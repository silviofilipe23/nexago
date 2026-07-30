# Planos Starter/Pro/Elite + taxa por tier — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir os planos de arena (Essencial grátis/Pro/Parceiro) por Starter R$99 / Pro R$249 / Elite R$499, com taxa de reserva 8/6/5% em todos os planos (8% sem plano), ativação única R$97, limites de quadra 2/5/∞ e saque PIX sem tarifa no Elite (R$1,75 nos demais).

**Architecture:** IDs canônicos novos `starter|pro|elite` com normalização de legados (`parceiro`→`elite`, `essencial`→sem plano) na borda de leitura de cada camada; docs Firestore não são migrados. A fonte da verdade de preço/taxa é `functions/src/arena-plans.ts` + `platform-fees.ts`; app Flutter, painel Angular e site espelham o catálogo.

**Tech Stack:** Cloud Functions (TypeScript, node:test), Firestore rules (+ @firebase/rules-unit-testing), Flutter/Dart, Angular 20 (signals), Next.js (site).

**Spec:** `docs/superpowers/specs/2026-07-30-arena-plan-tiers-design.md` (aprovada pelo dono; decisões: sem plano = 8%, ativação somada na 1ª cobrança, tarifa de saque R$1,75).

## Global Constraints

- Raiz do repo (worktree): `/Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/arena/.claude/worktrees/athlete-payment-commission-tiers-84e963`. **Todo comando bash deve ser prefixado com `cd <essa raiz>/<subdir> &&`.**
- Strings de UI em português; código (nomes, comentários técnicos) em inglês onde já for assim — siga o idioma do arquivo tocado (functions usa comentários em PT).
- Cada task termina com build verde: functions = `cd functions && npm test` (roda `tsc` + node:test); Flutter = `cd nexago_app && flutter test test/features/arena`; Angular = `cd frontend && npx ng build arena`; site = `cd frontend/projects/site && npm run build`.
- Preços (centavos): starter 9900 mensal / 108000 anual · pro 24900 / 273600 · elite 49900 / 548400. Ativação 9700. Taxas: starter 8, pro 6, elite 5, sem plano 8. Piso por transação R$1,50 (inalterado). Tarifa de saque R$1,75 (elite: 0).
- Retrocompat: nunca rejeitar docs com `planTier: 'parceiro'` (ler como elite). `'essencial'` em doc = sem plano. Nenhuma migração de dados.
- Commits: mensagens em PT no padrão do repo (`feat(...)`/`fix(...)`), terminando com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- NÃO tocar: `TOURNAMENT_FEE_PERCENT`, `CLUB_FEE_PERCENT`, fluxo de saque de organizador, `mercadopago-endpoints.ts` (fluxo MP dormente com fee fixa legada — fora de escopo), estorno (`platformFeeReais: 0`).

---

### Task 1: Catálogo novo em `arena-plans.ts` + normalização de legados

**Files:**
- Modify: `functions/src/arena-plans.ts`
- Modify: `functions/src/arena-subscription.ts:98-100` (remover check de plano grátis)
- Modify: `functions/src/asaas-arena-subscription-webhook.ts:28-40` (parse aceita legado)
- Test: `functions/src/arena-subscription.test.ts`

**Interfaces:**
- Consumes: nada (task raiz).
- Produces: `type ArenaPlanTier = "starter" | "pro" | "elite"`; `ARENA_PLANS: Record<ArenaPlanTier, ArenaPlan>` (sem campo `free`); `ACTIVATION_FEE_CENTS = 9700`; `isArenaPlanTier(value): value is ArenaPlanTier` (só ids novos); `normalizeArenaPlanTier(value: unknown): ArenaPlanTier | null` (`'parceiro'→'elite'`, resto legado → null); `resolvePlanPriceCents(tier, cycle): number` (sem caso grátis). Tasks 2, 4 e 6 dependem dessas exports.

- [ ] **Step 1: Reescrever o catálogo em `functions/src/arena-plans.ts`**

Substituir o conteúdo do arquivo por:

```ts
/**
 * Catálogo de planos de arena — fonte da verdade no servidor.
 *
 * O cliente envia apenas `tier` + `cycle`; o valor cobrado SEMPRE vem daqui,
 * nunca do request (segurança). Espelha os planos exibidos no site
 * (`ArenaPlanos`): Starter, Pro e Elite — todos pagos; a taxa por reserva
 * (8/6/5%) vive em `platform-fees.ts`.
 *
 * IDs legados em docs antigos: 'parceiro' é lido como 'elite' e 'essencial'
 * como "sem plano" via `normalizeArenaPlanTier` — nenhum doc é migrado.
 */

export type ArenaPlanTier = "starter" | "pro" | "elite";
export type BillingCycle = "monthly" | "yearly";

export interface ArenaPlan {
  tier: ArenaPlanTier;
  name: string;
  /** Valor mensal em centavos. */
  monthlyCents: number;
  /** Valor anual total em centavos (12× a parcela da tabela comercial ≈ 1 mês grátis). */
  yearlyCents: number;
}

// Tabela oficial (2026-07): anual = 12× R$90 / R$228 / R$457.
export const ARENA_PLANS: Record<ArenaPlanTier, ArenaPlan> = {
  starter: {tier: "starter", name: "Starter", monthlyCents: 9900, yearlyCents: 108000},
  pro: {tier: "pro", name: "Pro", monthlyCents: 24900, yearlyCents: 273600},
  elite: {tier: "elite", name: "Elite", monthlyCents: 49900, yearlyCents: 548400},
};

/** Ativação única na primeira assinatura da arena (domínio, site, onboarding). */
export const ACTIVATION_FEE_CENTS = 9700;

export function isArenaPlanTier(value: unknown): value is ArenaPlanTier {
  return value === "starter" || value === "pro" || value === "elite";
}

/**
 * Normaliza um tier lido de doc/ref, aceitando ids legados: 'parceiro' vira
 * 'elite' (mantém tudo que tinha); 'essencial' (grátis extinto) vira null.
 */
export function normalizeArenaPlanTier(value: unknown): ArenaPlanTier | null {
  if (isArenaPlanTier(value)) return value;
  if (value === "parceiro") return "elite";
  return null;
}

export function isBillingCycle(value: unknown): value is BillingCycle {
  return value === "monthly" || value === "yearly";
}

/** Valor em centavos do plano/ciclo. Lança `ARENA_PLAN_NOT_BILLABLE` se inválido. */
export function resolvePlanPriceCents(tier: ArenaPlanTier, cycle: BillingCycle): number {
  const plan = ARENA_PLANS[tier];
  if (!plan) {
    throw new Error("ARENA_PLAN_NOT_BILLABLE");
  }
  const cents = cycle === "yearly" ? plan.yearlyCents : plan.monthlyCents;
  if (!(cents > 0)) {
    throw new Error("ARENA_PLAN_NOT_BILLABLE");
  }
  return cents;
}

/** Mapeia o ciclo interno para o enum de recorrência do Asaas. */
export function asaasCycle(cycle: BillingCycle): "MONTHLY" | "YEARLY" {
  return cycle === "yearly" ? "YEARLY" : "MONTHLY";
}
```

- [ ] **Step 2: Remover o check de plano grátis em `arena-subscription.ts`**

Em `functions/src/arena-subscription.ts:98-100`, deletar o bloco (não existe mais plano grátis; `isArenaPlanTier` no passo anterior já rejeita legados no input com "Plano ou ciclo inválido"):

