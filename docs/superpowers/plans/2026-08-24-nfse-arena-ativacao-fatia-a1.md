# NFS-e da arena — Fatia A.1: ativação real Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma arena em `status: "testing"` consegue emitir uma nota real em homologação pelo próprio wizard; se autorizada, a config vira `active` sozinha. O mesmo mecanismo fecha o botão "Reemitir" para qualquer nota `rejected` real na aba Notas fiscais.

**Architecture:** Reaproveita o pipeline inteiro da Fatia A (`fiscalInvoices`, `onFiscalInvoiceRequested`, `processInvoiceRequest`, `FocusNfeIssuer`, `applyIssuerNotification`) sem reescrever nada dele. Dois arquivos novos em `functions/src/fiscal/`: `invoice-retry.ts` (o primitivo de resetar-e-reprocessar, compartilhado) e `activation.ts` (o callable de ativação, construído sobre esse primitivo, mais o trigger que promove `status` quando a nota de teste resolve).

**Tech Stack:** TypeScript, Firebase Functions v7, firebase-admin v13, Firestore. Portal da arena em Angular standalone com signals.

**Spec:** `docs/superpowers/specs/2026-08-24-nfse-arena-ativacao-fatia-a1-design.md`

## Global Constraints

- Português nas strings e na UI, inglês no código. Comentários em português, no tom dos arquivos vizinhos.
- **Retrocompatibilidade absoluta:** nenhum caminho de pagamento ou processamento de nota existente pode mudar de comportamento para `origin` diferente de `"activation_test"`.
- Tomador da nota de teste: CPF sintético fixo, formato-válido, não-real, igual para toda arena. Nome "Cliente de Teste NexaGO".
- Valor da nota de teste: R$1,00 fixo, sempre usando o `defaultServiceIdBooking` real da config.
- Id da nota de ativação é determinístico por arena (`activation:{arenaId}`) — no máximo uma por arena, sempre.
- `retryFiscalInvoice` só aceita `status === "rejected"`. `"cancellation_failed"` fica de fora (rota do contador, Fatia C).
- Permissão: dono da arena (`managerUserId`), mesma regra de toda ação fiscal já existente.
- Estilo em `functions/`: aspas duplas, ponto e vírgula, 2 espaços de indentação.
- Estilo no portal da arena: aspas simples, componentes standalone, signals, `protected readonly` nos membros de template.
- Testes: `node:test` + `node:assert/strict`, com `FakeFirestore`/`FakeIssuer` de `functions/src/fiscal/`. Rodar isolado com `npx ts-node --transpile-only src/fiscal/<arquivo>.test.ts` de dentro de `functions/`.
- Não deployar nada.

---

## File Structure

**Criados em `functions/src/fiscal/`:**

| Arquivo | Responsabilidade |
|---|---|
| `invoice-retry.ts` | `reprocessFiscalInvoice` (primitivo) + callable `retryFiscalInvoice` |
| `activation.ts` | Callable `emitActivationTestInvoice` + trigger `onActivationTestInvoiceResolved` |

**Modificados:**

- `functions/src/fiscal/types.ts` — `FiscalInvoiceOrigin` ganha `"activation_test"`
- `functions/src/fiscal/invoice-emitter.ts` — `shouldProcess` (gate de status + pagamento), `IdempotencyInput`/`buildIdempotencyKey`
- `functions/src/fiscal/invoice-repository.ts` — exporta `invoiceIdFor`
- `functions/src/fiscal/invoice-processor.ts` — `isOriginPaid` aceita `"activation_test"`; trigger passa a usar `buildDefaultIssuer`
- `functions/src/fiscal/focus-nfe-client.ts` — novo `buildDefaultIssuer()`
- `functions/src/fiscal/arena-fiscal-config.ts` — `assertManagesArena` passa a ser exportada
- `functions/src/index.ts` — exporta os 2 callables novos e o trigger novo
- `functions/FISCAL.md` — remove a seção "Limitação conhecida: ativação" da Fatia A, documenta o fluxo real

**Portal da arena (`frontend/projects/arena/src/app/painel/`):**

- `fiscal/fiscal-repository.ts` — wrappers de `emitActivationTestInvoice` e `retryFiscalInvoice`
- `finance/fiscal-invoice.model.ts` — rótulo de `activation_test` em `FISCAL_INVOICE_ORIGIN_LABEL`
- `fiscal/panel-fiscal.component.ts` — passo 5 ganha o botão de emitir/tentar de novo
- `finance/panel-fiscal-invoices.component.ts` — botão "Reemitir" e etiqueta de teste

---

### Task 1: Estender o pipeline de emissão para aceitar `activation_test`

O coração do design: sem isso, nenhuma nota de ativação passaria da primeira checagem. Toca 4 arquivos pequenos que juntos formam um único pré-requisito — nenhum deles funciona sozinho para o propósito desta fatia.

**Files:**
- Modify: `functions/src/fiscal/types.ts`
- Modify: `functions/src/fiscal/invoice-emitter.ts`
- Modify: `functions/src/fiscal/invoice-repository.ts`
- Modify: `functions/src/fiscal/invoice-processor.ts`
- Test: `functions/src/fiscal/invoice-emitter.test.ts` (existente, adicionar casos)
- Test: `functions/src/fiscal/invoice-processor.test.ts` (existente, adicionar casos)

**Interfaces:**
- Consumes: nada de tasks futuras
- Produces: `FiscalInvoiceOrigin` inclui `"activation_test"`; `shouldProcess` aceita esse origin com `config.status` em `"testing"`/`"error"`; `buildIdempotencyKey({origin: "activation_test", arenaId})` → `` `activation:${arenaId}` ``; `invoiceIdFor(arenaId, idempotencyKey): string` exportada de `invoice-repository.ts`; `isOriginPaid` retorna `true` para `"activation_test"`

- [ ] **Step 1: Escrever os testes que falham — `shouldProcess` e `buildIdempotencyKey`**

Abra `functions/src/fiscal/invoice-emitter.test.ts` e acrescente estes casos dentro dos `describe` existentes (não recrie o arquivo, edite):

```typescript
describe("shouldProcess — activation_test", () => {
  const activationBase = {
    origin: "activation_test" as const,
    originPaid: true,
    valorBrutoReais: 1,
    tomadorCpfCnpj: "39053344705",
    hasAuthorizedTwin: false,
  };

  it("processa com status testing, mesmo sem active", () => {
    const testingConfig = config({status: "testing", mode: "off"});
    assert.deepEqual(
      shouldProcess({...activationBase, config: testingConfig}),
      {ok: true},
    );
  });

  it("processa com status error (caminho do reemitir)", () => {
    const errorConfig = config({status: "error", mode: "off"});
    assert.deepEqual(
      shouldProcess({...activationBase, config: errorConfig}),
      {ok: true},
    );
  });

  it("recusa com status draft — cadastro ainda não foi enviado", () => {
    const draftConfig = config({status: "draft", mode: "off"});
    assert.deepEqual(
      shouldProcess({...activationBase, config: draftConfig}),
      {ok: false, reason: "CONFIG_NOT_EMITTING"},
    );
  });

  it("dispensa a checagem de pagamento, igual manual", () => {
    const testingConfig = config({status: "testing", mode: "off"});
    const result = shouldProcess({...activationBase, config: testingConfig, originPaid: false});
    assert.deepEqual(result, {ok: true});
  });
});

describe("buildIdempotencyKey — activation_test", () => {
  it("deriva da arena, não de pagamento", () => {
    assert.equal(
      buildIdempotencyKey({origin: "activation_test", arenaId: "arena1"}),
      "activation:arena1",
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/invoice-emitter.test.ts
```

Esperado: falha de tipo (TypeScript não compila `origin: "activation_test"` contra o `FiscalInvoiceOrigin`/`ShouldProcessInput`/`IdempotencyInput` atuais).

