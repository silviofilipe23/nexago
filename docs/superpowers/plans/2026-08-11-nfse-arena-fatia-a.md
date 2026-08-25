# NFS-e da arena — Fatia A (Emitir) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma arena piloto configura os dados fiscais dela pelo portal e passa a emitir NFS-e automaticamente para cada reserva e vaga de clubinho paga online.

**Architecture:** Módulo isolado em `functions/src/fiscal/`, atrás de uma porta (`issuer-port.ts`) que esconde o fornecedor. As regras de emissão são funções puras; a gravação do pedido e o processamento são separados por um trigger do Firestore, para que a prefeitura fora do ar nunca derrube a confirmação de um pagamento. A camada de pagamento existente (Asaas, carteira, repasse) não é modificada — apenas ganha uma chamada a mais depois do crédito.

**Tech Stack:** TypeScript, Firebase Functions v7 (Node 22), firebase-admin v13, Firestore. Portal da arena em Angular standalone com signals. Emissor: Focus NFe (`https://api.focusnfe.com.br/v2`).

**Spec:** `docs/superpowers/specs/2026-08-11-nfse-arena-design.md`

## Global Constraints

- Português nas strings e na UI, inglês no código. Comentários em português, no tom dos arquivos vizinhos.
- **Retrocompatibilidade absoluta:** arena sem `fiscal/config` tem de se comportar exatamente como hoje. Nenhum caminho de pagamento pode passar a falhar por causa do fiscal.
- **Certificado digital e senha de prefeitura nunca são gravados no Firestore nem aparecem em log.** O que persistimos é o token da empresa no emissor, e ele vai para o Secret Manager.
- A nota é sempre pelo **valor bruto pago pelo cliente**, nunca pelo líquido creditado na carteira.
- Estilo em `functions/`: aspas duplas, ponto e vírgula, 2 espaços de indentação.
- Estilo no portal da arena: aspas simples, componentes standalone, signals, `protected readonly` nos membros de template.
- Testes: `node:test` + `node:assert/strict`, com `FakeFirestore` de `functions/src/fake-firestore.test-helper.ts`. Rodar um teste isolado com `npx ts-node --transpile-only src/<arquivo>.test.ts` de dentro de `functions/`.
- Não deployar nada. O deploy é decisão do dono do projeto, e este repositório tem backlog de deploy pendente.

---

## File Structure

**Criados em `functions/src/fiscal/`:**

| Arquivo | Responsabilidade |
|---|---|
| `types.ts` | Tipos compartilhados: config, nota, status, origem |
| `invoice-emitter.ts` | Funções puras: `shouldAutoIssue`, `shouldProcess`, `buildIdempotencyKey` |
| `invoice-repository.ts` | `createInvoiceRequest` — grava o pedido respeitando idempotência |
| `issuer-port.ts` | Interface do emissor. Nenhuma dependência de HTTP |
| `fake-issuer.test-helper.ts` | Emissor em memória para os testes |
| `invoice-processor.ts` | Núcleo testável + trigger `onDocumentCreated` |
| `focus-nfe-client.ts` | Implementação da porta contra a Focus NFe |
| `invoice-webhook.ts` | Callback do emissor: autorizada / rejeitada |
| `arena-fiscal-config.ts` | Callables do wizard |

**Modificados:**

- `functions/src/asaas-arena-booking-webhook.ts` (2 pontos)
- `functions/src/asaas-arena-club-webhook.ts` (1 ponto)
- `functions/src/index.ts` (exports)
- `firestore.rules`
- `firestore.indexes.json`

**Portal da arena (`frontend/projects/arena/src/app/`):**

- `painel/fiscal/fiscal.model.ts`, `fiscal-repository.ts`, `panel-fiscal.component.ts`
- `painel/finance/fiscal-invoices-repository.ts`, `panel-fiscal-invoices.component.ts`
- `app.routes.ts` (2 rotas)

---

### Task 1: Tipos fiscais e regras de emissão

As regras de "deve emitir?" são o coração da feature e não dependem de Firestore nem de rede. Vêm primeiro, como funções puras.

**Files:**
- Create: `functions/src/fiscal/types.ts`
- Create: `functions/src/fiscal/invoice-emitter.ts`
- Test: `functions/src/fiscal/invoice-emitter.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `ArenaFiscalConfig`, `FiscalInvoiceStatus`, `FiscalInvoiceOrigin`, `FiscalInvoice`, `shouldAutoIssue(config: ArenaFiscalConfig | null): boolean`, `shouldProcess(input: ShouldProcessInput): ShouldProcessResult`, `buildIdempotencyKey(origin, ids): string`

- [ ] **Step 1: Escrever `types.ts`**

Sem teste — é só declaração de tipo. Entra junto porque a Task 1 não compila sem ele.

```typescript
/** Tipos do módulo fiscal. Nenhum deles conhece o emissor ou o gateway. */
import type {Timestamp} from "firebase-admin/firestore";

export type FiscalMode = "always" | "on_demand" | "off";
export type FiscalConfigStatus = "draft" | "testing" | "active" | "error";

export type FiscalInvoiceOrigin = "booking" | "club" | "manual";
export type FiscalInvoiceStatus =
  | "requested"
  | "processing"
  | "authorized"
  | "rejected"
  | "cancelled"
  | "cancellation_failed";

export interface FiscalService {
  id: string;
  /** Código do serviço na tabela do município. */
  codigoMunicipal: string;
  descricao: string;
  /** Alíquota de ISS em percentual, ex.: 2 para 2%. */
  aliquotaIss: number;
}

export interface FiscalAddress {
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  /** Código IBGE de 7 dígitos. */
  codigoIbge: string;
}

export interface ArenaFiscalConfig {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  enderecoFiscal: FiscalAddress;
  inscricaoMunicipal: string;
  regimeTributario: "simples_nacional" | "lucro_presumido" | "lucro_real" | "mei";
  /** Id da arena dentro do emissor. */
  issuerId?: string;
  /** Nome do secret no Secret Manager. NUNCA o valor. */
  credentialSecretName?: string;
  certificateExpiresAt?: Timestamp;
  services: FiscalService[];
  defaultServiceIdBooking?: string;
  defaultServiceIdClub?: string;
  mode: FiscalMode;
  status: FiscalConfigStatus;
  statusMessage?: string;
}

export interface FiscalTomador {
  nome: string;
  cpfCnpj: string;
  email?: string;
  endereco?: FiscalAddress;
}

export interface FiscalInvoice {
  arenaId: string;
  origin: FiscalInvoiceOrigin;
  originId: string | null;
  idempotencyKey: string;
  serviceId: string;
  codigoMunicipal: string;
  aliquotaIss: number;
  descricao: string;
  tomador: FiscalTomador;
  /** Uid do atleta quando conhecido. As rules dependem dele. */
  tomadorUid: string | null;
  valorBrutoReais: number;
  status: FiscalInvoiceStatus;
  numero?: string;
  serie?: string;
  codigoVerificacao?: string;
  pdfUrl?: string;
  xmlUrl?: string;
  errorMessage?: string;
  requestedByUid?: string;
  issuedByUid?: string;
}
```

- [ ] **Step 2: Escrever o teste que falha**

Create `functions/src/fiscal/invoice-emitter.test.ts`:

```typescript
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  buildIdempotencyKey,
  shouldAutoIssue,
  shouldProcess,
} from "./invoice-emitter";
import type {ArenaFiscalConfig} from "./types";

function config(overrides: Partial<ArenaFiscalConfig> = {}): ArenaFiscalConfig {
  return {
    cnpj: "12345678000199",
    razaoSocial: "Arena X Ltda",
    enderecoFiscal: {
      logradouro: "Rua A",
      numero: "10",
      bairro: "Centro",
      municipio: "Goiânia",
      uf: "GO",
      cep: "74000000",
      codigoIbge: "5208707",
    },
    inscricaoMunicipal: "123456",
    regimeTributario: "simples_nacional",
    services: [{id: "s1", codigoMunicipal: "3.03", descricao: "Quadra", aliquotaIss: 2}],
    defaultServiceIdBooking: "s1",
    mode: "always",
    status: "active",
    ...overrides,
  };
}

describe("shouldAutoIssue", () => {
  it("emite quando a config está ativa e o modo é sempre", () => {
    assert.equal(shouldAutoIssue(config()), true);
  });

  it("não emite quando a arena não tem config", () => {
    assert.equal(shouldAutoIssue(null), false);
  });

  it("não emite no modo sob demanda — a nota nasce quando o atleta pede", () => {
    assert.equal(shouldAutoIssue(config({mode: "on_demand"})), false);
  });

  it("não emite com o modo desligado", () => {
    assert.equal(shouldAutoIssue(config({mode: "off"})), false);
  });

  it("não emite enquanto a config não foi ativada", () => {
    assert.equal(shouldAutoIssue(config({status: "draft"})), false);
    assert.equal(shouldAutoIssue(config({status: "testing"})), false);
    assert.equal(shouldAutoIssue(config({status: "error"})), false);
  });
});

describe("shouldProcess", () => {
  const base = {
    config: config(),
    originPaid: true,
    valorBrutoReais: 100,
    tomadorCpfCnpj: "12345678909",
    hasAuthorizedTwin: false,
    origin: "booking" as const,
  };

  it("processa o caminho feliz", () => {
    assert.deepEqual(shouldProcess(base), {ok: true});
  });

  it("recusa quando a origem ainda não foi paga", () => {
    assert.deepEqual(shouldProcess({...base, originPaid: false}), {
      ok: false,
      reason: "ORIGIN_NOT_PAID",
    });
  });

  it("dispensa a checagem de pagamento na nota avulsa", () => {
    const result = shouldProcess({...base, origin: "manual", originPaid: false});
    assert.deepEqual(result, {ok: true});
  });

  it("recusa valor zerado", () => {
    assert.deepEqual(shouldProcess({...base, valorBrutoReais: 0}), {
      ok: false,
      reason: "INVALID_AMOUNT",
    });
  });

  it("recusa CPF inválido", () => {
    assert.deepEqual(shouldProcess({...base, tomadorCpfCnpj: "11111111111"}), {
      ok: false,
      reason: "INVALID_TOMADOR_DOCUMENT",
    });
  });

  it("recusa quando já existe nota autorizada para a mesma origem", () => {
    assert.deepEqual(shouldProcess({...base, hasAuthorizedTwin: true}), {
      ok: false,
      reason: "ALREADY_AUTHORIZED",
    });
  });

  it("processa no modo sob demanda — aqui o pedido do atleta já existe", () => {
    const onDemand = {...base, config: config({mode: "on_demand"})};
    assert.deepEqual(shouldProcess(onDemand), {ok: true});
  });

  it("recusa com a config desligada", () => {
    const off = {...base, config: config({mode: "off"})};
    assert.deepEqual(shouldProcess(off), {ok: false, reason: "CONFIG_NOT_EMITTING"});
  });
});