```ts
    if (ARENA_PLANS[tier].free) {
      throw new HttpsError("failed-precondition", "O plano Essencial é gratuito e não requer cobrança.");
    }
```

- [ ] **Step 3: Parse do webhook aceita refs legadas**

Em `functions/src/asaas-arena-subscription-webhook.ts`: trocar o import `isArenaPlanTier` por `normalizeArenaPlanTier` (linha 11) e reescrever `parseSubscriptionRef` (linhas 29-40) para normalizar — assinaturas antigas com ref `...:parceiro` continuam renovando (e passam a gravar `planTier: 'elite'`, migração suave no próximo pagamento):

```ts
/** Extrai `{arenaId, tier}` de `arenaSubscription:{arenaId}:{tier}` (aceita tiers legados). */
export function parseSubscriptionRef(
  externalReference: string,
): {arenaId: string; tier: ArenaPlanTier} | null {
  if (!externalReference.startsWith(ARENA_SUBSCRIPTION_REF_PREFIX)) return null;
  const rest = externalReference.slice(ARENA_SUBSCRIPTION_REF_PREFIX.length);
  const sep = rest.lastIndexOf(":");
  if (sep <= 0) return null;
  const arenaId = rest.slice(0, sep).trim();
  const tier = normalizeArenaPlanTier(rest.slice(sep + 1).trim());
  if (!arenaId || !tier) return null;
  return {arenaId, tier};
}
```

- [ ] **Step 4: Atualizar `arena-subscription.test.ts`**

Substituir o corpo de `run()` (mantendo os helpers `assert`/`expectThrows`):

```ts
function run(): void {
  // Catálogo: valores vêm do servidor, nunca do cliente.
  assert(resolvePlanPriceCents("starter", "monthly") === 9900, "starter mensal");
  assert(resolvePlanPriceCents("starter", "yearly") === 108000, "starter anual (12× R$90)");
  assert(resolvePlanPriceCents("pro", "monthly") === 24900, "pro mensal");
  assert(resolvePlanPriceCents("pro", "yearly") === 273600, "pro anual (12× R$228)");
  assert(resolvePlanPriceCents("elite", "monthly") === 49900, "elite mensal");
  assert(resolvePlanPriceCents("elite", "yearly") === 548400, "elite anual (12× R$457)");
  assert(ACTIVATION_FEE_CENTS === 9700, "ativação R$97");

  // Normalização de legados.
  assert(normalizeArenaPlanTier("parceiro") === "elite", "parceiro -> elite");
  assert(normalizeArenaPlanTier("essencial") === null, "essencial -> sem plano");
  assert(normalizeArenaPlanTier("starter") === "starter", "starter passa direto");
  assert(normalizeArenaPlanTier("vip") === null, "desconhecido -> null");

  // Parse do externalReference.
  const ok = parseSubscriptionRef("arenaSubscription:arena123:pro");
  assert(ok?.arenaId === "arena123" && ok?.tier === "pro", "parse válido");

  const legacy = parseSubscriptionRef("arenaSubscription:arena123:parceiro");
  assert(legacy?.arenaId === "arena123" && legacy?.tier === "elite", "ref legada parceiro -> elite");

  const withColon = parseSubscriptionRef("arenaSubscription:are:na:elite");
  assert(withColon?.arenaId === "are:na" && withColon?.tier === "elite", "parse com ':' no id");

  assert(parseSubscriptionRef("arenaBooking:arena123:pro") === null, "prefixo errado -> null");
  assert(parseSubscriptionRef("arenaSubscription:arena123:vip") === null, "tier inválido -> null");
  assert(parseSubscriptionRef("arenaSubscription:arena123") === null, "sem tier -> null");

  if (failures > 0) {
    throw new Error(`${failures} teste(s) falharam`);
  }
  // eslint-disable-next-line no-console
  console.log("arena-subscription.test.ts: OK");
}
```

Atualizar os imports do arquivo para: `import {resolvePlanPriceCents, normalizeArenaPlanTier, ACTIVATION_FEE_CENTS} from "./arena-plans";` (remover `ARENA_PLANS` se ficar sem uso).

- [ ] **Step 5: Rodar testes**

Run: `cd functions && npm test`
Expected: `tsc` compila e todos os testes passam (inclui `arena-subscription.test.ts: OK`).
Nota: `arena-entitlement.test.ts` ainda passa sem mudanças (será estendido na Task 2).

- [ ] **Step 6: Commit**

```bash
git add functions/src/arena-plans.ts functions/src/arena-subscription.ts functions/src/asaas-arena-subscription-webhook.ts functions/src/arena-subscription.test.ts
git commit -m "feat(planos): catálogo Starter/Pro/Elite com normalização de tiers legados"
```

---

### Task 2: Taxa de reserva por tier (`platform-fees.ts` + `arena-entitlement.ts`)

**Files:**
- Modify: `functions/src/platform-fees.ts`
- Modify: `functions/src/arena-entitlement.ts`
- Test: `functions/src/arena-entitlement.test.ts`

**Interfaces:**
- Consumes: `normalizeArenaPlanTier`, `type ArenaPlanTier` (Task 1).
- Produces: `BOOKING_FEE_PERCENT_BY_TIER: Record<ArenaPlanTier, number>` e `BOOKING_FEE_PERCENT_NO_PLAN = 8` (platform-fees); `arenaEntitledTier(arena: ArenaPlanFields, nowMs: number): ArenaPlanTier | null`; `isArenaEntitledPro(arena, nowMs): boolean` (assinatura preservada — call sites existentes não mudam); `resolveArenaBookingFeePercent(arena, nowMs): number` (arena-entitlement). Tasks 3 e 6 dependem.

- [ ] **Step 1: Escrever os testes novos (falhando)**

Em `functions/src/arena-entitlement.test.ts`, adicionar imports `arenaEntitledTier, resolveArenaBookingFeePercent` de `./arena-entitlement` e as suítes:

```ts
describe("arena-entitlement.arenaEntitledTier", () => {
  const now = Date.parse("2026-07-01T12:00:00Z");
  const ts = (ms: number) => Timestamp.fromMillis(ms);

  it("normaliza legados: parceiro ativo -> elite; essencial -> null", () => {
    assert.equal(arenaEntitledTier({planStatus: "active", planTier: "parceiro"}, now), "elite");
    assert.equal(arenaEntitledTier({planStatus: "active", planTier: "essencial"}, now), null);
  });

  it("tiers novos titulares", () => {
    assert.equal(arenaEntitledTier({planStatus: "active", planTier: "starter"}, now), "starter");
    assert.equal(arenaEntitledTier({planStatus: "active", planTier: "elite"}, now), "elite");
  });

  it("sem titularidade -> null (overdue fora da carência)", () => {
    assert.equal(
      arenaEntitledTier(
        {planStatus: "overdue", planTier: "pro", planActiveUntil: ts(now - 8 * DAY)},
        now,
      ),
      null,
    );
  });
});

describe("arena-entitlement.resolveArenaBookingFeePercent", () => {
  const now = Date.parse("2026-07-01T12:00:00Z");

  it("8/6/5 por tier titular", () => {
    assert.equal(resolveArenaBookingFeePercent({planStatus: "active", planTier: "starter"}, now), 8);
    assert.equal(resolveArenaBookingFeePercent({planStatus: "active", planTier: "pro"}, now), 6);
    assert.equal(resolveArenaBookingFeePercent({planStatus: "active", planTier: "elite"}, now), 5);
    assert.equal(resolveArenaBookingFeePercent({planStatus: "active", planTier: "parceiro"}, now), 5);
  });

  it("sem plano / sem titularidade -> 8%", () => {
    assert.equal(resolveArenaBookingFeePercent({}, now), 8);
    assert.equal(resolveArenaBookingFeePercent({planStatus: "none", planTier: "pro"}, now), 8);
    assert.equal(resolveArenaBookingFeePercent({planStatus: "active", planTier: "essencial"}, now), 8);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd functions && npm test`
