# Cartão de crédito na inscrição (portal do atleta) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir pagar a inscrição de torneio com cartão de crédito no portal web do atleta, via checkout hospedado do Asaas.

**Architecture:** Uma callable nova cria a cobrança `CREDIT_CARD` e devolve o `invoiceUrl` do Asaas; o portal abre esse link numa aba. O webhook passa a decidir em duas fases — no cartão a autorização (`CONFIRMED`) confirma a inscrição e só a liquidação (`RECEIVED`) credita a carteira do organizador, já descontando a taxa do gateway. O caminho de PIX não muda em nenhum ponto.

**Tech Stack:** Cloud Functions v2 (TypeScript, `node:test`), Firestore, Asaas API v3, Angular 20 zoneless (portal do atleta, Karma/Jasmine).

**Spec:** `docs/superpowers/specs/2026-09-02-athlete-web-card-payment-design.md`

## Global Constraints

- **O caminho de PIX não pode mudar de comportamento.** Todo teste existente de
  `asaas-tournament-registration-webhook.test.ts` e
  `tournament-registration-pix-expiry-sweeper.test.ts` deve continuar passando
  sem edição. Se um deles precisar mudar, a implementação está errada.
- **`billingType` ausente lê-se `"PIX"`** em todo lugar (acervo inteiro de
  `pixPending` e de `asaas_processed_payments` não tem o campo).
- A coleção continua se chamando `pixPending`. Não renomear.
- A taxa da plataforma (8% ou `commissionPercent`) incide sobre o **bruto**.
- Português nas strings de UI e nas mensagens de erro das callables; inglês no
  código.
- Rodar os testes de functions com `npm --prefix functions test` (compila com
  `tsc` antes; erro de tipo reprova).
- Testes do portal: `npx ng test athlete --watch=false --browsers=ChromeHeadless`
  a partir de `frontend/`.
- Commits em português, imperativo, sem prefixo de escopo inventado.

---

### Task 1: Regra pura das fases de pagamento

**Files:**
- Create: `functions/src/registration-payment-phases.ts`
- Test: `functions/src/registration-payment-phases.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `type RegistrationBillingType = "PIX" | "CREDIT_CARD"`,
  `parseRegistrationBillingType(raw: unknown): RegistrationBillingType`,
  `resolvePaymentPhases(input: PaymentPhaseInput): PaymentPhases` com
  `PaymentPhaseInput = {billingType, status, alreadyConfirmed, alreadyCredited}`
  e `PaymentPhases = {confirm: boolean, credit: boolean}`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  parseRegistrationBillingType,
  resolvePaymentPhases,
} from "./registration-payment-phases";

const FRESH = {alreadyConfirmed: false, alreadyCredited: false};

describe("parseRegistrationBillingType", () => {
  it("trata ausente e desconhecido como PIX (acervo sem o campo)", () => {
    assert.equal(parseRegistrationBillingType(undefined), "PIX");
    assert.equal(parseRegistrationBillingType(null), "PIX");
    assert.equal(parseRegistrationBillingType("BOLETO"), "PIX");
    assert.equal(parseRegistrationBillingType("CREDIT_CARD"), "CREDIT_CARD");
  });
});

describe("resolvePaymentPhases: PIX segue como sempre", () => {
  it("confirma e credita no RECEIVED", () => {
    assert.deepEqual(
      resolvePaymentPhases({billingType: "PIX", status: "RECEIVED", ...FRESH}),
      {confirm: true, credit: true},
    );
  });

  it("não faz nada no CONFIRMED", () => {
    assert.deepEqual(
      resolvePaymentPhases({billingType: "PIX", status: "CONFIRMED", ...FRESH}),
      {confirm: false, credit: false},
    );
  });

  it("aceita RECEIVED_IN_CASH", () => {
    assert.deepEqual(
      resolvePaymentPhases({billingType: "PIX", status: "RECEIVED_IN_CASH", ...FRESH}),
      {confirm: true, credit: true},
    );
  });
});

describe("resolvePaymentPhases: cartão separa autorização de liquidação", () => {
  it("CONFIRMED confirma a inscrição sem creditar a carteira", () => {
    assert.deepEqual(
      resolvePaymentPhases({billingType: "CREDIT_CARD", status: "CONFIRMED", ...FRESH}),
      {confirm: true, credit: false},
    );
  });

  it("RECEIVED depois do CONFIRMED só credita", () => {
    assert.deepEqual(
      resolvePaymentPhases({
        billingType: "CREDIT_CARD",
        status: "RECEIVED",
        alreadyConfirmed: true,
        alreadyCredited: false,
      }),
      {confirm: false, credit: true},
    );
  });

  it("RECEIVED sozinho faz as duas fases (CONFIRMED perdido)", () => {
    assert.deepEqual(
      resolvePaymentPhases({billingType: "CREDIT_CARD", status: "RECEIVED", ...FRESH}),
      {confirm: true, credit: true},
    );
  });

  it("reentrega do mesmo evento não faz nada", () => {
    assert.deepEqual(
      resolvePaymentPhases({
        billingType: "CREDIT_CARD",
        status: "RECEIVED",
        alreadyConfirmed: true,
        alreadyCredited: true,
      }),
      {confirm: false, credit: false},
    );
  });

  it("AWAITING_RISK_ANALYSIS ainda não é nada", () => {
    assert.deepEqual(
      resolvePaymentPhases({
        billingType: "CREDIT_CARD",
        status: "AWAITING_RISK_ANALYSIS",
        ...FRESH,
      }),
      {confirm: false, credit: false},
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --prefix functions test`
Expected: FAIL na compilação — `Cannot find module './registration-payment-phases'`.

- [ ] **Step 3: Implementar**