- [ ] **Step 3: `types.ts` — acrescentar o origin**

Em `functions/src/fiscal/types.ts:7`, mude:

```typescript
export type FiscalInvoiceOrigin = "booking" | "club" | "manual";
```

para:

```typescript
export type FiscalInvoiceOrigin = "booking" | "club" | "manual" | "activation_test";
```

- [ ] **Step 4: `invoice-emitter.ts` — o gate de status em `shouldProcess`**

Em `functions/src/fiscal/invoice-emitter.ts`, o `shouldProcess` atual (linhas 42-60) começa assim:

```typescript
export function shouldProcess(input: ShouldProcessInput): ShouldProcessResult {
  const {config} = input;
  if (!config || config.status !== "active" || config.mode === "off") {
    return {ok: false, reason: "CONFIG_NOT_EMITTING"};
  }
  if (input.origin !== "manual" && !input.originPaid) {
    return {ok: false, reason: "ORIGIN_NOT_PAID"};
  }
  ...
```

Troque só as duas primeiras linhas do corpo — a checagem de status precisa ramificar por origin, e a checagem de pagamento precisa dispensar `"activation_test"` junto com `"manual"`:

```typescript
export function shouldProcess(input: ShouldProcessInput): ShouldProcessResult {
  const {config} = input;
  if (input.origin === "activation_test") {
    // A nota de ativação roda enquanto o status ainda NÃO é "active" — ela é
    // quem produz esse estado. "error" também é aceito: é o caminho do
    // reemitir depois de corrigir o cadastro. `mode` não importa aqui —
    // emissão manual do dono, não emissão automática por pagamento.
    if (!config || (config.status !== "testing" && config.status !== "error")) {
      return {ok: false, reason: "CONFIG_NOT_EMITTING"};
    }
  } else if (!config || config.status !== "active" || config.mode === "off") {
    return {ok: false, reason: "CONFIG_NOT_EMITTING"};
  }
  if (input.origin !== "manual" && input.origin !== "activation_test" && !input.originPaid) {
    return {ok: false, reason: "ORIGIN_NOT_PAID"};
  }
  ...
```

Não toque no resto da função (checagem de valor, CPF, `hasAuthorizedTwin` continuam iguais).

- [ ] **Step 5: `invoice-emitter.ts` — a variante nova em `IdempotencyInput`/`buildIdempotencyKey`**

O `IdempotencyInput` atual (linhas 62-65):

```typescript
export type IdempotencyInput =
  | {origin: FiscalInvoiceOrigin; asaasPaymentId: string}
  | {origin: FiscalInvoiceOrigin; bookingId: string; receiptId: string}
  | {origin: "manual"; invoiceId: string};
```

Ganha a quarta variante:

```typescript
export type IdempotencyInput =
  | {origin: FiscalInvoiceOrigin; asaasPaymentId: string}
  | {origin: FiscalInvoiceOrigin; bookingId: string; receiptId: string}
  | {origin: "manual"; invoiceId: string}
  | {origin: "activation_test"; arenaId: string};
```

E `buildIdempotencyKey` (linhas 71-75) precisa de um `if` **antes** do `else` final — a variante nova não tem `asaasPaymentId` nem `receiptId`, então cairia por engano no `` `manual:${input.invoiceId}` `` se você só acrescentar no fim:

```typescript
export function buildIdempotencyKey(input: IdempotencyInput): string {
  if ("asaasPaymentId" in input) return `payment:${input.asaasPaymentId}`;
  if ("receiptId" in input) return `receipt:${input.bookingId}:${input.receiptId}`;
  if ("arenaId" in input) return `activation:${input.arenaId}`;
  return `manual:${input.invoiceId}`;
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/invoice-emitter.test.ts
```

- [ ] **Step 7: Escrever o teste que falha — `isOriginPaid`**

Em `functions/src/fiscal/invoice-processor.test.ts`, acrescente (dentro do `describe("processInvoiceRequest", ...)` existente, ou um novo `describe` no mesmo arquivo):

```typescript
describe("processInvoiceRequest — activation_test", () => {
  it("processa a nota de ativação mesmo com a config em testing", async () => {
    const fake = new FakeFirestore();
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
      mode: "off",
      status: "testing",
    });
    fake.seedDoc("fiscalInvoices/inv1", {
      arenaId: "arena1",
      origin: "activation_test",
      originId: null,
      idempotencyKey: "activation:arena1",
      serviceId: "s1",
      codigoMunicipal: "3.03",
      aliquotaIss: 2,
      descricao: "Nota de teste — ativação",
      tomador: {nome: "Cliente de Teste NexaGO", cpfCnpj: "39053344705"},
      tomadorUid: null,
      valorBrutoReais: 1,
      status: "requested",
    });
    const issuer = new FakeIssuer();

    await processInvoiceRequest(db(fake), issuer, async () => "tok_teste", "inv1");

    const doc = fake.store.get("fiscalInvoices/inv1");
    assert.equal(doc?.status, "authorized");
    assert.equal(issuer.issued.length, 1);
  });
});
```