Expected: FAIL — `arenaEntitledTier`/`resolveArenaBookingFeePercent` não exportados.

- [ ] **Step 3: Implementar**

Em `functions/src/platform-fees.ts`, substituir a constante `BOOKING_FEE_PERCENT` (linhas 19-20) e o comentário do cabeçalho (linhas 9-10) por:

```ts
/**
 * Taxa sobre reservas de arena por plano (%). Todos os planos pagam; arena sem
 * plano titular paga a taxa do Starter. Resolução em
 * `arena-entitlement.resolveArenaBookingFeePercent`.
 */
export const BOOKING_FEE_PERCENT_BY_TIER = {starter: 8, pro: 6, elite: 5} as const;

/** Taxa de reserva para arena sem plano titular (%). */
export const BOOKING_FEE_PERCENT_NO_PLAN = 8;
```

(No cabeçalho do arquivo, trocar a linha "- Reservas: só arenas no plano gratuito (Essencial)..." por "- Reservas: todos os planos — 8% Starter, 6% Pro, 5% Elite; sem plano = 8%.".)

Em `functions/src/arena-entitlement.ts`, substituir o arquivo inteiro por:

```ts
/**
 * Titularidade (entitlement) do plano de arena no servidor. Espelha
 * `ArenaPlanStatus.entitledAt` do app e `arenaEntitled` das firestore.rules:
 *  - active: sim;
 *  - overdue: sim enquanto dentro da carência de 7 dias após o vencimento;
 *  - canceling: sim até o fim do período pago (planActiveUntil);
 *  - demais: não.
 * Tiers legados são normalizados (parceiro→elite; essencial→sem plano).
 */
import {Timestamp} from "firebase-admin/firestore";
import {normalizeArenaPlanTier, type ArenaPlanTier} from "./arena-plans";
import {BOOKING_FEE_PERCENT_BY_TIER, BOOKING_FEE_PERCENT_NO_PLAN} from "./platform-fees";

export const OVERDUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

type ArenaPlanFields = {
  planStatus?: unknown;
  planTier?: unknown;
  planActiveUntil?: unknown;
};

/** Tier (normalizado) do qual a arena é titular neste momento, ou null. */
export function arenaEntitledTier(arena: ArenaPlanFields, nowMs: number): ArenaPlanTier | null {
  const tier = normalizeArenaPlanTier(
    typeof arena.planTier === "string" ? arena.planTier.trim() : arena.planTier,
  );
  if (!tier) return null;

  const status = typeof arena.planStatus === "string" ? arena.planStatus : "none";
  const until = arena.planActiveUntil instanceof Timestamp ?
    arena.planActiveUntil.toMillis() :
    null;

  if (status === "active") return tier;
  if (status === "overdue") {
    return until != null && nowMs < until + OVERDUE_GRACE_MS ? tier : null;
  }
  if (status === "canceling") {
    return until != null && nowMs < until ? tier : null;
  }
  return null;
}

/** A arena tem titularidade Pro-ou-superior? (gates de operação: comandas, estoque, clubinho, métricas, torneios.) */
export function isArenaEntitledPro(arena: ArenaPlanFields, nowMs: number): boolean {
  const tier = arenaEntitledTier(arena, nowMs);
  return tier === "pro" || tier === "elite";
}

/** Percentual da taxa de reserva conforme o plano titular (sem plano = 8%). */
export function resolveArenaBookingFeePercent(arena: ArenaPlanFields, nowMs: number): number {
  const tier = arenaEntitledTier(arena, nowMs);
  return tier ? BOOKING_FEE_PERCENT_BY_TIER[tier] : BOOKING_FEE_PERCENT_NO_PLAN;
}
```

- [ ] **Step 4: Rodar testes**

Run: `cd functions && npm test`
Expected: PASS — inclusive os testes antigos de `isArenaEntitledPro` (parceiro segue entitled; essencial segue não-entitled) e os 4 call sites de `isArenaEntitledPro` (occupancy, recurring, club, comanda-app-orders) compilam sem mudança.

- [ ] **Step 5: Commit**

```bash
git add functions/src/platform-fees.ts functions/src/arena-entitlement.ts functions/src/arena-entitlement.test.ts
git commit -m "feat(taxas): taxa de reserva por tier (8/6/5%) com resolução por titularidade"
```

---

### Task 3: Webhooks de reserva cobram a taxa por tier

**Files:**
- Modify: `functions/src/asaas-arena-booking-webhook.ts:14-15,111-120,266-274`
- Modify: `functions/src/mercadopago-arena-booking-webhook.ts:19-20,163-172`

**Interfaces:**
- Consumes: `resolveArenaBookingFeePercent` (Task 2), `computePlatformFeeReais` (existente).
- Produces: nada novo — mesmos efeitos (crédito líquido na carteira via `creditArenaWalletFromBooking`).

- [ ] **Step 1: Substituir os 3 call sites**

Nos dois arquivos, trocar os imports: remover `isArenaEntitledPro` (de `./arena-entitlement`) e `BOOKING_FEE_PERCENT` (de `./platform-fees`); adicionar `import {resolveArenaBookingFeePercent} from "./arena-entitlement";` (manter `computePlatformFeeReais` de `./platform-fees`).

Em cada um dos 3 blocos (asaas linhas 111-120 e 266-274; mercadopago linhas 163-172), substituir:

```ts
    // Taxa só para arenas no plano gratuito; Pro/Parceiro isentos.
    let platformFee = 0;
    if (arenaId) {
      const arenaSnap = await db.collection("arenas").doc(arenaId).get();
      const entitled = arenaSnap.exists &&
        isArenaEntitledPro(arenaSnap.data() ?? {}, Date.now());
      platformFee = entitled ?
        0 :
        computePlatformFeeReais(paidOnline, BOOKING_FEE_PERCENT);
    }
```

por:

```ts
    // Taxa por plano: 8% Starter, 6% Pro, 5% Elite; sem plano titular = 8%.
    let platformFee = 0;
    if (arenaId) {
      const arenaSnap = await db.collection("arenas").doc(arenaId).get();
      const feePercent = resolveArenaBookingFeePercent(arenaSnap.data() ?? {}, Date.now());
      platformFee = computePlatformFeeReais(paidOnline, feePercent);
    }
```

(No bloco do asaas em 266-274, o comentário original não existe — substituir só o trecho de código equivalente.)

- [ ] **Step 2: Rodar testes**

Run: `cd functions && npm test`
Expected: PASS (a lógica de percentual já está coberta pelos testes da Task 2; estes call sites são substituição mecânica).

- [ ] **Step 3: Commit**

```bash
git add functions/src/asaas-arena-booking-webhook.ts functions/src/mercadopago-arena-booking-webhook.ts
git commit -m "feat(taxas): webhooks de reserva aplicam taxa por tier no crédito da carteira"
```

---

### Task 4: Ativação R$97 na primeira assinatura

**Files:**
- Modify: `functions/src/arena-subscription.ts`
- Modify: `functions/src/asaas-arena-subscription-webhook.ts:86-110`
- Test: `functions/src/arena-subscription.test.ts`