describe("buildIdempotencyKey", () => {
  it("deriva do pagamento no caminho online", () => {
    assert.equal(
      buildIdempotencyKey({origin: "booking", asaasPaymentId: "pay_1"}),
      "payment:pay_1",
    );
  });

  it("deriva do recebimento no caminho presencial", () => {
    assert.equal(
      buildIdempotencyKey({origin: "booking", bookingId: "b1", receiptId: "r1"}),
      "receipt:b1:r1",
    );
  });

  it("deriva do próprio id na avulsa", () => {
    assert.equal(
      buildIdempotencyKey({origin: "manual", invoiceId: "i1"}),
      "manual:i1",
    );
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/invoice-emitter.test.ts
```

Esperado: erro de módulo não encontrado (`Cannot find module './invoice-emitter'`).

- [ ] **Step 4: Implementar `invoice-emitter.ts`**

Reaproveite `isValidCpfCnpj` e `normalizeCpfCnpj`, que já existem em `functions/src/asaas-customer.ts` — não escreva outro validador de CPF.

```typescript
/**
 * Regras de emissão de NFS-e. Funções puras: nenhuma delas toca Firestore,
 * rede ou relógio. É aqui que se decide se uma nota deve existir.
 */
import {isValidCpfCnpj, normalizeCpfCnpj} from "../asaas-customer";
import type {ArenaFiscalConfig, FiscalInvoiceOrigin} from "./types";

/**
 * Decide, no momento do pagamento, se já nasce um pedido de nota. Só o modo
 * `always` cria sozinho — em `on_demand` o documento nasce quando o atleta
 * pede, para a coleção não encher de pedido que nunca vira nota.
 */
export function shouldAutoIssue(config: ArenaFiscalConfig | null): boolean {
  if (!config) return false;
  return config.status === "active" && config.mode === "always";
}

export type ShouldProcessReason =
  | "CONFIG_NOT_EMITTING"
  | "ORIGIN_NOT_PAID"
  | "INVALID_AMOUNT"
  | "INVALID_TOMADOR_DOCUMENT"
  | "ALREADY_AUTHORIZED";

export interface ShouldProcessInput {
  config: ArenaFiscalConfig | null;
  origin: FiscalInvoiceOrigin;
  originPaid: boolean;
  valorBrutoReais: number;
  tomadorCpfCnpj: string;
  hasAuthorizedTwin: boolean;
}

export type ShouldProcessResult =
  | {ok: true}
  | {ok: false; reason: ShouldProcessReason};

/**
 * Revalidação feita pelo trigger, imediatamente antes de bater no emissor. A
 * config pode ter mudado entre a gravação do pedido e o processamento.
 */
export function shouldProcess(input: ShouldProcessInput): ShouldProcessResult {
  const {config} = input;
  if (!config || config.status !== "active" || config.mode === "off") {
    return {ok: false, reason: "CONFIG_NOT_EMITTING"};
  }
  if (input.origin !== "manual" && !input.originPaid) {
    return {ok: false, reason: "ORIGIN_NOT_PAID"};
  }
  if (!(input.valorBrutoReais > 0)) {
    return {ok: false, reason: "INVALID_AMOUNT"};
  }
  if (!isValidCpfCnpj(normalizeCpfCnpj(input.tomadorCpfCnpj))) {
    return {ok: false, reason: "INVALID_TOMADOR_DOCUMENT"};
  }
  if (input.hasAuthorizedTwin) {
    return {ok: false, reason: "ALREADY_AUTHORIZED"};
  }
  return {ok: true};
}

export type IdempotencyInput =
  | {origin: FiscalInvoiceOrigin; asaasPaymentId: string}
  | {origin: FiscalInvoiceOrigin; bookingId: string; receiptId: string}
  | {origin: "manual"; invoiceId: string};

/**
 * Chave única da nota. O webhook do Asaas repete, e nota duplicada é problema
 * fiscal, não bug de tela.
 */
export function buildIdempotencyKey(input: IdempotencyInput): string {
  if ("asaasPaymentId" in input) return `payment:${input.asaasPaymentId}`;
  if ("receiptId" in input) return `receipt:${input.bookingId}:${input.receiptId}`;
  return `manual:${input.invoiceId}`;
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/invoice-emitter.test.ts
```

Esperado: todos os testes passam. Se `isValidCpfCnpj` rejeitar `12345678909`, troque o CPF do teste por um válido gerado pelo mesmo validador — não relaxe a validação.

- [ ] **Step 6: Confirmar que o projeto compila**

```bash
cd functions && npm run lint
```

- [ ] **Step 7: Commit**

```bash
git add functions/src/fiscal/types.ts functions/src/fiscal/invoice-emitter.ts functions/src/fiscal/invoice-emitter.test.ts
git commit -m "feat(fiscal): regras puras de emissão de NFS-e"
```

---

### Task 2: Gravar o pedido de nota com idempotência

**Files:**
- Create: `functions/src/fiscal/invoice-repository.ts`
- Test: `functions/src/fiscal/invoice-repository.test.ts`

**Interfaces:**
- Consumes: `ArenaFiscalConfig`, `FiscalInvoice` (Task 1)
- Produces: `readArenaFiscalConfig(db, arenaId): Promise<ArenaFiscalConfig | null>`, `createInvoiceRequest(db, input: CreateInvoiceRequestInput): Promise<string | null>` (retorna o id, ou `null` quando já existia)

- [ ] **Step 1: Escrever o teste que falha**

Create `functions/src/fiscal/invoice-repository.test.ts`:

```typescript
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "../fake-firestore.test-helper";
import {createInvoiceRequest, readArenaFiscalConfig} from "./invoice-repository";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function seedConfig(fake: FakeFirestore): void {
  fake.seedDoc("arenas/arena1/fiscal/config", {
    cnpj: "12345678000199",
    razaoSocial: "Arena X Ltda",
    inscricaoMunicipal: "123456",
    regimeTributario: "simples_nacional",
    services: [{id: "s1", codigoMunicipal: "3.03", descricao: "Quadra", aliquotaIss: 2}],
    defaultServiceIdBooking: "s1",
    mode: "always",
    status: "active",
  });
}

const input = {
  arenaId: "arena1",
  origin: "booking" as const,
  originId: "b1",
  idempotencyKey: "payment:pay_1",
  serviceId: "s1",
  codigoMunicipal: "3.03",
  aliquotaIss: 2,
  descricao: "Locação de quadra",
  tomador: {nome: "Fulano", cpfCnpj: "39053344705"},
  tomadorUid: "athlete1",
  valorBrutoReais: 100,
};

describe("readArenaFiscalConfig", () => {
  it("devolve null quando a arena não tem config fiscal", async () => {
    const fake = new FakeFirestore();
    assert.equal(await readArenaFiscalConfig(db(fake), "arena1"), null);
  });

  it("lê a config gravada", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake);
    const config = await readArenaFiscalConfig(db(fake), "arena1");
    assert.equal(config?.status, "active");
    assert.equal(config?.services[0].codigoMunicipal, "3.03");
  });
});

describe("createInvoiceRequest", () => {
  it("cria o pedido com status requested", async () => {
    const fake = new FakeFirestore();
    const id = await createInvoiceRequest(db(fake), input);
    assert.ok(id);
    const doc = fake.store.get(`fiscalInvoices/${id}`);
    assert.equal(doc?.status, "requested");
    assert.equal(doc?.arenaId, "arena1");
    assert.equal(doc?.valorBrutoReais, 100);
    assert.equal(doc?.tomadorUid, "athlete1");
  });

  it("não cria a segunda nota para a mesma chave — o webhook repete", async () => {
    const fake = new FakeFirestore();
    const first = await createInvoiceRequest(db(fake), input);
    const second = await createInvoiceRequest(db(fake), input);
    assert.ok(first);
    assert.equal(second, null);
    const all = [...fake.store.keys()].filter((k) => k.startsWith("fiscalInvoices/"));
    assert.equal(all.length, 1);
  });

  it("cria notas separadas para chaves diferentes", async () => {
    const fake = new FakeFirestore();
    await createInvoiceRequest(db(fake), input);
    await createInvoiceRequest(db(fake), {...input, idempotencyKey: "payment:pay_2"});
    const all = [...fake.store.keys()].filter((k) => k.startsWith("fiscalInvoices/"));
    assert.equal(all.length, 2);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/invoice-repository.test.ts
```

- [ ] **Step 3: Implementar `invoice-repository.ts`**

A idempotência usa o id do documento derivado da chave, não uma query — assim duas execuções concorrentes do webhook não conseguem criar duas notas.

```typescript
/**
 * Acesso ao Firestore do módulo fiscal. A idempotência mora no id do
 * documento: duas execuções concorrentes do mesmo webhook não conseguem criar
 * duas notas porque disputam a mesma chave.
 */
import {FieldValue, type Firestore} from "firebase-admin/firestore";
import type {
  ArenaFiscalConfig,
  FiscalInvoiceOrigin,
  FiscalTomador,
} from "./types";

const FISCAL_INVOICES = "fiscalInvoices";

export async function readArenaFiscalConfig(
  db: Firestore,
  arenaId: string,
): Promise<ArenaFiscalConfig | null> {
  const snap = await db.doc(`arenas/${arenaId}/fiscal/config`).get();
  if (!snap.exists) return null;
  return snap.data() as ArenaFiscalConfig;
}

export interface CreateInvoiceRequestInput {
  arenaId: string;
  origin: FiscalInvoiceOrigin;
  originId: string | null;
  idempotencyKey: string;
  serviceId: string;
  codigoMunicipal: string;
  aliquotaIss: number;
  descricao: string;
  tomador: FiscalTomador;
  tomadorUid: string | null;
  valorBrutoReais: number;
  requestedByUid?: string;
  issuedByUid?: string;
}

/** Id determinístico: mesma chave, mesmo documento. */
function invoiceIdFor(arenaId: string, idempotencyKey: string): string {
  return `${arenaId}__${idempotencyKey}`.replace(/\//g, "_");
}

/**
 * Grava o pedido. Devolve o id criado, ou `null` quando já existia nota para
 * a mesma chave.
 */
export async function createInvoiceRequest(
  db: Firestore,
  input: CreateInvoiceRequestInput,
): Promise<string | null> {
  const id = invoiceIdFor(input.arenaId, input.idempotencyKey);
  const ref = db.collection(FISCAL_INVOICES).doc(id);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return null;
    tx.set(ref, {
      ...input,
      status: "requested",
      createdAt: FieldValue.serverTimestamp(),
    });
    return id;
  });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/invoice-repository.test.ts
```

Se o `FakeFirestore` não suportar `db.doc(path)` com caminho de subcoleção ou `tx.get`/`tx.set` dentro de `runTransaction`, estenda o helper em vez de contornar no código de produção — outros testes vão precisar do mesmo.

- [ ] **Step 5: Commit**

```bash
git add functions/src/fiscal/invoice-repository.ts functions/src/fiscal/invoice-repository.test.ts
git commit -m "feat(fiscal): pedido de nota com idempotência por id de documento"
```

---

### Task 3: Porta do emissor e processamento do pedido

**Files:**
- Create: `functions/src/fiscal/issuer-port.ts`
- Create: `functions/src/fiscal/fake-issuer.test-helper.ts`
- Create: `functions/src/fiscal/invoice-processor.ts`
- Test: `functions/src/fiscal/invoice-processor.test.ts`

**Interfaces:**
- Consumes: `shouldProcess` (Task 1), `readArenaFiscalConfig` (Task 2)
- Produces: `FiscalIssuer` (interface), `IssueServiceInvoiceInput`, `IssueServiceInvoiceResult`, `FakeIssuer` (test helper), `ReadIssuerToken = (secretName: string) => Promise<string>`, `processInvoiceRequest(db, issuer, readToken, invoiceId): Promise<void>`

- [ ] **Step 1: Escrever `issuer-port.ts`**

```typescript
/**
 * Porta do emissor de notas. Nada aqui sabe HTTP nem qual é o fornecedor —
 * trocar de emissor é escrever outra implementação desta interface, e a NFC-e
 * do bar (fase 2) entra pela mesma porta.
 */
import type {FiscalAddress, FiscalTomador} from "./types";

export interface MunicipalRequirement {
  field: string;
  label: string;
  required: boolean;
  /** `password` sinaliza campo que nunca pode ser logado nem persistido. */
  type: "text" | "password" | "file";
}

export interface RegisterIssuerInput {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  inscricaoMunicipal: string;
  endereco: FiscalAddress;
  regimeTributario: string;
  /** Certificado em base64. Passa em trânsito, nunca é persistido por nós. */
  certificadoBase64?: string;
  senhaCertificado?: string;
  loginPrefeitura?: string;
  senhaPrefeitura?: string;
}

export interface RegisterIssuerResult {
  issuerId: string;
  /** Token da empresa no emissor. Vai para o Secret Manager. */
  token: string;
  certificateExpiresAt?: Date;
}

export interface IssueServiceInvoiceInput {
  reference: string;
  prestador: {cnpj: string; inscricaoMunicipal: string; codigoIbge: string};
  tomador: FiscalTomador;
  servico: {
    valorServicos: number;
    itemListaServico: string;
    discriminacao: string;
    codigoIbge: string;
    aliquota: number;
    issRetido: boolean;
  };
  optanteSimplesNacional: boolean;
}

export interface IssueServiceInvoiceResult {
  status: "processing" | "authorized" | "rejected";
  numero?: string;
  serie?: string;
  codigoVerificacao?: string;
  pdfUrl?: string;
  xmlUrl?: string;
  errorMessage?: string;
}

export interface FiscalIssuer {
  getMunicipalRequirements(codigoIbge: string): Promise<MunicipalRequirement[]>;
  registerIssuer(input: RegisterIssuerInput): Promise<RegisterIssuerResult>;
  issueServiceInvoice(
    token: string,
    input: IssueServiceInvoiceInput,
  ): Promise<IssueServiceInvoiceResult>;
  getInvoice(token: string, reference: string): Promise<IssueServiceInvoiceResult>;
  cancelInvoice(token: string, reference: string, motivo: string): Promise<void>;
}
```

- [ ] **Step 2: Escrever o `FakeIssuer`**

Create `functions/src/fiscal/fake-issuer.test-helper.ts`:

```typescript
/** Emissor em memória. Permite forçar rejeição e falha de rede nos testes. */
import type {
  FiscalIssuer,
  IssueServiceInvoiceInput,
  IssueServiceInvoiceResult,
  MunicipalRequirement,
  RegisterIssuerInput,
  RegisterIssuerResult,
} from "./issuer-port";

export class FakeIssuer implements FiscalIssuer {
  readonly issued: IssueServiceInvoiceInput[] = [];
  nextResult: IssueServiceInvoiceResult = {
    status: "authorized",
    numero: "42",
    serie: "1",
    codigoVerificacao: "ABC123",
    pdfUrl: "https://exemplo/nota.pdf",
    xmlUrl: "https://exemplo/nota.xml",
  };
  throwOnIssue: Error | null = null;

  async getMunicipalRequirements(): Promise<MunicipalRequirement[]> {
    return [{field: "inscricaoMunicipal", label: "Inscrição municipal", required: true, type: "text"}];
  }

  async registerIssuer(input: RegisterIssuerInput): Promise<RegisterIssuerResult> {
    return {issuerId: `emp_${input.cnpj}`, token: "tok_teste"};
  }

  async issueServiceInvoice(
    _token: string,
    input: IssueServiceInvoiceInput,
  ): Promise<IssueServiceInvoiceResult> {
    if (this.throwOnIssue) throw this.throwOnIssue;
    this.issued.push(input);
    return this.nextResult;
  }

  async getInvoice(): Promise<IssueServiceInvoiceResult> {
    return this.nextResult;
  }

  async cancelInvoice(): Promise<void> {
    // nada a fazer no fake
  }
}
```

- [ ] **Step 3: Escrever o teste do processor**

Create `functions/src/fiscal/invoice-processor.test.ts`:

```typescript
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "../fake-firestore.test-helper";
import {FakeIssuer} from "./fake-issuer.test-helper";
import {processInvoiceRequest} from "./invoice-processor";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function seedAll(fake: FakeFirestore, overrides: Record<string, unknown> = {}): void {
  fake.seedDoc("arenas/arena1/fiscal/config", {
    cnpj: "12345678000199",
    razaoSocial: "Arena X Ltda",
    inscricaoMunicipal: "123456",
    regimeTributario: "simples_nacional",
    enderecoFiscal: {codigoIbge: "5208707", municipio: "Goiânia", uf: "GO"},
    services: [{id: "s1", codigoMunicipal: "3.03", descricao: "Quadra", aliquotaIss: 2}],
    defaultServiceIdBooking: "s1",
    issuerId: "emp_1",
    credentialSecretName: "fiscal-arena1",
    mode: "always",
    status: "active",
    ...overrides,
  });
  fake.seedDoc("arenaBookings/b1", {arenaId: "arena1", paymentStatus: "paid"});
  fake.seedDoc("fiscalInvoices/inv1", {
    arenaId: "arena1",
    origin: "booking",
    originId: "b1",
    idempotencyKey: "payment:pay_1",
    serviceId: "s1",
    codigoMunicipal: "3.03",
    aliquotaIss: 2,
    descricao: "Locação de quadra",
    tomador: {nome: "Fulano", cpfCnpj: "39053344705"},
    tomadorUid: "athlete1",
    valorBrutoReais: 100,
    status: "requested",
  });
}

const readToken = async () => "tok_teste";

describe("processInvoiceRequest", () => {
  it("autoriza e grava número, PDF e XML", async () => {
    const fake = new FakeFirestore();
    seedAll(fake);
    const issuer = new FakeIssuer();

    await processInvoiceRequest(db(fake), issuer, readToken, "inv1");

    const doc = fake.store.get("fiscalInvoices/inv1");
    assert.equal(doc?.status, "authorized");
    assert.equal(doc?.numero, "42");
    assert.equal(doc?.pdfUrl, "https://exemplo/nota.pdf");
    assert.equal(issuer.issued.length, 1);
    assert.equal(issuer.issued[0].servico.valorServicos, 100);
    assert.equal(issuer.issued[0].servico.itemListaServico, "3.03");
  });

  it("marca rejeitada com a mensagem crua do emissor", async () => {
    const fake = new FakeFirestore();
    seedAll(fake);
    const issuer = new FakeIssuer();
    issuer.nextResult = {status: "rejected", errorMessage: "Inscrição municipal inválida"};

    await processInvoiceRequest(db(fake), issuer, readToken, "inv1");

    const doc = fake.store.get("fiscalInvoices/inv1");
    assert.equal(doc?.status, "rejected");
    assert.equal(doc?.errorMessage, "Inscrição municipal inválida");
  });

  it("não emite quando a config foi desligada depois do pedido", async () => {
    const fake = new FakeFirestore();
    seedAll(fake, {mode: "off"});
    const issuer = new FakeIssuer();

    await processInvoiceRequest(db(fake), issuer, readToken, "inv1");

    assert.equal(issuer.issued.length, 0);
    assert.equal(fake.store.get("fiscalInvoices/inv1")?.status, "rejected");
    assert.equal(fake.store.get("fiscalInvoices/inv1")?.errorMessage, "CONFIG_NOT_EMITTING");
  });

  it("não emite quando a reserva ainda não está paga", async () => {
    const fake = new FakeFirestore();
    seedAll(fake);
    fake.seedDoc("arenaBookings/b1", {arenaId: "arena1", paymentStatus: "pending"});
    const issuer = new FakeIssuer();

    await processInvoiceRequest(db(fake), issuer, readToken, "inv1");

    assert.equal(issuer.issued.length, 0);
    assert.equal(fake.store.get("fiscalInvoices/inv1")?.errorMessage, "ORIGIN_NOT_PAID");
  });

  it("ignora pedido que já não está em requested — o trigger pode repetir", async () => {
    const fake = new FakeFirestore();
    seedAll(fake);
    fake.seedDoc("fiscalInvoices/inv1", {
      ...(fake.store.get("fiscalInvoices/inv1") as Record<string, unknown>),
      status: "authorized",
    });
    const issuer = new FakeIssuer();

    await processInvoiceRequest(db(fake), issuer, readToken, "inv1");

    assert.equal(issuer.issued.length, 0);
  });

  it("deixa em requested quando o emissor cai, para o retry pegar", async () => {
    const fake = new FakeFirestore();
    seedAll(fake);
    const issuer = new FakeIssuer();
    issuer.throwOnIssue = new Error("ECONNRESET");

    await assert.rejects(() => processInvoiceRequest(db(fake), issuer, readToken, "inv1"));

    assert.equal(fake.store.get("fiscalInvoices/inv1")?.status, "requested");
  });
});
```

- [ ] **Step 4: Rodar e confirmar que falha**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/invoice-processor.test.ts
```

- [ ] **Step 5: Implementar `invoice-processor.ts`**

O núcleo recebe `db`, `issuer` e uma função de leitura do token, para que o teste não precise do Secret Manager. O trigger é uma casca fina em volta.

```typescript
/**
 * Processa um pedido de nota: revalida, chama o emissor e grava o resultado.
 * Roda fora da transação da carteira de propósito — prefeitura fora do ar não
 * pode derrubar a confirmação de um pagamento.
 */
import {FieldValue, type Firestore} from "firebase-admin/firestore";
import {shouldProcess} from "./invoice-emitter";
import {readArenaFiscalConfig} from "./invoice-repository";
import type {FiscalIssuer} from "./issuer-port";
import type {FiscalInvoice} from "./types";

export type ReadIssuerToken = (secretName: string) => Promise<string>;

/** Uma origem só é "paga" se o documento de origem disser isso. */
async function isOriginPaid(db: Firestore, invoice: FiscalInvoice): Promise<boolean> {
  if (invoice.origin === "manual") return true;
  if (!invoice.originId) return false;
  if (invoice.origin === "booking") {
    const snap = await db.doc(`arenaBookings/${invoice.originId}`).get();
    const status = snap.data()?.paymentStatus;
    return status === "paid" || status === "partial";
  }
  // clubinho: o pedido só é criado no webhook de pagamento confirmado
  return true;
}

export async function processInvoiceRequest(
  db: Firestore,
  issuer: FiscalIssuer,
  readToken: ReadIssuerToken,
  invoiceId: string,
): Promise<void> {
  const ref = db.doc(`fiscalInvoices/${invoiceId}`);
  const snap = await ref.get();
  if (!snap.exists) return;
  const invoice = snap.data() as FiscalInvoice;
  if (invoice.status !== "requested") return;

  const config = await readArenaFiscalConfig(db, invoice.arenaId);
  const verdict = shouldProcess({
    config,
    origin: invoice.origin,
    originPaid: await isOriginPaid(db, invoice),
    valorBrutoReais: invoice.valorBrutoReais,
    tomadorCpfCnpj: invoice.tomador.cpfCnpj,
    hasAuthorizedTwin: false,
  });

  if (!verdict.ok) {
    await ref.set(
      {
        status: "rejected",
        errorMessage: verdict.reason,
        processedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    return;
  }

  const token = await readToken(config!.credentialSecretName!);
  const result = await issuer.issueServiceInvoice(token, {
    reference: invoiceId,
    prestador: {
      cnpj: config!.cnpj,
      inscricaoMunicipal: config!.inscricaoMunicipal,
      codigoIbge: config!.enderecoFiscal.codigoIbge,
    },
    tomador: invoice.tomador,
    servico: {
      valorServicos: invoice.valorBrutoReais,
      itemListaServico: invoice.codigoMunicipal,
      discriminacao: invoice.descricao,
      codigoIbge: config!.enderecoFiscal.codigoIbge,
      aliquota: invoice.aliquotaIss,
      issRetido: false,
    },
    optanteSimplesNacional: config!.regimeTributario === "simples_nacional",
  });

  await ref.set(
    {
      status: result.status === "processing" ? "processing" : result.status,
      numero: result.numero ?? null,
      serie: result.serie ?? null,
      codigoVerificacao: result.codigoVerificacao ?? null,
      pdfUrl: result.pdfUrl ?? null,
      xmlUrl: result.xmlUrl ?? null,
      errorMessage: result.errorMessage ?? null,
      processedAt: FieldValue.serverTimestamp(),
      ...(result.status === "authorized"
        ? {authorizedAt: FieldValue.serverTimestamp()}
        : {}),
    },
    {merge: true},
  );
}
```

Deixe o trigger para a Task 8, quando os secrets já estiverem definidos. Este arquivo, por ora, exporta só o núcleo — `tsconfig.json` tem `noUnusedLocals: true`, então importar `onDocumentCreated` ou `getFirestore` antes da hora quebra o build.

- [ ] **Step 6: Rodar e confirmar que passa**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/invoice-processor.test.ts
```

- [ ] **Step 7: Rodar o lint**

```bash
cd functions && npm run lint
```

- [ ] **Step 8: Commit**

```bash
git add functions/src/fiscal/issuer-port.ts functions/src/fiscal/fake-issuer.test-helper.ts functions/src/fiscal/invoice-processor.ts functions/src/fiscal/invoice-processor.test.ts
git commit -m "feat(fiscal): porta do emissor e processamento do pedido de nota"
```

---

### Task 4: Engatar nos webhooks de pagamento

O ponto mais delicado do plano: mexer em código de pagamento que já funciona. A regra é que o fiscal **nunca** pode derrubar a confirmação — toda chamada vai dentro de `try/catch` que só loga.

**Files:**
- Create: `functions/src/fiscal/payment-hooks.ts`
- Modify: `functions/src/asaas-arena-booking-webhook.ts` (depois de cada `creditArenaWalletFromBooking`, linhas 155 e 291)
- Modify: `functions/src/asaas-arena-club-webhook.ts` (depois de `creditArenaWalletFromClubPayment`, linha 158)
- Test: `functions/src/fiscal/payment-hooks.test.ts`

**Interfaces:**
- Consumes: `shouldAutoIssue` (Task 1), `readArenaFiscalConfig`, `createInvoiceRequest` (Task 2), `buildIdempotencyKey` (Task 1)
- Produces: `requestInvoiceForPaidBooking(db, input): Promise<void>`, `requestInvoiceForPaidClubSpot(db, input): Promise<void>` — ambas engolem qualquer erro

- [ ] **Step 1: Escrever o teste que falha**

Create `functions/src/fiscal/payment-hooks.test.ts`:

```typescript
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "../fake-firestore.test-helper";
import {requestInvoiceForPaidBooking} from "./payment-hooks";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function seedConfig(fake: FakeFirestore, overrides: Record<string, unknown> = {}): void {
  fake.seedDoc("arenas/arena1/fiscal/config", {
    cnpj: "12345678000199",
    razaoSocial: "Arena X Ltda",
    inscricaoMunicipal: "123456",
    regimeTributario: "simples_nacional",
    enderecoFiscal: {codigoIbge: "5208707"},
    services: [{id: "s1", codigoMunicipal: "3.03", descricao: "Locação de quadra", aliquotaIss: 2}],
    defaultServiceIdBooking: "s1",
    mode: "always",
    status: "active",
    ...overrides,
  });
}

const input = {
  arenaId: "arena1",
  bookingId: "b1",
  asaasPaymentId: "pay_1",
  grossReais: 100,
  tomador: {nome: "Fulano", cpfCnpj: "39053344705"},
  tomadorUid: "athlete1",
};

function invoices(fake: FakeFirestore): string[] {
  return [...fake.store.keys()].filter((k) => k.startsWith("fiscalInvoices/"));
}

describe("requestInvoiceForPaidBooking", () => {
  it("cria o pedido pelo valor bruto quando o modo é sempre", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake);
    await requestInvoiceForPaidBooking(db(fake), input);
    const keys = invoices(fake);
    assert.equal(keys.length, 1);
    const doc = fake.store.get(keys[0]);
    assert.equal(doc?.valorBrutoReais, 100);
    assert.equal(doc?.idempotencyKey, "payment:pay_1");
    assert.equal(doc?.descricao, "Locação de quadra");
  });

  it("não faz nada quando a arena não tem config fiscal", async () => {
    const fake = new FakeFirestore();
    await requestInvoiceForPaidBooking(db(fake), input);
    assert.equal(invoices(fake).length, 0);
  });

  it("não cria nada no modo sob demanda", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake, {mode: "on_demand"});
    await requestInvoiceForPaidBooking(db(fake), input);
    assert.equal(invoices(fake).length, 0);
  });

  it("não cria nada com a config em rascunho", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake, {status: "draft"});
    await requestInvoiceForPaidBooking(db(fake), input);
    assert.equal(invoices(fake).length, 0);
  });

  it("não cria duas notas quando o webhook repete", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake);
    await requestInvoiceForPaidBooking(db(fake), input);
    await requestInvoiceForPaidBooking(db(fake), input);
    assert.equal(invoices(fake).length, 1);
  });

  it("nunca propaga erro — confirmação de pagamento não pode cair por causa de nota", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake, {defaultServiceIdBooking: "inexistente"});
    await requestInvoiceForPaidBooking(db(fake), input);
    assert.equal(invoices(fake).length, 0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/payment-hooks.test.ts
```

- [ ] **Step 3: Implementar `payment-hooks.ts`**

```typescript
/**
 * Ponte entre a confirmação de pagamento e o módulo fiscal. Toda função aqui
 * engole o próprio erro: a nota é consequência do pagamento, nunca condição
 * dele.
 */
import type {Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {buildIdempotencyKey, shouldAutoIssue} from "./invoice-emitter";
import {createInvoiceRequest, readArenaFiscalConfig} from "./invoice-repository";
import type {ArenaFiscalConfig, FiscalService, FiscalTomador} from "./types";

function resolveService(
  config: ArenaFiscalConfig,
  serviceId: string | undefined,
): FiscalService {
  const service = config.services?.find((s) => s.id === serviceId);
  if (!service) throw new Error("FISCAL_DEFAULT_SERVICE_MISSING");
  return service;
}

export interface PaidBookingInvoiceInput {
  arenaId: string;
  bookingId: string;
  asaasPaymentId: string;
  grossReais: number;
  tomador: FiscalTomador;
  tomadorUid: string | null;
}

export async function requestInvoiceForPaidBooking(
  db: Firestore,
  input: PaidBookingInvoiceInput,
): Promise<void> {
  try {
    const config = await readArenaFiscalConfig(db, input.arenaId);
    if (!shouldAutoIssue(config)) return;
    const service = resolveService(config!, config!.defaultServiceIdBooking);

    await createInvoiceRequest(db, {
      arenaId: input.arenaId,
      origin: "booking",
      originId: input.bookingId,
      idempotencyKey: buildIdempotencyKey({
        origin: "booking",
        asaasPaymentId: input.asaasPaymentId,
      }),
      serviceId: service.id,
      codigoMunicipal: service.codigoMunicipal,
      aliquotaIss: service.aliquotaIss,
      descricao: service.descricao,
      tomador: input.tomador,
      tomadorUid: input.tomadorUid,
      valorBrutoReais: input.grossReais,
    });
  } catch (e) {
    logger.error("requestInvoiceForPaidBooking falhou", input.bookingId, e);
  }
}

export interface PaidClubSpotInvoiceInput {
  arenaId: string;
  sessionId: string;
  participantId: string;
  asaasPaymentId: string;
  grossReais: number;
  tomador: FiscalTomador;
  tomadorUid: string | null;
}

export async function requestInvoiceForPaidClubSpot(
  db: Firestore,
  input: PaidClubSpotInvoiceInput,
): Promise<void> {
  try {
    const config = await readArenaFiscalConfig(db, input.arenaId);
    if (!shouldAutoIssue(config)) return;
    const service = resolveService(config!, config!.defaultServiceIdClub);

    await createInvoiceRequest(db, {
      arenaId: input.arenaId,
      origin: "club",
      originId: `${input.sessionId}:${input.participantId}`,
      idempotencyKey: buildIdempotencyKey({
        origin: "club",
        asaasPaymentId: input.asaasPaymentId,
      }),
      serviceId: service.id,
      codigoMunicipal: service.codigoMunicipal,
      aliquotaIss: service.aliquotaIss,
      descricao: service.descricao,
      tomador: input.tomador,
      tomadorUid: input.tomadorUid,
      valorBrutoReais: input.grossReais,
    });
  } catch (e) {
    logger.error("requestInvoiceForPaidClubSpot falhou", input.sessionId, e);
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/payment-hooks.test.ts
```

- [ ] **Step 5: Ler os três pontos de acoplamento por inteiro antes de editar**

Não edite às cegas. Abra e leia o contexto completo de cada função:

```bash
cd functions && sed -n '100,200p' src/asaas-arena-booking-webhook.ts
```

```bash
cd functions && sed -n '270,300p' src/asaas-arena-booking-webhook.ts
```

```bash
cd functions && sed -n '130,180p' src/asaas-arena-club-webhook.ts
```

Você precisa descobrir, em cada um: qual variável tem o id do pagamento Asaas, qual tem o valor bruto pago, e de onde sai o nome e o CPF do atleta pagador. O CPF do pagador já é resolvido hoje para criar o PIX — veja `resolveAthleteCpfCnpj` em `src/asaas-customer.ts`. Se o CPF não estiver disponível no escopo do webhook, leia-o do documento do atleta ali mesmo; não invente um campo.

- [ ] **Step 6: Inserir a chamada nos três pontos**

Depois de cada `creditArenaWalletFromBooking` / `creditArenaWalletFromClubPayment`, e **fora** de qualquer transação:

```typescript
await requestInvoiceForPaidBooking(db, {
  arenaId,
  bookingId,
  asaasPaymentId: payment.id,
  grossReais: paidOnline,
  tomador: {nome: athleteName, cpfCnpj: athleteCpf},
  tomadorUid: athleteId,
});
```

Adapte os nomes das variáveis ao que existe em cada função. No clubinho use `requestInvoiceForPaidClubSpot` com `sessionId` e `participantId`.

- [ ] **Step 7: Verificar que os testes de pagamento existentes continuam verdes**

```bash
cd functions && npm test
```

Esperado: nenhuma regressão. Se algum teste de webhook quebrar por causa de chamada nova ao Firestore, o `FakeFirestore` do teste precisa da config fiscal ausente — o caminho sem config tem de sair silencioso, que é justamente o primeiro teste da Task 4.

- [ ] **Step 8: Commit**

```bash
git add functions/src/fiscal/payment-hooks.ts functions/src/fiscal/payment-hooks.test.ts functions/src/asaas-arena-booking-webhook.ts functions/src/asaas-arena-club-webhook.ts
git commit -m "feat(fiscal): pedir nota quando o pagamento online é confirmado"
```

---

### Task 5: Cliente Focus NFe

**Files:**
- Create: `functions/src/fiscal/focus-nfe-client.ts`
- Test: `functions/src/fiscal/focus-nfe-client.test.ts`

**Interfaces:**
- Consumes: `FiscalIssuer` e tipos (Task 3)
- Produces: `FocusNfeIssuer implements FiscalIssuer`, `FOCUS_API_URL_PRODUCTION`, `FOCUS_API_URL_SANDBOX`, `focusFiscalSecrets`

Referência verificada da API: `POST https://api.focusnfe.com.br/v2/nfse?ref={ref}`, homologação em `https://homologacao.focusnfe.com.br/v2/nfse`, autenticação HTTP Basic com o token como usuário e senha vazia. Campos obrigatórios do corpo: `data_emissao`, `natureza_operacao`, `optante_simples_nacional`, `prestador` (`cnpj`, `inscricao_municipal`, `codigo_municipio`), `tomador` (`cpf` ou `cnpj`, `razao_social`) e `servico` (`valor_servicos`, `iss_retido`, `item_lista_servico`, `discriminacao`, `codigo_municipio`, `aliquota`).

- [ ] **Step 1: Escrever o teste que falha**

O teste injeta um `fetch` falso — nenhuma chamada de rede real.

Create `functions/src/fiscal/focus-nfe-client.test.ts`:

```typescript
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {FocusNfeIssuer} from "./focus-nfe-client";

type Call = {url: string; init: RequestInit};

function stubFetch(response: unknown, status = 200) {
  const calls: Call[] = [];
  const fetchFn = async (url: string, init: RequestInit) => {
    calls.push({url, init});
    return {
      ok: status < 400,
      status,
      text: async () => JSON.stringify(response),
    } as unknown as Response;
  };
  return {calls, fetchFn};
}

const input = {
  reference: "inv1",
  prestador: {cnpj: "12345678000199", inscricaoMunicipal: "123456", codigoIbge: "5208707"},
  tomador: {nome: "Fulano de Tal", cpfCnpj: "39053344705"},
  servico: {
    valorServicos: 100,
    itemListaServico: "3.03",
    discriminacao: "Locação de quadra",
    codigoIbge: "5208707",
    aliquota: 2,
    issRetido: false,
  },
  optanteSimplesNacional: true,
};

describe("FocusNfeIssuer.issueServiceInvoice", () => {
  it("chama POST /v2/nfse com ref na query e Basic auth do token", async () => {
    const {calls, fetchFn} = stubFetch({status: "processando_autorizacao"});
    const issuer = new FocusNfeIssuer("https://homologacao.focusnfe.com.br", fetchFn);

    await issuer.issueServiceInvoice("tok_abc", input);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://homologacao.focusnfe.com.br/v2/nfse?ref=inv1");
    assert.equal(calls[0].init.method, "POST");
    const auth = (calls[0].init.headers as Record<string, string>)["Authorization"];
    assert.equal(auth, `Basic ${Buffer.from("tok_abc:").toString("base64")}`);
  });

  it("monta o corpo com tomador por CPF quando o documento tem 11 dígitos", async () => {
    const {calls, fetchFn} = stubFetch({status: "processando_autorizacao"});
    const issuer = new FocusNfeIssuer("https://homologacao.focusnfe.com.br", fetchFn);

    await issuer.issueServiceInvoice("tok_abc", input);

    const body = JSON.parse(calls[0].init.body as string);
    assert.equal(body.tomador.cpf, "39053344705");
    assert.equal(body.tomador.cnpj, undefined);
    assert.equal(body.tomador.razao_social, "Fulano de Tal");
    assert.equal(body.servico.item_lista_servico, "3.03");
    assert.equal(body.servico.valor_servicos, 100);
    assert.equal(body.optante_simples_nacional, true);
  });

  it("usa cnpj no tomador quando o documento tem 14 dígitos", async () => {
    const {calls, fetchFn} = stubFetch({status: "processando_autorizacao"});
    const issuer = new FocusNfeIssuer("https://homologacao.focusnfe.com.br", fetchFn);

    await issuer.issueServiceInvoice("tok_abc", {
      ...input,
      tomador: {nome: "Empresa Y", cpfCnpj: "12345678000199"},
    });

    const body = JSON.parse(calls[0].init.body as string);
    assert.equal(body.tomador.cnpj, "12345678000199");
    assert.equal(body.tomador.cpf, undefined);
  });

  it("traduz autorizado para o resultado da porta", async () => {
    const {fetchFn} = stubFetch({
      status: "autorizado",
      numero: "42",
      serie: "1",
      codigo_verificacao: "ABC",
      url_danfse: "https://focus/nota.pdf",
      caminho_xml_nota_fiscal: "https://focus/nota.xml",
    });
    const issuer = new FocusNfeIssuer("https://homologacao.focusnfe.com.br", fetchFn);

    const result = await issuer.issueServiceInvoice("tok_abc", input);

    assert.equal(result.status, "authorized");
    assert.equal(result.numero, "42");
    assert.equal(result.pdfUrl, "https://focus/nota.pdf");
  });

  it("traduz erro de validação para rejeitado, com a mensagem crua", async () => {
    const {fetchFn} = stubFetch(
      {codigo: "requisicao_invalida", mensagem: "inscricao_municipal inválida"},
      422,
    );
    const issuer = new FocusNfeIssuer("https://homologacao.focusnfe.com.br", fetchFn);

    const result = await issuer.issueServiceInvoice("tok_abc", input);

    assert.equal(result.status, "rejected");
    assert.match(result.errorMessage ?? "", /inscricao_municipal/);
  });

  it("propaga erro de infraestrutura para o retry pegar", async () => {
    const {fetchFn} = stubFetch({mensagem: "indisponível"}, 503);
    const issuer = new FocusNfeIssuer("https://homologacao.focusnfe.com.br", fetchFn);

    await assert.rejects(() => issuer.issueServiceInvoice("tok_abc", input));
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/focus-nfe-client.test.ts
```

- [ ] **Step 3: Implementar `focus-nfe-client.ts`**

A distinção que importa: erro 4xx de validação vira `rejected` (a nota está errada, retry não resolve); 5xx e falha de rede são lançados, para o retry do trigger pegar.

```typescript
/**
 * Implementação da porta fiscal contra a Focus NFe.
 * Único arquivo do módulo que sabe qual é o fornecedor.
 */
import {defineSecret} from "firebase-functions/params";
import type {
  FiscalIssuer,
  IssueServiceInvoiceInput,
  IssueServiceInvoiceResult,
  MunicipalRequirement,
  RegisterIssuerInput,
  RegisterIssuerResult,
} from "./issuer-port";

export const FOCUS_ACCOUNT_TOKEN = defineSecret("FOCUS_ACCOUNT_TOKEN");
export const FOCUS_ENV = defineSecret("FOCUS_ENV");
export const focusFiscalSecrets = [FOCUS_ACCOUNT_TOKEN, FOCUS_ENV];

export const FOCUS_API_URL_PRODUCTION = "https://api.focusnfe.com.br";
export const FOCUS_API_URL_SANDBOX = "https://homologacao.focusnfe.com.br";

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

function basicAuth(token: string): string {
  return `Basic ${Buffer.from(`${token}:`).toString("base64")}`;
}

function mapStatus(raw: string): IssueServiceInvoiceResult["status"] {
  if (raw === "autorizado") return "authorized";
  if (raw === "cancelado" || raw === "erro_autorizacao") return "rejected";
  return "processing";
}

export class FocusNfeIssuer implements FiscalIssuer {
  /**
   * `accountToken` é o token da conta nexaGO, usado só para cadastrar empresas.
   * A emissão usa o token da empresa, que vem por parâmetro.
   */
  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: FetchFn = fetch as unknown as FetchFn,
    private readonly accountToken = "",
  ) {}

  private async call<T>(
    token: string,
    path: string,
    init: RequestInit = {},
  ): Promise<{status: number; body: T}> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: basicAuth(token),
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    const text = await res.text();
    const body = text.trim() ? (JSON.parse(text) as T) : ({} as T);
    return {status: res.status, body};
  }

  async getMunicipalRequirements(): Promise<MunicipalRequirement[]> {
    // A Focus cadastra a empresa com certificado; a exigência por município é
    // resolvida no cadastro. O wizard usa esta lista fixa como ponto de partida.
    return [
      {field: "inscricaoMunicipal", label: "Inscrição municipal", required: true, type: "text"},
      {field: "certificado", label: "Certificado digital A1 (.pfx)", required: true, type: "file"},
      {field: "senhaCertificado", label: "Senha do certificado", required: true, type: "password"},
    ];
  }

  async registerIssuer(input: RegisterIssuerInput): Promise<RegisterIssuerResult> {
    // ATENÇÃO ao implementar: confirme os nomes exatos dos campos em
    // https://doc.focusnfe.com.br (seção Empresas) e valide com um cadastro
    // real em homologação antes de dar a task por pronta. Não persista
    // `certificadoBase64` nem `senhaCertificado` em lugar nenhum.
    const {status, body} = await this.call<{
      id?: number;
      token_homologacao?: string;
      token_producao?: string;
    }>(this.accountToken, "/v2/empresas", {
      method: "POST",
      body: JSON.stringify({
        cnpj: input.cnpj,
        nome: input.razaoSocial,
        nome_fantasia: input.nomeFantasia,
        inscricao_municipal: input.inscricaoMunicipal,
        regime_tributario: input.regimeTributario,
        habilita_nfse: true,
        arquivo_certificado_base64: input.certificadoBase64,
        senha_certificado: input.senhaCertificado,
        logradouro: input.endereco.logradouro,
        numero: input.endereco.numero,
        complemento: input.endereco.complemento,
        bairro: input.endereco.bairro,
        municipio: input.endereco.municipio,
        uf: input.endereco.uf,
        cep: input.endereco.cep,
        codigo_municipio: input.endereco.codigoIbge,
      }),
    });
    if (status >= 400 || !body.id) {
      throw new Error(`FOCUS_REGISTER_FAILED_${status}`);
    }
    const token = body.token_producao ?? body.token_homologacao;
    if (!token) throw new Error("FOCUS_TOKEN_MISSING");
    return {issuerId: String(body.id), token};
  }

  async issueServiceInvoice(
    token: string,
    input: IssueServiceInvoiceInput,
  ): Promise<IssueServiceInvoiceResult> {
    const doc = input.tomador.cpfCnpj.replace(/\D/g, "");
    const {status, body} = await this.call<Record<string, string>>(
      token,
      `/v2/nfse?ref=${encodeURIComponent(input.reference)}`,
      {
        method: "POST",
        body: JSON.stringify({
          data_emissao: new Date().toISOString(),
          natureza_operacao: "1",
          optante_simples_nacional: input.optanteSimplesNacional,
          prestador: {
            cnpj: input.prestador.cnpj,
            inscricao_municipal: input.prestador.inscricaoMunicipal,
            codigo_municipio: input.prestador.codigoIbge,
          },
          tomador: {
            ...(doc.length === 14 ? {cnpj: doc} : {cpf: doc}),
            razao_social: input.tomador.nome.slice(0, 115),
            email: input.tomador.email,
          },
          servico: {
            valor_servicos: input.servico.valorServicos,
            iss_retido: input.servico.issRetido,
            item_lista_servico: input.servico.itemListaServico,
            discriminacao: input.servico.discriminacao,
            codigo_municipio: input.servico.codigoIbge,
            aliquota: input.servico.aliquota,
          },
        }),
      },
    );

    if (status >= 500) throw new Error(`FOCUS_UNAVAILABLE_${status}`);
    if (status >= 400) {
      return {
        status: "rejected",
        errorMessage: body.mensagem ?? body.codigo ?? `HTTP ${status}`,
      };
    }
    return {
      status: mapStatus(body.status ?? "processando_autorizacao"),
      numero: body.numero,
      serie: body.serie,
      codigoVerificacao: body.codigo_verificacao,
      pdfUrl: body.url_danfse,
      xmlUrl: body.caminho_xml_nota_fiscal,
      errorMessage: body.mensagem,
    };
  }

  async getInvoice(token: string, reference: string): Promise<IssueServiceInvoiceResult> {
    const {body} = await this.call<Record<string, string>>(
      token,
      `/v2/nfse/${encodeURIComponent(reference)}`,
    );
    return {
      status: mapStatus(body.status ?? "processando_autorizacao"),
      numero: body.numero,
      serie: body.serie,
      codigoVerificacao: body.codigo_verificacao,
      pdfUrl: body.url_danfse,
      xmlUrl: body.caminho_xml_nota_fiscal,
      errorMessage: body.mensagem,
    };
  }

  async cancelInvoice(token: string, reference: string, motivo: string): Promise<void> {
    const {status} = await this.call(
      token,
      `/v2/nfse/${encodeURIComponent(reference)}`,
      {method: "DELETE", body: JSON.stringify({justificativa: motivo})},
    );
    if (status >= 400) throw new Error(`FOCUS_CANCEL_FAILED_${status}`);
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/focus-nfe-client.test.ts
```

- [ ] **Step 5: Confirmar o cadastro de empresa contra a homologação da Focus**

Este é o único ponto do plano que depende de credencial externa. Com o token de homologação em mãos:

```bash
curl -u "$FOCUS_TOKEN:" -H 'Content-Type: application/json' https://homologacao.focusnfe.com.br/v2/empresas
```

Compare os nomes dos campos que a resposta traz com os que `registerIssuer` envia e corrija o que divergir. Se ainda não houver conta de homologação, pare aqui, deixe a task aberta e siga para a Task 6 — nada depois dela depende deste passo.

- [ ] **Step 6: Commit**

```bash
git add functions/src/fiscal/focus-nfe-client.ts functions/src/fiscal/focus-nfe-client.test.ts
git commit -m "feat(fiscal): cliente Focus NFe implementando a porta"
```

---

### Task 6: Webhook do emissor

A Focus responde `processando_autorizacao` na hora e avisa depois. Sem este webhook a nota fica presa em `processing`.

**Files:**
- Create: `functions/src/fiscal/invoice-webhook.ts`
- Test: `functions/src/fiscal/invoice-webhook.test.ts`

**Interfaces:**
- Consumes: nada das tasks anteriores além dos tipos
- Produces: `applyIssuerNotification(db, payload): Promise<void>`, `fiscalIssuerWebhook` (onRequest)

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "../fake-firestore.test-helper";
import {applyIssuerNotification} from "./invoice-webhook";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function seedProcessing(fake: FakeFirestore): void {
  fake.seedDoc("fiscalInvoices/inv1", {
    arenaId: "arena1",
    status: "processing",
    valorBrutoReais: 100,
  });
}

describe("applyIssuerNotification", () => {
  it("marca autorizada com número, PDF e XML", async () => {
    const fake = new FakeFirestore();
    seedProcessing(fake);

    await applyIssuerNotification(db(fake), {
      ref: "inv1",
      status: "autorizado",
      numero: "42",
      serie: "1",
      codigo_verificacao: "ABC",
      url_danfse: "https://focus/nota.pdf",
      caminho_xml_nota_fiscal: "https://focus/nota.xml",
    });

    const doc = fake.store.get("fiscalInvoices/inv1");
    assert.equal(doc?.status, "authorized");
    assert.equal(doc?.numero, "42");
    assert.equal(doc?.xmlUrl, "https://focus/nota.xml");
  });

  it("marca rejeitada guardando a mensagem da prefeitura", async () => {
    const fake = new FakeFirestore();
    seedProcessing(fake);

    await applyIssuerNotification(db(fake), {
      ref: "inv1",
      status: "erro_autorizacao",
      mensagem: "Código de serviço não habilitado",
    });

    const doc = fake.store.get("fiscalInvoices/inv1");
    assert.equal(doc?.status, "rejected");
    assert.equal(doc?.errorMessage, "Código de serviço não habilitado");
  });

  it("ignora notificação de nota que não existe", async () => {
    const fake = new FakeFirestore();
    await applyIssuerNotification(db(fake), {ref: "sumiu", status: "autorizado"});
    assert.equal(fake.store.get("fiscalInvoices/sumiu"), undefined);
  });

  it("não rebaixa uma nota já autorizada", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("fiscalInvoices/inv1", {arenaId: "arena1", status: "authorized", numero: "42"});

    await applyIssuerNotification(db(fake), {ref: "inv1", status: "processando_autorizacao"});

    assert.equal(fake.store.get("fiscalInvoices/inv1")?.status, "authorized");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/invoice-webhook.test.ts
```

- [ ] **Step 3: Implementar `invoice-webhook.ts`**

O `onRequest` valida um token compartilhado no header, no mesmo espírito do `ASAAS_WEBHOOK_ACCESS_TOKEN`.

```typescript
/** Callback do emissor: a prefeitura responde depois, não na hora da chamada. */
import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

export const FISCAL_WEBHOOK_TOKEN = defineSecret("FISCAL_WEBHOOK_TOKEN");

export interface IssuerNotification {
  ref: string;
  status: string;
  numero?: string;
  serie?: string;
  codigo_verificacao?: string;
  url_danfse?: string;
  caminho_xml_nota_fiscal?: string;
  mensagem?: string;
}

const FINAL_STATUSES = new Set(["authorized", "cancelled"]);

export async function applyIssuerNotification(
  db: Firestore,
  payload: IssuerNotification,
): Promise<void> {
  const ref = db.doc(`fiscalInvoices/${payload.ref}`);
  const snap = await ref.get();
  if (!snap.exists) return;
  if (FINAL_STATUSES.has(String(snap.data()?.status))) return;

  if (payload.status === "autorizado") {
    await ref.set(
      {
        status: "authorized",
        numero: payload.numero ?? null,
        serie: payload.serie ?? null,
        codigoVerificacao: payload.codigo_verificacao ?? null,
        pdfUrl: payload.url_danfse ?? null,
        xmlUrl: payload.caminho_xml_nota_fiscal ?? null,
        errorMessage: null,
        authorizedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    return;
  }

  if (payload.status === "erro_autorizacao" || payload.status === "cancelado") {
    await ref.set(
      {
        status: payload.status === "cancelado" ? "cancelled" : "rejected",
        errorMessage: payload.mensagem ?? null,
        ...(payload.status === "cancelado"
          ? {cancelledAt: FieldValue.serverTimestamp()}
          : {}),
      },
      {merge: true},
    );
  }
}

export const fiscalIssuerWebhook = onRequest(
  {secrets: [FISCAL_WEBHOOK_TOKEN]},
  async (req, res) => {
    if (req.get("x-fiscal-token") !== FISCAL_WEBHOOK_TOKEN.value()) {
      res.status(401).send("unauthorized");
      return;
    }
    try {
      await applyIssuerNotification(getFirestore(), req.body as IssuerNotification);
      res.status(200).send("ok");
    } catch (e) {
      logger.error("fiscalIssuerWebhook falhou", e);
      res.status(500).send("error");
    }
  },
);
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/invoice-webhook.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add functions/src/fiscal/invoice-webhook.ts functions/src/fiscal/invoice-webhook.test.ts
git commit -m "feat(fiscal): webhook do emissor atualiza a nota"
```

---

### Task 7: Callables da configuração fiscal

**Files:**
- Create: `functions/src/fiscal/arena-fiscal-config.ts`
- Test: `functions/src/fiscal/arena-fiscal-config.test.ts`

**Interfaces:**
- Consumes: `FiscalIssuer` (Task 3), `readArenaFiscalConfig` (Task 2)
- Produces: `saveArenaFiscalConfigCore(db, issuer, saveSecret, input): Promise<void>`, `setArenaFiscalModeCore(db, input): Promise<void>`, e os callables `saveArenaFiscalConfig`, `setArenaFiscalMode`, `getArenaFiscalRequirements`

- [ ] **Step 1: Escrever o teste que falha**

Cubra o que importa: autorização, e que segredo nenhum encosta no Firestore.

```typescript
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "../fake-firestore.test-helper";
import {FakeIssuer} from "./fake-issuer.test-helper";
import {saveArenaFiscalConfigCore, setArenaFiscalModeCore} from "./arena-fiscal-config";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function seedArena(fake: FakeFirestore): void {
  fake.seedDoc("arenas/arena1", {managerUserId: "manager1", name: "Arena X"});
}

const input = {
  arenaId: "arena1",
  callerUid: "manager1",
  cnpj: "12345678000199",
  razaoSocial: "Arena X Ltda",
  inscricaoMunicipal: "123456",
  regimeTributario: "simples_nacional" as const,
  enderecoFiscal: {
    logradouro: "Rua A",
    numero: "10",
    bairro: "Centro",
    municipio: "Goiânia",
    uf: "GO",
    cep: "74000000",
    codigoIbge: "5208707",
  },
  services: [{id: "s1", codigoMunicipal: "3.03", descricao: "Locação de quadra", aliquotaIss: 2}],
  defaultServiceIdBooking: "s1",
  certificadoBase64: "BASE64_SECRETO",
  senhaCertificado: "senha123",
  authorizationAccepted: true,
  authorizationTermVersion: "v1",
};

describe("saveArenaFiscalConfigCore", () => {
  it("grava a config em testing e guarda só o nome do secret", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    const saved: Array<{name: string; value: string}> = [];

    await saveArenaFiscalConfigCore(
      db(fake),
      new FakeIssuer(),
      async (name, value) => {
        saved.push({name, value});
      },
      input,
    );

    const config = fake.store.get("arenas/arena1/fiscal/config");
    assert.equal(config?.status, "testing");
    assert.equal(config?.mode, "off");
    assert.equal(config?.issuerId, "emp_12345678000199");
    assert.equal(config?.credentialSecretName, "fiscal-issuer-token-arena1");
    assert.equal(saved[0].value, "tok_teste");
  });

  it("nunca grava certificado nem senha no Firestore", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    await saveArenaFiscalConfigCore(db(fake), new FakeIssuer(), async () => {}, input);

    const serialized = JSON.stringify(fake.store.get("arenas/arena1/fiscal/config"));
    assert.equal(serialized.includes("BASE64_SECRETO"), false);
    assert.equal(serialized.includes("senha123"), false);
  });

  it("registra o aceite do termo com autor e versão", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    await saveArenaFiscalConfigCore(db(fake), new FakeIssuer(), async () => {}, input);

    const config = fake.store.get("arenas/arena1/fiscal/config");
    assert.equal(config?.authorizationAcceptedByUid, "manager1");
    assert.equal(config?.authorizationTermVersion, "v1");
    assert.ok(config?.authorizationAcceptedAt);
  });

  it("recusa salvar sem aceite do termo — não se emite nota por terceiro sem autorização", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    await assert.rejects(
      () =>
        saveArenaFiscalConfigCore(
          db(fake),
          new FakeIssuer(),
          async () => {},
          {...input, authorizationAccepted: false},
        ),
      /invalid-argument|AUTHORIZATION/,
    );
    assert.equal(fake.store.get("arenas/arena1/fiscal/config"), undefined);
  });

  it("recusa quem não é gestor da arena", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    await assert.rejects(
      () =>
        saveArenaFiscalConfigCore(
          db(fake),
          new FakeIssuer(),
          async () => {},
          {...input, callerUid: "intruso"},
        ),
      /permission-denied|PERMISSION/,
    );
  });

  it("recusa serviço padrão que não está no catálogo", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    await assert.rejects(
      () =>
        saveArenaFiscalConfigCore(
          db(fake),
          new FakeIssuer(),
          async () => {},
          {...input, defaultServiceIdBooking: "inexistente"},
        ),
      /invalid-argument|INVALID/,
    );
  });
});

describe("setArenaFiscalModeCore", () => {
  it("liga o modo sempre só depois da config ativa", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    fake.seedDoc("arenas/arena1/fiscal/config", {status: "active", mode: "off", services: []});

    await setArenaFiscalModeCore(db(fake), {
      arenaId: "arena1",
      callerUid: "manager1",
      mode: "always",
    });

    assert.equal(fake.store.get("arenas/arena1/fiscal/config")?.mode, "always");
  });

  it("recusa ligar antes da config estar ativa", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    fake.seedDoc("arenas/arena1/fiscal/config", {status: "testing", mode: "off", services: []});

    await assert.rejects(
      () =>
        setArenaFiscalModeCore(db(fake), {
          arenaId: "arena1",
          callerUid: "manager1",
          mode: "always",
        }),
      /failed-precondition|NOT_ACTIVE/,
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/arena-fiscal-config.test.ts
```

- [ ] **Step 3: Implementar `arena-fiscal-config.ts`**

`assertCallerManagesArena` existe duas vezes no repositório (`arena-coupons.ts:355` e `arena-subscription.ts:155`) e em nenhuma delas é exportada. Não importe de lá nem crie uma terceira cópia genérica — o núcleo faz a checagem local lendo `managerUserId`, que é exatamente o que as rules fazem, e fica testável com `FakeFirestore`.

```typescript
/**
 * Configuração fiscal da arena. O núcleo recebe `saveSecret` injetado para o
 * teste não depender do Secret Manager.
 *
 * Certificado e senha passam por aqui em trânsito e não são gravados em lugar
 * nenhum: quem os guarda é o emissor. O que persistimos é o token da empresa,
 * e ele vai para o Secret Manager.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {SecretManagerServiceClient} from "@google-cloud/secret-manager";
import {
  FocusNfeIssuer,
  FOCUS_ACCOUNT_TOKEN,
  FOCUS_API_URL_PRODUCTION,
  FOCUS_API_URL_SANDBOX,
  FOCUS_ENV,
  focusFiscalSecrets,
} from "./focus-nfe-client";
import type {FiscalIssuer} from "./issuer-port";
import type {FiscalAddress, FiscalMode, FiscalService} from "./types";

export type SaveSecretFn = (name: string, value: string) => Promise<void>;

export interface SaveFiscalConfigInput {
  arenaId: string;
  callerUid: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  inscricaoMunicipal: string;
  regimeTributario: "simples_nacional" | "lucro_presumido" | "lucro_real" | "mei";
  enderecoFiscal: FiscalAddress;
  services: FiscalService[];
  defaultServiceIdBooking?: string;
  defaultServiceIdClub?: string;
  certificadoBase64?: string;
  senhaCertificado?: string;
  /** Aceite do termo que autoriza a nexaGO a emitir em nome da arena. */
  authorizationAccepted: boolean;
  authorizationTermVersion: string;
}

export function issuerTokenSecretName(arenaId: string): string {
  return `fiscal-issuer-token-${arenaId}`;
}

async function assertManagesArena(
  db: Firestore,
  arenaId: string,
  callerUid: string,
): Promise<void> {
  const snap = await db.doc(`arenas/${arenaId}`).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Arena não encontrada.");
  }
  if (snap.data()?.managerUserId !== callerUid) {
    throw new HttpsError("permission-denied", "Só o gestor da arena pode alterar os dados fiscais.");
  }
}

function assertDefaultServicesExist(input: SaveFiscalConfigInput): void {
  if (!input.services?.length) {
    throw new HttpsError("invalid-argument", "Cadastre ao menos um serviço.");
  }
  const ids = new Set(input.services.map((s) => s.id));
  for (const id of [input.defaultServiceIdBooking, input.defaultServiceIdClub]) {
    if (id && !ids.has(id)) {
      throw new HttpsError("invalid-argument", "Serviço padrão não está no catálogo.");
    }
  }
}

export async function saveArenaFiscalConfigCore(
  db: Firestore,
  issuer: FiscalIssuer,
  saveSecret: SaveSecretFn,
  input: SaveFiscalConfigInput,
): Promise<void> {
  await assertManagesArena(db, input.arenaId, input.callerUid);
  if (!input.authorizationAccepted || !input.authorizationTermVersion) {
    throw new HttpsError(
      "invalid-argument",
      "AUTHORIZATION_REQUIRED: aceite o termo que autoriza a emissão em nome da arena.",
    );
  }
  assertDefaultServicesExist(input);

  const registered = await issuer.registerIssuer({
    cnpj: input.cnpj,
    razaoSocial: input.razaoSocial,
    nomeFantasia: input.nomeFantasia,
    inscricaoMunicipal: input.inscricaoMunicipal,
    endereco: input.enderecoFiscal,
    regimeTributario: input.regimeTributario,
    certificadoBase64: input.certificadoBase64,
    senhaCertificado: input.senhaCertificado,
  });

  const secretName = issuerTokenSecretName(input.arenaId);
  await saveSecret(secretName, registered.token);

  // Note o que NÃO entra: certificadoBase64, senhaCertificado, token.
  await db.doc(`arenas/${input.arenaId}/fiscal/config`).set(
    {
      cnpj: input.cnpj,
      razaoSocial: input.razaoSocial,
      nomeFantasia: input.nomeFantasia ?? null,
      inscricaoMunicipal: input.inscricaoMunicipal,
      regimeTributario: input.regimeTributario,
      enderecoFiscal: input.enderecoFiscal,
      services: input.services,
      defaultServiceIdBooking: input.defaultServiceIdBooking ?? null,
      defaultServiceIdClub: input.defaultServiceIdClub ?? null,
      issuerId: registered.issuerId,
      credentialSecretName: secretName,
      certificateExpiresAt: registered.certificateExpiresAt ?? null,
      status: "testing",
      mode: "off",
      statusMessage: null,
      authorizationAcceptedAt: FieldValue.serverTimestamp(),
      authorizationAcceptedByUid: input.callerUid,
      authorizationTermVersion: input.authorizationTermVersion,
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
}

export interface SetFiscalModeInput {
  arenaId: string;
  callerUid: string;
  mode: FiscalMode;
}

export async function setArenaFiscalModeCore(
  db: Firestore,
  input: SetFiscalModeInput,
): Promise<void> {
  await assertManagesArena(db, input.arenaId, input.callerUid);
  const ref = db.doc(`arenas/${input.arenaId}/fiscal/config`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "Configure os dados fiscais antes.");
  }
  if (input.mode !== "off" && snap.data()?.status !== "active") {
    throw new HttpsError(
      "failed-precondition",
      "NOT_ACTIVE: emita a nota de teste antes de ligar a emissão.",
    );
  }
  await ref.set({mode: input.mode, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
}

function buildIssuer(): FiscalIssuer {
  const sandbox = FOCUS_ENV.value() === "sandbox";
  return new FocusNfeIssuer(
    sandbox ? FOCUS_API_URL_SANDBOX : FOCUS_API_URL_PRODUCTION,
    undefined,
    FOCUS_ACCOUNT_TOKEN.value(),
  );
}

const secretManager = new SecretManagerServiceClient();

/** Cria a secret se não existir e adiciona a versão nova. */
export async function saveSecretToSecretManager(name: string, value: string): Promise<void> {
  const projectId = process.env.GCLOUD_PROJECT ?? "";
  const parent = `projects/${projectId}`;
  try {
    await secretManager.createSecret({
      parent,
      secretId: name,
      secret: {replication: {automatic: {}}},
    });
  } catch {
    // já existe — segue para adicionar a versão
  }
  await secretManager.addSecretVersion({
    parent: `${parent}/secrets/${name}`,
    payload: {data: Buffer.from(value, "utf8")},
  });
}

export const saveArenaFiscalConfig = onCall(
  {secrets: focusFiscalSecrets},
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "Faça login para continuar.");
    }
    const data = (request.data ?? {}) as Omit<SaveFiscalConfigInput, "callerUid">;
    await saveArenaFiscalConfigCore(getFirestore(), buildIssuer(), saveSecretToSecretManager, {
      ...data,
      callerUid,
    });
    return {ok: true};
  },
);

export const setArenaFiscalMode = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const data = (request.data ?? {}) as Omit<SetFiscalModeInput, "callerUid">;
  await setArenaFiscalModeCore(getFirestore(), {...data, callerUid});
  return {ok: true};
});

export const getArenaFiscalRequirements = onCall(
  {secrets: focusFiscalSecrets},
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Faça login para continuar.");
    }
    const codigoIbge = String((request.data as {codigoIbge?: string})?.codigoIbge ?? "");
    return {requirements: await buildIssuer().getMunicipalRequirements(codigoIbge)};
  },
);
```

Adicione `@google-cloud/secret-manager` às dependências de `functions/package.json` nesta task.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/arena-fiscal-config.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add functions/src/fiscal/arena-fiscal-config.ts functions/src/fiscal/arena-fiscal-config.test.ts
git commit -m "feat(fiscal): callables de configuração fiscal da arena"
```

---

### Task 8: Trigger, exports, rules e índice

Fecha o backend: liga o processor no Firestore, expõe as functions e protege os dados.

**Files:**
- Modify: `functions/src/fiscal/invoice-processor.ts` (acrescentar o trigger)
- Modify: `functions/src/index.ts`
- Modify: `firestore.rules`
- Modify: `firestore.indexes.json`
- Create: `functions/FISCAL.md`

- [ ] **Step 1: Acrescentar o trigger ao processor**

```typescript
/** Processa o pedido assim que ele nasce. Retry automático em erro lançado. */
export const onFiscalInvoiceRequested = onDocumentCreated(
  {
    document: "fiscalInvoices/{invoiceId}",
    secrets: [...focusFiscalSecrets, FISCAL_WEBHOOK_TOKEN],
    retry: true,
  },
  async (event) => {
    const issuer = new FocusNfeIssuer(
      FOCUS_ENV.value() === "sandbox" ? FOCUS_API_URL_SANDBOX : FOCUS_API_URL_PRODUCTION,
    );
    await processInvoiceRequest(
      getFirestore(),
      issuer,
      readIssuerTokenFromSecretManager,
      event.params.invoiceId,
    );
  },
);
```

`readIssuerTokenFromSecretManager` é a contraparte de leitura do `saveSecretToSecretManager` da Task 7. Acrescente ao mesmo `invoice-processor.ts`:

```typescript
const secretManager = new SecretManagerServiceClient();

/** Lê a versão mais recente do secret cujo nome está em `credentialSecretName`. */
export const readIssuerTokenFromSecretManager: ReadIssuerToken = async (secretName) => {
  const projectId = process.env.GCLOUD_PROJECT ?? "";
  const [version] = await secretManager.accessSecretVersion({
    name: `projects/${projectId}/secrets/${secretName}/versions/latest`,
  });
  const value = version.payload?.data?.toString();
  if (!value) throw new Error("FISCAL_ISSUER_TOKEN_MISSING");
  return value;
};
```

Os imports que a Task 3 deliberadamente deixou de fora entram agora: `onDocumentCreated`, `getFirestore`, `SecretManagerServiceClient`, `FocusNfeIssuer` e os secrets. A dependência `@google-cloud/secret-manager` já foi adicionada na Task 7.

- [ ] **Step 2: Exportar no `index.ts`**

Siga o padrão de agrupamento por módulo que o arquivo já usa:

```typescript
export {
  saveArenaFiscalConfig,
  setArenaFiscalMode,
  getArenaFiscalRequirements,
} from "./fiscal/arena-fiscal-config";
export {onFiscalInvoiceRequested} from "./fiscal/invoice-processor";
export {fiscalIssuerWebhook} from "./fiscal/invoice-webhook";
```

- [ ] **Step 3: Escrever as rules**

Em `firestore.rules`, junto do bloco `arenas/{arenaId}/billing`, que já tem exatamente esta forma:

```
    // Configuração fiscal — leitura do gestor/admin; escrita só via functions.
    match /arenas/{arenaId}/fiscal/{docId} {
      allow read: if request.auth != null && (
        get(/databases/$(database)/documents/arenas/$(arenaId)).data.managerUserId == request.auth.uid ||
        isAdmin() ||
        isSuperAdmin()
      );
      allow write: if false;
    }

    // Notas fiscais — a arena vê as suas, o tomador vê a dele.
    match /fiscalInvoices/{invoiceId} {
      allow read: if request.auth != null && (
        isSuperAdmin() ||
        isAdmin() ||
        arenaCanRead(resource.data.arenaId, 'financeiro') ||
        resource.data.tomadorUid == request.auth.uid
      );
      allow create, update, delete: if false;
    }
```

- [ ] **Step 4: Acrescentar o índice**

Em `firestore.indexes.json`, para a listagem do portal:

```json
{
  "collectionGroup": "fiscalInvoices",
  "queryScope": "COLLECTION",
  "fields": [
    {"fieldPath": "arenaId", "order": "ASCENDING"},
    {"fieldPath": "createdAt", "order": "DESCENDING"}
  ]
}
```

- [ ] **Step 5: Escrever `functions/FISCAL.md`**

No mesmo formato de `functions/ASAAS.md`: secrets (`FOCUS_ACCOUNT_TOKEN`, `FOCUS_ENV`, `FISCAL_WEBHOOK_TOKEN`), URL do webhook a cadastrar na Focus, lista de functions do módulo e o comando de deploy. Não rode o deploy.

- [ ] **Step 6: Verificar que tudo compila e a suíte passa**

```bash
cd functions && npm run lint && npm test
```

- [ ] **Step 7: Commit**

```bash
git add functions/src/fiscal/invoice-processor.ts functions/src/index.ts functions/FISCAL.md functions/package.json firestore.rules firestore.indexes.json
git commit -m "feat(fiscal): trigger, exports, rules e índice do módulo fiscal"
```

---

### Task 9: Wizard fiscal no portal da arena

**Files:**
- Create: `frontend/projects/arena/src/app/painel/fiscal/fiscal.model.ts`
- Create: `frontend/projects/arena/src/app/painel/fiscal/fiscal-repository.ts`
- Create: `frontend/projects/arena/src/app/painel/fiscal/panel-fiscal.component.ts`
- Create: `frontend/projects/arena/src/app/painel/fiscal/fiscal.model.spec.ts`
- Modify: `frontend/projects/arena/src/app/app.routes.ts`

**Interfaces:**
- Consumes: callables `saveArenaFiscalConfig`, `setArenaFiscalMode` (Task 7)
- Produces: `ArenaFiscalConfigView`, `mapFiscalConfig(raw)`, `fiscalConfigStatusLabel(status)`, `PanelFiscalComponent`

- [ ] **Step 1: Escrever o teste do model**

O que dá para testar sem TestBed é o mapeamento e os rótulos — comece por aí. Create `fiscal.model.spec.ts`:

```typescript
import { mapFiscalConfig, fiscalConfigStatusLabel, FISCAL_MODE_LABEL } from './fiscal.model';

describe('mapFiscalConfig', () => {
  it('devolve null quando a arena não tem config', () => {
    expect(mapFiscalConfig(undefined)).toBeNull();
  });

  it('mapeia os campos e o catálogo de serviços', () => {
    const config = mapFiscalConfig({
      cnpj: '12345678000199',
      razaoSocial: 'Arena X Ltda',
      inscricaoMunicipal: '123456',
      services: [{ id: 's1', codigoMunicipal: '3.03', descricao: 'Quadra', aliquotaIss: 2 }],
      mode: 'always',
      status: 'active',
    });
    expect(config?.cnpj).toBe('12345678000199');
    expect(config?.services.length).toBe(1);
    expect(config?.mode).toBe('always');
  });

  it('assume rascunho e desligado quando os campos faltam', () => {
    const config = mapFiscalConfig({ cnpj: '12345678000199' });
    expect(config?.status).toBe('draft');
    expect(config?.mode).toBe('off');
    expect(config?.services).toEqual([]);
  });
});

describe('fiscalConfigStatusLabel', () => {
  it('traduz cada status para português', () => {
    expect(fiscalConfigStatusLabel('draft')).toBe('Rascunho');
    expect(fiscalConfigStatusLabel('testing')).toBe('Em teste');
    expect(fiscalConfigStatusLabel('active')).toBe('Ativa');
    expect(fiscalConfigStatusLabel('error')).toBe('Com erro');
  });

  it('rotula os modos', () => {
    expect(FISCAL_MODE_LABEL.always).toBe('Emitir sempre');
    expect(FISCAL_MODE_LABEL.on_demand).toBe('Só quando o cliente pedir');
    expect(FISCAL_MODE_LABEL.off).toBe('Desligado');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd frontend && npx ng test arena --watch=false --include='**/fiscal.model.spec.ts'
```

- [ ] **Step 3: Implementar `fiscal.model.ts` e `fiscal-repository.ts`**

`fiscal.model.ts`, no padrão de `painel/orders/comanda.model.ts` (tipos + mapeadores puros + mapas de rótulo):

```typescript
/** Espelha `arenas/{arenaId}/fiscal/config` gravado pelas functions. */

export type FiscalMode = 'always' | 'on_demand' | 'off';
export type FiscalConfigStatus = 'draft' | 'testing' | 'active' | 'error';

export const FISCAL_MODE_LABEL: Record<FiscalMode, string> = {
  always: 'Emitir sempre',
  on_demand: 'Só quando o cliente pedir',
  off: 'Desligado',
};

const FISCAL_CONFIG_STATUS_LABEL: Record<FiscalConfigStatus, string> = {
  draft: 'Rascunho',
  testing: 'Em teste',
  active: 'Ativa',
  error: 'Com erro',
};

export function fiscalConfigStatusLabel(status: FiscalConfigStatus): string {
  return FISCAL_CONFIG_STATUS_LABEL[status];
}

export interface FiscalServiceView {
  id: string;
  codigoMunicipal: string;
  descricao: string;
  aliquotaIss: number;
}

export interface ArenaFiscalConfigView {
  cnpj: string;
  razaoSocial: string;
  inscricaoMunicipal: string;
  services: FiscalServiceView[];
  defaultServiceIdBooking: string | null;
  defaultServiceIdClub: string | null;
  mode: FiscalMode;
  status: FiscalConfigStatus;
  statusMessage: string | null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** Config incompleta é normal: o wizard grava em etapas. */
export function mapFiscalConfig(raw: Record<string, unknown> | undefined): ArenaFiscalConfigView | null {
  if (!raw) return null;
  const services = Array.isArray(raw['services']) ? (raw['services'] as FiscalServiceView[]) : [];
  return {
    cnpj: asString(raw['cnpj']),
    razaoSocial: asString(raw['razaoSocial']),
    inscricaoMunicipal: asString(raw['inscricaoMunicipal']),
    services,
    defaultServiceIdBooking: (raw['defaultServiceIdBooking'] as string) ?? null,
    defaultServiceIdClub: (raw['defaultServiceIdClub'] as string) ?? null,
    mode: (raw['mode'] as FiscalMode) ?? 'off',
    status: (raw['status'] as FiscalConfigStatus) ?? 'draft',
    statusMessage: (raw['statusMessage'] as string) ?? null,
  };
}
```

`fiscal-repository.ts` segue `painel/plans/subscription-repository.ts`: um `docData`/`onSnapshot` em `arenas/{arenaId}/fiscal/config` para ler, e `httpsCallable` para `saveArenaFiscalConfig`, `setArenaFiscalMode` e `getArenaFiscalRequirements`.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd frontend && npx ng test arena --watch=false --include='**/fiscal.model.spec.ts'
```

- [ ] **Step 5: Implementar `panel-fiscal.component.ts`**

Componente standalone com signals, no padrão de `panel-finance.component.ts`. Cinco passos, um por vez:

1. Dados da empresa — CNPJ, razão social, inscrição municipal, regime, endereço fiscal com código IBGE.
2. Catálogo de serviços — pelo menos um; marcar o padrão de reserva e o de clubinho.
3. **Termo de autorização** — a arena autoriza expressamente a nexaGO a emitir NFS-e em nome dela, usando o certificado dela. Checkbox obrigatório, com o texto do termo visível na tela (não atrás de link) e a versão do termo em constante no código (`FISCAL_TERM_VERSION = 'v1'`). Sem marcar, o botão de avançar fica desabilitado — e o backend recusa de novo, porque validação de cliente não é garantia.
4. Credenciais — upload do certificado A1 e senha. Deixe explícito na tela que a nexaGO não guarda o arquivo: ele vai para o emissor.
5. Nota de teste — emite contra a homologação; só com sucesso a config vira `active` e o toggle de modo é liberado.

O `status` da config aparece fixo no topo, com o botão "Preciso de ajuda" ao lado.

- [ ] **Step 6: Registrar a rota**

Em `app.routes.ts`, seguindo o padrão exato das rotas vizinhas:

```typescript
  {
    path: 'painel/fiscal',
    title: 'Notas fiscais — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('financeiro')],
    loadComponent: () =>
      import('./painel/fiscal/panel-fiscal.component').then((m) => m.PanelFiscalComponent),
  },
```

- [ ] **Step 7: Verificar o build do portal**

Rode a partir do diretório do worktree, com caminho absoluto, e confira no output que o `Output location` aponta para dentro do worktree e não para o checkout principal:

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/nexago_app/.claude/worktrees/palpite-save-persistence-0b1cc0/frontend && npx ng build arena
```

- [ ] **Step 8: Commit**

```bash
git add frontend/projects/arena/src/app/painel/fiscal frontend/projects/arena/src/app/app.routes.ts
git commit -m "feat(arena-web): wizard de configuração fiscal"
```

---

### Task 10: Aba Notas fiscais no financeiro

**Files:**
- Create: `frontend/projects/arena/src/app/painel/finance/fiscal-invoices-repository.ts`
- Create: `frontend/projects/arena/src/app/painel/finance/fiscal-invoice.model.ts`
- Create: `frontend/projects/arena/src/app/painel/finance/fiscal-invoice.model.spec.ts`
- Create: `frontend/projects/arena/src/app/painel/finance/panel-fiscal-invoices.component.ts`
- Modify: `frontend/projects/arena/src/app/app.routes.ts`
- Modify: `frontend/projects/arena/src/app/painel/finance/panel-finance.component.ts` (link para a nova tela)

**Interfaces:**
- Consumes: coleção `fiscalInvoices` (Task 8), `setArenaFiscalMode` (Task 7)
- Produces: `FiscalInvoiceItem`, `mapFiscalInvoice(raw)`, `FISCAL_INVOICE_STATUS_LABEL`, `PanelFiscalInvoicesComponent`

- [ ] **Step 1: Escrever o teste do model**

```typescript
import { mapFiscalInvoice, FISCAL_INVOICE_STATUS_LABEL } from './fiscal-invoice.model';

describe('mapFiscalInvoice', () => {
  it('mapeia uma nota autorizada', () => {
    const item = mapFiscalInvoice('inv1', {
      arenaId: 'arena1',
      origin: 'booking',
      status: 'authorized',
      numero: '42',
      valorBrutoReais: 100,
      tomador: { nome: 'Fulano', cpfCnpj: '39053344705' },
      pdfUrl: 'https://exemplo/n.pdf',
    });
    expect(item.id).toBe('inv1');
    expect(item.numero).toBe('42');
    expect(item.pdfUrl).toBe('https://exemplo/n.pdf');
    expect(item.tomadorNome).toBe('Fulano');
  });

  it('sobrevive a documento incompleto', () => {
    const item = mapFiscalInvoice('inv2', { arenaId: 'arena1' });
    expect(item.status).toBe('requested');
    expect(item.valorBrutoReais).toBe(0);
    expect(item.pdfUrl).toBeNull();
  });
});

describe('FISCAL_INVOICE_STATUS_LABEL', () => {
  it('traduz os status para português', () => {
    expect(FISCAL_INVOICE_STATUS_LABEL.requested).toBe('Na fila');
    expect(FISCAL_INVOICE_STATUS_LABEL.processing).toBe('Processando');
    expect(FISCAL_INVOICE_STATUS_LABEL.authorized).toBe('Autorizada');
    expect(FISCAL_INVOICE_STATUS_LABEL.rejected).toBe('Rejeitada');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd frontend && npx ng test arena --watch=false --include='**/fiscal-invoice.model.spec.ts'
```

- [ ] **Step 3: Implementar o model e o repositório**

`fiscal-invoice.model.ts`:

```typescript
/** Espelha `fiscalInvoices/{id}`, escrito só pelas functions. */

export type FiscalInvoiceStatus =
  | 'requested'
  | 'processing'
  | 'authorized'
  | 'rejected'
  | 'cancelled'
  | 'cancellation_failed';

export const FISCAL_INVOICE_STATUS_LABEL: Record<FiscalInvoiceStatus, string> = {
  requested: 'Na fila',
  processing: 'Processando',
  authorized: 'Autorizada',
  rejected: 'Rejeitada',
  cancelled: 'Cancelada',
  cancellation_failed: 'Falha ao cancelar',
};

export const FISCAL_INVOICE_ORIGIN_LABEL: Record<string, string> = {
  booking: 'Reserva',
  club: 'Clubinho',
  manual: 'Avulsa',
};

export interface FiscalInvoiceItem {
  id: string;
  origin: string;
  status: FiscalInvoiceStatus;
  numero: string | null;
  valorBrutoReais: number;
  tomadorNome: string;
  tomadorDocumento: string;
  pdfUrl: string | null;
  xmlUrl: string | null;
  errorMessage: string | null;
  createdAt: Date | null;
}

function toDate(value: unknown): Date | null {
  const ts = value as {toDate?: () => Date} | undefined;
  return typeof ts?.toDate === 'function' ? ts.toDate() : null;
}

/** Documento incompleto acontece enquanto a nota está em voo. */
export function mapFiscalInvoice(id: string, raw: Record<string, unknown>): FiscalInvoiceItem {
  const tomador = (raw['tomador'] ?? {}) as {nome?: string; cpfCnpj?: string};
  return {
    id,
    origin: (raw['origin'] as string) ?? 'booking',
    status: (raw['status'] as FiscalInvoiceStatus) ?? 'requested',
    numero: (raw['numero'] as string) ?? null,
    valorBrutoReais: Number(raw['valorBrutoReais']) || 0,
    tomadorNome: tomador.nome ?? '—',
    tomadorDocumento: tomador.cpfCnpj ?? '',
    pdfUrl: (raw['pdfUrl'] as string) ?? null,
    xmlUrl: (raw['xmlUrl'] as string) ?? null,
    errorMessage: (raw['errorMessage'] as string) ?? null,
    createdAt: toDate(raw['createdAt']),
  };
}
```

O repositório consulta `fiscalInvoices` com `where('arenaId','==',arenaId)` e `orderBy('createdAt','desc')` — o índice foi criado na Task 8.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd frontend && npx ng test arena --watch=false --include='**/fiscal-invoice.model.spec.ts'
```

- [ ] **Step 5: Implementar `panel-fiscal-invoices.component.ts`**

Lista com filtro de período e de status, valor, tomador, número, botões de PDF e XML quando autorizada, e a mensagem de erro visível quando rejeitada. No topo, o seletor de modo (sempre / sob demanda / desligado) chamando `setArenaFiscalMode`, desabilitado enquanto a config não estiver `active`, com um link para o wizard nesse caso.

Estado vazio no padrão do portal: quando a arena não tem config, o texto convida a configurar e leva para `painel/fiscal`.

- [ ] **Step 6: Registrar a rota e ligar no financeiro**

```typescript
  {
    path: 'painel/financeiro/notas',
    title: 'Notas fiscais — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('financeiro')],
    loadComponent: () =>
      import('./painel/finance/panel-fiscal-invoices.component').then(
        (m) => m.PanelFiscalInvoicesComponent,
      ),
  },
```

Acrescente o link para essa rota em `panel-finance.component.ts`, ao lado do link existente para relatórios.

- [ ] **Step 7: Rodar a suíte do portal e o build**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/nexago_app/.claude/worktrees/palpite-save-persistence-0b1cc0/frontend && npx ng test arena --watch=false && npx ng build arena
```

Se algum spec novo quebrar com `NG0908`, falta `provideZonelessChangeDetection()` nos providers do `TestBed` — é exigência conhecida deste repositório.

- [ ] **Step 8: Verificação visual**

Suba o portal, abra `painel/fiscal` e `painel/financeiro/notas`, e confira os dois estados: arena sem config (convite para configurar) e arena com config ativa (lista e seletor de modo). Capture uma tela de cada.

- [ ] **Step 9: Commit**

```bash
git add frontend/projects/arena/src/app/painel/finance frontend/projects/arena/src/app/app.routes.ts
git commit -m "feat(arena-web): aba de notas fiscais no financeiro"
```

---

## Depois da Fatia A

Não faz parte deste plano, e não deve ser puxado para dentro dele:

- **Fatia B:** baixa manual de pagamento no local, nota avulsa com `fiscalCustomers`, modo sob demanda com pedido do atleta no app e no portal.
- **Fatia C:** cancelamento e estorno, alertas de certificado vencendo, config em erro por rejeição em sequência, telas de backoffice.
- **Contratação da Focus:** a conta é da nexaGO e cada arena entra como empresa
  dentro dela. O plano de entrada é o **Start** (R$113,90, 3 CNPJs, 100 notas por
  CNPJ, R$0,10 a adicional), que cobre o piloto; migra para o **Growth** (R$548,
  CNPJs ilimitados, 4.000 notas) por volta de 10 arenas. Não habilitar
  "Recebimento de NFe/CTe/NFSe Nacional": nota recebida também consome o pacote.
- **Deploy:** nada aqui é deployado. Quando for, a ordem é `firestore:indexes` → `firestore:rules` → functions, e os secrets (`FOCUS_ACCOUNT_TOKEN`, `FOCUS_ENV`, `FISCAL_WEBHOOK_TOKEN`) precisam existir antes.