- [ ] **Step 8: Rodar e confirmar que passa mesmo sem editar `invoice-processor.ts` ainda**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/invoice-processor.test.ts
```

Isso já deve passar neste ponto: `isOriginPaid` hoje cai no `if (!invoice.originId) return false;` (linha 38) para a nota de ativação (`originId` é `null`), mas `shouldProcess` (Step 4) já dispensa a checagem de pagamento para `"activation_test"` **antes** de olhar para o valor de `originPaid` — então o `false` nunca chega a bloquear nada. Confirme que passa antes de seguir para o próximo step; se falhar, algo nos Steps 3-5 ficou incompleto, revise-os antes de continuar.

- [ ] **Step 9: `invoice-processor.ts` — corrigir `isOriginPaid` mesmo assim**

O teste do Step 8 já passa, mas `isOriginPaid` continua devolvendo `false` ("não pago") para um origin que não tem conceito de pagamento nenhum — o mesmo raciocínio que já vale para `"manual"` e `"club"` (ambos retornam `true` incondicionalmente, com comentário explicando por quê). Deixar como está é uma armadilha: se algum dia `shouldProcess` parar de dispensar essa checagem para `"activation_test"`, o bug volta sem nenhum teste pegando, porque parece "já coberto". Corrija por consistência, não porque o teste exige:

Em `functions/src/fiscal/invoice-processor.ts:36-55`, acrescente o caso logo após o de `"manual"`:

```typescript
async function isOriginPaid(db: Firestore, invoice: FiscalInvoice): Promise<boolean> {
  if (invoice.origin === "manual" || invoice.origin === "activation_test") return true;
  if (!invoice.originId) return false;
  ...
```

- [ ] **Step 10: Rodar e confirmar que passa**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/invoice-processor.test.ts
```

- [ ] **Step 11: Rodar o lint**

```bash
cd functions && npm run lint
```

- [ ] **Step 12: Commit**

```bash
git add functions/src/fiscal/types.ts functions/src/fiscal/invoice-emitter.ts functions/src/fiscal/invoice-repository.ts functions/src/fiscal/invoice-processor.ts functions/src/fiscal/invoice-emitter.test.ts functions/src/fiscal/invoice-processor.test.ts
git commit -m "feat(fiscal): pipeline de emissão aceita origin activation_test"
```

Nota: `invoiceIdFor` ainda precisa ser exportada de `invoice-repository.ts` — isso é Task 3 (quem primeiro precisa dela é `activation.ts`), não esta task. Não exporte agora só porque está no arquivo.

---

### Task 2: `buildDefaultIssuer` compartilhado

Hoje a construção de `FocusNfeIssuer` sem token de conta (usada só para processar, nunca para registrar empresa) está duplicada uma vez, dentro do trigger `onFiscalInvoiceRequested`. Esta task extrai isso antes de duplicar de novo nas duas tasks seguintes.

**Files:**
- Modify: `functions/src/fiscal/focus-nfe-client.ts`
- Modify: `functions/src/fiscal/invoice-processor.ts`
- Test: `functions/src/fiscal/focus-nfe-client.test.ts` (existente, acrescentar)

**Interfaces:**
- Consumes: nada
- Produces: `buildDefaultIssuer(): FiscalIssuer`, exportada de `focus-nfe-client.ts`

- [ ] **Step 1: Escrever o teste que falha**

Em `functions/src/fiscal/focus-nfe-client.test.ts`, acrescente:

```typescript
import {buildDefaultIssuer} from "./focus-nfe-client";

describe("buildDefaultIssuer", () => {
  it("devolve uma instância de FocusNfeIssuer", () => {
    const issuer = buildDefaultIssuer();
    assert.ok(issuer instanceof FocusNfeIssuer);
  });
});
```

(Ajuste o `import` do topo do arquivo para incluir `buildDefaultIssuer` junto de `FocusNfeIssuer`, se ainda não importado.)

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/focus-nfe-client.test.ts
```

- [ ] **Step 3: Implementar `buildDefaultIssuer` em `focus-nfe-client.ts`**

Acrescente ao fim do arquivo, depois da classe `FocusNfeIssuer`:

```typescript
/**
 * Emissor para processar notas (nunca registrar empresa — por isso sem
 * `accountToken`). Usado pelo trigger de processamento e por qualquer
 * callable que precise reprocessar uma nota fora do trigger.
 */
export function buildDefaultIssuer(): FiscalIssuer {
  return new FocusNfeIssuer(
    FOCUS_ENV.value() === "sandbox" ? FOCUS_API_URL_SANDBOX : FOCUS_API_URL_PRODUCTION,
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/focus-nfe-client.test.ts
```

- [ ] **Step 5: Refatorar o trigger existente para usar `buildDefaultIssuer`**

Em `functions/src/fiscal/invoice-processor.ts:158-161`, o trigger constrói o issuer inline:

```typescript
  async (event) => {
    const issuer = new FocusNfeIssuer(
      FOCUS_ENV.value() === "sandbox" ? FOCUS_API_URL_SANDBOX : FOCUS_API_URL_PRODUCTION,
    );
    await processInvoiceRequest(
```

Troque para:

```typescript
  async (event) => {
    const issuer = buildDefaultIssuer();
    await processInvoiceRequest(
```

E ajuste o `import` do topo do arquivo (linhas 11-17): troque `FocusNfeIssuer` por `buildDefaultIssuer` na lista, removendo `FOCUS_API_URL_PRODUCTION`/`FOCUS_API_URL_SANDBOX`/`FOCUS_ENV` se não sobrarem outros usos deles neste arquivo (confira com `grep -n "FOCUS_API_URL\|FOCUS_ENV" functions/src/fiscal/invoice-processor.ts` antes de remover — se algum resquício sobrar fora do trecho trocado, mantenha o import correspondente).

- [ ] **Step 6: Rodar a suíte do módulo fiscal e confirmar zero regressão**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/invoice-processor.test.ts && npm run lint
```

- [ ] **Step 7: Commit**

```bash
git add functions/src/fiscal/focus-nfe-client.ts functions/src/fiscal/invoice-processor.ts functions/src/fiscal/focus-nfe-client.test.ts
git commit -m "refactor(fiscal): extrai buildDefaultIssuer, usado pelo trigger de processamento"
```

---

### Task 3: Primitivo de reprocessamento e o callable de reemitir

**Files:**
- Create: `functions/src/fiscal/invoice-retry.ts`
- Modify: `functions/src/fiscal/invoice-repository.ts` (exportar `invoiceIdFor`)
- Modify: `functions/src/fiscal/arena-fiscal-config.ts` (exportar `assertManagesArena`)
- Test: `functions/src/fiscal/invoice-retry.test.ts`

**Interfaces:**
- Consumes: `processInvoiceRequest`, `ReadIssuerToken`, `readIssuerTokenFromSecretManager` (Fatia A, `invoice-processor.ts`); `buildDefaultIssuer` (Task 2); `assertManagesArena` (esta task, exportada de `arena-fiscal-config.ts`)
- Produces: `reprocessFiscalInvoice(db, issuer, readToken, invoiceId): Promise<void>`; callable `retryFiscalInvoice`

- [ ] **Step 1: Exportar `assertManagesArena`**

Em `functions/src/fiscal/arena-fiscal-config.ts:49`, mude:

```typescript
async function assertManagesArena(
```

para:

```typescript
export async function assertManagesArena(
```

Motivo, para você entender e não desfazer sem querer: a Fatia A deixou essa checagem deliberadamente local para não virar um utilitário genérico compartilhado entre módulos não relacionados (cupons, assinatura, fiscal). Mas `invoice-retry.ts` e `activation.ts` são **do mesmo módulo fiscal** — reusar aqui não é o "terceiro utilitário genérico" que a Fatia A evitou, é a mesma checagem servindo o mesmo domínio.

- [ ] **Step 2: Exportar `invoiceIdFor`**

Em `functions/src/fiscal/invoice-repository.ts:43`, mude:

```typescript
function invoiceIdFor(arenaId: string, idempotencyKey: string): string {
```

para:

```typescript
export function invoiceIdFor(arenaId: string, idempotencyKey: string): string {
```

- [ ] **Step 3: Rodar o lint pra confirmar que as duas exportações não quebraram nada**

```bash
cd functions && npm run lint
```

- [ ] **Step 4: Escrever o teste que falha**

Create `functions/src/fiscal/invoice-retry.test.ts`:

```typescript
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "../fake-firestore.test-helper";
import {FakeIssuer} from "./fake-issuer.test-helper";
import {reprocessFiscalInvoice, retryFiscalInvoiceCore} from "./invoice-retry";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function seedArena(fake: FakeFirestore): void {
  fake.seedDoc("arenas/arena1", {managerUserId: "manager1", name: "Arena X"});
}

function seedRejectedInvoice(fake: FakeFirestore, overrides: Record<string, unknown> = {}): void {
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
    status: "rejected",
    errorMessage: "Pagamento ainda não confirmado.",
    ...overrides,
  });
  fake.seedDoc("arenaBookings/b1", {arenaId: "arena1", paymentStatus: "paid"});
}

const readToken = async () => "tok_teste";

describe("reprocessFiscalInvoice", () => {
  it("reseta status e errorMessage antes de reprocessar", async () => {
    const fake = new FakeFirestore();
    seedRejectedInvoice(fake);
    const issuer = new FakeIssuer();

    await reprocessFiscalInvoice(db(fake), issuer, readToken, "inv1");

    const doc = fake.store.get("fiscalInvoices/inv1");
    assert.equal(doc?.status, "authorized");
    assert.equal(doc?.errorMessage, null);
    assert.equal(issuer.issued.length, 1);
  });

  it("sem o reset, processInvoiceRequest seria um no-op — prova que o reset é necessário", async () => {
    // Sanity check da premissa do design: chamar processInvoiceRequest direto
    // numa nota "rejected" (sem passar por reprocessFiscalInvoice) não faz nada,
    // porque a guarda de entrada exige status "requested".
    const {processInvoiceRequest} = await import("./invoice-processor");
    const fake = new FakeFirestore();
    seedRejectedInvoice(fake);
    const issuer = new FakeIssuer();

    await processInvoiceRequest(db(fake), issuer, readToken, "inv1");

    assert.equal(fake.store.get("fiscalInvoices/inv1")?.status, "rejected");
    assert.equal(issuer.issued.length, 0);
  });
});

describe("retryFiscalInvoiceCore", () => {
  it("reemite uma nota rejeitada da própria arena", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedRejectedInvoice(fake);
    const issuer = new FakeIssuer();

    await retryFiscalInvoiceCore(db(fake), issuer, readToken, {
      arenaId: "arena1",
      invoiceId: "inv1",
      callerUid: "manager1",
    });

    assert.equal(fake.store.get("fiscalInvoices/inv1")?.status, "authorized");
  });

  it("recusa quem não é gestor da arena", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedRejectedInvoice(fake);
    const issuer = new FakeIssuer();

    await assert.rejects(
      () =>
        retryFiscalInvoiceCore(db(fake), issuer, readToken, {
          arenaId: "arena1",
          invoiceId: "inv1",
          callerUid: "intruso",
        }),
      /permission-denied|PERMISSION/,
    );
  });

  it("recusa nota que não pertence à arena informada", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedRejectedInvoice(fake, {arenaId: "arena2"});
    const issuer = new FakeIssuer();

    await assert.rejects(
      () =>
        retryFiscalInvoiceCore(db(fake), issuer, readToken, {
          arenaId: "arena1",
          invoiceId: "inv1",
          callerUid: "manager1",
        }),
      /not-found|NOT_FOUND/,
    );
  });

  it("recusa nota que não está rejected", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedRejectedInvoice(fake, {status: "authorized"});
    const issuer = new FakeIssuer();

    await assert.rejects(
      () =>
        retryFiscalInvoiceCore(db(fake), issuer, readToken, {
          arenaId: "arena1",
          invoiceId: "inv1",
          callerUid: "manager1",
        }),
      /failed-precondition|NOT_REJECTED/,
    );
  });

  it("recusa cancellation_failed — rota do contador, não reemitir simples", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedRejectedInvoice(fake, {status: "cancellation_failed"});
    const issuer = new FakeIssuer();

    await assert.rejects(
      () =>
        retryFiscalInvoiceCore(db(fake), issuer, readToken, {
          arenaId: "arena1",
          invoiceId: "inv1",
          callerUid: "manager1",
        }),
      /failed-precondition|NOT_REJECTED/,
    );
  });
});
```

- [ ] **Step 5: Rodar e confirmar que falha**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/invoice-retry.test.ts
```

Esperado: `Cannot find module './invoice-retry'`.

- [ ] **Step 6: Implementar `invoice-retry.ts`**

```typescript
/**
 * O primitivo de "resetar e reprocessar direto" — usado tanto pelo reemitir
 * de uma nota real quanto pelo callable de ativação (Task 4). É direto porque
 * `onFiscalInvoiceRequested` só dispara na CRIAÇÃO do documento; resetar o
 * status e esperar o trigger não funcionaria numa atualização.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {processInvoiceRequest, readIssuerTokenFromSecretManager, type ReadIssuerToken} from "./invoice-processor";
import {buildDefaultIssuer} from "./focus-nfe-client";
import {assertManagesArena} from "./arena-fiscal-config";
import type {FiscalIssuer} from "./issuer-port";
import type {FiscalInvoice} from "./types";

export async function reprocessFiscalInvoice(
  db: Firestore,
  issuer: FiscalIssuer,
  readToken: ReadIssuerToken,
  invoiceId: string,
): Promise<void> {
  await db.doc(`fiscalInvoices/${invoiceId}`).set(
    {status: "requested", errorMessage: null, processedAt: FieldValue.serverTimestamp()},
    {merge: true},
  );
  await processInvoiceRequest(db, issuer, readToken, invoiceId);
}

export interface RetryFiscalInvoiceInput {
  arenaId: string;
  invoiceId: string;
  callerUid: string;
}

export async function retryFiscalInvoiceCore(
  db: Firestore,
  issuer: FiscalIssuer,
  readToken: ReadIssuerToken,
  input: RetryFiscalInvoiceInput,
): Promise<void> {
  await assertManagesArena(db, input.arenaId, input.callerUid);

  const ref = db.doc(`fiscalInvoices/${input.invoiceId}`);
  const snap = await ref.get();
  const invoice = snap.data() as FiscalInvoice | undefined;
  if (!snap.exists || invoice?.arenaId !== input.arenaId) {
    throw new HttpsError("not-found", "NOT_FOUND: nota fiscal não encontrada para esta arena.");
  }
  if (invoice.status !== "rejected") {
    throw new HttpsError(
      "failed-precondition",
      "NOT_REJECTED: só é possível reemitir uma nota rejeitada.",
    );
  }

  await reprocessFiscalInvoice(db, issuer, readToken, input.invoiceId);
}

export const retryFiscalInvoice = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const data = (request.data ?? {}) as {arenaId?: string; invoiceId?: string};
  const arenaId = String(data.arenaId ?? "");
  const invoiceId = String(data.invoiceId ?? "");
  if (!arenaId || !invoiceId) {
    throw new HttpsError("invalid-argument", "arenaId e invoiceId são obrigatórios.");
  }
  await retryFiscalInvoiceCore(getFirestore(), buildDefaultIssuer(), readIssuerTokenFromSecretManager, {
    arenaId,
    invoiceId,
    callerUid,
  });
  return {ok: true};
});
```

- [ ] **Step 7: Rodar e confirmar que passa**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/invoice-retry.test.ts
```

- [ ] **Step 8: Rodar o lint**

```bash
cd functions && npm run lint
```

- [ ] **Step 9: Commit**

```bash
git add functions/src/fiscal/invoice-retry.ts functions/src/fiscal/invoice-retry.test.ts functions/src/fiscal/invoice-repository.ts functions/src/fiscal/arena-fiscal-config.ts
git commit -m "feat(fiscal): primitivo de reprocessamento e callable de reemitir"
```

---

### Task 4: Callable de ativação e o trigger de promoção

**Atenção, achado na auto-revisão deste plano:** o desenho original desta task tinha um bug real de corrida. No ramo "não existe nota ainda", `createInvoiceRequest` já dispara o trigger de criação da Fatia A (`onFiscalInvoiceRequested`) de forma assíncrona — é exatamente o que acontece com toda nota de reserva/clubinho. Se o callable, na mesma execução, também chamasse `reprocessFiscalInvoice` diretamente nesse ramo, a nota de teste seria enviada à Focus **duas vezes em paralelo**: uma pelo trigger, outra pela chamada direta. A chamada direta só é necessária no ramo de reemitir (`existing.status === "rejected"`), porque `onDocumentCreated` nunca dispara de novo numa atualização — resetar o status para `"requested"` não recria o documento. O código abaixo já reflete a correção: **crie e retorne** no ramo de criação; **chame `reprocessFiscalInvoice` direto** só no ramo de reemitir.

**Files:**
- Create: `functions/src/fiscal/activation.ts`
- Test: `functions/src/fiscal/activation.test.ts`

**Interfaces:**
- Consumes: `invoiceIdFor`, `readArenaFiscalConfig` (`invoice-repository.ts`); `createInvoiceRequest`, `CreateInvoiceRequestInput`; `buildIdempotencyKey` (`invoice-emitter.ts`); `reprocessFiscalInvoice` (Task 3); `assertManagesArena` (Task 3); `buildDefaultIssuer` (Task 2); `readIssuerTokenFromSecretManager` (Fatia A)
- Produces: callable `emitActivationTestInvoice`; trigger `onActivationTestInvoiceResolved`

- [ ] **Step 1: Escrever o teste que falha**

Create `functions/src/fiscal/activation.test.ts`:

```typescript
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "../fake-firestore.test-helper";
import {FakeIssuer} from "./fake-issuer.test-helper";
import {invoiceIdFor} from "./invoice-repository";
import {
  emitActivationTestInvoiceCore,
  applyActivationOutcome,
} from "./activation";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function seedArena(fake: FakeFirestore): void {
  fake.seedDoc("arenas/arena1", {managerUserId: "manager1", name: "Arena X"});
}

function seedConfig(fake: FakeFirestore, overrides: Record<string, unknown> = {}): void {
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
    mode: "off",
    status: "testing",
    ...overrides,
  });
}

const activationId = invoiceIdFor("arena1", "activation:arena1");
const readToken = async () => "tok_teste";

describe("emitActivationTestInvoiceCore", () => {
  it("cria a nota de teste quando não existe nenhuma ainda — sem processar direto, o trigger de criação da Fatia A cuida disso", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedConfig(fake);
    const issuer = new FakeIssuer();

    await emitActivationTestInvoiceCore(db(fake), issuer, readToken, {
      arenaId: "arena1",
      callerUid: "manager1",
    });

    const doc = fake.store.get(`fiscalInvoices/${activationId}`);
    assert.equal(doc?.origin, "activation_test");
    assert.equal(doc?.originId, null);
    assert.equal(doc?.valorBrutoReais, 1);
    assert.equal(doc?.tomador?.nome, "Cliente de Teste NexaGO");
    assert.equal(doc?.status, "requested");
    // Nenhuma chamada síncrona ao emissor neste ramo — é o trigger
    // `onFiscalInvoiceRequested` (Fatia A, disparado pela CRIAÇÃO do
    // documento) que processa, do mesmo jeito que qualquer outra nota.
    // Chamar `reprocessFiscalInvoice` aqui também seria enviar a nota à
    // Focus duas vezes em paralelo — ver a nota no início desta task.
    assert.equal(issuer.issued.length, 0);
  });

  it("reemite direto quando a nota de teste já existe e está rejected", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedConfig(fake, {status: "error", statusMessage: "Inscrição municipal inválida."});
    fake.seedDoc(`fiscalInvoices/${activationId}`, {
      arenaId: "arena1",
      origin: "activation_test",
      originId: null,
      idempotencyKey: "activation:arena1",
      serviceId: "s1",
      codigoMunicipal: "3.03",
      aliquotaIss: 2,
      descricao: "Nota de teste — ativação",
      tomador: {nome: "Cliente de Teste NexaGO", cpfCnpj: "39053344705"},
      tomadorUid: null,
      valorBrutoReais: 1,
      status: "rejected",
      errorMessage: "Inscrição municipal inválida.",
    });
    const issuer = new FakeIssuer();

    await emitActivationTestInvoiceCore(db(fake), issuer, readToken, {
      arenaId: "arena1",
      callerUid: "manager1",
    });

    const doc = fake.store.get(`fiscalInvoices/${activationId}`);
    assert.equal(doc?.status, "authorized");
    assert.equal(issuer.issued.length, 1);
  });

  it("não faz nada quando a nota já está authorized", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedConfig(fake, {status: "active", mode: "off"});
    fake.seedDoc(`fiscalInvoices/${activationId}`, {
      arenaId: "arena1",
      origin: "activation_test",
      status: "authorized",
      numero: "1",
    });
    const issuer = new FakeIssuer();

    await emitActivationTestInvoiceCore(db(fake), issuer, readToken, {
      arenaId: "arena1",
      callerUid: "manager1",
    });

    assert.equal(issuer.issued.length, 0);
  });

  it("não faz nada quando já está requested/processing — evita chamada duplicada em voo", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedConfig(fake);
    fake.seedDoc(`fiscalInvoices/${activationId}`, {
      arenaId: "arena1",
      origin: "activation_test",
      status: "processing",
    });
    const issuer = new FakeIssuer();

    await emitActivationTestInvoiceCore(db(fake), issuer, readToken, {
      arenaId: "arena1",
      callerUid: "manager1",
    });

    assert.equal(issuer.issued.length, 0);
  });

  it("recusa quando a config não existe", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    const issuer = new FakeIssuer();

    await assert.rejects(
      () =>
        emitActivationTestInvoiceCore(db(fake), issuer, readToken, {
          arenaId: "arena1",
          callerUid: "manager1",
        }),
      /failed-precondition|NO_CONFIG/,
    );
  });

  it("recusa quando o status é draft — cadastro ainda não foi enviado", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedConfig(fake, {status: "draft"});
    const issuer = new FakeIssuer();

    await assert.rejects(
      () =>
        emitActivationTestInvoiceCore(db(fake), issuer, readToken, {
          arenaId: "arena1",
          callerUid: "manager1",
        }),
      /failed-precondition/,
    );
  });

  it("recusa quando o status já é active — nada a ativar de novo", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedConfig(fake, {status: "active", mode: "off"});
    const issuer = new FakeIssuer();

    await assert.rejects(
      () =>
        emitActivationTestInvoiceCore(db(fake), issuer, readToken, {
          arenaId: "arena1",
          callerUid: "manager1",
        }),
      /failed-precondition/,
    );
  });

  it("recusa quem não é gestor da arena", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedConfig(fake);
    const issuer = new FakeIssuer();

    await assert.rejects(
      () =>
        emitActivationTestInvoiceCore(db(fake), issuer, readToken, {
          arenaId: "arena1",
          callerUid: "intruso",
        }),
      /permission-denied|PERMISSION/,
    );
  });
});

describe("applyActivationOutcome", () => {
  it("promove a config para active quando a nota de teste é autorizada", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake);

    await applyActivationOutcome(db(fake), "arena1", {status: "authorized"});

    assert.equal(fake.store.get("arenas/arena1/fiscal/config")?.status, "active");
  });

  it("marca error com o motivo quando a nota de teste é rejeitada", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake);

    await applyActivationOutcome(db(fake), "arena1", {
      status: "rejected",
      errorMessage: "CPF/CNPJ do cliente inválido ou ausente.",
    });

    const cfg = fake.store.get("arenas/arena1/fiscal/config");
    assert.equal(cfg?.status, "error");
    assert.equal(cfg?.statusMessage, "CPF/CNPJ do cliente inválido ou ausente.");
  });

  it("ignora status não-terminal — processing não deve promover nem rebaixar", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake, {status: "testing"});

    await applyActivationOutcome(db(fake), "arena1", {status: "processing"});

    assert.equal(fake.store.get("arenas/arena1/fiscal/config")?.status, "testing");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/activation.test.ts
```

Esperado: `Cannot find module './activation'`.

- [ ] **Step 3: Implementar `activation.ts`**

```typescript
/**
 * Ativação real: a arena emite uma nota de verdade em homologação usando o
 * próprio cadastro. Autorizada promove `status` para `active`; rejeitada vira
 * `error` com o motivo. O mesmo pedido serve de "reemitir" quando a nota de
 * teste já existe e falhou — não cria uma segunda, reprocessa a mesma.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {
  createInvoiceRequest,
  invoiceIdFor,
  readArenaFiscalConfig,
  type CreateInvoiceRequestInput,
} from "./invoice-repository";
import {buildIdempotencyKey} from "./invoice-emitter";
import {reprocessFiscalInvoice} from "./invoice-retry";
import {assertManagesArena} from "./arena-fiscal-config";
import {buildDefaultIssuer} from "./focus-nfe-client";
import {readIssuerTokenFromSecretManager, type ReadIssuerToken} from "./invoice-processor";
import type {FiscalIssuer} from "./issuer-port";
import type {FiscalInvoice, FiscalInvoiceStatus} from "./types";

/** Tomador sintético — sem cliente real, sem consequência fiscal fora de homologação. */
const ACTIVATION_TOMADOR = {
  nome: "Cliente de Teste NexaGO",
  cpfCnpj: "39053344705",
};
const ACTIVATION_VALOR_REAIS = 1;

export interface EmitActivationTestInvoiceInput {
  arenaId: string;
  callerUid: string;
}

export async function emitActivationTestInvoiceCore(
  db: Firestore,
  issuer: FiscalIssuer,
  readToken: ReadIssuerToken,
  input: EmitActivationTestInvoiceInput,
): Promise<void> {
  await assertManagesArena(db, input.arenaId, input.callerUid);

  const config = await readArenaFiscalConfig(db, input.arenaId);
  if (!config) {
    throw new HttpsError("failed-precondition", "NO_CONFIG: configure os dados fiscais antes.");
  }
  if (config.status !== "testing" && config.status !== "error") {
    throw new HttpsError(
      "failed-precondition",
      config.status === "draft"
        ? "Conclua o cadastro fiscal antes de emitir a nota de teste."
        : "A emissão já está ativa — não há nota de teste para emitir de novo.",
    );
  }
  if (!config.defaultServiceIdBooking) {
    throw new HttpsError(
      "failed-precondition",
      "Defina um serviço padrão de reserva antes de emitir a nota de teste.",
    );
  }
  const service = config.services.find((s) => s.id === config.defaultServiceIdBooking);
  if (!service) {
    throw new HttpsError("failed-precondition", "O serviço padrão de reserva não está no catálogo.");
  }

  const idempotencyKey = buildIdempotencyKey({origin: "activation_test", arenaId: input.arenaId});
  const invoiceId = invoiceIdFor(input.arenaId, idempotencyKey);
  const ref = db.doc(`fiscalInvoices/${invoiceId}`);
  const snap = await ref.get();

  if (!snap.exists) {
    // Só cria — NÃO chama `reprocessFiscalInvoice` aqui. `createInvoiceRequest`
    // já é uma criação de documento de verdade, e o trigger
    // `onFiscalInvoiceRequested` (Fatia A) processa sozinho, exatamente como
    // processa qualquer nota de reserva ou clubinho. Chamar o reprocessamento
    // direto neste ramo enviaria a nota à Focus duas vezes em paralelo.
    const createInput: CreateInvoiceRequestInput = {
      arenaId: input.arenaId,
      origin: "activation_test",
      originId: null,
      idempotencyKey,
      serviceId: service.id,
      codigoMunicipal: service.codigoMunicipal,
      aliquotaIss: service.aliquotaIss,
      descricao: "Nota de teste — ativação",
      tomador: ACTIVATION_TOMADOR,
      tomadorUid: null,
      valorBrutoReais: ACTIVATION_VALOR_REAIS,
    };
    await createInvoiceRequest(db, createInput);
    return;
  }

  const existing = snap.data() as FiscalInvoice;
  if (existing.status === "rejected") {
    await reprocessFiscalInvoice(db, issuer, readToken, invoiceId);
  }
  // authorized / requested / processing: nada a fazer, o estado já reflete
  // o que a tela precisa mostrar via o listener ao vivo da config/nota.
}

export const emitActivationTestInvoice = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const arenaId = String((request.data as {arenaId?: string})?.arenaId ?? "");
  if (!arenaId) {
    throw new HttpsError("invalid-argument", "arenaId é obrigatório.");
  }
  await emitActivationTestInvoiceCore(
    getFirestore(),
    buildDefaultIssuer(),
    readIssuerTokenFromSecretManager,
    {arenaId, callerUid},
  );
  return {ok: true};
});

/** Núcleo testável da promoção — separado do trigger para não depender do Firestore real. */
export async function applyActivationOutcome(
  db: Firestore,
  arenaId: string,
  invoice: {status: FiscalInvoiceStatus; errorMessage?: string | null},
): Promise<void> {
  if (invoice.status === "authorized") {
    await db.doc(`arenas/${arenaId}/fiscal/config`).set(
      {status: "active", statusMessage: null, updatedAt: FieldValue.serverTimestamp()},
      {merge: true},
    );
    return;
  }
  if (invoice.status === "rejected") {
    await db.doc(`arenas/${arenaId}/fiscal/config`).set(
      {
        status: "error",
        statusMessage: invoice.errorMessage ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  }
  // processing/requested/cancelled/cancellation_failed: sem promoção — só
  // authorized e rejected são terminais para efeito de ativação.
}

/**
 * Dispara em toda atualização de qualquer nota fiscal — o Firestore não
 * filtra triggers por valor de campo. Sai de imediato se não for a nota de
 * ativação. Custo extra por nota real: uma leitura de campo e um retorno.
 */
export const onActivationTestInvoiceResolved = onDocumentUpdated(
  "fiscalInvoices/{invoiceId}",
  async (event) => {
    const before = event.data?.before.data() as FiscalInvoice | undefined;
    const after = event.data?.after.data() as FiscalInvoice | undefined;
    if (!after || after.origin !== "activation_test") return;
    if (before?.status === after.status) return;
    await applyActivationOutcome(getFirestore(), after.arenaId, {
      status: after.status,
      errorMessage: after.errorMessage,
    });
  },
);
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd functions && npx ts-node --transpile-only src/fiscal/activation.test.ts
```

- [ ] **Step 5: Rodar o lint**

```bash
cd functions && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add functions/src/fiscal/activation.ts functions/src/fiscal/activation.test.ts
git commit -m "feat(fiscal): callable de ativação e trigger de promoção testing->active"
```

---

### Task 5: Ligar tudo — exports e documentação

**Files:**
- Modify: `functions/src/index.ts`
- Modify: `functions/FISCAL.md`

**Interfaces:**
- Consumes: `emitActivationTestInvoice`, `onActivationTestInvoiceResolved` (Task 4); `retryFiscalInvoice` (Task 3)
- Produces: nada consumido por tasks futuras

- [ ] **Step 1: Exportar no `index.ts`**

Em `functions/src/index.ts`, o bloco fiscal atual (linhas 396-405) termina em:

```typescript
export {onFiscalInvoiceRequested} from "./fiscal/invoice-processor";
export {fiscalIssuerWebhook} from "./fiscal/invoice-webhook";
```

Acrescente logo depois:

```typescript
export {emitActivationTestInvoice, onActivationTestInvoiceResolved} from "./fiscal/activation";
export {retryFiscalInvoice} from "./fiscal/invoice-retry";
```

- [ ] **Step 2: Rodar o lint**

```bash
cd functions && npm run lint
```

- [ ] **Step 3: Atualizar `FISCAL.md`**

Leia o arquivo inteiro primeiro (`cat functions/FISCAL.md`) para saber exatamente o que a Fatia A escreveu. Localize a seção `## Limitação conhecida: ativação` (acrescentada na correção final da Fatia A) e substitua o conteúdo dela — não delete a seção, atualize para descrever o fluxo real:

```markdown
## Ativação (testing → active)

A arena emite uma nota real em homologação pelo passo 5 do wizard (botão
"Emitir nota de teste"). Autorizada, `status` vira `active` sozinho — quem
faz isso é o trigger `onActivationTestInvoiceResolved`, não o wizard. Rejeitada,
`status` vira `error` com o motivo real do emissor, e o mesmo botão (agora
"Tentar novamente") reemite a mesma nota.

A nota de teste usa um tomador sintético fixo (CPF formato-válido, não real,
"Cliente de Teste NexaGO") e o serviço padrão de reserva real da arena, valor
R$1,00. Aparece na lista de notas fiscais com a etiqueta "Teste" — nunca some,
nunca é confundida com venda real.

Reemitir uma nota real rejeitada (`retryFiscalInvoice`) usa o mesmo mecanismo.
```

- [ ] **Step 4: Rodar a suíte completa e confirmar zero regressão**

```bash
cd functions && npm run lint && npm test
```

- [ ] **Step 5: Commit**

```bash
git add functions/src/index.ts functions/FISCAL.md
git commit -m "feat(fiscal): expõe callables de ativação e reemitir, documenta o fluxo real"
```

---

### Task 6: Repositório e modelo do frontend

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/fiscal/fiscal-repository.ts`
- Modify: `frontend/projects/arena/src/app/painel/finance/fiscal-invoice.model.ts`
- Test: `frontend/projects/arena/src/app/painel/finance/fiscal-invoice.model.spec.ts` (existente, acrescentar)

**Interfaces:**
- Consumes: callables `emitActivationTestInvoice`, `retryFiscalInvoice` (Tasks 3-4, backend)
- Produces: `emitActivationTestInvoice(functions, arenaId): Promise<void>`; `retryFiscalInvoice(functions, arenaId, invoiceId): Promise<void>`; `FISCAL_INVOICE_ORIGIN_LABEL.activation_test`

- [ ] **Step 1: Escrever o teste que falha**

Em `frontend/projects/arena/src/app/painel/finance/fiscal-invoice.model.spec.ts`, acrescente:

```typescript
it('rotula activation_test', () => {
  expect(FISCAL_INVOICE_ORIGIN_LABEL['activation_test']).toBe('Teste de ativação');
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/nexago_app/.claude/worktrees/palpite-save-persistence-0b1cc0/frontend && npx ng test arena --watch=false --include='**/fiscal-invoice.model.spec.ts'
```

- [ ] **Step 3: `fiscal-invoice.model.ts` — o rótulo novo**

Em `frontend/projects/arena/src/app/painel/finance/fiscal-invoice.model.ts:20-24`:

```typescript
export const FISCAL_INVOICE_ORIGIN_LABEL: Record<string, string> = {
  booking: 'Reserva',
  club: 'Clubinho',
  manual: 'Avulsa',
};
```

vira:

```typescript
export const FISCAL_INVOICE_ORIGIN_LABEL: Record<string, string> = {
  booking: 'Reserva',
  club: 'Clubinho',
  manual: 'Avulsa',
  activation_test: 'Teste de ativação',
};
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/nexago_app/.claude/worktrees/palpite-save-persistence-0b1cc0/frontend && npx ng test arena --watch=false --include='**/fiscal-invoice.model.spec.ts'
```

- [ ] **Step 5: `fiscal-repository.ts` — os dois wrappers novos**

Em `frontend/projects/arena/src/app/painel/fiscal/fiscal-repository.ts`, acrescente depois de `getArenaFiscalRequirements` (fim do arquivo), seguindo exatamente o padrão de `setArenaFiscalMode` (mesmo arquivo, linhas 75-82):

```typescript
export async function emitActivationTestInvoice(functions: Functions, arenaId: string): Promise<void> {
  const call = httpsCallable(functions, 'emitActivationTestInvoice');
  try {
    await call({ arenaId });
  } catch (err) {
    throw mapFunctionsError(err, 'Não foi possível emitir a nota de teste.');
  }
}

export async function retryFiscalInvoice(functions: Functions, arenaId: string, invoiceId: string): Promise<void> {
  const call = httpsCallable(functions, 'retryFiscalInvoice');
  try {
    await call({ arenaId, invoiceId });
  } catch (err) {
    throw mapFunctionsError(err, 'Não foi possível reemitir a nota.');
  }
}
```

Nenhum teste de unidade para essas duas funções — o resto do arquivo (`saveArenaFiscalConfig`, `setArenaFiscalMode`, `getArenaFiscalRequirements`) também não tem, porque são wrappers finos de `httpsCallable` sem lógica própria para testar. A cobertura real vem dos testes do backend (Tasks 3-4) e da verificação manual do componente (Tasks 7-8).

- [ ] **Step 6: Rodar a suíte do portal**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/nexago_app/.claude/worktrees/palpite-save-persistence-0b1cc0/frontend && npx ng test arena --watch=false
```

- [ ] **Step 7: Commit**

```bash
git add frontend/projects/arena/src/app/painel/fiscal/fiscal-repository.ts frontend/projects/arena/src/app/painel/finance/fiscal-invoice.model.ts frontend/projects/arena/src/app/painel/finance/fiscal-invoice.model.spec.ts
git commit -m "feat(arena-web): wrappers de emitActivationTestInvoice e retryFiscalInvoice"
```

---

### Task 7: Wizard, passo 5 — botão de emitir/tentar de novo

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/fiscal/panel-fiscal.component.ts`

**Interfaces:**
- Consumes: `emitActivationTestInvoice` (Task 6)
- Produces: nada consumido por tasks futuras

- [ ] **Step 1: Ler o arquivo inteiro antes de editar**

```bash
cat -n /Users/silviodionizio/Documents/projects/volley/nexago/nexago_app/.claude/worktrees/palpite-save-persistence-0b1cc0/frontend/projects/arena/src/app/painel/fiscal/panel-fiscal.component.ts
```

Confirme os números de linha abaixo contra o arquivo real antes de editar — outra task pode ter mudado alguma coisa próxima.

- [ ] **Step 2: Importar `emitActivationTestInvoice`**

No topo do arquivo (linhas 12-19), o import de `./fiscal-repository` ganha o nome novo:

```typescript
import {
  emitActivationTestInvoice,
  getArenaFiscalRequirements,
  saveArenaFiscalConfig,
  setArenaFiscalMode,
  watchArenaFiscalConfig,
  type FiscalAddressInput,
  type FiscalRegimeTributario,
  type MunicipalRequirementView,
} from './fiscal-repository';
```

- [ ] **Step 3: Acrescentar o estado de "emitindo"**

Perto de `settingMode` (linha 439 do arquivo original — confirme a linha real), acrescente um signal irmão:

```typescript
protected readonly emittingTest = signal(false);
protected readonly emitTestError = signal<string | null>(null);
```

- [ ] **Step 4: O método que chama o callable**

Logo depois de `chooseMode` (fim do arquivo, por volta da linha 935 do original — confirme):

```typescript
protected async emitTestInvoice(): Promise<void> {
  const arenaId = this.arenaContext.arenaId();
  if (!arenaId || !this.isOwner()) return;
  if (this.currentStatus() !== 'testing' && this.currentStatus() !== 'error') return;

  this.emittingTest.set(true);
  this.emitTestError.set(null);
  try {
    await emitActivationTestInvoice(arenaFunctions(), arenaId);
  } catch (err) {
    this.emitTestError.set(err instanceof Error ? err.message : 'Não foi possível emitir a nota de teste.');
  } finally {
    this.emittingTest.set(false);
  }
}
```

- [ ] **Step 5: O template do passo 5 — casos `testing` e `error`**

O bloco atual (linhas 304-316 do arquivo original):

```html
                  @case ('testing') {
                    <p class="hint">
                      Seus dados fiscais foram enviados e estão em análise. A ativação da emissão automática ainda não é
                      self-service nesta versão — a equipe nexaGO vai avisar quando sua arena estiver pronta para emitir.
                      Enquanto isso, fale com o suporte se precisar acompanhar o andamento.
                    </p>
                  }
                  @case ('error') {
                    <p class="hint error">
                      Houve um problema no cadastro junto ao emissor. Revise os dados nos passos anteriores ou fale com o
                      suporte.
                    </p>
                  }
```

vira:

```html
                  @case ('testing') {
                    <p class="hint">
                      Seus dados fiscais foram enviados. Falta emitir uma nota real em homologação pra confirmar que o
                      cadastro foi aceito pela prefeitura — assim que ela for autorizada, a emissão automática libera.
                    </p>
                    <button
                      type="button"
                      class="ar-mini-btn ar-mini-btn-primary"
                      [disabled]="!isOwner() || emittingTest()"
                      (click)="emitTestInvoice()"
                    >
                      {{ emittingTest() ? 'Emitindo…' : 'Emitir nota de teste' }}
                    </button>
                    @if (emitTestError(); as eerr) {
                      <div class="error-banner">{{ eerr }}</div>
                    }
                  }
                  @case ('error') {
                    <p class="hint error">
                      A nota de teste foi rejeitada pela prefeitura. Revise os dados nos passos anteriores se precisar, ou
                      tente de novo.
                    </p>
                    <button
                      type="button"
                      class="ar-mini-btn ar-mini-btn-primary"
                      [disabled]="!isOwner() || emittingTest()"
                      (click)="emitTestInvoice()"
                    >
                      {{ emittingTest() ? 'Tentando…' : 'Tentar novamente' }}
                    </button>
                    @if (emitTestError(); as eerr) {
                      <div class="error-banner">{{ eerr }}</div>
                    }
                  }
```

Não toque no `@case ('draft')` nem no `@case ('active')` — continuam corretos como estão.

- [ ] **Step 6: Rodar a suíte do portal**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/nexago_app/.claude/worktrees/palpite-save-persistence-0b1cc0/frontend && npx ng test arena --watch=false
```

- [ ] **Step 7: Build**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/nexago_app/.claude/worktrees/palpite-save-persistence-0b1cc0/frontend && npx ng build arena
```

Confirme que o "Output location" aponta para dentro deste worktree.

- [ ] **Step 8: Commit**

```bash
git add frontend/projects/arena/src/app/painel/fiscal/panel-fiscal.component.ts
git commit -m "feat(arena-web): passo 5 do wizard emite/reemite a nota de teste"
```

---

### Task 8: Notas fiscais — reemitir e etiqueta de teste

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/finance/panel-fiscal-invoices.component.ts`

**Interfaces:**
- Consumes: `retryFiscalInvoice` (Task 6), `FISCAL_INVOICE_ORIGIN_LABEL.activation_test` (Task 6)
- Produces: nada consumido por tasks futuras

- [ ] **Step 1: Ler o arquivo inteiro antes de editar**

```bash
cat -n /Users/silviodionizio/Documents/projects/volley/nexago/nexago_app/.claude/worktrees/palpite-save-persistence-0b1cc0/frontend/projects/arena/src/app/painel/finance/panel-fiscal-invoices.component.ts
```

Confirme os números de linha abaixo contra o arquivo real.

- [ ] **Step 2: Importar `retryFiscalInvoice`**

O import de `../fiscal/fiscal-repository` (linhas 8-11 do arquivo original):

```typescript
import {
  setArenaFiscalMode,
  watchArenaFiscalConfig,
} from '../fiscal/fiscal-repository';
```

vira:

```typescript
import {
  retryFiscalInvoice,
  setArenaFiscalMode,
  watchArenaFiscalConfig,
} from '../fiscal/fiscal-repository';
```

- [ ] **Step 3: Estado de "reemitindo", por nota**

Perto de `settingMode` (linha 439 do arquivo original), acrescente:

```typescript
protected readonly retryingInvoiceId = signal<string | null>(null);
```

Um signal só (não um Set) é suficiente: a UI desabilita o botão da linha em voo e a chamada anterior sempre termina (sucesso ou erro) antes de outra começar, porque o botão fica desabilitado enquanto isso.

- [ ] **Step 4: O método de reemitir**

Depois de `chooseMode` (fim do arquivo, linha ~522 do original — confirme):

```typescript
protected async retryInvoice(invoiceId: string): Promise<void> {
  const arenaId = this.arenaContext.arenaId();
  if (!arenaId || !this.isOwner()) return;

  this.retryingInvoiceId.set(invoiceId);
  try {
    await retryFiscalInvoice(arenaFunctions(), arenaId, invoiceId);
  } catch (err) {
    this.errorMessage.set(err instanceof Error ? err.message : 'Não foi possível reemitir a nota.');
  } finally {
    this.retryingInvoiceId.set(null);
  }
}
```

`errorMessage` já existe no componente (linha 444 do original, usado para erro de carregamento da lista) — reaproveitar é intencional: um erro de reemitir também é um erro de nível de tela, não precisa de um segundo banner.

- [ ] **Step 5: O template da linha — etiqueta de teste e botão de reemitir**

O bloco da linha da tabela (linhas 166-180 do arquivo original):

```html
                      <div class="inv-date">{{ formatDate(inv.createdAt) }}</div>
                      <div class="inv-origin">{{ originLabel[inv.origin] }}</div>
```

vira:

```html
                      <div class="inv-date">{{ formatDate(inv.createdAt) }}</div>
                      <div class="inv-origin">
                        {{ originLabel[inv.origin] }}
                        @if (inv.origin === 'activation_test') {
                          <span class="test-badge">Teste</span>
                        }
                      </div>
```

E o bloco de arquivos (linhas 178-184 do arquivo original):

```html
                      <div class="inv-files">
                        @if (inv.pdfUrl; as pdf) {
                          <a [href]="pdf" target="_blank" rel="noopener" class="ar-ghost-btn file-btn">PDF</a>
                        }
                        @if (inv.xmlUrl; as xml) {
                          <a [href]="xml" target="_blank" rel="noopener" class="ar-ghost-btn file-btn">XML</a>
                        }
                      </div>
```

vira:

```html
                      <div class="inv-files">
                        @if (inv.pdfUrl; as pdf) {
                          <a [href]="pdf" target="_blank" rel="noopener" class="ar-ghost-btn file-btn">PDF</a>
                        }
                        @if (inv.xmlUrl; as xml) {
                          <a [href]="xml" target="_blank" rel="noopener" class="ar-ghost-btn file-btn">XML</a>
                        }
                        @if (inv.status === 'rejected' && isOwner()) {
                          <button
                            type="button"
                            class="ar-ghost-btn file-btn"
                            [disabled]="retryingInvoiceId() === inv.id"
                            (click)="retryInvoice(inv.id)"
                          >
                            {{ retryingInvoiceId() === inv.id ? 'Reemitindo…' : 'Reemitir' }}
                          </button>
                        }
                      </div>
```

- [ ] **Step 6: Estilo da etiqueta de teste**

No bloco `styles` do componente (procure por `.inv-doc` ou `.error-line` como referência de onde os estilos de linha já vivem), acrescente:

```css
.test-badge {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  background: var(--nx-pending, #f5a623);
  color: #fff;
}
```

(Confira se `--nx-pending` já é usada em outro lugar deste arquivo ou de `panel-fiscal.component.ts` — se a variável tiver outro nome no design system do portal, use o nome real em vez de inventar um novo token.)

- [ ] **Step 7: Rodar a suíte do portal**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/nexago_app/.claude/worktrees/palpite-save-persistence-0b1cc0/frontend && npx ng test arena --watch=false
```

- [ ] **Step 8: Build**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/nexago_app/.claude/worktrees/palpite-save-persistence-0b1cc0/frontend && npx ng build arena
```

- [ ] **Step 9: Commit**

```bash
git add frontend/projects/arena/src/app/painel/finance/panel-fiscal-invoices.component.ts
git commit -m "feat(arena-web): botão de reemitir e etiqueta de teste na lista de notas"
```

---

## Depois desta fatia

- **Verificação de ponta a ponta contra a homologação real da Focus** continua pendente — nenhuma task deste plano valida o payload real (`registerIssuer`, `issueServiceInvoice`, o webhook). Mesmo risco já documentado desde a Fatia A.
- **Cooldown/limite de tentativas de reemitir**: deliberadamente fora de escopo (ver spec, seção "Fora de escopo") — ação manual do dono, sem automação repetindo sozinha.
- **Nota avulsa de verdade** (Fatia B) continua não construída — `origin: "activation_test"` é deliberadamente distinto de `"manual"`.
- **Estado "em voo" da nota de teste não aparece no wizard.** O callable `emitActivationTestInvoice` só cria o documento e retorna — quem processa é o trigger assíncrono da Fatia A (correção feita na auto-revisão da Task 4, ver nota na task). Isso significa que, entre o clique e o resultado (autorizada ou rejeitada), a tela continua mostrando o mesmo texto de `'testing'`, sem indicar "processando". O botão reabilita quase na hora, e clicar de novo nesse intervalo já é seguro (o callable no-opa quando a nota está `requested`/`processing`), mas a experiência não diferencia "ainda não tentei" de "já tentei, aguardando a prefeitura". Corrigir isso exigiria o wizard também observar ao vivo o documento da nota de ativação, não só o da config — pequeno, mas ficou fora do escopo desta fatia por não ter sido pedido na spec.