**Interfaces:**
- Consumes: `ACTIVATION_FEE_CENTS` (Task 1).
- Produces: `shouldChargeActivationFee(billing: Record<string, unknown> | undefined): boolean` (exportada de `arena-subscription.ts`); campos novos em `arenas/{id}/billing/subscription`: `activationPaymentId: string | null`, `activationFeeCents: number | null`, `activationFeePaidAt: Timestamp` (gravado só pelo webhook).

- [ ] **Step 1: Testes do helper (falhando)**

Em `functions/src/arena-subscription.test.ts`, importar `shouldChargeActivationFee` de `./arena-subscription` e adicionar ao `run()`:

```ts
  // Ativação: cobrada uma única vez por arena.
  assert(shouldChargeActivationFee(undefined) === true, "sem billing -> cobra ativação");
  assert(shouldChargeActivationFee({}) === true, "billing sem activationFeePaidAt -> cobra");
  assert(
    shouldChargeActivationFee({activationFeePaidAt: {seconds: 1}}) === false,
    "ativação já paga -> não cobra de novo",
  );
  assert(
    shouldChargeActivationFee({activationPaymentId: "pay_1"}) === true,
    "tentativa anterior não paga -> cobra de novo (novo paymentId substitui)",
  );
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd functions && npm test`
Expected: FAIL — `shouldChargeActivationFee` não existe.

- [ ] **Step 3: Implementar em `arena-subscription.ts`**

Adicionar ao import de `./arena-plans`: `ACTIVATION_FEE_CENTS`. Exportar o helper (perto de `parseBillingType`):

```ts
/**
 * A arena ainda deve a taxa de ativação? Só o webhook grava
 * `activationFeePaidAt` (quando a cobrança com ativação embutida confirma);
 * uma tentativa anterior não paga (só `activationPaymentId`) cobra de novo.
 */
export function shouldChargeActivationFee(
  billing: Record<string, unknown> | undefined,
): boolean {
  return !billing?.activationFeePaidAt;
}
```

No corpo de `createArenaSubscription`, logo após obter `paymentId`/`invoiceUrl` (linha 163) e ANTES do bloco do QR PIX (linha 165), inserir:

```ts
    // Ativação única (R$97) na primeira assinatura: soma na 1ª cobrança da
    // recorrência (um único PIX; renovações vêm no preço normal do plano).
    const billingRef = getFirestore().doc(`arenas/${arenaId}/billing/subscription`);
    const existingBilling = (await billingRef.get()).data();
    let activationPaymentId: string | null = null;
    if (shouldChargeActivationFee(existingBilling) && paymentId) {
      const firstChargeReais = Math.round(valueCents + ACTIVATION_FEE_CENTS) / 100;
      try {
        await fetchAsaas(`/v3/payments/${encodeURIComponent(paymentId)}`, {
          method: "PUT",
          body: {
            value: firstChargeReais,
            description:
              `${description} + ativação única R$ 97`.slice(0, 500),
          },
        });
        activationPaymentId = paymentId;
      } catch (e) {
        logger.error("createArenaSubscription: falha ao somar ativação na 1ª cobrança", paymentId, e);
        throw new HttpsError("internal", "Falha ao gerar a cobrança de ativação. Tente novamente.");
      }
    }
```

(O QR PIX continua sendo buscado DEPOIS deste bloco — assim o payload reflete o valor com ativação. O throw é seguro: re-chamar a função reaproveita a assinatura via `idempotencyKey` e tenta o PUT de novo, que é idempotente por gravar valor absoluto.)

No `set` do doc `billing/subscription` (linhas 177-190), reusar `billingRef` já criado acima (trocar `getFirestore().doc(...)` por `billingRef`) e acrescentar os campos:

```ts
        activationPaymentId,
        activationFeeCents: activationPaymentId ? ACTIVATION_FEE_CENTS : null,
```

- [ ] **Step 4: Webhook grava `activationFeePaidAt`**

Em `functions/src/asaas-arena-subscription-webhook.ts`, no branch `ACTIVE_STATUSES` (linhas 86-110), antes do `billingRef.set` ler o billing e marcar a ativação como paga quando este pagamento é o que embutiu a ativação:

```ts
    const billingData = (await billingRef.get()).data() ?? {};
    const paidActivation =
      typeof billingData.activationPaymentId === "string" &&
      billingData.activationPaymentId === paymentId &&
      !billingData.activationFeePaidAt;

    await billingRef.set(
      {
        status: "active",
        lastPaymentId: paymentId,
        updatedAt: FieldValue.serverTimestamp(),
        ...(paidActivation ? {activationFeePaidAt: FieldValue.serverTimestamp()} : {}),
      },
      {merge: true},
    );
```

(Substitui o `billingRef.set` existente das linhas 107-110; o `arenaRef.set` das linhas 98-106 fica como está.)

- [ ] **Step 5: Rodar testes**

Run: `cd functions && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/src/arena-subscription.ts functions/src/asaas-arena-subscription-webhook.ts functions/src/arena-subscription.test.ts
git commit -m "feat(planos): ativação única de R\$97 somada à 1ª cobrança da assinatura"
```

---

### Task 5: Renomear limite de horários fixos para Starter

**Files:**
- Modify: `functions/src/arena-recurring-booking.ts:23-24`
- Modify: `functions/src/arena-recurring-booking.test.ts` (referências à constante)

**Interfaces:**
- Consumes: nada.
- Produces: `STARTER_MAX_ACTIVE_RECURRING = 3` (substitui `ESSENCIAL_MAX_ACTIVE_RECURRING`; o gate continua usando `isArenaEntitledPro`, que já cobre elite via Task 2 — arenas Starter e sem plano ficam limitadas a 3).

- [ ] **Step 1: Renomear**

Em `functions/src/arena-recurring-booking.ts:23-24`:

```ts
/** Limite de séries ativas para arenas sem plano Pro+ (sem plano ou Starter). */
export const STARTER_MAX_ACTIVE_RECURRING = 3;
```

Atualizar TODAS as referências ao nome antigo: `grep -rn "ESSENCIAL_MAX_ACTIVE_RECURRING" functions/src` e substituir cada ocorrência (handler na linha ~640-656 e `arena-recurring-booking.test.ts:131`).

- [ ] **Step 2: Rodar testes**

Run: `cd functions && npm test`
Expected: PASS; `grep -rn "ESSENCIAL_MAX" functions/src` retorna vazio.

- [ ] **Step 3: Commit**

```bash
git add functions/src/arena-recurring-booking.ts functions/src/arena-recurring-booking.test.ts
git commit -m "refactor(planos): limite de horários fixos renomeado para Starter"
```

---

### Task 6: Tarifa de saque R$1,75 (Elite isento)

**Files:**
- Modify: `functions/src/platform-fees.ts`
- Modify: `functions/src/arena-entitlement.ts`
- Modify: `functions/src/arena-booking-pix.ts:453-489`
- Modify: `functions/src/asaas-payout.ts:164-195`
- Test: `functions/src/arena-entitlement.test.ts`

**Interfaces:**
- Consumes: `arenaEntitledTier` (Task 2).
- Produces: `ARENA_WITHDRAWAL_FEE_REAIS = 1.75` (platform-fees); `resolveArenaWithdrawalFeeReais(arena: ArenaPlanFields, nowMs: number): number` (arena-entitlement); campos novos em `arenaWithdrawals/{id}`: `feeReais: number`, `netReais: number`. A reserva/liberação de saldo continua pelo `amountReais` cheio — a tarifa sai do valor transferido.