```ts
/**
 * Quais fases um evento de pagamento de inscrição dispara.
 *
 * No PIX as duas fases sempre andam juntas na liquidação. No cartão elas se
 * separam no tempo: a autorização (`CONFIRMED`) garante a vaga do atleta na
 * hora, mas o dinheiro só chega à plataforma na liquidação (`RECEIVED`,
 * ~D+30) — e a carteira do organizador só pode ser creditada quando o
 * dinheiro existe, senão a plataforma financia o repasse.
 */

export type RegistrationBillingType = "PIX" | "CREDIT_CARD";

/** Só cartão é tratado à parte; qualquer outra coisa (inclusive campo ausente
 *  no acervo inteiro) segue o caminho histórico do PIX. */
export function parseRegistrationBillingType(
  raw: unknown,
): RegistrationBillingType {
  return raw === "CREDIT_CARD" ? "CREDIT_CARD" : "PIX";
}

export interface PaymentPhaseInput {
  billingType: RegistrationBillingType;
  status: string;
  alreadyConfirmed: boolean;
  alreadyCredited: boolean;
}

export interface PaymentPhases {
  /** Confirmar a inscrição, cancelar as cobranças abertas e notificar. */
  confirm: boolean;
  /** Creditar a carteira do organizador. */
  credit: boolean;
}

const SETTLED_STATUSES = new Set(["RECEIVED", "RECEIVED_IN_CASH"]);

export function resolvePaymentPhases(input: PaymentPhaseInput): PaymentPhases {
  const status = input.status.toUpperCase();
  const settled = SETTLED_STATUSES.has(status);
  const cardAuthorized =
    input.billingType === "CREDIT_CARD" && status === "CONFIRMED";

  if (!settled && !cardAuthorized) {
    return {confirm: false, credit: false};
  }

  return {
    confirm: !input.alreadyConfirmed,
    credit: settled && !input.alreadyCredited,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --prefix functions test`
Expected: PASS (a suíte inteira; nenhum teste existente muda).

- [ ] **Step 5: Commitar**

```bash
git add functions/src/registration-payment-phases.ts functions/src/registration-payment-phases.test.ts
git commit -m "regra de fases do pagamento de inscrição (PIX x cartão)"
```

---

### Task 2: Carteira do organizador desconta a taxa do gateway

**Files:**
- Modify: `functions/src/organizer-wallet.ts` (`creditOrganizerWalletFromRegistration`)
- Test: `functions/src/organizer-wallet.test.ts` (criar se não existir)

**Interfaces:**
- Consumes: nada da Task 1.
- Produces: `creditOrganizerWalletFromRegistration` passa a aceitar
  `gatewayFeeReais?: number` nos params; o lançamento do ledger ganha o campo
  `gatewayFeeReais` e `netReais` vira
  `bruto − platformFeeReais − gatewayFeeReais`.

- [ ] **Step 1: Escrever o teste que falha**

Se `functions/src/organizer-wallet.test.ts` já existir, acrescente o `describe`
abaixo em vez de recriar o arquivo.

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {creditOrganizerWalletFromRegistration} from "./organizer-wallet";

const ORGANIZER = "org1";
const WALLET_PATH = `organizerWallets/${ORGANIZER}`;

function ledgerEntry(fake: FakeFirestore): Record<string, unknown> {
  const entry = [...fake.store.entries()].find(([path]) =>
    path.startsWith(`${WALLET_PATH}/ledger/`),
  );
  assert.ok(entry, "nenhum lançamento no ledger");
  return entry[1];
}