- [ ] **Step 1: Testes (falhando)**

Em `functions/src/arena-entitlement.test.ts`, importar `resolveArenaWithdrawalFeeReais` e adicionar:

```ts
describe("arena-entitlement.resolveArenaWithdrawalFeeReais", () => {
  const now = Date.parse("2026-07-01T12:00:00Z");

  it("elite (e parceiro legado) isento; demais pagam R$1,75", () => {
    assert.equal(resolveArenaWithdrawalFeeReais({planStatus: "active", planTier: "elite"}, now), 0);
    assert.equal(resolveArenaWithdrawalFeeReais({planStatus: "active", planTier: "parceiro"}, now), 0);
    assert.equal(resolveArenaWithdrawalFeeReais({planStatus: "active", planTier: "pro"}, now), 1.75);
    assert.equal(resolveArenaWithdrawalFeeReais({planStatus: "active", planTier: "starter"}, now), 1.75);
    assert.equal(resolveArenaWithdrawalFeeReais({}, now), 1.75);
  });

  it("elite sem titularidade paga tarifa", () => {
    assert.equal(resolveArenaWithdrawalFeeReais({planStatus: "none", planTier: "elite"}, now), 1.75);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd functions && npm test`
Expected: FAIL — função inexistente.

- [ ] **Step 3: Implementar**

`functions/src/platform-fees.ts` — adicionar após `FEE_FLOOR_REAIS`:

```ts
/** Tarifa fixa de saque PIX da carteira de arena (R$). Elite é isento. */
export const ARENA_WITHDRAWAL_FEE_REAIS = 1.75;
```

`functions/src/arena-entitlement.ts` — adicionar `ARENA_WITHDRAWAL_FEE_REAIS` ao import de `./platform-fees` e, no fim do arquivo:

```ts
/** Tarifa fixa do saque PIX conforme o plano titular da arena (Elite isento). */
export function resolveArenaWithdrawalFeeReais(arena: ArenaPlanFields, nowMs: number): number {
  return arenaEntitledTier(arena, nowMs) === "elite" ? 0 : ARENA_WITHDRAWAL_FEE_REAIS;
}
```

`functions/src/arena-booking-pix.ts` — importar `resolveArenaWithdrawalFeeReais` de `./arena-entitlement`. Em `requestArenaWithdrawal`, logo após `const amount = roundMoney(amountReais);` (linha 455), inserir (o doc `arena` já foi carregado na linha 423):

```ts
  const feeReais = resolveArenaWithdrawalFeeReais(arena, Date.now());
  const netReais = roundMoney(amount - feeReais);
  if (netReais <= 0) {
    throw new HttpsError(
      "invalid-argument",
      `O valor do saque precisa ser maior que a tarifa de R$ ${feeReais.toFixed(2)}.`,
    );
  }
```

E no `withdrawalRef.set` (linhas 469-480), acrescentar os campos `feeReais` e `netReais` logo após `amountReais: amount,`:

```ts
    feeReais,
    netReais,
```

`functions/src/asaas-payout.ts` — em `sendArenaWithdrawalPixTransfer`, substituir a linha 166 e o guard das linhas 171-173 por (docs antigos/organizador sem `feeReais` transferem o valor cheio — retrocompat):

```ts
  const amountReais = roundMoney(Number(withdrawal.amountReais) || 0);
  const feeReais = roundMoney(Math.max(0, Number(withdrawal.feeReais) || 0));
  const netReais = roundMoney(amountReais - feeReais);

  if (pixAddressKey.length < 5) {
    throw new Error("PIX_KEY_INVALID");
  }
  if (amountReais <= 0 || netReais <= 0) {
    throw new Error("AMOUNT_INVALID");
  }
```

e no body do `POST /v3/transfers` (linha 188) trocar `value: amountReais` por `value: netReais`.

**Não alterar** `arena-withdrawal-payout.ts` nem `arena-wallet.ts`: reserva, assert e liberação continuam pelo `amountReais` cheio (o saldo da arena diminui pelo valor sacado; a tarifa fica com a plataforma na conta Asaas).

- [ ] **Step 4: Rodar testes**

Run: `cd functions && npm test`
Expected: PASS.

- [ ] **Step 5: Aviso da tarifa nas UIs de saque (copy)**

Angular — `frontend/projects/arena/src/app/painel/finance/panel-finance.component.ts`: no card "Solicitar saque" (linha ~145), adicionar abaixo do botão uma linha de apoio (usar as classes de hint/muted já usadas no componente):

```html
<p class="withdraw-fee-hint">Tarifa de R$ 1,75 por saque · grátis no plano Elite.</p>
```

Flutter — `nexago_app/lib/features/arena/presentation/widgets/arena_financial_widgets.dart`: no sheet/card de "Solicitar saque" (linhas ~186 e ~369), adicionar o mesmo aviso como `Text` de estilo secundário (`colors.onSurfaceMuted`, fontSize 12):

```dart
Text(
  'Tarifa de R\$ 1,75 por saque · grátis no plano Elite.',
  style: TextStyle(fontSize: 12, color: colors.onSurfaceMuted),
),
```

(Adaptar ao estilo local do widget — ver como os textos de apoio vizinhos são construídos.)

- [ ] **Step 6: Verificar builds das UIs tocadas**

Run: `cd frontend && npx ng build arena` e `cd nexago_app && flutter analyze lib/features/arena/presentation/widgets/arena_financial_widgets.dart`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add functions/src/platform-fees.ts functions/src/arena-entitlement.ts functions/src/arena-entitlement.test.ts functions/src/arena-booking-pix.ts functions/src/asaas-payout.ts frontend/projects/arena/src/app/painel/finance/panel-finance.component.ts nexago_app/lib/features/arena/presentation/widgets/arena_financial_widgets.dart
git commit -m "feat(saque): tarifa de R\$1,75 por saque de arena com isenção no Elite"
```

---

### Task 7: firestore.rules — elite nas listas + limite de quadras por tier

**Files:**
- Modify: `firestore.rules:390-397` (arenaCanAddCourt) e as 7 listas `['pro', 'parceiro']` (linhas ~395, 761, 863, 870, 886, 930, 954 — confirmar com grep)
- Test: `functions/test/plan-tier-gates.rules.test.mjs` (novo)

**Interfaces:**
- Consumes: helper `arenaEntitled(arenaId, tiers)` existente (rules:379-391, inalterado).
- Produces: todas as listas de tiers pagos nas rules passam a `['pro', 'parceiro', 'elite']`; `arenaCanAddCourt` com teto 5 para Pro.

- [ ] **Step 1: Escrever o teste de rules (falhando)**

Criar `functions/test/plan-tier-gates.rules.test.mjs` seguindo a estrutura de `functions/test/comanda-add-items.rules.test.mjs` (mesmos imports, `initializeTestEnvironment` com as rules da raiz, contexts autenticados). Cobrir com `assertSucceeds`/`assertFails`:

```
Seed (withSecurityRulesDisabled): arenas/arena-elite {managerUserId: MANAGER_UID, planTier: 'elite', planStatus: 'active', courtsCount: 10}
                                  arenas/arena-parceiro {managerUserId: MANAGER_UID, planTier: 'parceiro', planStatus: 'active', courtsCount: 10}
                                  arenas/arena-pro {managerUserId: MANAGER_UID, planTier: 'pro', planStatus: 'active', courtsCount: 4}
                                  arenas/arena-pro-cheia {managerUserId: MANAGER_UID, planTier: 'pro', planStatus: 'active', courtsCount: 5}
                                  arenas/arena-starter {managerUserId: MANAGER_UID, planTier: 'starter', planStatus: 'active', courtsCount: 2}

Testes (todos como manager autenticado):
1. create arenas/arena-elite/promotions/p1     -> assertSucceeds (elite entra nos gates Pro+)
2. create arenas/arena-parceiro/promotions/p1  -> assertSucceeds (legado preservado)
3. create arenas/arena-starter/promotions/p1   -> assertFails   (starter não tem caps Pro)
4. create arenas/arena-elite/courts/c1         -> assertSucceeds (elite ilimitado, mesmo com 10)
5. create arenas/arena-pro/courts/c1           -> assertSucceeds (pro com 4 < 5)
6. create arenas/arena-pro-cheia/courts/c1     -> assertFails   (pro no teto de 5)
7. create arenas/arena-starter/courts/c1       -> assertFails   (starter no teto de 2)
```

Para os docs de promotion/court usar payloads mínimos que os rules aceitem — copiar o formato dos seeds do teste existente e, se a rule exigir campos, incluir os campos exigidos (a rule de courts exige apenas manager + `arenaCanAddCourt`; a de promotions exige manager + `arenaEntitled`).

- [ ] **Step 2: Rodar para ver falhar**

Run (da RAIZ do worktree — o `firebase.json` está na raiz): `npx firebase emulators:exec --only firestore "node --test functions/test/plan-tier-gates.rules.test.mjs"`
Expected: FAIL nos casos 1, 4 e 6 (elite ainda não está nas listas; pro hoje é ilimitado, então o teto de 5 ainda não nega). Confirmar que o runner executa.

- [ ] **Step 3: Editar as rules**

Substituir `arenaCanAddCourt` (firestore.rules:394-397) por:

```
    // Limite de quadras por plano: sem plano/Starter até 2; Pro até 5;
    // Elite/Parceiro (legado) ilimitado. courtsCount é mantido por Cloud
    // Function (arena-courts-count.ts) — as rules não contam documentos.
    function arenaCanAddCourt(arenaId) {
      return arenaEntitled(arenaId, ['parceiro', 'elite']) ||
        (arenaEntitled(arenaId, ['pro']) &&
          get(/databases/$(database)/documents/arenas/$(arenaId)).data.get('courtsCount', 0) < 5) ||
        get(/databases/$(database)/documents/arenas/$(arenaId)).data.get('courtsCount', 0) < 2;
    }
```

Depois, `grep -n "\['pro', 'parceiro'\]" firestore.rules` e trocar TODAS as ocorrências restantes por `['pro', 'parceiro', 'elite']` (promoções, produtos create/update, cupons, stockMovements, arenaComandas create, comanda items create). Atualizar o comentário acima de `arenaEntitled` que menciona "Pro/Parceiro".

- [ ] **Step 4: Rodar o teste de rules + o existente**

Run (da raiz do worktree): `npx firebase emulators:exec --only firestore "node --test functions/test/plan-tier-gates.rules.test.mjs functions/test/comanda-add-items.rules.test.mjs"`
Expected: PASS em todos.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules functions/test/plan-tier-gates.rules.test.mjs
git commit -m "feat(rules): elite nos gates de plano e limite de quadras 2/5/ilimitado"
```

---

### Task 8: Flutter — domínio `arena_plan.dart` + páginas de plano

**Files:**
- Modify: `nexago_app/lib/features/arena/domain/arena_plan.dart`
- Modify: `nexago_app/lib/features/arena/presentation/plan/arena_plan_page.dart`
- Modify: `nexago_app/lib/features/arena/presentation/plan/arena_plan_activated_page.dart`
- Test: `nexago_app/test/features/arena/domain/arena_plan_capabilities_test.dart`, `arena_plan_recurring_limit_test.dart`, `nexago_app/test/features/arena/arena_plan_activation_content_test.dart`, `nexago_app/test/features/arena/plan/arena_plan_gate_test.dart`

**Interfaces:**
- Consumes: contrato do servidor (Tasks 1-4): `planTier` em docs pode ser `starter|pro|elite|parceiro|essencial`; callable `createArenaSubscription` aceita só ids novos; 1ª cobrança pode vir com +R$97.
- Produces: `enum ArenaPlanTier { starter, pro, elite }` (SEM valores legados — `ArenaPlanTierX.fromId` normaliza `'parceiro'`→`elite`, `'essencial'`→`null`); `capabilitiesFor`/`maxCourtsFor` (pro=5)/`maxRecurringBookingsFor` com a mesma semântica das outras camadas; `arenaPlansCatalog` com 3 planos pagos; `arenaPlanActivationContent` cobre os 3 tiers; constante `arenaActivationFeeCents = 9700`.

- [ ] **Step 1: Testes de domínio (falhando)**

Em `nexago_app/test/features/arena/domain/arena_plan_capabilities_test.dart`, adicionar/ajustar casos (manter o estilo do arquivo):

```dart
test('fromId normaliza legados', () {
  expect(ArenaPlanTierX.fromId('starter'), ArenaPlanTier.starter);
  expect(ArenaPlanTierX.fromId('elite'), ArenaPlanTier.elite);
  expect(ArenaPlanTierX.fromId('parceiro'), ArenaPlanTier.elite);
  expect(ArenaPlanTierX.fromId('essencial'), isNull);
});

test('elite titular tem todas as capabilities', () {
  expect(
    capabilitiesFor(ArenaPlanTier.elite, entitled: true),
    containsAll(ArenaCapability.values),
  );
});

test('starter titular não tem capabilities Pro', () {
  expect(capabilitiesFor(ArenaPlanTier.starter, entitled: true), isEmpty);
});

test('limite de quadras 2/5/ilimitado', () {
  expect(maxCourtsFor(ArenaPlanTier.starter, entitled: true), 2);
  expect(maxCourtsFor(ArenaPlanTier.pro, entitled: true), 5);
  expect(maxCourtsFor(ArenaPlanTier.elite, entitled: true), isNull);
  expect(maxCourtsFor(ArenaPlanTier.pro, entitled: false), 2);
  expect(maxCourtsFor(null, entitled: false), 2);
});
```

Substituir nesses arquivos de teste toda referência a `ArenaPlanTier.essencial` por `null` (sem plano) e a `ArenaPlanTier.parceiro` por `ArenaPlanTier.elite`. Em `arena_plan_recurring_limit_test.dart`: starter/null → 3, pro/elite → null.

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd nexago_app && flutter test test/features/arena`
Expected: FAIL (enum ainda tem valores antigos).

- [ ] **Step 3: Reescrever o domínio em `arena_plan.dart`**

Aplicar as mudanças mantendo o restante do arquivo (ArenaPlan, ArenaPlanStatus etc.):

```dart
enum ArenaPlanTier { starter, pro, elite }

extension ArenaPlanTierX on ArenaPlanTier {
  String get id => switch (this) {
        ArenaPlanTier.starter => 'starter',
        ArenaPlanTier.pro => 'pro',
        ArenaPlanTier.elite => 'elite',
      };