describe("creditOrganizerWalletFromRegistration: taxa do gateway", () => {
  it("desconta a taxa do cartão do líquido do organizador", async () => {
    const fake = new FakeFirestore();

    await creditOrganizerWalletFromRegistration(
      fake as unknown as Firestore,
      ORGANIZER,
      {
        registrationId: "reg1",
        payerUid: "uidA",
        paymentId: "pay1",
        grossReais: 100,
        platformFeeReais: 8,
        gatewayFeeReais: 3.29,
      },
    );

    assert.equal(fake.store.get(WALLET_PATH)!["availableReais"], 88.71);
    const entry = ledgerEntry(fake);
    assert.equal(entry["gatewayFeeReais"], 3.29);
    assert.equal(entry["netReais"], 88.71);
    assert.equal(entry["grossReais"], 100);
  });

  it("sem taxa de gateway credita como sempre (caminho do PIX)", async () => {
    const fake = new FakeFirestore();

    await creditOrganizerWalletFromRegistration(
      fake as unknown as Firestore,
      ORGANIZER,
      {
        registrationId: "reg1",
        payerUid: "uidA",
        paymentId: "pay1",
        grossReais: 100,
        platformFeeReais: 8,
      },
    );

    assert.equal(fake.store.get(WALLET_PATH)!["availableReais"], 92);
    assert.equal(ledgerEntry(fake)["gatewayFeeReais"], 0);
  });

  it("nunca credita negativo", async () => {
    const fake = new FakeFirestore();

    await creditOrganizerWalletFromRegistration(
      fake as unknown as Firestore,
      ORGANIZER,
      {
        registrationId: "reg1",
        payerUid: "uidA",
        paymentId: "pay1",
        grossReais: 10,
        platformFeeReais: 8,
        gatewayFeeReais: 5,
      },
    );

    assert.equal(fake.store.get(WALLET_PATH)!["availableReais"], 0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --prefix functions test`
Expected: FAIL na compilação — `gatewayFeeReais` não existe no tipo dos params.

- [ ] **Step 3: Implementar**

Em `functions/src/organizer-wallet.ts`, dentro de
`creditOrganizerWalletFromRegistration`:

```ts
  params: {
    registrationId: string;
    payerUid: string;
    paymentId: string;
    grossReais: number;
    platformFeeReais: number;
    /**
     * Taxa do gateway repassada ao organizador (decisão do dono, 02/09): no
     * cartão ele recebe bruto − taxa da plataforma − taxa do cartão. No PIX é
     * 0 — ali a plataforma continua absorvendo o custo do gateway.
     */
    gatewayFeeReais?: number;
  },
): Promise<void> {
  const gatewayFeeReais = roundMoney(Math.max(0, params.gatewayFeeReais ?? 0));
  const netReais = roundMoney(
    Math.max(0, params.grossReais - params.platformFeeReais - gatewayFeeReais),
  );
```

e no lançamento do ledger, junto de `platformFeeReais`:

```ts
      gatewayFeeReais,
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --prefix functions test`
Expected: PASS.

- [ ] **Step 5: Commitar**

```bash
git add functions/src/organizer-wallet.ts functions/src/organizer-wallet.test.ts
git commit -m "carteira do organizador desconta a taxa do gateway"
```

---

### Task 3: Camada Asaas — cobrança de cartão e campos do pagamento

**Files:**
- Modify: `functions/src/asaas-booking-payment.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `createAsaasCardCharge(params): Promise<{paymentId: string; invoiceUrl: string}>`
  com os mesmos params de `createAsaasPixCharge`; `AsaasPaymentDetails` ganha
  `billingType?: string` e `netValue?: number`.

Sem teste próprio: é um invólucro tipado sobre `fetchAsaas` (rede). A cobertura
vem do `tsc` e dos testes das tasks que o consomem.

- [ ] **Step 1: Declarar os campos novos do pagamento**

Em `functions/src/asaas-booking-payment.ts`, no tipo `AsaasPaymentDetails`:

```ts
  /** `PIX`, `CREDIT_CARD`, … — decide o tratamento no webhook de inscrição. */
  billingType?: string;
  /** Bruto − taxa do gateway. A diferença para `value` é o custo da cobrança. */
  netValue?: number;
```

- [ ] **Step 2: Criar a cobrança de cartão**

No mesmo arquivo, logo depois de `createAsaasPixCharge`:

```ts
/**
 * Cria cobrança de cartão no Asaas e devolve o checkout HOSPEDADO
 * (`invoiceUrl`). Nenhum dado de cartão passa por nós: o atleta digita no
 * domínio do Asaas. Mesmo formato de `createAsaasPixCharge` — o que muda é o
 * `billingType` e o fato de não haver QR para buscar.
 */
export async function createAsaasCardCharge(params: {
  customerId: string;
  valueReais: number;
  dueDate: Date;
  description: string;
  externalReference: string;
  idempotencyKey: string;
}): Promise<{paymentId: string; invoiceUrl: string}> {
  const dueDate = resolveDueDate(params.dueDate);

  const payment = await fetchAsaas<AsaasPaymentResponse>("/v3/payments", {
    method: "POST",
    body: {
      customer: params.customerId,
      billingType: "CREDIT_CARD",
      value: params.valueReais,
      dueDate,
      description: params.description.slice(0, 500),
      externalReference: params.externalReference,
    },
    idempotencyKey: params.idempotencyKey,
  });

  const paymentId = payment.id?.trim() ?? "";
  if (!paymentId) {
    throw new Error("ASAAS_PAYMENT_MISSING_ID");
  }

  const invoiceUrl = payment.invoiceUrl?.trim() ?? "";
  if (!invoiceUrl) {
    // Sem checkout não há como o atleta pagar: falhar aqui é melhor que
    // devolver uma tela com botão para lugar nenhum.
    throw new Error("ASAAS_CARD_INVOICE_URL_MISSING");
  }

  logger.info(
    `createAsaasCardCharge: payment ${paymentId} status=${payment.status ?? "?"} dueDate=${dueDate}`,
  );

  return {paymentId, invoiceUrl};
}
```

- [ ] **Step 3: Compilar**

Run: `npm --prefix functions run lint`
Expected: sem erros.

- [ ] **Step 4: Commitar**

```bash
git add functions/src/asaas-booking-payment.ts
git commit -m "cobrança de cartão no Asaas com checkout hospedado"
```

---

### Task 4: Webhook em duas fases

**Files:**
- Modify: `functions/src/asaas-tournament-registration-webhook.ts`
- Test: `functions/src/asaas-tournament-registration-webhook.test.ts`

**Interfaces:**
- Consumes: `parseRegistrationBillingType`, `resolvePaymentPhases` (Task 1);
  `gatewayFeeReais` em `creditOrganizerWalletFromRegistration` (Task 2);
  `billingType`/`netValue` em `AsaasPaymentDetails` (Task 3).
- Produces: `asaas_processed_payments/{paymentId}` passa a gravar
  `confirmedAt`, `walletCreditedAt` e `billingType`.

**ARMADILHA — leia antes de implementar:** quando só a fase de crédito roda (o
`RECEIVED` do cartão, depois que o `CONFIRMED` já confirmou), a checagem de
pagamento duplicado **não pode rodar**. Ela testa
`sharePaidUids.includes(payerUid)`, que a fase 1 acabou de deixar `true` — o
evento cairia como `duplicate_payer` e a carteira nunca seria creditada. Todo o
bloco de confirmação (divergência de valor, duplicidade, `batch`, cancelamento
das outras cobranças, notificações) fica dentro de `if (phases.confirm)`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao final de
`functions/src/asaas-tournament-registration-webhook.test.ts`:

```ts
const CARD_PENDING_A = {
  status: "pending",
  amountType: "full",
  asaasPaymentId: "pay1",
  payerUid: "uidA",
  billingType: "CREDIT_CARD",
};

function cardPayment(status: string, extra: Record<string, unknown> = {}) {
  return {
    status,
    value: ENTRY_FEE,
    billingType: "CREDIT_CARD",
    externalReference: `tournamentRegistration:${REG_ID}:uidA`,
    ...extra,
  };
}

function seedTournamentWithOrganizer(fake: FakeFirestore): void {
  fake.seedDoc(TOURNAMENT_PATH, {
    name: "Copa Teste",
    managerId: "org1",
    categories: [{categoryName: CATEGORY, entryFee: ENTRY_FEE}],
  });
}

function walletDoc(fake: FakeFirestore): Record<string, unknown> | undefined {
  return fake.store.get("organizerWallets/org1");
}

describe("asaas-tournament-registration-webhook: cartão em duas fases", () => {
  it("CONFIRMED confirma a inscrição e NÃO credita a carteira", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    fake.seedDoc(PENDING_A, CARD_PENDING_A);

    await processTournamentRegistrationAsaasNotification(
      db, "pay1", cardPayment("CONFIRMED"), processedRefOf(db), makeDeps().deps,
    );

    assert.equal(fake.store.get(REG_PATH)!["isPaid"], true);
    assert.equal(fake.store.get(PENDING_A)!["status"], "paid");
    assert.equal(walletDoc(fake), undefined);
    assert.ok(fake.store.get(PROCESSED_PATH)!["confirmedAt"]);
    assert.equal(fake.store.get(PROCESSED_PATH)!["walletCreditedAt"], undefined);
  });

  it("RECEIVED depois do CONFIRMED credita a carteira sem reconfirmar", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    fake.seedDoc(PENDING_A, CARD_PENDING_A);

    await processTournamentRegistrationAsaasNotification(
      db, "pay1", cardPayment("CONFIRMED"), processedRefOf(db), makeDeps().deps,
    );
    await processTournamentRegistrationAsaasNotification(
      db, "pay1", cardPayment("RECEIVED", {netValue: 96.71}),
      processedRefOf(db), makeDeps().deps,
    );

    // bruto 100 − 8% da plataforma − 3,29 do cartão
    assert.equal(walletDoc(fake)!["availableReais"], 88.71);
    assert.equal(fake.store.get(REG_PATH)!["paidAmount"], ENTRY_FEE);
    assert.ok(fake.store.get(PROCESSED_PATH)!["walletCreditedAt"]);
  });

  it("RECEIVED sozinho confirma e credita (CONFIRMED perdido)", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    fake.seedDoc(PENDING_A, CARD_PENDING_A);

    await processTournamentRegistrationAsaasNotification(
      db, "pay1", cardPayment("RECEIVED", {netValue: 96.71}),
      processedRefOf(db), makeDeps().deps,
    );

    assert.equal(fake.store.get(REG_PATH)!["isPaid"], true);
    assert.equal(walletDoc(fake)!["availableReais"], 88.71);
  });

  it("reentrega do RECEIVED não credita de novo", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    fake.seedDoc(PENDING_A, CARD_PENDING_A);

    const evt = cardPayment("RECEIVED", {netValue: 96.71});
    await processTournamentRegistrationAsaasNotification(
      db, "pay1", evt, processedRefOf(db), makeDeps().deps,
    );
    await processTournamentRegistrationAsaasNotification(
      db, "pay1", evt, processedRefOf(db), makeDeps().deps,
    );

    assert.equal(walletDoc(fake)!["availableReais"], 88.71);
  });

  it("netValue ausente credita sem descontar taxa de gateway", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    fake.seedDoc(PENDING_A, CARD_PENDING_A);

    await processTournamentRegistrationAsaasNotification(
      db, "pay1", cardPayment("RECEIVED"), processedRefOf(db), makeDeps().deps,
    );

    assert.equal(walletDoc(fake)!["availableReais"], 92);
  });
});

describe("asaas-tournament-registration-webhook: PIX inalterado", () => {
  it("CONFIRMED de PIX não confirma nada", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    fake.seedDoc(PENDING_A, {
      status: "pending", amountType: "full", asaasPaymentId: "pay1", payerUid: "uidA",
    });

    await processTournamentRegistrationAsaasNotification(
      db, "pay1", {...fullPayment, status: "CONFIRMED"},
      processedRefOf(db), makeDeps().deps,
    );

    assert.equal(fake.store.get(REG_PATH)!["isPaid"], false);
    assert.equal(fake.store.get(PROCESSED_PATH), undefined);
  });

  it("RECEIVED de PIX confirma e credita numa passada só, sem taxa de gateway", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    fake.seedDoc(PENDING_A, {
      status: "pending", amountType: "full", asaasPaymentId: "pay1", payerUid: "uidA",
    });

    await processTournamentRegistrationAsaasNotification(
      db, "pay1", {...fullPayment, netValue: 96.71},
      processedRefOf(db), makeDeps().deps,
    );

    assert.equal(fake.store.get(REG_PATH)!["isPaid"], true);
    assert.equal(walletDoc(fake)!["availableReais"], 92);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --prefix functions test`
Expected: FAIL — o cartão em `CONFIRMED` cai no `return` de status
não-terminal e a inscrição continua `isPaid: false`.

- [ ] **Step 3: Implementar**

3a. Imports novos no topo do arquivo:

```ts
import {
  parseRegistrationBillingType,
  resolvePaymentPhases,
  type RegistrationBillingType,
} from "./registration-payment-phases";
```

3b. `ASAAS_NON_TERMINAL_STATUSES` deixa de existir como guarda de saída
antecipada — quem decide agora é `resolvePaymentPhases`. Remova a constante e
o bloco `if (ASAAS_NON_TERMINAL_STATUSES.has(status)) {...}`.

3c. Helper da taxa do gateway, junto dos outros helpers do arquivo:

```ts
/**
 * Taxa que o gateway cobrou nesta cobrança, para repassar ao organizador.
 *
 * Sai do próprio pagamento (`value − netValue`) em vez de uma alíquota fixa no
 * código, que envelheceria calada a cada renegociação com o Asaas. Só vale
 * para cartão: no PIX a plataforma absorve o custo, como sempre absorveu.
 */
function resolveGatewayFeeReais(
  payment: AsaasPaymentDetails,
  billingType: RegistrationBillingType,
  grossReais: number,
): number {
  if (billingType !== "CREDIT_CARD") return 0;
  const net = Number(payment.netValue);
  if (!Number.isFinite(net) || net <= 0 || net > grossReais) {
    logger.error(
      "Asaas tournament registration: netValue ausente/inválido no cartão — " +
      "creditando sem descontar a taxa do gateway",
      {paymentId: payment.id, value: grossReais, netValue: payment.netValue},
    );
    return 0;
  }
  return roundMoney(grossReais - net);
}
```

3d. A guarda de entrada, no lugar do `if (processedSnap.exists) return;`:

```ts
  const processedSnap = await processedRef.get();
  const processed = processedSnap.data() ?? {};
  const outcome = typeof processed.outcome === "string" ? processed.outcome : "";

  // Desfecho terminal que não é "aprovado" (órfão, pagador duplicado,
  // recusado) encerra o assunto, como sempre encerrou.
  if (processedSnap.exists && outcome !== "approved") {
    logger.info(`Asaas tournament registration: payment ${paymentId} já processado`);
    return;
  }

  // Documento aprovado SEM marcador de fase é do acervo pré-cartão: ali as
  // duas fases sempre rodaram juntas.
  const legacyApproved = outcome === "approved" && processed.confirmedAt == null;
  const alreadyConfirmed = legacyApproved || processed.confirmedAt != null;
  const alreadyCredited = legacyApproved || processed.walletCreditedAt != null;

  const status = (payment.status || "").toUpperCase();
  const billingType = parseRegistrationBillingType(payment.billingType);
  const phases = resolvePaymentPhases({
    billingType, status, alreadyConfirmed, alreadyCredited,
  });

  if (!phases.confirm && !phases.credit &&
      !ASAAS_NEGATIVE_TERMINAL_STATUSES.has(status)) {
    logger.info(
      `Asaas tournament registration ${registrationId}: pagamento ${paymentId} ainda ${status}`,
    );
    return;
  }
```

3e. A condição do bloco pago deixa de ser `ASAAS_PAID_STATUSES.has(status)` e
passa a ser `phases.confirm || phases.credit`. Remova a constante
`ASAAS_PAID_STATUSES` (a regra de "liquidado" agora mora na Task 1).

Dentro do bloco, tudo que vai de `if (amountType === "share" && ...)` até o
fim das notificações fica envolto em `if (phases.confirm) { ... }`, e o crédito
da carteira em `if (phases.credit && organizerId) { ... }`.

3f. No `batch.set(processedRef, ...)`, mesclar em vez de sobrescrever e marcar
a fase:

```ts
    batch.set(processedRef, {
      kind: "tournamentRegistration",
      registrationId,
      payerUid,
      outcome: "approved",
      billingType,
      confirmedAt: FieldValue.serverTimestamp(),
      processedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
```

3g. O crédito da carteira passa a marcar a própria fase, e só quando dá certo
(um crédito que falhou precisa poder ser reprocessado):

```ts
    if (phases.credit && organizerId) {
      try {
        const organizerSnap = await db.doc(`organizers/${organizerId}`).get();
        const feePercent = resolveOrganizerTournamentFeePercent(organizerSnap.data());
        await creditOrganizerWalletFromRegistration(db, organizerId, {
          registrationId,
          payerUid,
          paymentId,
          grossReais: paidOnline,
          platformFeeReais: computePlatformFeeReais(paidOnline, feePercent),
          gatewayFeeReais: resolveGatewayFeeReais(payment, billingType, paidOnline),
        });
        await processedRef.set({
          walletCreditedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
      } catch (walletErr) {
        logger.error(
          `Asaas tournament registration ${registrationId}: organizer wallet credit failed`,
          walletErr,
        );
      }
    }
```

Quando só a fase de crédito roda, o `paidOnline`/`amountType` continuam sendo
lidos no topo do bloco (do `payment` e do `pixPending`), então nada mais
precisa mudar ali.

3h. No bloco de status negativo, gritar quando o pagamento já estava
confirmado — é estorno ou chargeback de vaga garantida, e hoje isso sumia num
`return` silencioso:

```ts
  if (ASAAS_NEGATIVE_TERMINAL_STATUSES.has(status)) {
    if (alreadyConfirmed) {
      logger.error(
        `Asaas tournament registration ${registrationId}: pagamento ${paymentId} ` +
        `virou ${status} DEPOIS de confirmar a inscrição — vaga e carteira ` +
        "seguem como estão, resolver à mão",
        {registrationId, payerUid, paymentId, status, billingType},
      );
      return;
    }
    // …bloco existente que marca `expired` / `rejected`…
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --prefix functions test`
Expected: PASS, incluindo todos os testes que já existiam no arquivo.

- [ ] **Step 5: Commitar**

```bash
git add functions/src/asaas-tournament-registration-webhook.ts functions/src/asaas-tournament-registration-webhook.test.ts
git commit -m "webhook de inscrição decide confirmação e crédito em duas fases"
```

---

### Task 5: Varredura não mata cobrança de cartão em voo

**Files:**
- Modify: `functions/src/tournament-registration-pix-expiry-sweeper.ts`
- Test: `functions/src/tournament-registration-pix-expiry-sweeper.test.ts`

**Interfaces:**
- Consumes: `parseRegistrationBillingType` (Task 1); `getAsaasPayment` (já
  existe em `asaas-booking-payment.ts`).
- Produces: `expireOpenPixCharges` ganha o parâmetro opcional
  `resolveChargeStatus?: (asaasPaymentId: string) => Promise<string>`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
/** Cobrança de cartão vencida no nosso relógio, mas que pode estar autorizada
 *  no gateway — a janela entre o atleta pagar e o webhook chegar. */
function expiredCard(id = "uid-card", asaasPaymentId = "pay_card"): ExpiringPixDoc {
  return pixDoc(id, {
    status: "pending",
    billingType: "CREDIT_CARD",
    asaasPaymentId,
    paymentExpiresAt: Timestamp.fromMillis(NOW - 1 * MIN),
  });
}

describe("expireOpenPixCharges: cartão em voo", () => {
  it("não deleta cobrança de cartão já autorizada no gateway", async () => {
    const cancelled: string[] = [];
    const marked: string[] = [];

    const result = await expireOpenPixCharges({
      docs: [expiredCard()],
      nowMs: NOW,
      cancelCharge: async (id) => {
        cancelled.push(id);
      },
      markCancelled: async (doc) => {
        marked.push(doc.id);
      },
      resolveChargeStatus: async () => "CONFIRMED",
    });

    assert.deepEqual(cancelled, []);
    assert.deepEqual(marked, []);
    assert.equal(result.expired, 0);
  });

  it("deleta cobrança de cartão ainda pendente no gateway", async () => {
    const cancelled: string[] = [];

    await expireOpenPixCharges({
      docs: [expiredCard()],
      nowMs: NOW,
      cancelCharge: async (id) => {
        cancelled.push(id);
      },
      markCancelled: async () => {},
      resolveChargeStatus: async () => "PENDING",
    });

    assert.deepEqual(cancelled, ["pay_card"]);
  });

  it("não consulta o gateway para cobrança de PIX", async () => {
    let consultas = 0;
    const cancelled: string[] = [];

    await expireOpenPixCharges({
      docs: [expiredPending()],
      nowMs: NOW,
      cancelCharge: async (id) => {
        cancelled.push(id);
      },
      markCancelled: async () => {},
      resolveChargeStatus: async () => {
        consultas++;
        return "PENDING";
      },
    });

    assert.equal(consultas, 0);
    assert.deepEqual(cancelled, ["pay_1"]);
  });

  it("falha na consulta do gateway não marca nada", async () => {
    const marked: string[] = [];

    const result = await expireOpenPixCharges({
      docs: [expiredCard()],
      nowMs: NOW,
      cancelCharge: async () => {},
      markCancelled: async (doc) => {
        marked.push(doc.id);
      },
      resolveChargeStatus: async () => {
        throw new Error("asaas fora do ar");
      },
    });

    assert.deepEqual(marked, []);
    assert.equal(result.failed, 1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --prefix functions test`
Expected: FAIL — `resolveChargeStatus` não existe nos params.

- [ ] **Step 3: Implementar**

Import novo:

```ts
import {parseRegistrationBillingType} from "./registration-payment-phases";
```

Status em que o dinheiro está em voo e a cobrança não pode ser destruída,
junto das constantes do topo:

```ts
/** Cartão já saiu do "aberto": deletar aqui destruiria pagamento em voo. O
 *  webhook resolve em minutos; a varredura só precisa não atrapalhar. */
const CARD_IN_FLIGHT_STATUSES = new Set([
  "CONFIRMED",
  "RECEIVED",
  "RECEIVED_IN_CASH",
  "AWAITING_RISK_ANALYSIS",
]);
```

Na assinatura de `expireOpenPixCharges`, um parâmetro a mais:

```ts
  resolveChargeStatus?: (asaasPaymentId: string) => Promise<string>;
```

E, dentro do laço, logo antes do `try { await params.cancelCharge(...) }`:

```ts
    if (
      parseRegistrationBillingType(data.billingType) === "CREDIT_CARD" &&
      params.resolveChargeStatus
    ) {
      let gatewayStatus: string;
      try {
        gatewayStatus = (await params.resolveChargeStatus(asaasPaymentId)).toUpperCase();
      } catch (e) {
        logger.error("Falha ao consultar cobrança de cartão vencida", {
          payerUid: doc.id, asaasPaymentId, error: e,
        });
        failed++;
        continue;
      }
      if (CARD_IN_FLIGHT_STATUSES.has(gatewayStatus)) {
        logger.info("Cobrança de cartão vencida no relógio, mas em voo no gateway", {
          payerUid: doc.id, asaasPaymentId, gatewayStatus,
        });
        continue;
      }
    }
```

No job agendado, ligar a consulta de verdade:

```ts
    resolveChargeStatus: async (id) => (await getAsaasPayment(id)).status ?? "",
```

com `getAsaasPayment` acrescentado ao import de `./asaas-booking-payment`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --prefix functions test`
Expected: PASS.

- [ ] **Step 5: Commitar**

```bash
git add functions/src/tournament-registration-pix-expiry-sweeper.ts functions/src/tournament-registration-pix-expiry-sweeper.test.ts
git commit -m "varredura não destrói cobrança de cartão em voo"
```

---

### Task 6: Callable de cartão

**Files:**
- Modify: `functions/src/tournament-registration-pix.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `createAsaasCardCharge` (Task 3).
- Produces: callable `createTournamentRegistrationCardPayment`, que recebe
  `{registrationId, cpfCnpj?, cpf?, amountType?}` (mesma entrada da de PIX) e
  devolve `{paymentId: string; invoiceUrl: string; expiresAt: string; amountReais: number}`.

O corpo de `createTournamentRegistrationPixPayment` (hoje das linhas ~126 a
~360, do parsing dos argumentos até `getOrCreateAsaasCustomer`) é preâmbulo
comum aos dois meios de pagamento. Extraia-o **sem alterar uma linha de
lógica** para `prepareRegistrationCharge`, e deixe as duas callables finas
sobre ele. Copiar o preâmbulo em vez de extrair é o erro a evitar: as duas
cópias divergiriam na primeira regra nova de elegibilidade.

- [ ] **Step 1: Extrair o preâmbulo**

Nova função no mesmo arquivo, acima das callables:

```ts
interface PreparedRegistrationCharge {
  db: Firestore;
  projectId: string;
  registrationId: string;
  amountType: "share" | "full";
  chargeAmount: number;
  customerId: string;
  description: string;
  externalReference: string;
  expiresAtDate: Date;
}

/**
 * Tudo que vem antes de existir uma cobrança: autenticação, elegibilidade,
 * prazo da vaga, valor da cota e cliente no gateway. É idêntico para PIX e
 * cartão — o que muda é só o `billingType` na hora de criar a cobrança.
 *
 * `methodLabel` entra nas mensagens de erro voltadas ao atleta ("Informe seu
 * CPF para pagar com PIX" / "com cartão").
 */
async function prepareRegistrationCharge(
  callerUid: string,
  data: {
    registrationId?: string;
    cpf?: string;
    cpfCnpj?: string;
    amountType?: string;
  },
  methodLabel: string,
): Promise<PreparedRegistrationCharge> {
  // …corpo movido verbatim das linhas 139–360 da callable de PIX…
}
```

Regras da mudança:
- O corpo move **verbatim**, trocando apenas as duas mensagens que citam PIX
  por interpolação de `methodLabel`: `"Informe seu CPF para pagar com ${methodLabel}."`
- `cancelExistingPixPending` continua sendo chamado dentro do preparo (uma
  cobrança nova sempre substitui a anterior do mesmo atleta, seja qual for o
  meio).
- Os `catch` de `getOrCreateAsaasCustomer` mudam o texto do log para
  `prepareRegistrationCharge`.

`createTournamentRegistrationPixPayment` passa a ser:

```ts
export const createTournamentRegistrationPixPayment = onCall({
  secrets: pixPaymentSecrets,
}, async (request): Promise<PixPaymentResponse> => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Faça login para pagar.");
  }
  const prepared = await prepareRegistrationCharge(
    callerUid, (request.data ?? {}) as Record<string, string>, "PIX",
  );
  // …o restante segue idêntico, lendo de `prepared`…
});
```

- [ ] **Step 2: Rodar a suíte para provar que nada mudou**

Run: `npm --prefix functions test`
Expected: PASS. Nenhum teste novo aqui — a extração é refatoração pura, e a
suíte existente é a rede de segurança.

- [ ] **Step 3: Commitar a refatoração sozinha**

```bash
git add functions/src/tournament-registration-pix.ts
git commit -m "extrai o preparo da cobrança de inscrição das callables"
```

- [ ] **Step 4: Escrever a callable de cartão**

```ts
type CardPaymentResponse = {
  paymentId: string;
  /** Checkout hospedado do Asaas — o atleta digita o cartão lá, não aqui. */
  invoiceUrl: string;
  expiresAt: string;
  amountReais: number;
};

export const createTournamentRegistrationCardPayment = onCall({
  secrets: pixPaymentSecrets,
}, async (request): Promise<CardPaymentResponse> => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Faça login para pagar.");
  }

  const prepared = await prepareRegistrationCharge(
    callerUid, (request.data ?? {}) as Record<string, string>, "cartão",
  );

  let charge;
  try {
    charge = await createAsaasCardCharge({
      customerId: prepared.customerId,
      valueReais: prepared.chargeAmount,
      dueDate: prepared.expiresAtDate,
      description: prepared.description,
      externalReference: prepared.externalReference,
      idempotencyKey: `tournament-reg-card-${prepared.registrationId}-${callerUid}`,
    });
  } catch (e) {
    if (e instanceof AsaasApiError) {
      logger.error(
        "createTournamentRegistrationCardPayment Asaas failed:",
        e.httpStatus, e.body,
      );
      const hint = e.message.toLowerCase();
      if (hint.includes("cpf") || hint.includes("cnpj")) {
        throw new HttpsError("failed-precondition", e.message);
      }
      throw new HttpsError(
        "internal", "Não foi possível abrir o checkout. Tente novamente.",
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "ASAAS_API_KEY_MISSING") {
      throw new HttpsError(
        "failed-precondition", "Pagamento online temporariamente indisponível.",
      );
    }
    logger.error("createTournamentRegistrationCardPayment charge failed", e);
    throw new HttpsError(
      "internal", "Não foi possível abrir o checkout. Tente novamente.",
    );
  }

  await pixPendingRef(
    prepared.db, prepared.projectId, prepared.registrationId, callerUid,
  ).set({
    asaasPaymentId: charge.paymentId,
    amountReais: prepared.chargeAmount,
    amountType: prepared.amountType,
    billingType: "CREDIT_CARD",
    status: "pending",
    payerUid: callerUid,
    paymentExpiresAt: Timestamp.fromDate(prepared.expiresAtDate),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    paymentId: charge.paymentId,
    invoiceUrl: charge.invoiceUrl,
    expiresAt: prepared.expiresAtDate.toISOString(),
    amountReais: prepared.chargeAmount,
  };
});
```

A callable de PIX também passa a gravar `billingType: "PIX"` no seu
`pixPendingRef(...).set({...})`, para o acervo novo ser explícito.

- [ ] **Step 5: Exportar**

Em `functions/src/index.ts`, ao lado de
`createTournamentRegistrationPixPayment` (duas ocorrências: o import e o bloco
de export), acrescentar `createTournamentRegistrationCardPayment`.

- [ ] **Step 6: Compilar e rodar**

Run: `npm --prefix functions test`
Expected: PASS.

- [ ] **Step 7: Commitar**

```bash
git add functions/src/tournament-registration-pix.ts functions/src/index.ts
git commit -m "callable de pagamento de inscrição por cartão"
```

---

### Task 7: Portal — wrapper da callable

**Files:**
- Modify: `frontend/projects/athlete/src/app/data/tournament-registrations-repository.ts`

**Interfaces:**
- Consumes: callable `createTournamentRegistrationCardPayment` (Task 6).
- Produces: `interface CardPaymentResult {paymentId: string; invoiceUrl: string; expiresAt: string; amountReais: number}`
  e `createRegistrationCardPayment(functions, registrationId, amountType, cpfCnpj): Promise<CardPaymentResult>`
  — argumentos posicionais, na mesma ordem de `createRegistrationPixPayment`.

- [ ] **Step 1: Implementar**

Logo depois de `createRegistrationPixPayment` (linha ~636), espelhando-a
argumento por argumento:

```ts
/** Cobrança de cartão: o pagamento acontece no checkout HOSPEDADO do Asaas
 *  (`invoiceUrl`), fora do nosso domínio. Nenhum dado de cartão passa por
 *  aqui — nem pelo navegador dentro do portal. */
export interface CardPaymentResult {
  paymentId: string;
  invoiceUrl: string;
  expiresAt: string;
  amountReais: number;
}

export async function createRegistrationCardPayment(functions: Functions, registrationId: string, amountType: 'share' | 'full', cpfCnpj: string): Promise<CardPaymentResult> {
  try {
    const result = await httpsCallable<Record<string, unknown>, CardPaymentResult>(functions, 'createTournamentRegistrationCardPayment')({
      registrationId,
      amountType,
      cpfCnpj,
    });
    return result.data;
  } catch (err) {
    throw mapCallableError(err);
  }
}
```

- [ ] **Step 2: Compilar**

Run (a partir de `frontend/`): `npx tsc -p projects/athlete/tsconfig.app.json --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commitar**

```bash
git add frontend/projects/athlete/src/app/data/tournament-registrations-repository.ts
git commit -m "portal do atleta chama a callable de cartão"
```

---

### Task 8: Portal — escolha do método e checkout

**Files:**
- Modify: `frontend/projects/athlete/src/app/tournaments/registration/tournament-payment.component.ts`
- Modify: `frontend/projects/athlete/src/app/tournaments/registration/tournament-payment.component.html`
- Modify: `frontend/projects/athlete/src/app/tournaments/registration/tournament-payment.component.scss`
- Test: `frontend/projects/athlete/src/app/tournaments/registration/card-checkout.spec.ts` (criar)

**Interfaces:**
- Consumes: `createRegistrationCardPayment`, `CardPaymentResult` (Task 7).
- Produces: nada para tasks seguintes.

**Como o estado de espera funciona:** não há polling novo. O componente já
mantém `watchRegistration` montado; quando o webhook confirma, o listener
dispara, `registration()` vira `isPaid: true` e o caminho de saída existente
(`payment-paid-exit`) leva ao comprovante. A tela de cartão só precisa mostrar
o link e não atrapalhar.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { resolvePaymentMethods } from './tournament-payment.component';

describe('resolvePaymentMethods', () => {
  it('oferece PIX e cartão no torneio que cobra pelo app', () => {
    expect(resolvePaymentMethods('appPixCard')).toEqual(['pix', 'card']);
  });

  it('não oferece nada no pagamento direto com o organizador', () => {
    expect(resolvePaymentMethods('directWithOrganizer')).toEqual([]);
  });

  it('trata modo desconhecido como cobrança pelo app (padrão do acervo)', () => {
    expect(resolvePaymentMethods(null)).toEqual(['pix', 'card']);
  });
});
```

Extraia `resolvePaymentMethods(paymentMode: string | null): ReadonlyArray<'pix' | 'card'>`
como função exportada pura no `.ts` do componente — regra testável sem montar
a tela (o componente monta Firestore no construtor, ver o comentário no
`payment-paid-exit.spec.ts`).

- [ ] **Step 2: Rodar e ver falhar**

Run (a partir de `frontend/`): `npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/card-checkout.spec.ts'`
Expected: FAIL — `resolvePaymentMethods` não existe.

- [ ] **Step 3: Implementar a regra e o estado**

No `.ts`:

```ts
export type PaymentMethod = 'pix' | 'card';

/** Modo de pagamento do torneio → meios oferecidos ao atleta. Modo ausente é
 *  cobrança pelo app: é o padrão de todo torneio do acervo. */
export function resolvePaymentMethods(
  paymentMode: string | null | undefined,
): ReadonlyArray<PaymentMethod> {
  return paymentMode === 'directWithOrganizer' ? [] : ['pix', 'card'];
}
```

Estado novo no componente:

```ts
  protected readonly method = signal<PaymentMethod>('pix');
  protected readonly cardResult = signal<CardPaymentResult | null>(null);
  protected readonly methods = computed(() => resolvePaymentMethods(this.listing()?.paymentMode));
```

Ação de gerar a cobrança de cartão, espelhando `generatePix()` (mesma validação
de CPF, mesmo `processing`, mesmo `documentError`) e alimentando o relógio que
já existe:

```ts
  protected async generateCardCheckout(): Promise<void> {
    const digits = normalizeCpfCnpj(this.cpfCnpj());
    if (!isValidCpfCnpj(digits)) {
      this.documentError.set(cpfCnpjValidationMessage(digits));
      return;
    }
    this.documentError.set(null);

    const registrationId = this.registration()?.id;
    if (!registrationId) return;

    this.processing.set(true);
    try {
      const result = await createRegistrationCardPayment(
        athleteFunctions(),
        registrationId,
        this.amountType(),
        digits,
      );
      // Uma cobrança viva por vez: duas seriam duas chances de pagar a mesma cota.
      this.pixResult.set(null);
      this.pixQrSrc.set(null);
      this.cardResult.set(result);
      this.pixExpired.set(false);
      this.pixExpiresAtMs.set(Date.parse(result.expiresAt));
    } catch (err) {
      this.toasts.error(
        err instanceof TournamentRegistrationError
          ? err.message
          : 'Não foi possível abrir o checkout. Tente novamente.',
      );
    } finally {
      this.processing.set(false);
    }
  }
```

Confira no arquivo o nome exato do método de PIX e dos helpers de CPF antes de
copiar — o bloco acima segue os que estão importados no topo do componente
(`normalizeCpfCnpj`, `isValidCpfCnpj`, `cpfCnpjValidationMessage`,
`athleteFunctions`, `TournamentRegistrationError`).

Ao trocar de método pelo seletor, limpar o resultado do outro pelo mesmo
motivo.

- [ ] **Step 4: Implementar o template**

No `.html`, no ramo de cobrança pelo app e antes de existir cobrança viva,
dois botões de método (`PIX` / `Cartão`). Depois de gerar a cobrança de
cartão:

```html
<a class="at-btn at-btn-primary" [href]="cardResult()!.invoiceUrl"
   target="_blank" rel="noopener">
  Abrir checkout seguro
</a>
<p class="at-hint">
  O pagamento acontece no ambiente do Asaas. Assim que o cartão for aprovado,
  esta tela confirma sozinha — pode deixá-la aberta.
</p>
```

**Nunca** chamar `window.open()` depois do `await` da callable: o bloqueador de
popup mata a chamada e não há erro visível. O link real é o padrão que o portal
da arena já usa (`panel-plans.component.ts`).

- [ ] **Step 5: Rodar e ver passar**

Run (a partir de `frontend/`): `npx ng test athlete --watch=false --browsers=ChromeHeadless`
Expected: PASS, incluindo `payment-paid-exit.spec.ts` sem edição.

- [ ] **Step 6: Verificar no navegador**

Suba o portal e confira: seletor aparece no torneio `appPixCard`, some no
`directWithOrganizer`; o botão de cartão gera a cobrança e mostra o link; o
relógio do prazo continua correndo; "Voltar sem pagar" limpa a cobrança.

- [ ] **Step 7: Commitar**

```bash
git add frontend/projects/athlete/src/app/tournaments/registration/tournament-payment.component.ts frontend/projects/athlete/src/app/tournaments/registration/tournament-payment.component.html frontend/projects/athlete/src/app/tournaments/registration/tournament-payment.component.scss frontend/projects/athlete/src/app/tournaments/registration/card-checkout.spec.ts
git commit -m "portal do atleta oferece cartão no pagamento da inscrição"
```

---

### Task 9: Textos que afirmam que cartão não existe

**Files:**
- Modify: `frontend/projects/athlete/src/app/tournaments/registration/wizard/steps/registration-consent.component.html:22-23`
- Modify: `frontend/projects/athlete/src/app/tournaments/registration/tournament-payment.component.ts:80-81` (comentário de doutrina)
- Modify: `frontend/projects/athlete/src/app/reservar/arena-payment.component.ts:49` (comentário de doutrina)

**Interfaces:** nenhuma.

O termo LGPD hoje afirma ao atleta, por escrito, que **não existe pagamento por
cartão**. Deixar isso na tela depois de lançar o cartão é uma declaração falsa
num texto de consentimento.

- [ ] **Step 1: Corrigir o termo**

Em `registration-consent.component.html`, o trecho "…e não existe pagamento por
cartão (só PIX)" passa a dizer que os dados de pagamento não chegam ao
organizador e que o cartão é processado pelo ambiente do gateway, sem passar
pelo NexaGO. Mantenha o resto da frase (nascimento, CPF) intacto.

- [ ] **Step 2: Corrigir os comentários de doutrina**

Os dois comentários afirmam "não existe pagamento por cartão em lugar nenhum do
fluxo real". No `tournament-payment.component.ts`, passa a descrever os dois
meios reais. No `arena-payment.component.ts` a afirmação **continua verdadeira**
(reserva de arena segue sem cartão) — ajuste só para deixar claro que o escopo
da frase é a reserva, não o produto inteiro.

- [ ] **Step 3: Rodar a suíte do portal**

Run (a partir de `frontend/`): `npx ng test athlete --watch=false --browsers=ChromeHeadless`
Expected: PASS.

- [ ] **Step 4: Commitar**

```bash
git add frontend/projects/athlete/src
git commit -m "textos deixam de afirmar que cartão não existe"
```

---

## Depois do plano (não é código)

1. Habilitar o evento `PAYMENT_CONFIRMED` no webhook do painel do Asaas — o
   roteador já aceita o evento (`asaas-webhook.ts`), mas o PIX até hoje só
   dependeu de `PAYMENT_RECEIVED`. Sem isso o cartão só confirma na
   liquidação, que é exatamente o que este trabalho evita.
2. Deploy em DEV das funções tocadas
   (`createTournamentRegistrationCardPayment`, `asaasWebhook`,
   `expireOpenTournamentRegistrationPixCharges`) e teste ponta a ponta com
   cartão de sandbox do Asaas.
3. PROD sobe junto com as funções de expiração de PIX que já estão pendentes
   (ver memória `pix-cabe-no-prazo-da-inscricao`).
4. Fica em aberto, fora deste plano: o portal do **organizador** mostra a
   inscrição paga com a carteira parada por ~30 dias. Precisa de um rótulo
   "a liberar" na tela dele.