  /// Aceita ids legados gravados em docs antigos: 'parceiro' → elite;
  /// 'essencial' (grátis extinto) → null (sem plano).
  static ArenaPlanTier? fromId(String? id) => switch (id?.trim()) {
        'starter' => ArenaPlanTier.starter,
        'pro' => ArenaPlanTier.pro,
        'elite' || 'parceiro' => ArenaPlanTier.elite,
        _ => null,
      };
}
```

`capabilitiesFor`: `elite` → set completo (com `multiUnidade`); `pro` → set sem `multiUnidade`; `starter || null` → `{}`. O parâmetro `entitled:false` cai para `null` (trocar `ArenaPlanTier.essencial` por `null` como effectiveTier).

`maxCourtsFor`: `elite` → `null`; `pro` → `5`; `starter || null` → `2`.

`maxRecurringBookingsFor`: `pro || elite` → `null`; `starter || null` → `3`.

Catálogo (espelha o site/imagem; anual = 12× 90/228/457):

```dart
/// Ativação única na primeira assinatura (R$97) — cobrada pelo servidor na
/// 1ª fatura; aqui só para exibição.
const int arenaActivationFeeCents = 9700;

const List<ArenaPlan> arenaPlansCatalog = [
  ArenaPlan(
    tier: ArenaPlanTier.starter,
    name: 'Starter',
    tagline: 'Ideal para pequenas arenas começarem online.',
    monthlyCents: 9900,
    yearlyCents: 108000,
    features: [
      'Até 2 quadras · 1 admin',
      'Site institucional + perfil na busca',
      'Agenda e reservas online (site e app)',
      'Avaliações e reputação',
      'Pagamento e saque via PIX',
      'Taxa de 8% por reserva',
    ],
  ),
  ArenaPlan(
    tier: ArenaPlanTier.pro,
    name: 'Pro',
    tagline: 'A operação completa da arena.',
    monthlyCents: 24900,
    yearlyCents: 273600,
    popular: true,
    features: [
      'Tudo do Starter · até 5 quadras',
      'Torneios ilimitados e ranking da arena',
      'Inscrições com pagamento online',
      'Relatórios e dashboard',
      'PDV, comandas e estoque',
      'Push para atletas · taxa de 6%',
    ],
  ),
  ArenaPlan(
    tier: ArenaPlanTier.elite,
    name: 'Elite',
    tagline: 'Para arenas grandes e redes.',
    monthlyCents: 49900,
    yearlyCents: 548400,
    features: [
      'Tudo do Pro · usuários ilimitados',
      'Análise financeira + consultoria semanal',
      'Landing pages ilimitadas',
      'Área de patrocinadores',
      'Suporte prioritário',
      'Taxa de 5% · saque PIX sem tarifa',
    ],
  ),
];
```

Remover o getter `bool get free` de `ArenaPlan` (não há mais plano grátis). `arenaPlanActivationContent`: substituir o case `parceiro` por `elite` (highlights: 'Taxa de 5% por reserva' / 'Saque PIX sem tarifa' / 'Suporte prioritário') e o case `essencial => throw` por um case `starter` com highlights ('Site institucional', 'Reservas online', 'Carteira e saque PIX'). Atualizar o doc-comment do topo do arquivo para o novo eixo de valor (todos pagos + taxa 8/6/5).

- [ ] **Step 4: Ajustar as páginas**

`arena_plan_page.dart` — compilar sem o conceito de plano grátis:
- Linhas 99-100: `onSubscribe: () => _onSubscribe(arenaId, plan)` sempre; `onDowngrade: null` (remover o parâmetro/fluxo de downgrade do card — cancelar assinatura continua existindo onde já existe fora do card).
- Linha 225-227 (branch `if (plan.free)`): remover o branch; um card é "atual" quando `status.tier == plan.tier`.
- Linha 516 ('Plano Essencial'): trocar por `'Sem plano'` (estado da arena sem assinatura).
- Linhas 742-746 (`_canDowngrade`): remover o getter e seus usos (linhas 886, 896-898).
- Linhas 748, 753, 819, 825, 887, 894: remover os branches `plan.free` (preço sempre `formatBRL`, check color sempre `colors.brand`).
- Onde o preço do ciclo anual é exibido, acrescentar a linha de apoio com a parcela: `'12× de ${formatBRL(plan.yearlyCents / 12 / 100)} · 1 mês grátis'`.
- No fluxo `_onSubscribe`, antes de chamar a callable, se for a primeira assinatura exibir no resumo a linha `'+ ${formatBRL(arenaActivationFeeCents / 100)} de ativação (única)'` — usar o dado que a página já tiver do billing; se a página não carrega billing, exibir a nota fixa `'Primeira assinatura tem ativação única de R$ 97 somada à 1ª cobrança.'` como texto de apoio no sheet de confirmação.

`arena_plan_activated_page.dart` — linhas 157-159: trocar `ArenaPlanTier.parceiro => AppColors.pending` por `ArenaPlanTier.elite => AppColors.pending` e `ArenaPlanTier.essencial => colors.onSurfaceMuted` por `ArenaPlanTier.starter => colors.onSurfaceMuted`; atualizar o doc-comment "(Pro / Parceiro)" para "(planos pagos)".

Rodar `grep -rn "ArenaPlanTier.essencial\|ArenaPlanTier.parceiro\|\.free" nexago_app/lib` e corrigir qualquer ocorrência restante (ex.: providers/gates) com a mesma regra: `essencial` → `null`/starter conforme o contexto de "sem plano" vs "tier base"; `parceiro` → `elite`.

- [ ] **Step 5: Rodar testes e analyzer**

Run: `cd nexago_app && flutter test test/features/arena && flutter analyze lib/features/arena`
Expected: PASS / sem erros novos (warnings pré-existentes de build/ ignorar).

- [ ] **Step 6: Commit**

```bash
git add nexago_app/lib/features/arena nexago_app/test/features/arena
git commit -m "feat(app): planos Starter/Pro/Elite no app com normalização de tiers legados"
```

---

### Task 9: Painel Angular da arena — modelo + tela de Planos

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/data/arena-plan.model.ts`
- Modify: `frontend/projects/arena/src/app/painel/plans/panel-plans.component.ts`
- Modify: `frontend/projects/arena/src/app/painel/data/subscription-repository.ts` (normalizar tier do billing)

**Interfaces:**
- Consumes: contrato do servidor (Tasks 1-4) e semântica das outras camadas (Task 8).
- Produces: `type ArenaPlanTier = 'starter' | 'pro' | 'elite'`; `normalizeArenaPlanTier(value: unknown): ArenaPlanTier | null`; `ARENA_PLAN_CATALOG` com 3 planos pagos (sem campo `free`); `ARENA_ACTIVATION_FEE_CENTS = 9700`; `maxCourtsFor` (pro=5); `arenaCapabilitiesFor` (elite = tudo). O componente passa a tratar `currentTier: ArenaPlanTier | null` (null = sem plano).

- [ ] **Step 1: Reescrever `arena-plan.model.ts`**

Mesma estrutura atual, com estas mudanças:

```ts
export type ArenaPlanTier = 'starter' | 'pro' | 'elite';

/** Aceita ids legados de docs antigos: 'parceiro' → elite; 'essencial' → null (sem plano). */
export function normalizeArenaPlanTier(value: unknown): ArenaPlanTier | null {
  if (value === 'starter' || value === 'pro' || value === 'elite') return value;
  if (value === 'parceiro') return 'elite';
  return null;
}

export const ARENA_ACTIVATION_FEE_CENTS = 9700;
```

- `arenaPlanStatusFromDoc`: trocar `isKnownTier(data['planTier']) ? ... : null` por `normalizeArenaPlanTier(data['planTier'])` (remover `isKnownTier`).
- `arenaCapabilitiesFor`: case `'elite'` → set completo; `'pro'` → sem `multiUnidade`; default (`'starter'`/null) → vazio. `effectiveTier = entitled ? tier : null`.
- `maxCourtsFor`: `'elite'` → null; `'pro'` → 5; demais → 2. `maxRecurringActiveFor`: `'pro' | 'elite'` → null; demais → 3.
- `ARENA_PLAN_CATALOG`: 3 entradas starter/pro/elite com preços 9900/108000, 24900/273600, 49900/548400 e as mesmas features/taglines da Task 8 (copiar as strings do catálogo Dart). Remover o campo `free` da interface `ArenaPlanCatalogEntry`.
- `ARENA_PLAN_TIER_ORDER = ['starter', 'pro', 'elite']`.

- [ ] **Step 2: Normalizar o billing em `subscription-repository.ts`**

No parser de `fetchArenaSubscriptionBilling`, passar o campo `tier` lido do doc por `normalizeArenaPlanTier(...)` (billing antigo com `tier: 'parceiro'` vira `'elite'`; se normalizar para null, tratar o billing como ausente).

- [ ] **Step 3: Atualizar `panel-plans.component.ts`**

- `currentTier`: `computed<ArenaPlanTier | null>(() => this.arenaContext.planStatus().tier)` (sem fallback `'essencial'`).
- `planName`: `computed(() => { const t = this.currentTier(); return t ? this.catalog[t].name : 'Sem plano'; })`.
- `priceLabel`: remover o branch `if (this.catalog[tier].free) return 'Grátis';`; quando `currentTier() == null` retornar `'—'`.
- Adicionar `computed` para a linha de contexto do plano atual sem assinatura: `Sem plano ativo — taxa de 8% por reserva paga no app.` (exibir no lugar do preço quando tier null).
- `canCancel`: `tier != null && (status === 'active' || 'overdue' || 'pending')` (remover `tier !== 'essencial'`).
- `planCardAction`: reescrever —

```ts
protected planCardAction(tier: ArenaPlanTier): PlanCardAction {
  const current = this.currentTier();
  if (tier === current) {
    return { label: 'Plano atual', disabled: true, kind: 'current' };
  }
  if (current === null) {
    return { label: `Assinar ${this.catalog[tier].name}`, disabled: false, kind: 'subscribe' };
  }
  return { label: 'Fale com o suporte pra trocar', disabled: true, kind: 'blocked' };
}
```

Remover o kind `'downgrade'` do tipo `PlanCardAction` e o branch correspondente em `onPlanCardClick` (o cancelamento continua pelo botão/fluxo `showCancelConfirm` existente fora dos cards).
- No dialog de assinatura: quando `billing()?.activationFeePaidAt` não existir (campo novo — adicionar ao tipo `ArenaSubscriptionBilling` como `activationFeePaidAt?: unknown`), exibir abaixo do preço: `+ R$ 97,00 de ativação (única, somada à 1ª cobrança)` usando `formatCentsBRL(ARENA_ACTIVATION_FEE_CENTS)`.
- No template: onde houver copy "2 meses grátis" no toggle anual, trocar por "1 mês grátis"; revisar `@for` dos cards (tierOrder agora tem 3 pagos) e remover qualquer branch de card grátis ("Grátis"/"Fazer downgrade").

- [ ] **Step 4: Build**

Run: `cd frontend && npx ng build arena`
Expected: build verde. Rodar também `grep -rn "'essencial'\|'parceiro'" frontend/projects/arena/src` e corrigir sobras (exceto comentários históricos).

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src
git commit -m "feat(painel-arena): tela de planos Starter/Pro/Elite com ativação e taxa por tier"
```

---

### Task 10: Site — seção `ArenaPlanos` com a nova tabela

**Files:**
- Modify: `frontend/projects/site/src/components/sections/ArenaPlanos.tsx`

**Interfaces:**
- Consumes: valores oficiais (Global Constraints).
- Produces: seção de planos pública espelhando a tabela comercial.

- [ ] **Step 1: Atualizar conteúdo**

- `PLANS` (linhas 25-69): substituir pelos 3 planos — Starter 99/1080, Pro 249/2736 (`popular: true`), Elite 499/5484 — com as features da imagem (mesmas strings do catálogo Dart da Task 8, incluindo as linhas de taxa). CTAs: Starter `'Começar agora'`; Pro/Elite `'Falar com a gente'`. Atualizar o comentário "Ciclo anual = 2 meses grátis" para "Ciclo anual = 1 mês grátis (12× 90/228/457)".
- Remover o branch `free` (linhas 146, 170-171): preço sempre renderizado com `NumberFlow`.
- No card, abaixo do preço, adicionar linha de apoio quando anual: `12× de R$ {plan.yearly / 12} · 1 mês grátis` (texto pequeno `text-text-mute`).
- `BillingSwitch` (linha 110): badge "2 meses grátis" → `1 mês grátis`.
- Subtítulo da seção (linhas 130-133): trocar por: `Ativação única de R$ 97 (domínio, site, onboarding e perfil na busca). No anual, 1 mês grátis em todos os planos.`
- Rodapé (linha 219): trocar por: `Sem fidelidade. Cancele quando quiser — a taxa por reserva paga no app varia por plano (8%, 6% ou 5%).`

- [ ] **Step 2: Build**

Run: `cd frontend/projects/site && npm run build`
Expected: build verde.

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/site/src/components/sections/ArenaPlanos.tsx
git commit -m "feat(site): tabela de planos Starter/Pro/Elite com ativação e taxa por plano"
```

---

### Task 11: Verificação integrada final

**Files:** nenhum novo (só verificação e correções pontuais que surgirem).

- [ ] **Step 1: Suítes completas**

Run (cada um na raiz do worktree):
```bash
cd functions && npm test
npx firebase emulators:exec --only firestore "node --test functions/test/plan-tier-gates.rules.test.mjs functions/test/comanda-add-items.rules.test.mjs"   # da raiz do worktree
cd nexago_app && flutter test test/features/arena
cd frontend && npx ng build arena
cd frontend/projects/site && npm run build
```
Expected: tudo verde.

- [ ] **Step 2: Varredura de sobras**

```bash
grep -rn "essencial\|parceiro" functions/src firestore.rules --include="*.ts" | grep -vi "torneio\|partner\|dupla\|test"
```
Expected: só ocorrências intencionais (normalização de legado, comentários explicando o alias, listas das rules com `'parceiro'` legado). Qualquer preço antigo (14900/39900/149000/399000) restante em `functions/`, `frontend/projects/arena`, `frontend/projects/site` ou `nexago_app/lib` é bug — corrigir.

- [ ] **Step 3: Commit final (se houver correções)**

```bash
git add -A
git commit -m "chore(planos): ajustes finais da migração Starter/Pro/Elite"
```

---

## Notas de escopo (do self-review da spec → plano)

- **Backoffice (spec §Superfícies item 4):** a tela de revisão de saques de arena NÃO existe em nenhum frontend (verificado por grep de `listPendingArenaWithdrawals`/`reviewArenaWithdrawal` — zero consumidores). Não há o que modificar; os campos `feeReais`/`netReais` já ficam nos docs para quando a tela for construída. Item dropado.
- **Aviso de tarifa nas UIs de saque (Task 6 step 5):** pequena adição além da spec — cobrar tarifa sem exibir seria má UX; só copy, sem lógica.
- **`mercadopago-endpoints.ts`** mantém a `marketplace_fee` fixa legada (R$2) no fluxo MP dormente — inconsistência pré-existente, fora de escopo (registrada aqui para rastreio).
- **Rollout** (da spec): 1) functions + rules juntos; 2) webs; 3) app Flutter. Nenhum backfill.
