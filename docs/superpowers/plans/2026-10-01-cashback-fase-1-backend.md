# Fase 1 — Backend do cashback do atleta: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo o backend do cashback — carteira do atleta com lotes, ganho no pagamento, uso como desconto nas três cobranças, liberação depois do evento, vencimento, estorno — atrás de `appConfig/cashback.enabled` (desligado por padrão).

**Architecture:** Uma carteira por atleta (`athleteWallets/{uid}`) com lotes (um por pagamento), reservas de saldo (uma por cobrança) e extrato. Toda mudança de dinheiro passa por `athlete-wallet.ts`, que carrega o estado ativo numa transação (`athlete-wallet-state.ts`), muda em memória e grava tudo junto, recalculando os totais a partir dos lotes. As callables de cobrança reservam o saldo antes de criar a cobrança no Asaas pelo restante; os webhooks somam o saldo de volta (bruto = `payment.value` + saldo aplicado) e gravam uma "intenção de cashback" junto da confirmação; uma varredura de 5 min devolve reservas de cobranças mortas e retenta intenções; uma varredura diária libera, cancela e vence lotes e avisa o atleta; o estorno (`PAYMENT_REFUNDED`) desfaz tudo pelo roteador.

**Tech Stack:** Cloud Functions v2 (TypeScript, `node:test` + `FakeFirestore`), regras do Firestore (`@firebase/rules-unit-testing` no emulador), script Node com `firebase-admin`.

**Spec:** `docs/superpowers/specs/2026-10-01-cashback-atleta-design.md` (seções 1, 2, 3 e a parte de backend da 4).

## Global Constraints

- Valores da carteira do atleta em **centavos inteiros** (`*Cents`). Conversão só nas bordas: `toCents(reais)` / `centsToReais(cents)` de `cashback-rules.ts`.
- Configuração ao vivo em `appConfig/cashback`: `enabled` (padrão `false`), `ratePercent` 2, `maxShareOfFee` 0.5, `minCashReais` 5, `expiryMonths` 6, `expiryWarningDays` 15. Doc ausente ou campo inválido cai no padrão.
- Ganho: `min(floor(cashCents × ratePercent / 100), floor(feeCents × maxShareOfFee))`, só quando `enabled`; a taxa (`feeCents`) é calculada sobre o **bruto** (dinheiro + saldo) pelas funções que já existem.
- Saldo usado: no máximo `preço − minCash`; nunca deixa a cobrança abaixo do mínimo em dinheiro. A parte paga com saldo não gera cashback.
- Recebedor (arena/torneio) recebe o mesmo líquido de sempre: **bruto = `payment.value` + `cashbackAppliedCents/100`** em taxa, repasse, `amountPaidOnlineReais`, `paidAmount` de equipe e `amountReais` do clubinho.
- Falha de cashback **nunca** derruba o webhook nem a confirmação; fica `cashbackStatus: "pending"` para a varredura.
- Saldo nunca negativo; o que não dá para debitar a nexaGO absorve e o código loga.
- Cota dividida de reserva: ganha cashback, **não** aceita saldo.
- O Admin SDK rejeita `undefined` em documentos (o projeto não liga `ignoreUndefinedProperties`): campos opcionais são gravados como `null`.
- `FakeFirestore` não aplica `FieldValue.increment`/`serverTimestamp` nem consulta campo aninhado: a carteira usa valores calculados e `Timestamp.fromMillis(nowMs)`; a intenção tem o espelho de topo `cashbackStatus` para ser consultável.
- Transações do Firestore exigem todas as leituras antes das escritas.
- `functions/tsconfig.json` tem `noUnusedLocals: true`.
- Strings ao usuário em português; identificadores em inglês; comentários em português.
- Push com `url` para o app e `webUrl` para o portal (ambos `/cashback`).
- **Worktree:** antes do primeiro comando, `ln -sfn /Users/silviodionizio/Documents/projects/volley/nexago/functions/node_modules /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions/node_modules`. Todo comando começa com `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions &&`. Nunca `git add -A`; commits listam os arquivos. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Rodar um arquivo de teste: `npx tsc && node --test lib/<arquivo>.test.js`. Suíte inteira uma vez antes de cada commit: `npm test`.
- Branch: `claude/cashback-atleta` (empilhada sobre a fase 0, PR #542).

## Review Focus

- **Duas cobranças ao mesmo tempo com o mesmo saldo** (dois checkouts abertos): a segunda reserva só pega o que sobrou — teste na Task 2.
- **PIX pago depois de a reserva de saldo ter sido devolvida** (expirou e pagou): o saldo é debitado de novo do que houver; o que faltar não deixa saldo negativo — teste na Task 2.
- **Lote vencido no meio de uma reserva aberta**: devolver a reserva não ressuscita o valor vencido, e o extrato registra a perda — teste na Task 2.
- **Estorno chegando antes de a intenção ser aplicada**: a varredura não pode depois capturar a reserva nem criar o lote — teste na Task 11.
- **Torneio adiado e pedido de cancelamento pendente**: o lote espera em vez de liberar ou cancelar — teste na Task 10.

---

### Task 1: Configuração e regras puras

**Files:**
- Create: `functions/src/cashback-config.ts`
- Create: `functions/src/cashback-config.test.ts`
- Create: `functions/src/cashback-rules.ts`
- Create: `functions/src/cashback-rules.test.ts`

**Interfaces:**
- Consumes: `eventDateFromDayKeyAndTime(dayKey, hour, minute): Date` de `./event-timezone`.
- Produces:
  - `type CashbackConfig = {enabled: boolean; ratePercent: number; maxShareOfFee: number; minCashCents: number; expiryMonths: number; expiryWarningDays: number}`; `DEFAULT_CASHBACK_CONFIG`; `parseCashbackConfig(raw?): CashbackConfig`; `readCashbackConfig(db): Promise<CashbackConfig>`.
  - `type CashbackSourceType = "registration" | "booking" | "club"`; `toCents(reais)`, `centsToReais(cents)`; `computeEarnCents({cashCents, feeCents, config})`; `type LotBalance = {lotId; remainingCents; expiresAtMs}`; `type LotAllocation = {lotId; cents}`; `allocateFifo(lots, amountCents): LotAllocation[]` (lança `CASHBACK_INSUFFICIENT_BALANCE`); `computeExpiresAtMs(releasedAtMs, months)`; `toMillisOrNull(raw)`; `bookingEventAtMs(date, startTime)`; `type CashbackSourceState`; `type ReleaseDecision`; `releaseDecision(state, nowMs)`; `formatCentsBrl(cents)`.

- [ ] **Step 1: Preparar o worktree**

```bash
ln -sfn /Users/silviodionizio/Documents/projects/volley/nexago/functions/node_modules /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions/node_modules
```

- [ ] **Step 2: Escrever os testes que falham**

Criar `functions/src/cashback-config.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  DEFAULT_CASHBACK_CONFIG,
  parseCashbackConfig,
  readCashbackConfig,
} from "./cashback-config";

describe("parseCashbackConfig", () => {
  it("doc ausente cai no padrão, desligado", () => {
    assert.deepEqual(parseCashbackConfig(undefined), DEFAULT_CASHBACK_CONFIG);
    assert.equal(DEFAULT_CASHBACK_CONFIG.enabled, false);
  });

  it("lê os campos válidos e converte o mínimo para centavos", () => {
    assert.deepEqual(
      parseCashbackConfig({
        enabled: true,
        ratePercent: 3,
        maxShareOfFee: 0.4,
        minCashReais: 7.5,
        expiryMonths: 12,
        expiryWarningDays: 10,
      }),
      {
        enabled: true,
        ratePercent: 3,
        maxShareOfFee: 0.4,
        minCashCents: 750,
        expiryMonths: 12,
        expiryWarningDays: 10,
      },
    );
  });

  it("campo fora da faixa ou de outro tipo volta ao padrão", () => {
    const cfg = parseCashbackConfig({
      enabled: "true",
      ratePercent: 50,
      maxShareOfFee: "0.5",
      minCashReais: -1,
      expiryMonths: 0,
      expiryWarningDays: Number.NaN,
    });
    assert.deepEqual(cfg, DEFAULT_CASHBACK_CONFIG);
  });
});

describe("readCashbackConfig", () => {
  it("lê appConfig/cashback", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("appConfig/cashback", {enabled: true, ratePercent: 2});
    const cfg = await readCashbackConfig(fake as unknown as Firestore);
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.minCashCents, 500);
  });

  it("sem doc devolve o padrão", async () => {
    const fake = new FakeFirestore();
    assert.deepEqual(
      await readCashbackConfig(fake as unknown as Firestore),
      DEFAULT_CASHBACK_CONFIG,
    );
  });
});
```

Criar `functions/src/cashback-rules.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {
  allocateFifo,
  bookingEventAtMs,
  centsToReais,
  computeEarnCents,
  computeExpiresAtMs,
  formatCentsBrl,
  releaseDecision,
  toCents,
  toMillisOrNull,
} from "./cashback-rules";

const RULE = {ratePercent: 2, maxShareOfFee: 0.5};
const NOW = Date.UTC(2026, 9, 1, 13, 0, 0);

describe("toCents / centsToReais", () => {
  it("arredonda para o centavo mais próximo", () => {
    assert.equal(toCents(10.005), 1001);
    assert.equal(toCents(0.1 + 0.2), 30);
    assert.equal(centsToReais(1234), 12.34);
  });
});

describe("computeEarnCents", () => {
  it("2% do dinheiro quando cabe na metade da taxa", () => {
    // Reserva de R$ 120 com taxa de 8% (R$ 9,60): 2% = R$ 2,40; teto R$ 4,80.
    assert.equal(computeEarnCents({cashCents: 12000, feeCents: 960, config: RULE}), 240);
  });

  it("trava na metade da taxa", () => {
    assert.equal(computeEarnCents({cashCents: 10000, feeCents: 300, config: RULE}), 150);
  });

  it("arredonda para baixo e zera sem taxa ou sem dinheiro", () => {
    assert.equal(computeEarnCents({cashCents: 999, feeCents: 1000, config: RULE}), 19);
    assert.equal(computeEarnCents({cashCents: 10000, feeCents: 0, config: RULE}), 0);
    assert.equal(computeEarnCents({cashCents: 0, feeCents: 500, config: RULE}), 0);
  });
});

describe("allocateFifo", () => {
  const lots = [
    {lotId: "b", remainingCents: 300, expiresAtMs: 2000},
    {lotId: "a", remainingCents: 200, expiresAtMs: 1000},
    {lotId: "c", remainingCents: 500, expiresAtMs: 2000},
    {lotId: "z", remainingCents: 0, expiresAtMs: 500},
  ];

  it("consome primeiro o que vence primeiro, empate pelo id", () => {
    assert.deepEqual(allocateFifo(lots, 600), [
      {lotId: "a", cents: 200},
      {lotId: "b", cents: 300},
      {lotId: "c", cents: 100},
    ]);
  });

  it("valor exato de um lote não toca no seguinte", () => {
    assert.deepEqual(allocateFifo(lots, 200), [{lotId: "a", cents: 200}]);
  });

  it("lança quando o saldo não cobre", () => {
    assert.throws(() => allocateFifo(lots, 1001), /CASHBACK_INSUFFICIENT_BALANCE/);
  });
});

describe("computeExpiresAtMs", () => {
  it("soma meses mantendo o dia e a hora", () => {
    const released = Date.UTC(2026, 0, 15, 13, 0, 0);
    assert.equal(computeExpiresAtMs(released, 6), Date.UTC(2026, 6, 15, 13, 0, 0));
  });

  it("dia que não existe no mês de destino vira o último dia", () => {
    const released = Date.UTC(2026, 7, 31, 13, 0, 0);
    assert.equal(computeExpiresAtMs(released, 6), Date.UTC(2027, 1, 28, 13, 0, 0));
  });
});

describe("toMillisOrNull", () => {
  it("aceita Timestamp, Date, ISO e número; o resto é null", () => {
    assert.equal(toMillisOrNull(Timestamp.fromMillis(NOW)), NOW);
    assert.equal(toMillisOrNull(new Date(NOW)), NOW);
    assert.equal(toMillisOrNull(new Date(NOW).toISOString()), NOW);
    assert.equal(toMillisOrNull(NOW), NOW);
    assert.equal(toMillisOrNull("amanhã"), null);
    assert.equal(toMillisOrNull(undefined), null);
  });
});

describe("bookingEventAtMs", () => {
  it("lê data e hora da reserva no fuso de São Paulo", () => {
    assert.equal(bookingEventAtMs("2026-10-12", "19:30"), Date.UTC(2026, 9, 12, 22, 30, 0));
  });

  it("formato inválido é null", () => {
    assert.equal(bookingEventAtMs("12/10/2026", "19:30"), null);
    assert.equal(bookingEventAtMs("2026-10-12", "7h"), null);
  });
});

describe("formatCentsBrl", () => {
  it("formata com vírgula", () => {
    assert.equal(formatCentsBrl(240), "R$ 2,40");
    assert.equal(formatCentsBrl(123456), "R$ 1234,56");
  });
});

describe("releaseDecision", () => {
  const past = NOW - 60_000;
  const future = NOW + 60_000;

  it("origem que sumiu cancela", () => {
    assert.deepEqual(
      releaseDecision({sourceType: "booking", exists: false, status: "", eventAtMs: past}, NOW),
      {kind: "cancel", reason: "source_missing"},
    );
  });

  it("reserva: cancelada cancela; aconteceu libera; futura espera", () => {
    assert.equal(
      releaseDecision({sourceType: "booking", exists: true, status: "cancelled", eventAtMs: past}, NOW).kind,
      "cancel",
    );
    assert.equal(
      releaseDecision({sourceType: "booking", exists: true, status: "Canceled", eventAtMs: past}, NOW).kind,
      "cancel",
    );
    assert.deepEqual(
      releaseDecision({sourceType: "booking", exists: true, status: "confirmed", eventAtMs: past}, NOW),
      {kind: "release"},
    );
    assert.deepEqual(
      releaseDecision({sourceType: "booking", exists: true, status: "confirmed", eventAtMs: future}, NOW),
      {kind: "wait", eventAtMs: future},
    );
  });

  it("inscrição: torneio cancelado cancela; pedido de cancelamento pendente espera", () => {
    assert.equal(
      releaseDecision({
        sourceType: "registration", exists: true, cancellationPending: false,
        tournamentCancelled: true, eventAtMs: past,
      }, NOW).kind,
      "cancel",
    );
    assert.deepEqual(
      releaseDecision({
        sourceType: "registration", exists: true, cancellationPending: true,
        tournamentCancelled: false, eventAtMs: past,
      }, NOW),
      {kind: "wait", eventAtMs: null},
    );
    assert.deepEqual(
      releaseDecision({
        sourceType: "registration", exists: true, cancellationPending: false,
        tournamentCancelled: false, eventAtMs: past,
      }, NOW),
      {kind: "release"},
    );
  });

  it("torneio adiado espera pela data nova", () => {
    assert.deepEqual(
      releaseDecision({
        sourceType: "registration", exists: true, cancellationPending: false,
        tournamentCancelled: false, eventAtMs: future,
      }, NOW),
      {kind: "wait", eventAtMs: future},
    );
  });

  it("clubinho: saiu ou sessão cancelada cancela; confirmado libera", () => {
    assert.equal(
      releaseDecision({
        sourceType: "club", exists: true, participantStatus: "canceled_refunded",
        sessionStatus: "scheduled", eventAtMs: past,
      }, NOW).kind,
      "cancel",
    );
    assert.equal(
      releaseDecision({
        sourceType: "club", exists: true, participantStatus: "confirmed",
        sessionStatus: "canceled", eventAtMs: past,
      }, NOW).kind,
      "cancel",
    );
    assert.deepEqual(
      releaseDecision({
        sourceType: "club", exists: true, participantStatus: "confirmed",
        sessionStatus: "completed", eventAtMs: past,
      }, NOW),
      {kind: "release"},
    );
  });

  it("sem data conhecida libera (não há o que esperar)", () => {
    assert.deepEqual(
      releaseDecision({sourceType: "booking", exists: true, status: "confirmed", eventAtMs: null}, NOW),
      {kind: "release"},
    );
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc`
Expected: FAIL — `Cannot find module './cashback-config'` e `'./cashback-rules'`.

- [ ] **Step 4: Implementar**

Criar `functions/src/cashback-config.ts`:

```ts
/**
 * Configuração ao vivo do cashback do atleta — `appConfig/cashback`.
 *
 * Desligado por padrão: doc ausente ou campo inválido cai no padrão seguro.
 * Desligar para de GERAR e de OFERECER o uso do saldo; o saldo já ganho segue
 * visível e é preservado.
 */
import type {Firestore} from "firebase-admin/firestore";

export type CashbackConfig = {
  enabled: boolean;
  ratePercent: number;
  maxShareOfFee: number;
  minCashCents: number;
  expiryMonths: number;
  expiryWarningDays: number;
};

export const DEFAULT_CASHBACK_CONFIG: CashbackConfig = {
  enabled: false,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
};

function numberInRange(raw: unknown, min: number, max: number, fallback: number): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw >= min && raw <= max ?
    raw :
    fallback;
}

export function parseCashbackConfig(raw?: Record<string, unknown>): CashbackConfig {
  const d = DEFAULT_CASHBACK_CONFIG;
  if (!raw) return {...d};
  return {
    enabled: raw.enabled === true,
    ratePercent: numberInRange(raw.ratePercent, 0, 20, d.ratePercent),
    maxShareOfFee: numberInRange(raw.maxShareOfFee, 0, 1, d.maxShareOfFee),
    minCashCents: Math.round(numberInRange(raw.minCashReais, 0, 1000, d.minCashCents / 100) * 100),
    expiryMonths: Math.round(numberInRange(raw.expiryMonths, 1, 60, d.expiryMonths)),
    expiryWarningDays: Math.round(numberInRange(raw.expiryWarningDays, 0, 90, d.expiryWarningDays)),
  };
}

export async function readCashbackConfig(db: Firestore): Promise<CashbackConfig> {
  const snap = await db.doc("appConfig/cashback").get();
  return parseCashbackConfig(snap.exists ? snap.data() : undefined);
}
```

Criar `functions/src/cashback-rules.ts`:

```ts
/**
 * Regras puras do cashback do atleta (sem I/O): ganho, consumo dos lotes,
 * vencimento e a decisão de liberar um lote pendente.
 */
import {Timestamp} from "firebase-admin/firestore";
import {eventDateFromDayKeyAndTime} from "./event-timezone";
import type {CashbackConfig} from "./cashback-config";

export type CashbackSourceType = "registration" | "booking" | "club";

export function toCents(reais: number): number {
  return Math.round(reais * 100);
}

export function centsToReais(cents: number): number {
  return Math.round(cents) / 100;
}

export function formatCentsBrl(cents: number): string {
  return `R$ ${(Math.round(cents) / 100).toFixed(2).replace(".", ",")}`;
}

/** % do dinheiro pago, travado numa fração da taxa da nexaGO; sempre para baixo. */
export function computeEarnCents(params: {
  cashCents: number;
  feeCents: number;
  config: Pick<CashbackConfig, "ratePercent" | "maxShareOfFee">;
}): number {
  const {cashCents, feeCents, config} = params;
  if (cashCents <= 0 || feeCents <= 0) return 0;
  const byRate = Math.floor((cashCents * config.ratePercent) / 100);
  const byFee = Math.floor(feeCents * config.maxShareOfFee);
  return Math.max(0, Math.min(byRate, byFee));
}

export type LotBalance = {lotId: string; remainingCents: number; expiresAtMs: number};
export type LotAllocation = {lotId: string; cents: number};

/** Consome primeiro o que vence primeiro; empate pelo id, para ser determinístico. */
export function allocateFifo(lots: LotBalance[], amountCents: number): LotAllocation[] {
  const ordered = lots
    .filter((lot) => lot.remainingCents > 0)
    .sort((a, b) =>
      a.expiresAtMs - b.expiresAtMs || (a.lotId < b.lotId ? -1 : a.lotId > b.lotId ? 1 : 0));
  const allocations: LotAllocation[] = [];
  let left = amountCents;
  for (const lot of ordered) {
    if (left <= 0) break;
    const cents = Math.min(lot.remainingCents, left);
    allocations.push({lotId: lot.lotId, cents});
    left -= cents;
  }
  if (left > 0) throw new Error("CASHBACK_INSUFFICIENT_BALANCE");
  return allocations;
}

/** Soma meses mantendo dia e hora; dia inexistente no mês de destino vira o último dia. */
export function computeExpiresAtMs(releasedAtMs: number, months: number): number {
  const d = new Date(releasedAtMs);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.getTime();
}

/** Timestamp, Date, ISO ou millis → millis; qualquer outra coisa → null. */
export function toMillisOrNull(raw: unknown): number | null {
  if (raw instanceof Timestamp) return raw.toMillis();
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw.getTime();
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

/** Início da reserva (`date` YYYY-MM-DD + `startTime` HH:mm) no fuso do evento. */
export function bookingEventAtMs(date: unknown, startTime: unknown): number | null {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (typeof startTime !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(startTime.trim());
  if (!m) return null;
  return eventDateFromDayKeyAndTime(date, Number(m[1]), Number(m[2])).getTime();
}

/** Estado atual da origem de um lote, lido pela varredura diária. */
export type CashbackSourceState =
  | {sourceType: "booking"; exists: boolean; status: string; eventAtMs: number | null}
  | {
    sourceType: "registration";
    exists: boolean;
    cancellationPending: boolean;
    tournamentCancelled: boolean;
    eventAtMs: number | null;
  }
  | {
    sourceType: "club";
    exists: boolean;
    participantStatus: string;
    sessionStatus: string;
    eventAtMs: number | null;
  };

export type ReleaseDecision =
  | {kind: "release"}
  | {kind: "cancel"; reason: string}
  | {kind: "wait"; eventAtMs: number | null};

const BOOKING_CANCELLED_STATUSES = new Set(["canceled", "cancelled"]);

/**
 * Pendente → disponível quando o evento aconteceu e o vínculo continua de pé.
 * Vínculo que caiu cancela o lote — é isso que cobre o estorno manual "por
 * fora" sem precisar detectá-lo. Pedido de cancelamento pendente espera.
 */
export function releaseDecision(state: CashbackSourceState, nowMs: number): ReleaseDecision {
  if (!state.exists) return {kind: "cancel", reason: "source_missing"};
  if (state.sourceType === "booking") {
    if (BOOKING_CANCELLED_STATUSES.has(state.status.toLowerCase())) {
      return {kind: "cancel", reason: "booking_cancelled"};
    }
  } else if (state.sourceType === "registration") {
    if (state.tournamentCancelled) return {kind: "cancel", reason: "tournament_cancelled"};
    if (state.cancellationPending) return {kind: "wait", eventAtMs: null};
  } else {
    if (state.sessionStatus.toLowerCase() === "canceled") {
      return {kind: "cancel", reason: "session_cancelled"};
    }
    if (state.participantStatus !== "confirmed") {
      return {kind: "cancel", reason: "participant_left"};
    }
  }
  if (state.eventAtMs != null && state.eventAtMs > nowMs) {
    return {kind: "wait", eventAtMs: state.eventAtMs};
  }
  return {kind: "release"};
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc && node --test lib/cashback-config.test.js lib/cashback-rules.test.js`
Expected: PASS, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add functions/src/cashback-config.ts functions/src/cashback-config.test.ts functions/src/cashback-rules.ts functions/src/cashback-rules.test.ts && git commit -m "feat(cashback): configuração e regras puras do cashback do atleta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Carteira — estado da transação e reservas de saldo

**Files:**
- Create: `functions/src/athlete-wallet-state.ts`
- Create: `functions/src/athlete-wallet.ts` (só as funções de reserva nesta task)
- Create: `functions/src/athlete-wallet.test.ts`

**Interfaces:**
- Consumes: `allocateFifo`, `LotAllocation`, `LotBalance`, `CashbackSourceType` (Task 1).
- Produces (`athlete-wallet-state.ts`): `ATHLETE_WALLETS = "athleteWallets"`; tipos `LotStatus`, `HoldStatus`, `LedgerType`, `LotDoc`, `HoldDoc`, `LedgerEntry`, `WalletState`, `WalletSummary`; `athleteWalletRef(db, uid)`; `loadWalletState(tx, db, uid)`; `readLots(tx, state, ids)`; `readHold(tx, state, holdId)`; `putLot`; `putHold`; `addLedger`; `spendableLots(state, nowMs)`; `debitLot(state, lotId, cents)`; `restoreToLot(state, lotId, cents, ctx): number`; `computeSummary(state)`; `writeWalletState(tx, state, nowMs)`.
- Produces (`athlete-wallet.ts`): `holdCashback(db, {uid, maxCents, sourceType, sourceId, trackingPath, label, nowMs}): Promise<{holdId: string | null; appliedCents: number}>`; `attachHoldPayment(db, uid, holdId, asaasPaymentId)`; `releaseHold(db, uid, holdId, nowMs): Promise<boolean>`; `captureHold(db, uid, holdId, nowMs): Promise<{capturedCents; shortfallCents}>`; `refundCapturedHold(db, uid, holdId, nowMs): Promise<number>`.
- Documento da carteira gravado: `{uid, availableCents, pendingCents, heldCents, lifetimeEarnedCents, lifetimeRedeemedCents, nextExpiryAt: Timestamp|null, nextExpiryCents, updatedAt}`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `functions/src/athlete-wallet.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {
  attachHoldPayment,
  captureHold,
  holdCashback,
  refundCapturedHold,
  releaseHold,
} from "./athlete-wallet";

const UID = "ath1";
const W = `athleteWallets/${UID}`;
const NOW = Date.UTC(2026, 9, 1, 13, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

export function seedLot(
  fake: FakeFirestore,
  lotId: string,
  overrides: DocData = {},
): void {
  fake.seedDoc(`${W}/lots/${lotId}`, {
    uid: UID,
    sourceType: "booking",
    sourceId: "b1",
    tournamentId: null,
    arenaId: "arena1",
    label: "Reserva · Arena Sol · 12/10",
    earnedCents: 1000,
    remainingCents: 1000,
    status: "available",
    eventAt: Timestamp.fromMillis(NOW - 30 * DAY),
    releasedAt: Timestamp.fromMillis(NOW - 29 * DAY),
    expiresAt: Timestamp.fromMillis(NOW + 100 * DAY),
    expiryWarnedAt: null,
    createdAt: Timestamp.fromMillis(NOW - 30 * DAY),
    ...overrides,
  });
}

function ledgerOf(fake: FakeFirestore): DocData[] {
  return [...fake.store.entries()]
    .filter(([path]) => path.startsWith(`${W}/ledger/`))
    .map(([, data]) => data);
}

function holdParams(maxCents: number) {
  return {
    uid: UID,
    maxCents,
    sourceType: "booking" as const,
    sourceId: "b9",
    trackingPath: "arenaBookings/b9",
    label: "Reserva · Arena Sol · 20/10",
    nowMs: NOW,
  };
}

describe("holdCashback", () => {
  it("reserva consumindo primeiro o lote que vence primeiro", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "late", {remainingCents: 1000, expiresAt: Timestamp.fromMillis(NOW + 90 * DAY)});
    seedLot(fake, "early", {remainingCents: 300, expiresAt: Timestamp.fromMillis(NOW + 10 * DAY)});

    const r = await holdCashback(db, holdParams(800));

    assert.equal(r.appliedCents, 800);
    assert.ok(r.holdId);
    assert.equal(fake.store.get(`${W}/lots/early`)!.remainingCents, 0);
    assert.equal(fake.store.get(`${W}/lots/early`)!.status, "consumed");
    assert.equal(fake.store.get(`${W}/lots/late`)!.remainingCents, 500);
    const hold = fake.store.get(`${W}/holds/${r.holdId}`)!;
    assert.equal(hold.status, "open");
    assert.deepEqual(hold.allocations, [{lotId: "early", cents: 300}, {lotId: "late", cents: 500}]);
    assert.equal(hold.trackingPath, "arenaBookings/b9");
    const wallet = fake.store.get(W)!;
    assert.equal(wallet.availableCents, 500);
    assert.equal(wallet.heldCents, 800);
  });

  it("limita ao saldo e não cria reserva sem saldo", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "l1", {remainingCents: 400});
    assert.equal((await holdCashback(db, holdParams(1000))).appliedCents, 400);

    const empty = makeDb();
    const r = await holdCashback(empty.db, holdParams(1000));
    assert.deepEqual(r, {holdId: null, appliedCents: 0});
    assert.equal(empty.fake.store.has(W), false);
  });

  it("lote vencido e ainda não varrido não pode ser gasto", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "old", {remainingCents: 900, expiresAt: Timestamp.fromMillis(NOW - DAY)});
    assert.deepEqual(await holdCashback(db, holdParams(500)), {holdId: null, appliedCents: 0});
  });

  it("duas reservas seguidas não gastam o mesmo saldo", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "l1", {remainingCents: 1000});
    const a = await holdCashback(db, holdParams(700));
    const b = await holdCashback(db, holdParams(700));
    assert.equal(a.appliedCents, 700);
    assert.equal(b.appliedCents, 300);
    assert.equal(fake.store.get(W)!.availableCents, 0);
    assert.equal(fake.store.get(W)!.heldCents, 1000);
  });
});

describe("releaseHold", () => {
  it("devolve aos mesmos lotes e é idempotente", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "l1", {remainingCents: 1000});
    const {holdId} = await holdCashback(db, holdParams(1000));

    assert.equal(await releaseHold(db, UID, holdId!, NOW), true);
    assert.equal(await releaseHold(db, UID, holdId!, NOW), false);

    const lot = fake.store.get(`${W}/lots/l1`)!;
    assert.equal(lot.remainingCents, 1000);
    assert.equal(lot.status, "available");
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "released");
    assert.equal(fake.store.get(W)!.availableCents, 1000);
    assert.equal(fake.store.get(W)!.heldCents, 0);
  });

  it("lote vencido no meio da reserva não volta, e o extrato registra a perda", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "l1", {remainingCents: 600});
    const {holdId} = await holdCashback(db, holdParams(600));
    fake.seedDoc(`${W}/lots/l1`, {...fake.store.get(`${W}/lots/l1`)!, status: "expired"});

    await releaseHold(db, UID, holdId!, NOW);

    assert.equal(fake.store.get(`${W}/lots/l1`)!.remainingCents, 0);
    assert.equal(fake.store.get(W)!.availableCents, 0);
    const lost = ledgerOf(fake).find((e) => e.type === "expire");
    assert.equal(lost?.amountCents, 600);
  });
});

describe("attachHoldPayment", () => {
  it("grava o id da cobrança na reserva", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "l1");
    const {holdId} = await holdCashback(db, holdParams(500));
    await attachHoldPayment(db, UID, holdId!, "pay9");
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.asaasPaymentId, "pay9");
  });
});

describe("captureHold", () => {
  it("vira consumo, registra no extrato e é idempotente", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "l1", {remainingCents: 1000});
    const {holdId} = await holdCashback(db, holdParams(400));

    assert.deepEqual(await captureHold(db, UID, holdId!, NOW), {capturedCents: 400, shortfallCents: 0});
    assert.deepEqual(await captureHold(db, UID, holdId!, NOW), {capturedCents: 400, shortfallCents: 0});

    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "captured");
    const wallet = fake.store.get(W)!;
    assert.equal(wallet.heldCents, 0);
    assert.equal(wallet.availableCents, 600);
    assert.equal(wallet.lifetimeRedeemedCents, 400);
    assert.equal(ledgerOf(fake).filter((e) => e.type === "redeem").length, 1);
  });

  it("pagamento depois de devolver a reserva debita de novo o que houver", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "l1", {remainingCents: 1000});
    const {holdId} = await holdCashback(db, holdParams(400));
    await releaseHold(db, UID, holdId!, NOW);

    const r = await captureHold(db, UID, holdId!, NOW);

    assert.deepEqual(r, {capturedCents: 400, shortfallCents: 0});
    assert.equal(fake.store.get(`${W}/lots/l1`)!.remainingCents, 600);
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.lateCapture, true);
  });

  it("sem saldo suficiente no pagamento tardio, a falta fica registrada e o saldo não fica negativo", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "l1", {remainingCents: 500});
    const {holdId} = await holdCashback(db, holdParams(500));
    await releaseHold(db, UID, holdId!, NOW);
    // O atleta gastou parte do saldo noutra cobrança antes de o PIX tardio chegar.
    const other = await holdCashback(db, holdParams(300));
    await captureHold(db, UID, other.holdId!, NOW);

    const r = await captureHold(db, UID, holdId!, NOW);

    assert.deepEqual(r, {capturedCents: 200, shortfallCents: 300});
    assert.equal(fake.store.get(W)!.availableCents, 0);
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.shortfallCents, 300);
  });
});

describe("refundCapturedHold", () => {
  it("devolve o saldo usado aos lotes de origem, inclusive o consumido", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "l1", {remainingCents: 500});
    const {holdId} = await holdCashback(db, holdParams(500));
    await captureHold(db, UID, holdId!, NOW);
    assert.equal(fake.store.get(`${W}/lots/l1`)!.status, "consumed");

    assert.equal(await refundCapturedHold(db, UID, holdId!, NOW), 500);

    const lot = fake.store.get(`${W}/lots/l1`)!;
    assert.equal(lot.status, "available");
    assert.equal(lot.remainingCents, 500);
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "refunded");
    const wallet = fake.store.get(W)!;
    assert.equal(wallet.availableCents, 500);
    assert.equal(wallet.lifetimeRedeemedCents, 0);
    assert.equal(ledgerOf(fake).find((e) => e.type === "refund")?.amountCents, 500);
    assert.equal(await refundCapturedHold(db, UID, holdId!, NOW), 0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc`
Expected: FAIL — `Cannot find module './athlete-wallet'`.

- [ ] **Step 3: Implementar o estado**

Criar `functions/src/athlete-wallet-state.ts`:

```ts
/**
 * Estado da carteira de cashback do atleta dentro de UMA transação.
 *
 * Toda operação de `athlete-wallet.ts` carrega este estado (doc da carteira,
 * lotes ativos e reservas abertas), muda lotes e reservas em memória e grava
 * tudo de uma vez — inclusive os totais, recalculados a partir dos lotes. Os
 * totais nunca são incrementados às cegas: se divergirem, a próxima operação
 * os corrige.
 *
 * O Firestore exige todas as leituras antes das escritas numa transação: por
 * isso `loadWalletState` lê tudo primeiro, e `readLots`/`readHold` existem
 * para o que está fora do conjunto ativo (ex.: lote já consumido que recebe
 * de volta o saldo de um estorno).
 */
import {
  Timestamp,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import type {CashbackSourceType, LotAllocation, LotBalance} from "./cashback-rules";

export const ATHLETE_WALLETS = "athleteWallets";

export type LotStatus = "pending" | "available" | "consumed" | "expired" | "cancelled" | "reversed";
export type HoldStatus = "open" | "captured" | "released" | "refunded";
export type LedgerType =
  | "earn" | "release" | "cancel" | "redeem" | "expire" | "reverse" | "refund";

export type LotDoc = {
  uid: string;
  sourceType: CashbackSourceType;
  sourceId: string;
  tournamentId: string | null;
  arenaId: string | null;
  label: string;
  earnedCents: number;
  remainingCents: number;
  status: LotStatus;
  eventAt: Timestamp;
  releasedAt: Timestamp | null;
  expiresAt: Timestamp | null;
  expiryWarnedAt: Timestamp | null;
  createdAt: Timestamp;
};

export type HoldDoc = {
  uid: string;
  amountCents: number;
  allocations: LotAllocation[];
  status: HoldStatus;
  sourceType: CashbackSourceType;
  sourceId: string;
  /** Doc que registra a cobrança (pixPending, reserva, participante) — a varredura o confere. */
  trackingPath: string;
  label: string;
  asaasPaymentId: string | null;
  createdAt: Timestamp;
  capturedAt: Timestamp | null;
  releasedAt: Timestamp | null;
  /** Capturada depois de devolvida (PIX pago após expirar). */
  lateCapture: boolean;
  /** O que não deu para debitar na captura tardia — a nexaGO absorveu. */
  shortfallCents: number;
};

export type LedgerEntry = {
  type: LedgerType;
  amountCents: number;
  label: string;
  lotId: string | null;
  holdId: string | null;
};

export type WalletState = {
  uid: string;
  walletRef: DocumentReference;
  lifetimeEarnedCents: number;
  lifetimeRedeemedCents: number;
  lots: Map<string, LotDoc>;
  holds: Map<string, HoldDoc>;
  dirtyLots: Set<string>;
  dirtyHolds: Set<string>;
  ledger: LedgerEntry[];
};

export type WalletSummary = {
  availableCents: number;
  pendingCents: number;
  heldCents: number;
  nextExpiryAtMs: number | null;
  nextExpiryCents: number;
};

export function athleteWalletRef(db: Firestore, uid: string): DocumentReference {
  return db.collection(ATHLETE_WALLETS).doc(uid);
}

export async function loadWalletState(
  tx: Transaction,
  db: Firestore,
  uid: string,
): Promise<WalletState> {
  const walletRef = athleteWalletRef(db, uid);
  const lotsCol = walletRef.collection("lots");
  const holdsCol = walletRef.collection("holds");
  const walletSnap = await tx.get(walletRef);
  const pendingSnap = await tx.get(lotsCol.where("status", "==", "pending"));
  const availableSnap = await tx.get(lotsCol.where("status", "==", "available"));
  const openHoldsSnap = await tx.get(holdsCol.where("status", "==", "open"));

  const wallet = (walletSnap.exists ? walletSnap.data() : undefined) ?? {};
  const lots = new Map<string, LotDoc>();
  for (const doc of [...pendingSnap.docs, ...availableSnap.docs]) {
    lots.set(doc.id, doc.data() as LotDoc);
  }
  const holds = new Map<string, HoldDoc>();
  for (const doc of openHoldsSnap.docs) holds.set(doc.id, doc.data() as HoldDoc);

  return {
    uid,
    walletRef,
    lifetimeEarnedCents: Number(wallet.lifetimeEarnedCents) || 0,
    lifetimeRedeemedCents: Number(wallet.lifetimeRedeemedCents) || 0,
    lots,
    holds,
    dirtyLots: new Set(),
    dirtyHolds: new Set(),
    ledger: [],
  };
}

export async function readLots(
  tx: Transaction,
  state: WalletState,
  lotIds: string[],
): Promise<void> {
  for (const lotId of lotIds) {
    if (state.lots.has(lotId)) continue;
    const snap = await tx.get(state.walletRef.collection("lots").doc(lotId));
    if (snap.exists) state.lots.set(lotId, snap.data() as LotDoc);
  }
}

export async function readHold(
  tx: Transaction,
  state: WalletState,
  holdId: string,
): Promise<HoldDoc | null> {
  const known = state.holds.get(holdId);
  if (known) return known;
  const snap = await tx.get(state.walletRef.collection("holds").doc(holdId));
  if (!snap.exists) return null;
  const hold = snap.data() as HoldDoc;
  state.holds.set(holdId, hold);
  return hold;
}

export function putLot(state: WalletState, lotId: string, lot: LotDoc): void {
  state.lots.set(lotId, lot);
  state.dirtyLots.add(lotId);
}

export function putHold(state: WalletState, holdId: string, hold: HoldDoc): void {
  state.holds.set(holdId, hold);
  state.dirtyHolds.add(holdId);
}

export function addLedger(
  state: WalletState,
  entry: {type: LedgerType; amountCents: number; label: string; lotId?: string; holdId?: string},
): void {
  if (entry.amountCents <= 0) return;
  state.ledger.push({
    type: entry.type,
    amountCents: entry.amountCents,
    label: entry.label,
    lotId: entry.lotId ?? null,
    holdId: entry.holdId ?? null,
  });
}

/** Lotes que podem ser gastos agora: disponíveis, com saldo e ainda não vencidos. */
export function spendableLots(state: WalletState, nowMs: number): LotBalance[] {
  const out: LotBalance[] = [];
  for (const [lotId, lot] of state.lots) {
    if (lot.status !== "available" || lot.remainingCents <= 0) continue;
    const expiresAtMs = lot.expiresAt ? lot.expiresAt.toMillis() : Number.MAX_SAFE_INTEGER;
    if (expiresAtMs <= nowMs) continue;
    out.push({lotId, remainingCents: lot.remainingCents, expiresAtMs});
  }
  return out;
}

/** Debita de um lote já alocado; zerou → consumido, para sair da leitura dos ativos. */
export function debitLot(state: WalletState, lotId: string, cents: number): void {
  const lot = state.lots.get(lotId);
  if (!lot) throw new Error(`CASHBACK_LOT_MISSING:${lotId}`);
  const remainingCents = lot.remainingCents - cents;
  putLot(state, lotId, {
    ...lot,
    remainingCents,
    status: remainingCents > 0 ? lot.status : "consumed",
  });
}

/**
 * Devolve centavos ao lote de origem. Disponível ou consumido volta a valer;
 * vencido ou estornado não — o valor se perde e o extrato registra a saída,
 * para o saldo nunca mudar sem explicação. Devolve quanto voltou de fato.
 */
export function restoreToLot(
  state: WalletState,
  lotId: string,
  cents: number,
  ctx: {holdId: string; label: string},
): number {
  const lot = state.lots.get(lotId);
  if (lot && (lot.status === "available" || lot.status === "consumed")) {
    putLot(state, lotId, {
      ...lot,
      remainingCents: lot.remainingCents + cents,
      status: "available",
    });
    return cents;
  }
  addLedger(state, {
    type: lot?.status === "reversed" ? "reverse" : "expire",
    amountCents: cents,
    label: ctx.label,
    lotId,
    holdId: ctx.holdId,
  });
  return 0;
}

export function computeSummary(state: WalletState): WalletSummary {
  let availableCents = 0;
  let pendingCents = 0;
  let heldCents = 0;
  let nextExpiryAtMs: number | null = null;
  let nextExpiryCents = 0;
  for (const lot of state.lots.values()) {
    if (lot.status === "pending") pendingCents += lot.earnedCents;
    if (lot.status !== "available" || lot.remainingCents <= 0) continue;
    availableCents += lot.remainingCents;
    const ms = lot.expiresAt ? lot.expiresAt.toMillis() : null;
    if (ms == null) continue;
    if (nextExpiryAtMs == null || ms < nextExpiryAtMs) {
      nextExpiryAtMs = ms;
      nextExpiryCents = lot.remainingCents;
    } else if (ms === nextExpiryAtMs) {
      nextExpiryCents += lot.remainingCents;
    }
  }
  for (const hold of state.holds.values()) {
    if (hold.status === "open") heldCents += hold.amountCents;
  }
  return {availableCents, pendingCents, heldCents, nextExpiryAtMs, nextExpiryCents};
}

export function writeWalletState(
  tx: Transaction,
  state: WalletState,
  nowMs: number,
): WalletSummary {
  const now = Timestamp.fromMillis(nowMs);
  for (const lotId of state.dirtyLots) {
    tx.set(state.walletRef.collection("lots").doc(lotId), state.lots.get(lotId)!);
  }
  for (const holdId of state.dirtyHolds) {
    tx.set(state.walletRef.collection("holds").doc(holdId), state.holds.get(holdId)!);
  }
  for (const entry of state.ledger) {
    tx.set(state.walletRef.collection("ledger").doc(), {...entry, createdAt: now});
  }
  const summary = computeSummary(state);
  tx.set(state.walletRef, {
    uid: state.uid,
    availableCents: summary.availableCents,
    pendingCents: summary.pendingCents,
    heldCents: summary.heldCents,
    lifetimeEarnedCents: state.lifetimeEarnedCents,
    lifetimeRedeemedCents: state.lifetimeRedeemedCents,
    nextExpiryAt: summary.nextExpiryAtMs == null ?
      null :
      Timestamp.fromMillis(summary.nextExpiryAtMs),
    nextExpiryCents: summary.nextExpiryCents,
    updatedAt: now,
  });
  return summary;
}
```

- [ ] **Step 4: Implementar as reservas**

Criar `functions/src/athlete-wallet.ts`:

```ts
/**
 * Carteira de cashback do atleta — `athleteWallets/{uid}`.
 *
 * Toda mudança de saldo passa por aqui, sempre numa transação que mexe na
 * carteira, nos lotes, nas reservas e no extrato juntos (ver
 * `athlete-wallet-state.ts`). Escrita só pelo servidor; as rules bloqueiam o
 * cliente.
 */
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {allocateFifo, type CashbackSourceType} from "./cashback-rules";
import {
  addLedger,
  athleteWalletRef,
  debitLot,
  loadWalletState,
  putHold,
  readHold,
  readLots,
  restoreToLot,
  spendableLots,
  writeWalletState,
} from "./athlete-wallet-state";

export type HoldCashbackParams = {
  uid: string;
  maxCents: number;
  sourceType: CashbackSourceType;
  sourceId: string;
  trackingPath: string;
  label: string;
  nowMs: number;
};

/**
 * Reserva saldo para uma cobrança que vai ser criada: abate os lotes na hora
 * (pelo que vence primeiro), para a varredura de vencimento nunca vencer
 * dinheiro preso num checkout aberto e para dois checkouts não gastarem o
 * mesmo saldo. Sem saldo, não cria nada.
 */
export async function holdCashback(
  db: Firestore,
  params: HoldCashbackParams,
): Promise<{holdId: string | null; appliedCents: number}> {
  if (params.maxCents <= 0) return {holdId: null, appliedCents: 0};
  const holdRef = athleteWalletRef(db, params.uid).collection("holds").doc();
  return db.runTransaction(async (tx) => {
    const state = await loadWalletState(tx, db, params.uid);
    const spendable = spendableLots(state, params.nowMs);
    const totalCents = spendable.reduce((sum, lot) => sum + lot.remainingCents, 0);
    const appliedCents = Math.min(params.maxCents, totalCents);
    if (appliedCents <= 0) return {holdId: null, appliedCents: 0};

    const allocations = allocateFifo(spendable, appliedCents);
    for (const allocation of allocations) debitLot(state, allocation.lotId, allocation.cents);
    putHold(state, holdRef.id, {
      uid: params.uid,
      amountCents: appliedCents,
      allocations,
      status: "open",
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      trackingPath: params.trackingPath,
      label: params.label,
      asaasPaymentId: null,
      createdAt: Timestamp.fromMillis(params.nowMs),
      capturedAt: null,
      releasedAt: null,
      lateCapture: false,
      shortfallCents: 0,
    });
    writeWalletState(tx, state, params.nowMs);
    return {holdId: holdRef.id, appliedCents};
  });
}

/** Liga a reserva à cobrança criada no Asaas — é por esse id que a varredura a confere. */
export async function attachHoldPayment(
  db: Firestore,
  uid: string,
  holdId: string,
  asaasPaymentId: string,
): Promise<void> {
  await athleteWalletRef(db, uid).collection("holds").doc(holdId).set(
    {asaasPaymentId},
    {merge: true},
  );
}

/** Cobrança morreu sem pagamento: o saldo volta aos lotes de origem. Idempotente. */
export async function releaseHold(
  db: Firestore,
  uid: string,
  holdId: string,
  nowMs: number,
): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const state = await loadWalletState(tx, db, uid);
    const hold = await readHold(tx, state, holdId);
    if (!hold || hold.status !== "open") return false;
    await readLots(tx, state, hold.allocations.map((a) => a.lotId));
    for (const allocation of hold.allocations) {
      restoreToLot(state, allocation.lotId, allocation.cents, {holdId, label: hold.label});
    }
    putHold(state, holdId, {...hold, status: "released", releasedAt: Timestamp.fromMillis(nowMs)});
    writeWalletState(tx, state, nowMs);
    return true;
  });
}

export type CaptureResult = {capturedCents: number; shortfallCents: number};

/**
 * Cobrança paga: a reserva vira consumo. Se ela já tinha sido devolvida (PIX
 * pago depois de expirar), o desconto já foi dado no Asaas — então debita de
 * novo do que estiver disponível; o que faltar a nexaGO absorve, e o saldo
 * nunca fica negativo. Idempotente.
 */
export async function captureHold(
  db: Firestore,
  uid: string,
  holdId: string,
  nowMs: number,
): Promise<CaptureResult> {
  return db.runTransaction(async (tx) => {
    const state = await loadWalletState(tx, db, uid);
    const hold = await readHold(tx, state, holdId);
    if (!hold) return {capturedCents: 0, shortfallCents: 0};
    if (hold.status === "captured" || hold.status === "refunded") {
      return {
        capturedCents: hold.amountCents - hold.shortfallCents,
        shortfallCents: hold.shortfallCents,
      };
    }
    const now = Timestamp.fromMillis(nowMs);
    if (hold.status === "open") {
      putHold(state, holdId, {...hold, status: "captured", capturedAt: now});
      state.lifetimeRedeemedCents += hold.amountCents;
      addLedger(state, {type: "redeem", amountCents: hold.amountCents, label: hold.label, holdId});
      writeWalletState(tx, state, nowMs);
      return {capturedCents: hold.amountCents, shortfallCents: 0};
    }

    const spendable = spendableLots(state, nowMs);
    const totalCents = spendable.reduce((sum, lot) => sum + lot.remainingCents, 0);
    const capturedCents = Math.min(hold.amountCents, totalCents);
    const allocations = capturedCents > 0 ? allocateFifo(spendable, capturedCents) : [];
    for (const allocation of allocations) debitLot(state, allocation.lotId, allocation.cents);
    const shortfallCents = hold.amountCents - capturedCents;
    putHold(state, holdId, {
      ...hold,
      status: "captured",
      capturedAt: now,
      allocations,
      lateCapture: true,
      shortfallCents,
    });
    state.lifetimeRedeemedCents += capturedCents;
    addLedger(state, {type: "redeem", amountCents: capturedCents, label: hold.label, holdId});
    writeWalletState(tx, state, nowMs);
    return {capturedCents, shortfallCents};
  });
}

/**
 * Pagamento estornado: o saldo usado nele volta aos mesmos lotes, com a
 * validade original (lote já vencido não volta — o extrato registra).
 * Reserva ainda aberta é só devolvida. Devolve quantos centavos voltaram.
 */
export async function refundCapturedHold(
  db: Firestore,
  uid: string,
  holdId: string,
  nowMs: number,
): Promise<number> {
  return db.runTransaction(async (tx) => {
    const state = await loadWalletState(tx, db, uid);
    const hold = await readHold(tx, state, holdId);
    if (!hold || (hold.status !== "captured" && hold.status !== "open")) return 0;
    await readLots(tx, state, hold.allocations.map((a) => a.lotId));
    let restoredCents = 0;
    for (const allocation of hold.allocations) {
      restoredCents += restoreToLot(
        state, allocation.lotId, allocation.cents, {holdId, label: hold.label},
      );
    }
    if (hold.status === "captured") {
      state.lifetimeRedeemedCents = Math.max(
        0,
        state.lifetimeRedeemedCents - (hold.amountCents - hold.shortfallCents),
      );
      addLedger(state, {type: "refund", amountCents: restoredCents, label: hold.label, holdId});
    }
    putHold(state, holdId, {
      ...hold,
      status: hold.status === "open" ? "released" : "refunded",
      releasedAt: Timestamp.fromMillis(nowMs),
    });
    writeWalletState(tx, state, nowMs);
    return restoredCents;
  });
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc && node --test lib/athlete-wallet.test.js`
Expected: PASS, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add functions/src/athlete-wallet-state.ts functions/src/athlete-wallet.ts functions/src/athlete-wallet.test.ts && git commit -m "feat(cashback): carteira do atleta com reservas de saldo por cobrança

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Carteira — ciclo de vida dos lotes

**Files:**
- Modify: `functions/src/athlete-wallet.ts` (acrescentar as funções de lote)
- Modify: `functions/src/athlete-wallet.test.ts` (acrescentar os testes)

**Interfaces:**
- Consumes: estado e helpers da Task 2; `computeExpiresAtMs` (Task 1).
- Produces: `type EarnLotParams = {uid; paymentId; earnCents; sourceType; sourceId; tournamentId: string | null; arenaId: string | null; label; eventAtMs; nowMs}`; `earnPendingLot(db, p): Promise<boolean>`; `releaseLot(db, uid, lotId, nowMs, expiryMonths): Promise<number>`; `cancelLot(db, uid, lotId, nowMs): Promise<boolean>`; `rescheduleLot(db, uid, lotId, eventAtMs): Promise<void>`; `reverseLot(db, uid, lotId, nowMs): Promise<"cancelled" | "reversed" | "none">`; `expireLot(db, uid, lotId, nowMs): Promise<number>`; `markExpiryWarned(db, uid, lotIds, nowMs): Promise<void>`. O id do lote é o `paymentId` do Asaas.

- [ ] **Step 1: Escrever os testes que falham**

Em `functions/src/athlete-wallet.test.ts`, acrescentar ao import de `./athlete-wallet`: `cancelLot, earnPendingLot, expireLot, markExpiryWarned, releaseLot, rescheduleLot, reverseLot`. Acrescentar ao fim do arquivo:

```ts
function earnParams(overrides: Partial<Parameters<typeof earnPendingLot>[1]> = {}) {
  return {
    uid: UID,
    paymentId: "pay1",
    earnCents: 240,
    sourceType: "booking" as const,
    sourceId: "b1",
    tournamentId: null,
    arenaId: "arena1",
    label: "Reserva · Arena Sol · 12/10",
    eventAtMs: NOW + 2 * DAY,
    nowMs: NOW,
    ...overrides,
  };
}

describe("earnPendingLot", () => {
  it("cria o lote pendente com o id do pagamento e é idempotente", async () => {
    const {fake, db} = makeDb();
    assert.equal(await earnPendingLot(db, earnParams()), true);
    assert.equal(await earnPendingLot(db, earnParams()), false);

    const lot = fake.store.get(`${W}/lots/pay1`)!;
    assert.equal(lot.status, "pending");
    assert.equal(lot.earnedCents, 240);
    assert.equal(lot.remainingCents, 0);
    assert.equal((lot.eventAt as Timestamp).toMillis(), NOW + 2 * DAY);
    const wallet = fake.store.get(W)!;
    assert.equal(wallet.pendingCents, 240);
    assert.equal(wallet.availableCents, 0);
    assert.equal(wallet.lifetimeEarnedCents, 240);
    assert.equal(ledgerOf(fake).filter((e) => e.type === "earn").length, 1);
  });

  it("ganho zero não cria lote", async () => {
    const {fake, db} = makeDb();
    assert.equal(await earnPendingLot(db, earnParams({earnCents: 0})), false);
    assert.equal(fake.store.has(`${W}/lots/pay1`), false);
  });
});

describe("releaseLot", () => {
  it("libera com validade de N meses e é idempotente", async () => {
    const {fake, db} = makeDb();
    await earnPendingLot(db, earnParams());

    assert.equal(await releaseLot(db, UID, "pay1", NOW, 6), 240);
    assert.equal(await releaseLot(db, UID, "pay1", NOW, 6), 0);

    const lot = fake.store.get(`${W}/lots/pay1`)!;
    assert.equal(lot.status, "available");
    assert.equal(lot.remainingCents, 240);
    assert.equal((lot.expiresAt as Timestamp).toMillis(), Date.UTC(2027, 3, 1, 13, 0, 0));
    const wallet = fake.store.get(W)!;
    assert.equal(wallet.pendingCents, 0);
    assert.equal(wallet.availableCents, 240);
    assert.equal((wallet.nextExpiryAt as Timestamp).toMillis(), Date.UTC(2027, 3, 1, 13, 0, 0));
    assert.equal(wallet.nextExpiryCents, 240);
  });
});

describe("cancelLot / rescheduleLot", () => {
  it("cancela só lote pendente", async () => {
    const {fake, db} = makeDb();
    await earnPendingLot(db, earnParams());
    assert.equal(await cancelLot(db, UID, "pay1", NOW), true);
    assert.equal(await cancelLot(db, UID, "pay1", NOW), false);
    assert.equal(fake.store.get(`${W}/lots/pay1`)!.status, "cancelled");
    assert.equal(fake.store.get(W)!.pendingCents, 0);
    assert.equal(ledgerOf(fake).find((e) => e.type === "cancel")?.amountCents, 240);
  });

  it("move a data do evento", async () => {
    const {fake, db} = makeDb();
    await earnPendingLot(db, earnParams());
    await rescheduleLot(db, UID, "pay1", NOW + 9 * DAY);
    assert.equal(
      (fake.store.get(`${W}/lots/pay1`)!.eventAt as Timestamp).toMillis(),
      NOW + 9 * DAY,
    );
  });
});

describe("reverseLot", () => {
  it("pendente é cancelado", async () => {
    const {fake, db} = makeDb();
    await earnPendingLot(db, earnParams());
    assert.equal(await reverseLot(db, UID, "pay1", NOW), "cancelled");
    assert.equal(fake.store.get(`${W}/lots/pay1`)!.status, "cancelled");
  });

  it("disponível perde o que resta, sem saldo negativo", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "pay1", {remainingCents: 100, earnedCents: 240});
    assert.equal(await reverseLot(db, UID, "pay1", NOW), "reversed");
    const lot = fake.store.get(`${W}/lots/pay1`)!;
    assert.equal(lot.status, "reversed");
    assert.equal(lot.remainingCents, 0);
    assert.equal(fake.store.get(W)!.availableCents, 0);
    assert.equal(ledgerOf(fake).find((e) => e.type === "reverse")?.amountCents, 100);
  });

  it("lote inexistente não faz nada", async () => {
    const {db} = makeDb();
    assert.equal(await reverseLot(db, UID, "nada", NOW), "none");
  });
});

describe("expireLot", () => {
  it("vence o que sobrou do lote disponível vencido", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "l1", {remainingCents: 320, expiresAt: Timestamp.fromMillis(NOW - 1000)});
    seedLot(fake, "l2", {remainingCents: 500});

    assert.equal(await expireLot(db, UID, "l1", NOW), 320);
    assert.equal(await expireLot(db, UID, "l2", NOW), 0);

    assert.equal(fake.store.get(`${W}/lots/l1`)!.status, "expired");
    assert.equal(fake.store.get(`${W}/lots/l2`)!.status, "available");
    assert.equal(fake.store.get(W)!.availableCents, 500);
    assert.equal(ledgerOf(fake).find((e) => e.type === "expire")?.amountCents, 320);
  });
});

describe("markExpiryWarned", () => {
  it("marca os lotes avisados", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "l1");
    seedLot(fake, "l2");
    await markExpiryWarned(db, UID, ["l1", "l2"], NOW);
    assert.equal((fake.store.get(`${W}/lots/l1`)!.expiryWarnedAt as Timestamp).toMillis(), NOW);
    assert.equal((fake.store.get(`${W}/lots/l2`)!.expiryWarnedAt as Timestamp).toMillis(), NOW);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc`
Expected: FAIL — `Module '"./athlete-wallet"' has no exported member 'earnPendingLot'`.

- [ ] **Step 3: Implementar**

Em `functions/src/athlete-wallet.ts`, trocar o import de `./cashback-rules` por `import {allocateFifo, computeExpiresAtMs, type CashbackSourceType} from "./cashback-rules";`, acrescentar `putLot` ao import de `./athlete-wallet-state`, e acrescentar ao fim do arquivo:

```ts
export type EarnLotParams = {
  uid: string;
  /** Id do pagamento no Asaas — também é o id do lote: um ganho por pagamento. */
  paymentId: string;
  earnCents: number;
  sourceType: CashbackSourceType;
  sourceId: string;
  tournamentId: string | null;
  arenaId: string | null;
  label: string;
  eventAtMs: number;
  nowMs: number;
};

/** Ganho nasce PENDENTE e só libera depois do evento. Idempotente pelo id do pagamento. */
export async function earnPendingLot(db: Firestore, p: EarnLotParams): Promise<boolean> {
  if (p.earnCents <= 0) return false;
  return db.runTransaction(async (tx) => {
    const state = await loadWalletState(tx, db, p.uid);
    const lotSnap = await tx.get(state.walletRef.collection("lots").doc(p.paymentId));
    if (lotSnap.exists) return false;
    const now = Timestamp.fromMillis(p.nowMs);
    putLot(state, p.paymentId, {
      uid: p.uid,
      sourceType: p.sourceType,
      sourceId: p.sourceId,
      tournamentId: p.tournamentId,
      arenaId: p.arenaId,
      label: p.label,
      earnedCents: p.earnCents,
      remainingCents: 0,
      status: "pending",
      eventAt: Timestamp.fromMillis(p.eventAtMs),
      releasedAt: null,
      expiresAt: null,
      expiryWarnedAt: null,
      createdAt: now,
    });
    state.lifetimeEarnedCents += p.earnCents;
    addLedger(state, {type: "earn", amountCents: p.earnCents, label: p.label, lotId: p.paymentId});
    writeWalletState(tx, state, p.nowMs);
    return true;
  });
}

/** Pendente → disponível, vencendo em `expiryMonths`. Devolve o valor liberado (0 se nada mudou). */
export async function releaseLot(
  db: Firestore,
  uid: string,
  lotId: string,
  nowMs: number,
  expiryMonths: number,
): Promise<number> {
  return db.runTransaction(async (tx) => {
    const state = await loadWalletState(tx, db, uid);
    const lot = state.lots.get(lotId);
    if (!lot || lot.status !== "pending") return 0;
    putLot(state, lotId, {
      ...lot,
      status: "available",
      remainingCents: lot.earnedCents,
      releasedAt: Timestamp.fromMillis(nowMs),
      expiresAt: Timestamp.fromMillis(computeExpiresAtMs(nowMs, expiryMonths)),
    });
    addLedger(state, {type: "release", amountCents: lot.earnedCents, label: lot.label, lotId});
    writeWalletState(tx, state, nowMs);
    return lot.earnedCents;
  });
}

/** Vínculo caiu antes do evento: o pendente é cancelado. */
export async function cancelLot(
  db: Firestore,
  uid: string,
  lotId: string,
  nowMs: number,
): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const state = await loadWalletState(tx, db, uid);
    const lot = state.lots.get(lotId);
    if (!lot || lot.status !== "pending") return false;
    putLot(state, lotId, {...lot, status: "cancelled"});
    addLedger(state, {type: "cancel", amountCents: lot.earnedCents, label: lot.label, lotId});
    writeWalletState(tx, state, nowMs);
    return true;
  });
}

/** Evento adiado: só move a data em que o lote volta a ser conferido. */
export async function rescheduleLot(
  db: Firestore,
  uid: string,
  lotId: string,
  eventAtMs: number,
): Promise<void> {
  await athleteWalletRef(db, uid).collection("lots").doc(lotId).set(
    {eventAt: Timestamp.fromMillis(eventAtMs)},
    {merge: true},
  );
}

/**
 * Estorno do pagamento que gerou o lote: pendente é cancelado; disponível
 * perde o que ainda resta. O que o atleta já gastou a nexaGO absorve — o
 * saldo nunca fica negativo.
 */
export async function reverseLot(
  db: Firestore,
  uid: string,
  lotId: string,
  nowMs: number,
): Promise<"cancelled" | "reversed" | "none"> {
  return db.runTransaction(async (tx) => {
    const state = await loadWalletState(tx, db, uid);
    await readLots(tx, state, [lotId]);
    const lot = state.lots.get(lotId);
    if (!lot) return "none";
    if (lot.status === "pending") {
      putLot(state, lotId, {...lot, status: "cancelled"});
      addLedger(state, {type: "cancel", amountCents: lot.earnedCents, label: lot.label, lotId});
      writeWalletState(tx, state, nowMs);
      return "cancelled";
    }
    if (lot.status !== "available" && lot.status !== "consumed") return "none";
    putLot(state, lotId, {...lot, remainingCents: 0, status: "reversed"});
    addLedger(state, {type: "reverse", amountCents: lot.remainingCents, label: lot.label, lotId});
    writeWalletState(tx, state, nowMs);
    return "reversed";
  });
}

/** Vence o que sobrou de um lote disponível já vencido. Devolve o valor perdido. */
export async function expireLot(
  db: Firestore,
  uid: string,
  lotId: string,
  nowMs: number,
): Promise<number> {
  return db.runTransaction(async (tx) => {
    const state = await loadWalletState(tx, db, uid);
    const lot = state.lots.get(lotId);
    if (!lot || lot.status !== "available") return 0;
    if (!lot.expiresAt || lot.expiresAt.toMillis() > nowMs) return 0;
    putLot(state, lotId, {...lot, remainingCents: 0, status: "expired"});
    addLedger(state, {type: "expire", amountCents: lot.remainingCents, label: lot.label, lotId});
    writeWalletState(tx, state, nowMs);
    return lot.remainingCents;
  });
}

export async function markExpiryWarned(
  db: Firestore,
  uid: string,
  lotIds: string[],
  nowMs: number,
): Promise<void> {
  const batch = db.batch();
  const lots = athleteWalletRef(db, uid).collection("lots");
  for (const lotId of lotIds) {
    batch.set(lots.doc(lotId), {expiryWarnedAt: Timestamp.fromMillis(nowMs)}, {merge: true});
  }
  await batch.commit();
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc && node --test lib/athlete-wallet.test.js`
Expected: PASS, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add functions/src/athlete-wallet.ts functions/src/athlete-wallet.test.ts && git commit -m "feat(cashback): ciclo de vida dos lotes (ganho, liberação, cancelamento, estorno, vencimento)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: Intenção de cashback e reserva no checkout

**Files:**
- Create: `functions/src/cashback-intent.ts`
- Create: `functions/src/cashback-checkout.ts`
- Create: `functions/src/cashback-intent.test.ts`

**Interfaces:**
- Consumes: `readCashbackConfig`, `CashbackConfig` (Task 1); `computeEarnCents`, `toCents`, `centsToReais`, `CashbackSourceType` (Task 1); `holdCashback`, `releaseHold`, `captureHold`, `earnPendingLot` (Tasks 2–3).
- Produces (`cashback-intent.ts`):
  - `type CashbackIntent = {uid; sourceType; sourceId; tournamentId: string|null; arenaId: string|null; label; eventAtMs; cashCents; appliedCents; feeCents; earnCents; holdId: string|null; attempts: number; lastError: string|null; reversedAtMs: number|null}`
  - `buildCashbackIntent(p)`, `intentHasWork(intent)`, `cashbackIntentFields(intent)` → `{cashback: intent, cashbackStatus: "pending"}`, `readCashbackApplied(data)` → `{appliedCents, holdId}`, `MAX_INTENT_ATTEMPTS = 10`, `applyCashbackIntent(db, processedRef, paymentId, nowMs): Promise<"done"|"skipped"|"failed">` (nunca lança), `registrationCashbackLabel(name)`, `bookingCashbackLabel(arenaName, dateKey)`, `clubCashbackLabel(clubName)`.
  - Valores de `cashbackStatus` no doc de processado: `"pending" | "done" | "failed" | "reversed"`.
- Produces (`cashback-checkout.ts`): `type CashbackReservation = {holdId: string|null; appliedCents: number; chargeReais: number}`; `reserveCashbackForCharge(db, {uid, useCashback, priceReais, sourceType, sourceId, trackingPath, label, nowMs})`; `releaseCashbackHoldQuietly(db, uid, holdId, nowMs)`; `cashbackIdempotencyKey(baseKey, holdId)`; `cashbackResponseFields(reservation)` → `{cashbackAppliedReais, chargedReais}`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `functions/src/cashback-intent.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {DEFAULT_CASHBACK_CONFIG} from "./cashback-config";
import {holdCashback} from "./athlete-wallet";
import {
  applyCashbackIntent,
  bookingCashbackLabel,
  buildCashbackIntent,
  cashbackIntentFields,
  intentHasWork,
  readCashbackApplied,
} from "./cashback-intent";
import {
  cashbackIdempotencyKey,
  cashbackResponseFields,
  releaseCashbackHoldQuietly,
  reserveCashbackForCharge,
} from "./cashback-checkout";

const UID = "ath1";
const W = `athleteWallets/${UID}`;
const NOW = Date.UTC(2026, 9, 1, 13, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const PROCESSED = "artifacts/p/public/data/asaas_processed_payments/pay1";
const ENABLED = {...DEFAULT_CASHBACK_CONFIG, enabled: true};

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function seedAvailable(fake: FakeFirestore, lotId: string, cents: number): void {
  fake.seedDoc(`${W}/lots/${lotId}`, {
    uid: UID, sourceType: "booking", sourceId: "b0", tournamentId: null, arenaId: "a1",
    label: "Reserva", earnedCents: cents, remainingCents: cents, status: "available",
    eventAt: Timestamp.fromMillis(NOW - 10 * DAY), releasedAt: Timestamp.fromMillis(NOW - 9 * DAY),
    expiresAt: Timestamp.fromMillis(NOW + 90 * DAY), expiryWarnedAt: null,
    createdAt: Timestamp.fromMillis(NOW - 10 * DAY),
  });
}

function intentFor(overrides: Partial<Parameters<typeof buildCashbackIntent>[0]> = {}) {
  return buildCashbackIntent({
    uid: UID,
    sourceType: "booking",
    sourceId: "b1",
    tournamentId: null,
    arenaId: "a1",
    label: "Reserva · Arena Sol · 12/10",
    eventAtMs: NOW + 2 * DAY,
    cashReais: 120,
    appliedCents: 0,
    feeReais: 9.6,
    holdId: null,
    config: ENABLED,
    ...overrides,
  });
}

describe("buildCashbackIntent", () => {
  it("calcula o ganho com o cashback ligado", () => {
    const intent = intentFor();
    assert.equal(intent.cashCents, 12000);
    assert.equal(intent.feeCents, 960);
    assert.equal(intent.earnCents, 240);
    assert.equal(intent.attempts, 0);
    assert.equal(intent.reversedAtMs, null);
  });

  it("desligado não gera ganho, mas a reserva continua sendo capturada", () => {
    const intent = intentFor({config: DEFAULT_CASHBACK_CONFIG, holdId: "h1"});
    assert.equal(intent.earnCents, 0);
    assert.equal(intentHasWork(intent), true);
    assert.equal(intentHasWork(intentFor({config: DEFAULT_CASHBACK_CONFIG})), false);
    assert.equal(intentHasWork(intentFor({uid: ""})), false);
  });
});

describe("readCashbackApplied", () => {
  it("lê o saldo aplicado e a reserva do registro da cobrança", () => {
    assert.deepEqual(readCashbackApplied({cashbackAppliedCents: 1500, cashbackHoldId: "h1"}), {
      appliedCents: 1500, holdId: "h1",
    });
    assert.deepEqual(readCashbackApplied({}), {appliedCents: 0, holdId: null});
    assert.deepEqual(readCashbackApplied(undefined), {appliedCents: 0, holdId: null});
    assert.deepEqual(readCashbackApplied({cashbackAppliedCents: -5, cashbackHoldId: " "}), {
      appliedCents: 0, holdId: null,
    });
  });
});

describe("bookingCashbackLabel", () => {
  it("usa dia/mês da reserva quando a data é válida", () => {
    assert.equal(bookingCashbackLabel("Arena Sol", "2026-10-12"), "Reserva · Arena Sol · 12/10");
    assert.equal(bookingCashbackLabel("Arena Sol", undefined), "Reserva · Arena Sol");
  });
});

describe("applyCashbackIntent", () => {
  it("captura a reserva, cria o lote pendente e marca feito; depois é no-op", async () => {
    const {fake, db} = makeDb();
    seedAvailable(fake, "l1", 2000);
    const {holdId} = await holdCashback(db, {
      uid: UID, maxCents: 1000, sourceType: "booking", sourceId: "b1",
      trackingPath: "arenaBookings/b1", label: "Reserva", nowMs: NOW,
    });
    const intent = intentFor({holdId, appliedCents: 1000, cashReais: 110});
    fake.seedDoc(PROCESSED, {outcome: "approved", ...cashbackIntentFields(intent)});
    const ref = db.doc(PROCESSED) as DocumentReference;

    assert.equal(await applyCashbackIntent(db, ref, "pay1", NOW), "done");
    assert.equal(await applyCashbackIntent(db, ref, "pay1", NOW), "skipped");

    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "captured");
    assert.equal(fake.store.get(`${W}/lots/pay1`)!.status, "pending");
    assert.equal(fake.store.get(`${W}/lots/pay1`)!.earnedCents, intent.earnCents);
    assert.equal(fake.store.get(PROCESSED)!.cashbackStatus, "done");
  });

  it("falha conta tentativa e deixa pendente para a varredura", async () => {
    const {fake, db} = makeDb();
    const intent = intentFor({eventAtMs: Number.NaN});
    fake.seedDoc(PROCESSED, {outcome: "approved", ...cashbackIntentFields(intent)});

    const r = await applyCashbackIntent(db, db.doc(PROCESSED) as DocumentReference, "pay1", NOW);

    assert.equal(r, "failed");
    const processed = fake.store.get(PROCESSED)!;
    assert.equal(processed.cashbackStatus, "pending");
    assert.equal((processed.cashback as {attempts: number}).attempts, 1);
  });
});

describe("reserveCashbackForCharge", () => {
  const base = {
    uid: UID, sourceType: "booking" as const, sourceId: "b1",
    trackingPath: "arenaBookings/b1", label: "Reserva", nowMs: NOW,
  };

  it("sem pedido do atleta ou com o recurso desligado não reserva nada", async () => {
    const {fake, db} = makeDb();
    seedAvailable(fake, "l1", 3000);
    assert.deepEqual(
      await reserveCashbackForCharge(db, {...base, useCashback: "true", priceReais: 20}),
      {holdId: null, appliedCents: 0, chargeReais: 20},
    );
    assert.deepEqual(
      await reserveCashbackForCharge(db, {...base, useCashback: true, priceReais: 20}),
      {holdId: null, appliedCents: 0, chargeReais: 20},
    );
  });

  it("abate até deixar o mínimo em dinheiro", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("appConfig/cashback", {enabled: true});
    seedAvailable(fake, "l1", 3000);
    const r = await reserveCashbackForCharge(db, {...base, useCashback: true, priceReais: 20});
    assert.equal(r.appliedCents, 1500);
    assert.equal(r.chargeReais, 5);
    assert.ok(r.holdId);
    assert.deepEqual(cashbackResponseFields(r), {cashbackAppliedReais: 15, chargedReais: 5});
  });

  it("preço abaixo do mínimo não usa saldo; saldo pequeno é usado inteiro", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("appConfig/cashback", {enabled: true});
    seedAvailable(fake, "l1", 300);
    assert.equal(
      (await reserveCashbackForCharge(db, {...base, useCashback: true, priceReais: 4})).appliedCents,
      0,
    );
    const r = await reserveCashbackForCharge(db, {...base, useCashback: true, priceReais: 50});
    assert.equal(r.appliedCents, 300);
    assert.equal(r.chargeReais, 47);
  });
});

describe("releaseCashbackHoldQuietly / cashbackIdempotencyKey", () => {
  it("devolve a reserva e ignora reserva nula", async () => {
    const {fake, db} = makeDb();
    seedAvailable(fake, "l1", 1000);
    const {holdId} = await holdCashback(db, {
      uid: UID, maxCents: 400, sourceType: "booking", sourceId: "b1",
      trackingPath: "arenaBookings/b1", label: "Reserva", nowMs: NOW,
    });
    await releaseCashbackHoldQuietly(db, UID, null, NOW);
    await releaseCashbackHoldQuietly(db, UID, holdId, NOW);
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "released");
  });

  it("muda a chave só quando há saldo aplicado", () => {
    assert.equal(cashbackIdempotencyKey("arena-booking-pix-b1", null), "arena-booking-pix-b1");
    assert.equal(cashbackIdempotencyKey("arena-booking-pix-b1", "h9"), "arena-booking-pix-b1-h9");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc`
Expected: FAIL — `Cannot find module './cashback-intent'`.

- [ ] **Step 3: Implementar**

Criar `functions/src/cashback-intent.ts`:

```ts
/**
 * Intenção de cashback — gravada pelo webhook no MESMO batch que confirma o
 * pagamento (em `asaas_processed_payments/{paymentId}`) e aplicada logo em
 * seguida: captura a reserva de saldo e cria o lote pendente.
 *
 * Falha aqui nunca derruba o webhook: a intenção fica `cashbackStatus:
 * "pending"` e a varredura de 5 minutos tenta de novo. O espelho de topo
 * `cashbackStatus` existe para a varredura consultar sem depender de campo
 * aninhado.
 */
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import type {CashbackConfig} from "./cashback-config";
import {computeEarnCents, toCents, type CashbackSourceType} from "./cashback-rules";
import {captureHold, earnPendingLot} from "./athlete-wallet";

export type CashbackIntent = {
  uid: string;
  sourceType: CashbackSourceType;
  sourceId: string;
  tournamentId: string | null;
  arenaId: string | null;
  label: string;
  eventAtMs: number;
  cashCents: number;
  appliedCents: number;
  feeCents: number;
  earnCents: number;
  holdId: string | null;
  attempts: number;
  lastError: string | null;
  reversedAtMs: number | null;
};

export const MAX_INTENT_ATTEMPTS = 10;

export function buildCashbackIntent(p: {
  uid: string;
  sourceType: CashbackSourceType;
  sourceId: string;
  tournamentId: string | null;
  arenaId: string | null;
  label: string;
  eventAtMs: number;
  /** O que o Asaas recebeu — base do ganho (a parte paga com saldo não gera cashback). */
  cashReais: number;
  appliedCents: number;
  /** Taxa da nexaGO sobre o BRUTO — base da trava do ganho. */
  feeReais: number;
  holdId: string | null;
  config: CashbackConfig;
}): CashbackIntent {
  const cashCents = toCents(p.cashReais);
  const feeCents = toCents(p.feeReais);
  return {
    uid: p.uid,
    sourceType: p.sourceType,
    sourceId: p.sourceId,
    tournamentId: p.tournamentId,
    arenaId: p.arenaId,
    label: p.label,
    eventAtMs: p.eventAtMs,
    cashCents,
    appliedCents: p.appliedCents,
    feeCents,
    earnCents: p.config.enabled ? computeEarnCents({cashCents, feeCents, config: p.config}) : 0,
    holdId: p.holdId,
    attempts: 0,
    lastError: null,
    reversedAtMs: null,
  };
}

/** Sem atleta, sem reserva e sem ganho não há o que gravar. */
export function intentHasWork(intent: CashbackIntent): boolean {
  return intent.uid !== "" && (intent.holdId != null || intent.earnCents > 0);
}

export function cashbackIntentFields(intent: CashbackIntent): Record<string, unknown> {
  return {cashback: intent, cashbackStatus: "pending"};
}

/** Saldo aplicado e reserva gravados no registro da cobrança (pixPending, reserva, participante). */
export function readCashbackApplied(
  data: Record<string, unknown> | undefined,
): {appliedCents: number; holdId: string | null} {
  const applied = Math.round(Number(data?.cashbackAppliedCents));
  const rawHold = data?.cashbackHoldId;
  return {
    appliedCents: Number.isFinite(applied) && applied > 0 ? applied : 0,
    holdId: typeof rawHold === "string" && rawHold.trim() ? rawHold.trim() : null,
  };
}

export function registrationCashbackLabel(tournamentName: string): string {
  return `Inscrição · ${tournamentName}`;
}

export function bookingCashbackLabel(arenaName: string, dateKey: unknown): string {
  const m = typeof dateKey === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey) : null;
  return m ? `Reserva · ${arenaName} · ${m[3]}/${m[2]}` : `Reserva · ${arenaName}`;
}

export function clubCashbackLabel(clubName: string): string {
  return `Clubinho · ${clubName}`;
}

/** Captura a reserva e cria o lote pendente. Idempotente; nunca lança. */
export async function applyCashbackIntent(
  db: Firestore,
  processedRef: DocumentReference,
  paymentId: string,
  nowMs: number,
): Promise<"done" | "skipped" | "failed"> {
  let intent: CashbackIntent | undefined;
  try {
    const data = (await processedRef.get()).data() ?? {};
    if (data.cashbackStatus !== "pending") return "skipped";
    intent = data.cashback as CashbackIntent | undefined;
    if (!intent) return "skipped";
    if (intent.holdId) {
      const capture = await captureHold(db, intent.uid, intent.holdId, nowMs);
      if (capture.shortfallCents > 0) {
        logger.error(
          "cashback: saldo usado num pagamento tardio já não estava disponível — nexaGO absorveu",
          {paymentId, uid: intent.uid, holdId: intent.holdId, shortfallCents: capture.shortfallCents},
        );
      }
    }
    await earnPendingLot(db, {
      uid: intent.uid,
      paymentId,
      earnCents: intent.earnCents,
      sourceType: intent.sourceType,
      sourceId: intent.sourceId,
      tournamentId: intent.tournamentId,
      arenaId: intent.arenaId,
      label: intent.label,
      eventAtMs: intent.eventAtMs,
      nowMs,
    });
    await processedRef.set({cashbackStatus: "done"}, {merge: true});
    return "done";
  } catch (e) {
    logger.error("cashback: falha ao aplicar a intenção — a varredura tenta de novo", {
      paymentId,
      error: String(e),
    });
    try {
      await processedRef.set({
        cashback: {attempts: (intent?.attempts ?? 0) + 1, lastError: String(e)},
      }, {merge: true});
    } catch {
      // A varredura reconta na próxima passada.
    }
    return "failed";
  }
}
```

Criar `functions/src/cashback-checkout.ts`:

```ts
/**
 * Saldo de cashback nas callables de cobrança (inscrição, reserva, clubinho).
 *
 * Sequência em todas: preço → `reserveCashbackForCharge` → cobrança no Asaas
 * por `chargeReais` → `attachHoldPayment` → grava `cashbackAppliedCents` e
 * `cashbackHoldId` no registro da cobrança. Falha no Asaas →
 * `releaseCashbackHoldQuietly`. Cliente que não manda `useCashback: true`
 * (inclusive o app antigo) paga exatamente como antes.
 */
import type {Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {readCashbackConfig} from "./cashback-config";
import {centsToReais, toCents, type CashbackSourceType} from "./cashback-rules";
import {holdCashback, releaseHold} from "./athlete-wallet";

export type CashbackReservation = {
  holdId: string | null;
  appliedCents: number;
  chargeReais: number;
};

export async function reserveCashbackForCharge(
  db: Firestore,
  p: {
    uid: string;
    useCashback: unknown;
    priceReais: number;
    sourceType: CashbackSourceType;
    sourceId: string;
    trackingPath: string;
    label: string;
    nowMs: number;
  },
): Promise<CashbackReservation> {
  const priceCents = toCents(p.priceReais);
  const none: CashbackReservation = {
    holdId: null,
    appliedCents: 0,
    chargeReais: centsToReais(priceCents),
  };
  if (p.useCashback !== true) return none;
  const config = await readCashbackConfig(db);
  if (!config.enabled) return none;
  // Sempre sobra o mínimo em dinheiro: existe cobrança no Asaas e o webhook
  // continua sendo a única porta de confirmação.
  const maxCents = priceCents - config.minCashCents;
  if (maxCents <= 0) return none;
  const {holdId, appliedCents} = await holdCashback(db, {
    uid: p.uid,
    maxCents,
    sourceType: p.sourceType,
    sourceId: p.sourceId,
    trackingPath: p.trackingPath,
    label: p.label,
    nowMs: p.nowMs,
  });
  return {holdId, appliedCents, chargeReais: centsToReais(priceCents - appliedCents)};
}

export async function releaseCashbackHoldQuietly(
  db: Firestore,
  uid: string,
  holdId: string | null | undefined,
  nowMs: number,
): Promise<void> {
  if (!holdId) return;
  try {
    await releaseHold(db, uid, holdId, nowMs);
  } catch (e) {
    logger.error("cashback: falha ao devolver a reserva — a varredura de 5 min devolve", {
      uid,
      holdId,
      error: String(e),
    });
  }
}

/** Com saldo aplicado o valor muda: a mesma chave devolveria a cobrança antiga no Asaas. */
export function cashbackIdempotencyKey(baseKey: string, holdId: string | null): string {
  return holdId ? `${baseKey}-${holdId}` : baseKey;
}

export function cashbackResponseFields(
  reservation: CashbackReservation,
): {cashbackAppliedReais: number; chargedReais: number} {
  return {
    cashbackAppliedReais: centsToReais(reservation.appliedCents),
    chargedReais: reservation.chargeReais,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc && node --test lib/cashback-intent.test.js`
Expected: PASS, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add functions/src/cashback-intent.ts functions/src/cashback-checkout.ts functions/src/cashback-intent.test.ts && git commit -m "feat(cashback): intenção de cashback do webhook e reserva de saldo no checkout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Rules, índices e exclusão de conta

**Files:**
- Modify: `firestore.rules` (logo depois do bloco `match /tournamentWallets/{tournamentId} { ... }`)
- Modify: `firestore.indexes.json` (array `indexes`)
- Create: `functions/test/athlete-wallet.rules.test.mjs`
- Modify: `functions/src/account-deletion.ts`

**Interfaces:**
- Consumes: helpers das rules `isSuperAdmin()`, `isAdmin()` (já existem).
- Produces: leitura de `athleteWallets/{uid}` e subcoleções só pelo dono e admins; escrita sempre negada ao cliente. Índices de grupo de coleção para as varreduras das Tasks 9 e 10: `holds (status, createdAt)`, `lots (status, eventAt)`, `lots (status, expiresAt)`.

- [ ] **Step 1: Escrever o teste de rules que falha**

Criar `functions/test/athlete-wallet.rules.test.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

/**
 * Carteira de cashback do atleta: saldo é dinheiro. Só o dono lê; ninguém
 * escreve pelo cliente — nem o próprio atleta (senão ele se dava saldo).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-athlete-wallet-test';
const DONO = 'atleta-uid';
const OUTRO = 'outro-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'athleteWallets', DONO), { uid: DONO, availableCents: 500 });
    await setDoc(doc(db, 'athleteWallets', DONO, 'lots', 'pay1'), { earnedCents: 500 });
    await setDoc(doc(db, 'athleteWallets', DONO, 'holds', 'h1'), { amountCents: 100 });
    await setDoc(doc(db, 'athleteWallets', DONO, 'ledger', 'e1'), { type: 'earn' });
  });
});

after(async () => { await testEnv.cleanup(); });

const dbOf = (uid) => testEnv.authenticatedContext(uid).firestore();

test('dono lê a carteira e as subcoleções', async () => {
  await assertSucceeds(getDoc(doc(dbOf(DONO), 'athleteWallets', DONO)));
  await assertSucceeds(getDoc(doc(dbOf(DONO), 'athleteWallets', DONO, 'lots', 'pay1')));
  await assertSucceeds(getDoc(doc(dbOf(DONO), 'athleteWallets', DONO, 'holds', 'h1')));
  await assertSucceeds(getDoc(doc(dbOf(DONO), 'athleteWallets', DONO, 'ledger', 'e1')));
});

test('outro atleta não lê', async () => {
  await assertFails(getDoc(doc(dbOf(OUTRO), 'athleteWallets', DONO)));
  await assertFails(getDoc(doc(dbOf(OUTRO), 'athleteWallets', DONO, 'ledger', 'e1')));
});

test('anônimo não lê', async () => {
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'athleteWallets', DONO)));
});

test('nem o dono escreve na carteira', async () => {
  await assertFails(updateDoc(doc(dbOf(DONO), 'athleteWallets', DONO), { availableCents: 999999 }));
  await assertFails(setDoc(doc(dbOf(DONO), 'athleteWallets', DONO, 'lots', 'fake'), { earnedCents: 999999 }));
  await assertFails(setDoc(doc(dbOf(DONO), 'athleteWallets', DONO, 'ledger', 'fake'), { type: 'earn' }));
  await assertFails(deleteDoc(doc(dbOf(DONO), 'athleteWallets', DONO, 'holds', 'h1')));
});

test('ninguém cria carteira para si', async () => {
  await assertFails(setDoc(doc(dbOf(OUTRO), 'athleteWallets', OUTRO), { availableCents: 100 }));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx firebase emulators:exec --only firestore --project nexago-rules-test "node --test test/athlete-wallet.rules.test.mjs"`
Expected: FAIL nos testes de leitura do dono (as rules ainda não têm `athleteWallets`, o padrão é negar). Se o emulador não subir (Java ausente), registrar o erro no relatório e seguir — os testes ficam para a verificação final.

- [ ] **Step 3: Implementar rules, índices e exclusão**

Em `firestore.rules`, logo depois do `}` que fecha `match /tournamentWallets/{tournamentId} { ... }`, inserir:

```
    // Carteira de cashback do atleta (`athlete-wallet.ts`). Saldo é dinheiro:
    // só o dono lê; só o servidor escreve — nem lote, nem reserva, nem extrato.
    match /athleteWallets/{uid} {
      allow read: if request.auth != null && (
        isSuperAdmin() ||
        isAdmin() ||
        request.auth.uid == uid
      );
      allow create, update, delete: if false;
      match /{subcollection}/{docId} {
        allow read: if request.auth != null && (
          isSuperAdmin() ||
          isAdmin() ||
          request.auth.uid == uid
        );
        allow create, update, delete: if false;
      }
    }
```

Em `firestore.indexes.json`, acrescentar ao fim do array `indexes`:

```json
    {
      "collectionGroup": "holds",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        {"fieldPath": "status", "order": "ASCENDING"},
        {"fieldPath": "createdAt", "order": "ASCENDING"}
      ]
    },
    {
      "collectionGroup": "lots",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        {"fieldPath": "status", "order": "ASCENDING"},
        {"fieldPath": "eventAt", "order": "ASCENDING"}
      ]
    },
    {
      "collectionGroup": "lots",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        {"fieldPath": "status", "order": "ASCENDING"},
        {"fieldPath": "expiresAt", "order": "ASCENDING"}
      ]
    }
```

(Seguir a indentação do arquivo; conferir com `python3 -c "import json; json.load(open('firestore.indexes.json'))"` na raiz do worktree.)

Em `functions/src/account-deletion.ts`, dentro do mesmo `try` que apaga `users/${uid}`, logo depois do `recursiveDelete` existente, acrescentar:

```ts
    // Saldo de cashback não sobrevive à conta (spec do cashback do atleta):
    // carteira, lotes, reservas e extrato saem juntos.
    await db.recursiveDelete(db.doc(`athleteWallets/${uid}`));
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx firebase emulators:exec --only firestore --project nexago-rules-test "node --test test/athlete-wallet.rules.test.mjs" && npx tsc`
Expected: PASS (5 testes de rules); `tsc` limpo.

- [ ] **Step 5: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add firestore.rules firestore.indexes.json functions/test/athlete-wallet.rules.test.mjs functions/src/account-deletion.ts && git commit -m "feat(cashback): rules da carteira do atleta, índices das varreduras e limpeza na exclusão de conta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Inscrição — saldo na cobrança e bruto no webhook

**Files:**
- Modify: `functions/src/tournament-registration-pix.ts` (`RegistrationChargeRequest`, `PreparedRegistrationCharge`, `cancelExistingPixPending`, `prepareRegistrationCharge`, `createTournamentRegistrationPixPayment`, `createTournamentRegistrationCardPayment`, tipos de resposta)
- Modify: `functions/src/asaas-tournament-registration-webhook.ts`
- Modify: `functions/src/tournament-wallet.ts` (`creditTournamentWalletFromRegistration`)
- Test: `functions/src/asaas-tournament-registration-webhook.test.ts`

**Interfaces:**
- Consumes: `reserveCashbackForCharge`, `releaseCashbackHoldQuietly`, `cashbackIdempotencyKey`, `cashbackResponseFields` (Task 4); `attachHoldPayment`, `holdCashback` (Task 2); `buildCashbackIntent`, `intentHasWork`, `cashbackIntentFields`, `readCashbackApplied`, `applyCashbackIntent`, `registrationCashbackLabel` (Task 4); `readCashbackConfig` (Task 1); `toMillisOrNull` (Task 1).
- Produces: `pixPending/{uid}` ganha `cashbackAppliedCents: number` e `cashbackHoldId: string | null`; respostas das duas callables ganham `cashbackAppliedReais` e `chargedReais` (opcionais no tipo); `creditTournamentWalletFromRegistration` aceita `cashbackAppliedReais?: number` e grava no extrato do caixa.

- [ ] **Step 1: Escrever os testes que falham**

Em `functions/src/asaas-tournament-registration-webhook.test.ts`, acrescentar aos imports:

```ts
import {Timestamp} from "firebase-admin/firestore";
import {holdCashback} from "./athlete-wallet";
```

E acrescentar ao fim do arquivo:

```ts
describe("asaas-tournament-registration-webhook: cashback", () => {
  const START_MS = Date.UTC(2026, 10, 7, 11, 0, 0);
  const NOW_MS = Date.now();

  function seedTournamentWithOrganizer(fake: FakeFirestore, categories?: unknown[]): void {
    fake.seedDoc(TOURNAMENT_PATH, {
      name: "Copa Teste",
      managerId: "org1",
      startAt: Timestamp.fromMillis(START_MS),
      categories: categories ?? [{categoryName: CATEGORY, entryFee: ENTRY_FEE}],
    });
  }

  function seedSpendableLot(fake: FakeFirestore, uid: string, cents: number): void {
    fake.seedDoc(`athleteWallets/${uid}/lots/old`, {
      uid, sourceType: "booking", sourceId: "b0", tournamentId: null, arenaId: "a1",
      label: "Reserva", earnedCents: cents, remainingCents: cents, status: "available",
      eventAt: Timestamp.fromMillis(NOW_MS - 1000), releasedAt: Timestamp.fromMillis(NOW_MS - 1000),
      expiresAt: Timestamp.fromMillis(NOW_MS + 90 * 86_400_000), expiryWarnedAt: null,
      createdAt: Timestamp.fromMillis(NOW_MS - 1000),
    });
  }

  function tournamentLedger(fake: FakeFirestore): Record<string, unknown>[] {
    return [...fake.store.entries()]
      .filter(([path]) => path.startsWith("tournamentWallets/t1/ledger/"))
      .map(([, data]) => data);
  }

  it("saldo aplicado: o caixa recebe o bruto e a reserva é capturada", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    seedSpendableLot(fake, "uidA", 2000);
    const {holdId} = await holdCashback(db, {
      uid: "uidA", maxCents: 1000, sourceType: "registration", sourceId: REG_ID,
      trackingPath: PENDING_A, label: "Inscrição · Copa Teste", nowMs: NOW_MS,
    });
    fake.seedDoc(PENDING_A, {
      status: "pending", amountType: "share", asaasPaymentId: "pay1", payerUid: "uidA",
      cashbackAppliedCents: 1000, cashbackHoldId: holdId,
    });

    await processTournamentRegistrationAsaasNotification(
      db, "pay1",
      {status: "RECEIVED", value: 40, billingType: "PIX",
        externalReference: `tournamentRegistration:${REG_ID}:uidA`},
      processedRefOf(db), makeDeps().deps,
    );

    assert.equal(fake.store.get(REG_PATH)!.paidAmount, 50);
    const credit = tournamentLedger(fake).find((e) => e.type === "credit")!;
    assert.equal(credit.grossReais, 50);
    assert.equal(credit.platformFeeReais, 4);
    assert.equal(credit.netReais, 46);
    assert.equal(credit.cashbackAppliedReais, 10);
    assert.equal(fake.store.get(`athleteWallets/uidA/holds/${holdId}`)!.status, "captured");
    assert.equal(fake.store.get(PROCESSED_PATH)!.cashbackStatus, "done");
  });

  it("cashback ligado: 2% do dinheiro vira lote pendente até o torneio começar", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    fake.seedDoc("appConfig/cashback", {enabled: true});
    fake.seedDoc(PENDING_A, {
      status: "pending", amountType: "share", asaasPaymentId: "pay1", payerUid: "uidA",
    });

    await processTournamentRegistrationAsaasNotification(
      db, "pay1",
      {status: "RECEIVED", value: 50, billingType: "PIX",
        externalReference: `tournamentRegistration:${REG_ID}:uidA`},
      processedRefOf(db), makeDeps().deps,
    );

    const lot = fake.store.get("athleteWallets/uidA/lots/pay1")!;
    assert.equal(lot.status, "pending");
    // 2% de R$ 50 = R$ 1,00; teto = metade da taxa de R$ 4,00 = R$ 2,00.
    assert.equal(lot.earnedCents, 100);
    assert.equal(lot.sourceType, "registration");
    assert.equal(lot.tournamentId, "t1");
    assert.equal((lot.eventAt as Timestamp).toMillis(), START_MS);
  });

  it("cashback desligado não cria lote nem grava intenção sem reserva", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    fake.seedDoc(PENDING_A, {
      status: "pending", amountType: "share", asaasPaymentId: "pay1", payerUid: "uidA",
    });

    await processTournamentRegistrationAsaasNotification(
      db, "pay1",
      {status: "RECEIVED", value: 50, billingType: "PIX",
        externalReference: `tournamentRegistration:${REG_ID}:uidA`},
      processedRefOf(db), makeDeps().deps,
    );

    assert.equal(fake.store.has("athleteWallets/uidA/lots/pay1"), false);
    assert.equal(fake.store.get(PROCESSED_PATH)!.cashbackStatus, undefined);
  });

  it("equipe: a parcela creditada é o bruto (dinheiro + saldo)", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake, [{categoryName: CATEGORY, entryFee: 90}]);
    seedRegistration(fake, {teamSize: 3, participantUids: ["uidA", "uidB", "uidC"]});
    seedSpendableLot(fake, "uidA", 2000);
    const {holdId} = await holdCashback(db, {
      uid: "uidA", maxCents: 1000, sourceType: "registration", sourceId: REG_ID,
      trackingPath: PENDING_A, label: "Inscrição · Copa Teste", nowMs: NOW_MS,
    });
    fake.seedDoc(PENDING_A, {
      status: "pending", amountType: "share", asaasPaymentId: "pay1", payerUid: "uidA",
      cashbackAppliedCents: 1000, cashbackHoldId: holdId,
    });

    await processTournamentRegistrationAsaasNotification(
      db, "pay1",
      {status: "RECEIVED", value: 20, billingType: "PIX",
        externalReference: `tournamentRegistration:${REG_ID}:uidA`},
      processedRefOf(db), makeDeps().deps,
    );

    assert.equal(fake.store.get(REG_PATH)!.paidAmount, 30);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc && node --test lib/asaas-tournament-registration-webhook.test.js`
Expected: FAIL em "saldo aplicado" (bruto 40 em vez de 50; sem `cashbackAppliedReais`), "cashback ligado" (sem lote) e "equipe" (`paidAmount` 20). "cashback desligado" passa.

- [ ] **Step 3: Caixa do torneio registra o saldo aplicado**

Em `functions/src/tournament-wallet.ts`, em `creditTournamentWalletFromRegistration`, acrescentar ao tipo `params`:

```ts
    /** Parte do bruto paga com cashback do atleta (a nexaGO cobre) — só auditoria. */
    cashbackAppliedReais?: number;
```

e, no `tx.set(ledgerRef, {...})`, acrescentar depois de `netReais,`:

```ts
      cashbackAppliedReais: roundMoney(Math.max(0, params.cashbackAppliedReais ?? 0)),
```

- [ ] **Step 4: Webhook usa o bruto e grava a intenção**

Em `functions/src/asaas-tournament-registration-webhook.ts`:

(a) Imports — trocar `import {computePlatformFeeReais, resolveOrganizerTournamentFeePercent} from "./platform-fees";` por `import {computePlatformFeeReais, resolveOrganizerTournamentFeePercent} from "./platform-fees";` (inalterado) e acrescentar:

```ts
import {readCashbackConfig} from "./cashback-config";
import {toMillisOrNull} from "./cashback-rules";
import {
  applyCashbackIntent,
  buildCashbackIntent,
  cashbackIntentFields,
  intentHasWork,
  readCashbackApplied,
  registrationCashbackLabel,
} from "./cashback-intent";
```

(b) Logo depois de `const pendingSnap = await pendingRef.get();` e da linha do `amountType`, acrescentar:

```ts
    // Saldo de cashback usado nesta cobrança: o Asaas recebeu só o dinheiro,
    // mas para o torneio a parcela vale o bruto — a nexaGO cobre a diferença.
    const {appliedCents, holdId} = readCashbackApplied(pendingSnap.data());
    const grossOnline = roundMoney(paidOnline + appliedCents / 100);

    // Comissão negociada no cadastro do organizador; sem cadastro (ou com
    // valor fora da faixa) cai nos 8% padrão. Lida uma vez para as duas fases.
    const organizerFeePercent = organizerId ?
      resolveOrganizerTournamentFeePercent((await db.doc(`organizers/${organizerId}`).get()).data()) :
      0;
```

(c) No bloco `if (phases.confirm)`: no aviso de divergência, trocar as duas ocorrências de `paidOnline` por `grossOnline` (a condição `Math.abs(grossOnline - expectedShare) > 0.02` e a mensagem). Na chamada `resolveTournamentRegistrationCredit`, trocar `shareCreditReais: paidOnline` por `shareCreditReais: grossOnline`. O ramo `duplicate_payer` continua com `paidOnline` (é o dinheiro a estornar).

(d) Logo antes de `const batch = db.batch();` (dentro de `if (phases.confirm)`), acrescentar:

```ts
      const intent = buildCashbackIntent({
        uid: payerUid,
        sourceType: "registration",
        sourceId: registrationId,
        tournamentId,
        arenaId: null,
        label: registrationCashbackLabel(
          typeof regData.tournamentName === "string" && regData.tournamentName.trim() ?
            regData.tournamentName.trim() :
            (typeof tournament?.name === "string" ? tournament.name : "Torneio"),
        ),
        eventAtMs: toMillisOrNull(tournament?.startAt ?? tournament?.startDate) ?? Date.now(),
        cashReais: paidOnline,
        appliedCents,
        feeReais: organizerId ? computePlatformFeeReais(grossOnline, organizerFeePercent) : 0,
        holdId,
        config: await readCashbackConfig(db),
      });
```

(e) No `batch.set(processedRef, {...}, {merge: true})` do bloco de confirmação, acrescentar como última propriedade do objeto:

```ts
        ...(intentHasWork(intent) ? cashbackIntentFields(intent) : {}),
```

(f) Logo depois de `await batch.commit();` do bloco de confirmação, acrescentar:

```ts
      // Captura a reserva de saldo e cria o lote pendente. Nunca lança: o que
      // falhar fica pendente para a varredura de 5 minutos.
      if (intentHasWork(intent)) {
        await applyCashbackIntent(db, processedRef, paymentId, Date.now());
      }
```

(g) No bloco `if (phases.credit && organizerId)`: apagar as duas linhas que leem o organizador (`const organizerSnap = ...` e `const feePercent = ...`) e o comentário acima delas, e trocar a chamada por:

```ts
        await creditTournamentWalletFromRegistration(db, tournamentId, {
          ownerId: organizerId,
          registrationId,
          payerUid,
          paymentId,
          grossReais: grossOnline,
          platformFeeReais: computePlatformFeeReais(grossOnline, organizerFeePercent),
          // A taxa do gateway é sobre o que o Asaas cobrou (o dinheiro), não sobre o bruto.
          gatewayFeeReais: resolveGatewayFeeReais(payment, billingType, paidOnline),
          cashbackAppliedReais: appliedCents / 100,
        });
```

- [ ] **Step 5: Callables reservam o saldo**

Em `functions/src/tournament-registration-pix.ts`:

(a) Imports — acrescentar:

```ts
import {
  cashbackIdempotencyKey,
  cashbackResponseFields,
  releaseCashbackHoldQuietly,
  reserveCashbackForCharge,
} from "./cashback-checkout";
import {readCashbackApplied, registrationCashbackLabel} from "./cashback-intent";
import {attachHoldPayment} from "./athlete-wallet";
```

(b) `type PixPaymentResponse` e `type CardPaymentResponse`: acrescentar a cada um

```ts
  /** Parte paga com cashback (0 sem saldo). `amountReais` segue sendo o preço. */
  cashbackAppliedReais?: number;
  /** Valor efetivamente cobrado no Asaas. */
  chargedReais?: number;
```

(c) `type RegistrationChargeRequest`: acrescentar `useCashback?: boolean;`.

(d) `interface PreparedRegistrationCharge`: acrescentar `tournamentName: string;` e, no `return` de `prepareRegistrationCharge`, acrescentar `tournamentName,`.

(e) `cancelExistingPixPending` — trocar o corpo depois de `if (!pendingSnap.exists) return;` por:

```ts
  const pending = pendingSnap.data() ?? {};
  const asaasId = (pending.asaasPaymentId as string | undefined)?.trim();
  if (asaasId) {
    await deleteAsaasPaymentIfOpen(asaasId);
  }
  await pendingRef.delete();
  // O saldo reservado pela cobrança antiga volta antes de a nova reservar de novo.
  await releaseCashbackHoldQuietly(db, payerUid, readCashbackApplied(pending).holdId, Date.now());
```

(f) Em `createTournamentRegistrationPixPayment`: acrescentar `tournamentName` à desestruturação do `prepareRegistrationCharge`; logo depois dela, acrescentar:

```ts
  const pendingDocRef = pixPendingRef(db, projectId, registrationId, callerUid);
  const cashback = await reserveCashbackForCharge(db, {
    uid: callerUid,
    useCashback: (request.data as RegistrationChargeRequest | undefined)?.useCashback,
    priceReais: chargeAmount,
    sourceType: "registration",
    sourceId: registrationId,
    trackingPath: pendingDocRef.path,
    label: registrationCashbackLabel(tournamentName),
    nowMs: Date.now(),
  });
```

Na chamada `createAsaasPixCharge`, trocar `valueReais: chargeAmount` por `valueReais: cashback.chargeReais` e o `idempotencyKey` por `cashbackIdempotencyKey(\`tournament-reg-pix-${registrationId}-${callerUid}\`, cashback.holdId)`. Como primeira linha do `catch (e) {` dessa chamada, acrescentar `await releaseCashbackHoldQuietly(db, callerUid, cashback.holdId, Date.now());`. Depois do `try/catch`, antes do `set` do pendente, acrescentar:

```ts
  if (cashback.holdId) {
    await attachHoldPayment(db, callerUid, cashback.holdId, charge.paymentId);
  }
```

Trocar `await pixPendingRef(db, projectId, registrationId, callerUid).set({` por `await pendingDocRef.set({` e acrescentar ao objeto, antes de `updatedAt`:

```ts
    cashbackAppliedCents: cashback.appliedCents,
    cashbackHoldId: cashback.holdId,
```

No `return`, acrescentar `...cashbackResponseFields(cashback),` depois de `amountReais: chargeAmount,`.

(g) Em `createTournamentRegistrationCardPayment`: as mesmas mudanças de (f), com `createAsaasCardCharge` e a chave base `\`tournament-reg-card-${registrationId}-${callerUid}\``.

- [ ] **Step 6: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc && node --test lib/asaas-tournament-registration-webhook.test.js`
Expected: PASS, `# fail 0` (testes antigos inclusive). Depois `npm test` — `# fail 0`.

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add functions/src/tournament-registration-pix.ts functions/src/asaas-tournament-registration-webhook.ts functions/src/asaas-tournament-registration-webhook.test.ts functions/src/tournament-wallet.ts && git commit -m "feat(cashback): inscrição usa saldo na cobrança e o webhook credita o bruto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Reserva — saldo na cobrança, bruto no webhook, cotas e divisão

**Files:**
- Modify: `functions/src/arena-booking-pix.ts` (`createArenaBookingPixPayment`)
- Modify: `functions/src/asaas-arena-booking-webhook.ts` (`processArenaBookingAsaasNotification` ramo pago; `processArenaBookingShareAsaasNotification` ramo pago)
- Modify: `functions/src/arena-wallet.ts` (`creditArenaWalletFromBooking`)
- Modify: `functions/src/arena-booking-split.ts` (`splitArenaBookingPaymentCore`)
- Test: `functions/src/asaas-arena-booking-webhook.test.ts`, `functions/src/arena-booking-split.test.ts`

**Interfaces:**
- Consumes: Task 4 inteira; `bookingEventAtMs` (Task 1); `readCashbackConfig` (Task 1); `holdCashback` (Task 2, só em teste).
- Produces: `arenaBookings/{id}` ganha `cashbackAppliedCents`, `cashbackHoldId` (na cobrança) e `cashbackAppliedReais` (no pagamento); `amountPaidOnlineReais` passa a incluir o saldo; `asaasPaidAmount` segue sendo o dinheiro; `creditArenaWalletFromBooking(db, arenaId, bookingId, grossReais, platformFeeReais, cashbackAppliedReais = 0)`; resposta da callable ganha `cashbackAppliedReais` e `chargedReais`.

- [ ] **Step 1: Escrever os testes que falham**

Em `functions/src/asaas-arena-booking-webhook.test.ts`, acrescentar aos imports:

```ts
import {Timestamp} from "firebase-admin/firestore";
import {holdCashback} from "./athlete-wallet";
import {processArenaBookingShareAsaasNotification} from "./asaas-arena-booking-webhook";
```

(se `processArenaBookingAsaasNotification` já é importado da mesma origem, juntar no mesmo import). Acrescentar ao fim do arquivo:

```ts
describe("processArenaBookingAsaasNotification — cashback", () => {
  const NOW_MS = Date.now();

  function seedSpendableLot(fake: FakeFirestore, cents: number): void {
    fake.seedDoc("athleteWallets/owner1/lots/old", {
      uid: "owner1", sourceType: "booking", sourceId: "b0", tournamentId: null, arenaId: "a1",
      label: "Reserva", earnedCents: cents, remainingCents: cents, status: "available",
      eventAt: Timestamp.fromMillis(NOW_MS - 1000), releasedAt: Timestamp.fromMillis(NOW_MS - 1000),
      expiresAt: Timestamp.fromMillis(NOW_MS + 90 * 86_400_000), expiryWarnedAt: null,
      createdAt: Timestamp.fromMillis(NOW_MS - 1000),
    });
  }

  function arenaLedger(fake: FakeFirestore): Record<string, unknown>[] {
    return [...fake.store.entries()]
      .filter(([path]) => path.startsWith("arenaWallets/arena1/ledger/"))
      .map(([, data]) => data);
  }

  it("saldo aplicado conta como pago online: reserva paga, arena recebe o bruto", async () => {
    const {fake, db} = makeDb();
    seedPendingBooking(fake, {date: "2026-10-12", startTime: "19:30", arenaName: "Arena Sol"});
    seedSpendableLot(fake, 3000);
    const {holdId} = await holdCashback(db, {
      uid: "owner1", maxCents: 2000, sourceType: "booking", sourceId: "b1",
      trackingPath: BOOKING_PATH, label: "Reserva", nowMs: NOW_MS,
    });
    fake.seedDoc(BOOKING_PATH, {
      ...fake.store.get(BOOKING_PATH)!, cashbackAppliedCents: 2000, cashbackHoldId: holdId,
    });

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("RECEIVED", 80), processedRefOf(db),
    );

    const booking = fake.store.get(BOOKING_PATH)!;
    assert.equal(booking.paymentStatus, "paid");
    assert.equal(booking.amountPaidOnlineReais, 100);
    assert.equal(booking.amountDueOnsiteReais, 0);
    assert.equal(booking.asaasPaidAmount, 80);
    assert.equal(booking.cashbackAppliedReais, 20);
    const credit = arenaLedger(fake).find((e) => e.type === "credit")!;
    assert.equal(credit.grossReais, 100);
    assert.equal(credit.cashbackAppliedReais, 20);
    assert.equal(fake.store.get(`athleteWallets/owner1/holds/${holdId}`)!.status, "captured");
  });

  it("cashback ligado: lote pendente com a data e hora da reserva", async () => {
    const {fake, db} = makeDb();
    seedPendingBooking(fake, {date: "2026-10-12", startTime: "19:30", arenaName: "Arena Sol"});
    fake.seedDoc("appConfig/cashback", {enabled: true});

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("RECEIVED", 100), processedRefOf(db),
    );

    const lot = fake.store.get("athleteWallets/owner1/lots/orig1")!;
    // Taxa sem plano = 8% de R$ 100 = R$ 8,00 → teto R$ 4,00; 2% = R$ 2,00.
    assert.equal(lot.earnedCents, 200);
    assert.equal(lot.label, "Reserva · Arena Sol · 12/10");
    assert.equal((lot.eventAt as Timestamp).toMillis(), Date.UTC(2026, 9, 12, 22, 30, 0));
  });

  it("cota de amigo paga ganha cashback para quem pagou a cota", async () => {
    const {fake, db} = makeDb();
    seedSplitBooking(fake, {date: "2026-10-12", startTime: "19:30", arenaName: "Arena Sol"});
    fake.seedDoc("appConfig/cashback", {enabled: true});
    fake.seedDoc(`${BOOKING_PATH}/paymentShares/s1`, {
      payerAthleteId: "friend1", amountReais: 50, status: "pending", asaasPaymentId: "payS1",
    });

    await processArenaBookingShareAsaasNotification(
      db, "payS1",
      {status: "RECEIVED", value: 50, externalReference: "arenaBookingShare:b1:s1"},
      db.doc("artifacts/p/public/data/asaas_processed_payments/payS1") as DocumentReference,
    );

    const lot = fake.store.get("athleteWallets/friend1/lots/payS1")!;
    assert.equal(lot.status, "pending");
    assert.equal(lot.earnedCents, 100);
  });
});
```

Em `functions/src/arena-booking-split.test.ts`, acrescentar aos imports `import {holdCashback} from "./athlete-wallet";` e, dentro de `describe("splitArenaBookingPaymentCore", ...)`, acrescentar:

```ts
  it("devolve o saldo reservado pelo PIX da reserva inteira ao dividir", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("athleteWallets/owner1/lots/old", {
      uid: "owner1", sourceType: "booking", sourceId: "b0", tournamentId: null, arenaId: "a1",
      label: "Reserva", earnedCents: 2000, remainingCents: 2000, status: "available",
      eventAt: Timestamp.fromMillis(now - 1000), releasedAt: Timestamp.fromMillis(now - 1000),
      expiresAt: Timestamp.fromMillis(now + 90 * 86_400_000), expiryWarnedAt: null,
      createdAt: Timestamp.fromMillis(now - 1000),
    });
    const {holdId} = await holdCashback(db(fake), {
      uid: "owner1", maxCents: 1500, sourceType: "booking", sourceId: "b1",
      trackingPath: "arenaBookings/b1", label: "Reserva", nowMs: now,
    });
    seedPendingPixBooking(fake, "b1", {
      asaasPaymentId: "orig1", cashbackAppliedCents: 1500, cashbackHoldId: holdId,
    });

    await splitArenaBookingPaymentCore(
      db(fake), "owner1", "Dono",
      {bookingId: "b1", shares: [{athleteId: "a", amountReais: 40}, {athleteId: "b", amountReais: 60}]},
      stubCreateCharge(), stubOriginalCharge({status: "PENDING"}).ops, now,
    );

    assert.equal(fake.store.get(`athleteWallets/owner1/holds/${holdId}`)!.status, "released");
    assert.equal(fake.store.get("athleteWallets/owner1/lots/old")!.remainingCents, 2000);
  });
```

(Os helpers `seedPendingBooking`/`seedSplitBooking` do teste do webhook já aceitam `overrides`; se `seedSplitBooking` não aceitar, acrescentar o parâmetro `overrides: DocData = {}` espalhado no fim do objeto, como `seedPendingBooking`.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc && node --test lib/asaas-arena-booking-webhook.test.js lib/arena-booking-split.test.js`
Expected: FAIL nos 3 testes novos do webhook e no novo da divisão.

- [ ] **Step 3: Carteira da arena registra o saldo aplicado**

Em `functions/src/arena-wallet.ts`, em `creditArenaWalletFromBooking`, acrescentar o parâmetro `cashbackAppliedReais = 0,` depois de `platformFeeReais: number,` e, no `tx.set(ledgerRef, {...})`, depois de `netReais,`:

```ts
      cashbackAppliedReais: roundMoney(Math.max(0, cashbackAppliedReais)),
```

- [ ] **Step 4: Webhook da reserva**

Em `functions/src/asaas-arena-booking-webhook.ts`:

(a) Imports — acrescentar:

```ts
import {readCashbackConfig} from "./cashback-config";
import {bookingEventAtMs} from "./cashback-rules";
import {
  applyCashbackIntent,
  bookingCashbackLabel,
  buildCashbackIntent,
  cashbackIntentFields,
  intentHasWork,
  readCashbackApplied,
} from "./cashback-intent";
```

(b) No ramo `if (ASAAS_PAID_STATUSES.has(status))` de `processArenaBookingAsaasNotification`, trocar `const paidOnline = roundMoney(amount);` por:

```ts
    // Para a arena, o saldo de cashback é dinheiro recebido online (a nexaGO
    // cobre): tudo que lê `amountPaidOnlineReais` segue certo sem mudar.
    const {appliedCents, holdId} = readCashbackApplied(booking);
    const cashPaid = roundMoney(amount);
    const paidOnline = roundMoney(cashPaid + appliedCents / 100);
```

No `batch.update(bookingRef, {...})`, trocar `asaasPaidAmount: paidOnline,` por `asaasPaidAmount: cashPaid,` e acrescentar `cashbackAppliedReais: appliedCents / 100,`.

Logo antes de `const batch = db.batch();` acrescentar:

```ts
    const intent = buildCashbackIntent({
      uid: typeof booking.athleteId === "string" ? booking.athleteId : "",
      sourceType: "booking",
      sourceId: bookingId,
      tournamentId: null,
      arenaId: arenaId ?? null,
      label: bookingCashbackLabel(String(booking.arenaName ?? "Arena"), booking.date),
      eventAtMs: bookingEventAtMs(booking.date, booking.startTime) ?? Date.now(),
      cashReais: cashPaid,
      appliedCents,
      feeReais: platformFee,
      holdId,
      config: await readCashbackConfig(db),
    });
```

No `batch.set(processedRef, {...})` acrescentar `...(intentHasWork(intent) ? cashbackIntentFields(intent) : {}),`. Logo depois de `await batch.commit();` acrescentar:

```ts
    if (intentHasWork(intent)) {
      await applyCashbackIntent(db, processedRef, paymentId, Date.now());
    }
```

Na chamada `creditArenaWalletFromBooking(db, arenaId, bookingId, paidOnline, platformFee)` acrescentar o 6º argumento `appliedCents / 100`.

(c) No ramo pago de `processArenaBookingShareAsaasNotification`, logo antes de `const batch = db.batch();`:

```ts
    // Cota de amigo: ganha cashback sobre o que pagou; não usa saldo na v1.
    const intent = buildCashbackIntent({
      uid: typeof share.payerAthleteId === "string" ? share.payerAthleteId : "",
      sourceType: "booking",
      sourceId: bookingId,
      tournamentId: null,
      arenaId: arenaId ?? null,
      label: bookingCashbackLabel(String(booking.arenaName ?? "Arena"), booking.date),
      eventAtMs: bookingEventAtMs(booking.date, booking.startTime) ?? Date.now(),
      cashReais: paidOnline,
      appliedCents: 0,
      feeReais: platformFee,
      holdId: null,
      config: await readCashbackConfig(db),
    });
```

No `batch.set(processedRef, {...})` desse ramo acrescentar `...(intentHasWork(intent) ? cashbackIntentFields(intent) : {}),` e, depois de `await batch.commit();`, o mesmo bloco `if (intentHasWork(intent)) { await applyCashbackIntent(...); }`.

- [ ] **Step 5: Callable da cobrança da reserva**

Em `functions/src/arena-booking-pix.ts`:

(a) Imports — acrescentar:

```ts
import {
  cashbackIdempotencyKey,
  cashbackResponseFields,
  releaseCashbackHoldQuietly,
  reserveCashbackForCharge,
} from "./cashback-checkout";
import {bookingCashbackLabel, readCashbackApplied} from "./cashback-intent";
import {attachHoldPayment} from "./athlete-wallet";
```

(b) `type PixPaymentResponse` deste arquivo: acrescentar `cashbackAppliedReais?: number;` e `chargedReais?: number;`. No tipo de `data` da callable, acrescentar `useCashback?: boolean;`.

(c) Logo depois de `if (existingAsaasId) { await deleteAsaasPaymentIfOpen(existingAsaasId); }`:

```ts
  // PIX gerado de novo: o saldo reservado pela cobrança antiga volta primeiro.
  await releaseCashbackHoldQuietly(db, callerUid, readCashbackApplied(booking).holdId, Date.now());
```

(d) Logo antes de `let charge;`:

```ts
  const cashback = await reserveCashbackForCharge(db, {
    uid: callerUid,
    useCashback: data.useCashback,
    priceReais: amountToPayNow,
    sourceType: "booking",
    sourceId: bookingId,
    trackingPath: bookingRef.path,
    label: bookingCashbackLabel(arenaName, dateStr),
    nowMs: Date.now(),
  });
```

Na chamada `createAsaasPixCharge`: `valueReais: cashback.chargeReais,` e `idempotencyKey: cashbackIdempotencyKey(\`arena-booking-pix-${bookingId}\`, cashback.holdId),`. Primeira linha do `catch (e) {`: `await releaseCashbackHoldQuietly(db, callerUid, cashback.holdId, Date.now());`. Depois do `try/catch`:

```ts
  if (cashback.holdId) {
    await attachHoldPayment(db, callerUid, cashback.holdId, charge.paymentId);
  }
```

No `bookingRef.update({...})` acrescentar `cashbackAppliedCents: cashback.appliedCents,` e `cashbackHoldId: cashback.holdId,`. No `return` acrescentar `...cashbackResponseFields(cashback),`.

- [ ] **Step 6: Divisão devolve o saldo do PIX da reserva inteira**

Em `functions/src/arena-booking-split.ts`, acrescentar os imports `import {releaseCashbackHoldQuietly} from "./cashback-checkout";` e `import {readCashbackApplied} from "./cashback-intent";`. Em `splitArenaBookingPaymentCore`, logo depois do bloco que trata o retorno `false` da transação final (o `if (!stillPendingPayment) { ... }`) e antes do `return {bookingId, shareIds, notifications};`, acrescentar:

```ts
  // As cotas não aceitam saldo: o que o PIX da reserva inteira tinha reservado volta.
  await releaseCashbackHoldQuietly(
    db,
    callerUid,
    readCashbackApplied(booking).holdId,
    nowMs,
  );
```

- [ ] **Step 7: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc && node --test lib/asaas-arena-booking-webhook.test.js lib/arena-booking-split.test.js`
Expected: PASS, `# fail 0`. Depois `npm test` — `# fail 0`.

- [ ] **Step 8: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add functions/src/arena-booking-pix.ts functions/src/asaas-arena-booking-webhook.ts functions/src/asaas-arena-booking-webhook.test.ts functions/src/arena-wallet.ts functions/src/arena-booking-split.ts functions/src/arena-booking-split.test.ts && git commit -m "feat(cashback): reserva usa saldo na cobrança, webhook credita o bruto, cotas ganham cashback

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Clubinho — saldo na cobrança e bruto no webhook

**Files:**
- Modify: `functions/src/arena-club-join.ts` (`JoinInput`, `joinArenaClubSession`)
- Modify: `functions/src/asaas-arena-club-webhook.ts`
- Modify: `functions/src/arena-wallet.ts` (`creditArenaWalletFromClubPayment`)
- Test: `functions/src/asaas-arena-club-webhook.test.ts`

**Interfaces:**
- Consumes: Task 4 inteira; `toMillisOrNull`, `readCashbackConfig` (Task 1); `holdCashback` (só em teste).
- Produces: `clubParticipants/{uid}` ganha `cashbackAppliedCents`, `cashbackHoldId`; `amountReais`, `platformFeeReais` e `netReais` do participante passam a ser sobre o bruto; `creditArenaWalletFromClubPayment` aceita `cashbackAppliedReais?: number` no `input`; resposta do join ganha `cashbackAppliedReais` e `chargedReais`.

- [ ] **Step 1: Escrever os testes que falham**

Em `functions/src/asaas-arena-club-webhook.test.ts`, acrescentar aos imports `import {Timestamp} from "firebase-admin/firestore";` e `import {holdCashback} from "./athlete-wallet";`, e ao fim do arquivo:

```ts
describe("processArenaClubSessionAsaasNotification — cashback", () => {
  const NOW_MS = Date.now();

  it("saldo aplicado: participante e arena ficam com o bruto; reserva capturada", async () => {
    const {fake, db} = makeDb();
    seedSession(fake, {startAt: Timestamp.fromMillis(Date.UTC(2026, 6, 24, 18, 0, 0))});
    fake.seedDoc("athleteWallets/uid1/lots/old", {
      uid: "uid1", sourceType: "booking", sourceId: "b0", tournamentId: null, arenaId: "a1",
      label: "Reserva", earnedCents: 2000, remainingCents: 2000, status: "available",
      eventAt: Timestamp.fromMillis(NOW_MS - 1000), releasedAt: Timestamp.fromMillis(NOW_MS - 1000),
      expiresAt: Timestamp.fromMillis(NOW_MS + 90 * 86_400_000), expiryWarnedAt: null,
      createdAt: Timestamp.fromMillis(NOW_MS - 1000),
    });
    const {holdId} = await holdCashback(db, {
      uid: "uid1", maxCents: 1000, sourceType: "club", sourceId: "club_c1_2026-07-24",
      trackingPath: PARTICIPANT_PATH, label: "Clubinho", nowMs: NOW_MS,
    });
    seedParticipant(fake, {cashbackAppliedCents: 1000, cashbackHoldId: holdId});

    await processArenaClubSessionAsaasNotification(
      db, "pay1", {...paidPayment, value: 5}, processedRefOf(db), makeDeps().deps,
    );

    const participant = fake.store.get(PARTICIPANT_PATH)!;
    assert.equal(participant.status, "confirmed");
    assert.equal(participant.amountReais, 15);
    assert.equal(participant.platformFeeReais, 0.75);
    assert.equal(participant.netReais, 14.25);
    assert.equal(fake.store.get(`athleteWallets/uid1/holds/${holdId}`)!.status, "captured");
    assert.equal(fake.store.get(PROCESSED_PATH)!.cashbackStatus, "done");
  });

  it("cashback ligado: lote pendente até a sessão começar", async () => {
    const {fake, db} = makeDb();
    const startMs = Date.UTC(2026, 6, 24, 18, 0, 0);
    seedSession(fake, {startAt: Timestamp.fromMillis(startMs)});
    seedParticipant(fake);
    fake.seedDoc("appConfig/cashback", {enabled: true});

    await processArenaClubSessionAsaasNotification(
      db, "pay1", paidPayment, processedRefOf(db), makeDeps().deps,
    );

    const lot = fake.store.get("athleteWallets/uid1/lots/pay1")!;
    // Taxa do clubinho = 5% de R$ 15 = R$ 0,75 → teto R$ 0,37; 2% = R$ 0,30.
    assert.equal(lot.earnedCents, 30);
    assert.equal(lot.sourceType, "club");
    assert.equal(lot.label, "Clubinho · Clubinho de sexta");
    assert.equal((lot.eventAt as Timestamp).toMillis(), startMs);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc && node --test lib/asaas-arena-club-webhook.test.js`
Expected: FAIL nos 2 testes novos.

- [ ] **Step 3: Carteira da arena (clubinho) registra o saldo aplicado**

Em `functions/src/arena-wallet.ts`, em `creditArenaWalletFromClubPayment`, acrescentar ao tipo do `input` `cashbackAppliedReais?: number;` e, no ledger, depois de `netReais,`:

```ts
      cashbackAppliedReais: roundMoney(Math.max(0, input.cashbackAppliedReais ?? 0)),
```

- [ ] **Step 4: Webhook do clubinho**

Em `functions/src/asaas-arena-club-webhook.ts`:

(a) Imports — acrescentar:

```ts
import {readCashbackConfig} from "./cashback-config";
import {toMillisOrNull} from "./cashback-rules";
import {
  applyCashbackIntent,
  buildCashbackIntent,
  cashbackIntentFields,
  clubCashbackLabel,
  intentHasWork,
  readCashbackApplied,
} from "./cashback-intent";
```

(b) `markProcessed` passa a aceitar campos extras:

```ts
  const markProcessed = (outcome: string, extra: Record<string, unknown> = {}) =>
    processedRef.set({
      kind: "arenaClubSession",
      sessionId,
      participantId: athleteUid,
      outcome,
      paymentStatus: status,
      processedAt: FieldValue.serverTimestamp(),
      ...extra,
    });
```

(c) No ramo pago, trocar o cálculo de `paidReais` por:

```ts
    // Saldo de cashback usado na vaga: para a arena vale como dinheiro recebido
    // (a nexaGO cobre). O Asaas só recebeu `cashPaid`.
    const {appliedCents, holdId} = readCashbackApplied(
      (await participantRef.get()).data(),
    );
    const cashPaid = roundMoney(Number(payment.value) || 0);
    if (cashPaid <= 0) {
      logger.warn(`Asaas clubinho ${sessionId}/${athleteUid}: valor inválido`);
      return;
    }
    const paidReais = roundMoney(cashPaid + appliedCents / 100);
```

(o resto do ramo segue usando `paidReais` — agora o bruto).

(d) No `if (outcome === "approved") {`: na chamada `creditArenaWalletFromClubPayment`, acrescentar `cashbackAppliedReais: appliedCents / 100,` ao `input`. Trocar `await markProcessed("approved");` por:

```ts
      const intent = buildCashbackIntent({
        uid: athleteUid,
        sourceType: "club",
        sourceId: sessionId,
        tournamentId: null,
        arenaId: arenaId || null,
        label: clubCashbackLabel(String(sessionData["clubName"] ?? "Clubinho")),
        eventAtMs: toMillisOrNull(sessionData["startAt"]) ?? Date.now(),
        cashReais: cashPaid,
        appliedCents,
        feeReais: platformFeeReais,
        holdId,
        config: await readCashbackConfig(db),
      });
      await markProcessed(
        "approved",
        intentHasWork(intent) ? cashbackIntentFields(intent) : {},
      );
      if (intentHasWork(intent)) {
        await applyCashbackIntent(db, processedRef, paymentId, Date.now());
      }
```

- [ ] **Step 5: Callable de entrada no clubinho**

Em `functions/src/arena-club-join.ts`:

(a) Imports — acrescentar:

```ts
import {
  cashbackResponseFields,
  releaseCashbackHoldQuietly,
  reserveCashbackForCharge,
  type CashbackReservation,
} from "./cashback-checkout";
import {clubCashbackLabel, readCashbackApplied} from "./cashback-intent";
import {attachHoldPayment} from "./athlete-wallet";
```

(b) `interface JoinInput`: acrescentar `useCashback?: boolean;`.

(c) No `return` da transação do caminho PIX (o que devolve `{session, previousAsaasPaymentId: ...}`), acrescentar `previousHoldId: readCashbackApplied(existing ?? undefined).holdId,` e trocar a desestruturação seguinte por `const {session, previousAsaasPaymentId, previousHoldId} = txResult;`.

(d) Logo depois da desestruturação, acrescentar:

```ts
  let cashback: CashbackReservation = {
    holdId: null,
    appliedCents: 0,
    chargeReais: roundMoney(session.priceReais),
  };
```

No fim do corpo de `rollbackHold` (depois do `try/catch` existente), acrescentar `await releaseCashbackHoldQuietly(db, uid, cashback.holdId, Date.now());`.

(e) Dentro do `try`, logo depois de `if (previousAsaasPaymentId) { await deleteAsaasPaymentIfOpen(previousAsaasPaymentId); }`:

```ts
    // Entrada refeita: o saldo reservado pela cobrança anterior volta primeiro.
    await releaseCashbackHoldQuietly(db, uid, previousHoldId, Date.now());
```

Logo antes de `const charge = await createAsaasPixCharge({`:

```ts
    cashback = await reserveCashbackForCharge(db, {
      uid,
      useCashback: input.useCashback,
      priceReais: session.priceReais,
      sourceType: "club",
      sourceId: sessionId,
      trackingPath: participantRef.path,
      label: clubCashbackLabel(session.clubName),
      nowMs: Date.now(),
    });
```

Na chamada, trocar `valueReais: roundMoney(session.priceReais),` por `valueReais: cashback.chargeReais,` (a chave de idempotência já é única por chamada). Depois da chamada:

```ts
    if (cashback.holdId) {
      await attachHoldPayment(db, uid, cashback.holdId, charge.paymentId);
    }
```

No `participantRef.set({...}, {merge: true})` seguinte acrescentar `cashbackAppliedCents: cashback.appliedCents,` e `cashbackHoldId: cashback.holdId,`. No `return` acrescentar `...cashbackResponseFields(cashback),`.

- [ ] **Step 6: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc && node --test lib/asaas-arena-club-webhook.test.js`
Expected: PASS, `# fail 0`. Depois `npm test` — `# fail 0`.

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add functions/src/arena-club-join.ts functions/src/asaas-arena-club-webhook.ts functions/src/asaas-arena-club-webhook.test.ts functions/src/arena-wallet.ts && git commit -m "feat(cashback): clubinho usa saldo na cobrança e o webhook credita o bruto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: Varredura de 5 minutos — reservas abertas e intenções pendentes

**Files:**
- Create: `functions/src/cashback-hold-sweeper.ts`
- Create: `functions/src/cashback-hold-sweeper.test.ts`
- Modify: `functions/src/index.ts` (export)

**Interfaces:**
- Consumes: `HoldDoc` (Task 2); `releaseHold`, `captureHold` (Task 2); `applyCashbackIntent`, `MAX_INTENT_ATTEMPTS`, `CashbackIntent` (Task 4); `getFirebaseProjectId` de `./firebase-paths`.
- Produces: `type HoldAction = "release" | "capture" | "keep"`; `decideHoldAction({sourceType, holdPaymentId, holdCreatedAtMs, tracking, nowMs})`; `runCashbackHoldSweep(db, projectId, nowMs)` → `{released, captured, kept, intentsDone, intentsFailed, intentsGivenUp}`; função agendada `expireCashbackHolds` (a cada 5 min).

- [ ] **Step 1: Escrever os testes que falham**

Criar `functions/src/cashback-hold-sweeper.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {attachHoldPayment, holdCashback} from "./athlete-wallet";
import {cashbackIntentFields, buildCashbackIntent} from "./cashback-intent";
import {DEFAULT_CASHBACK_CONFIG} from "./cashback-config";
import {decideHoldAction, runCashbackHoldSweep} from "./cashback-hold-sweeper";

const NOW = Date.UTC(2026, 9, 1, 13, 0, 0);
const MIN = 60 * 1000;
const UID = "ath1";
const W = `athleteWallets/${UID}`;
const PROCESSED = "artifacts/p/public/data/asaas_processed_payments";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

describe("decideHoldAction", () => {
  const base = {holdPaymentId: "pay1", holdCreatedAtMs: NOW - 10 * MIN, nowMs: NOW};

  it("reserva sem cobrança ligada: espera 15 min e depois devolve", () => {
    assert.equal(decideHoldAction({...base, sourceType: "booking", holdPaymentId: null, holdCreatedAtMs: NOW - 5 * MIN, tracking: null}), "keep");
    assert.equal(decideHoldAction({...base, sourceType: "booking", holdPaymentId: null, holdCreatedAtMs: NOW - 16 * MIN, tracking: null}), "release");
  });

  it("registro sumido ou de outra cobrança devolve", () => {
    assert.equal(decideHoldAction({...base, sourceType: "registration", tracking: null}), "release");
    assert.equal(decideHoldAction({...base, sourceType: "booking", tracking: {asaasPaymentId: "outra", status: "pending_payment"}}), "release");
    assert.equal(decideHoldAction({...base, sourceType: "booking", tracking: {asaasPaymentId: null, status: "confirmed", paymentStatus: "split_pending"}}), "release");
  });

  it("inscrição: pago captura, pendente espera, cancelado devolve", () => {
    const t = (status: string) => ({asaasPaymentId: "pay1", status});
    assert.equal(decideHoldAction({...base, sourceType: "registration", tracking: t("paid")}), "capture");
    assert.equal(decideHoldAction({...base, sourceType: "registration", tracking: t("pending")}), "keep");
    assert.equal(decideHoldAction({...base, sourceType: "registration", tracking: t("cancelled")}), "release");
    assert.equal(decideHoldAction({...base, sourceType: "registration", tracking: t("expired")}), "release");
  });

  it("reserva: paga ou parcial captura, aguardando espera, cancelada devolve", () => {
    const t = (status: string, paymentStatus: string) => ({asaasPaymentId: "pay1", status, paymentStatus});
    assert.equal(decideHoldAction({...base, sourceType: "booking", tracking: t("confirmed", "paid")}), "capture");
    assert.equal(decideHoldAction({...base, sourceType: "booking", tracking: t("confirmed", "partial")}), "capture");
    assert.equal(decideHoldAction({...base, sourceType: "booking", tracking: t("pending_payment", "pending")}), "keep");
    assert.equal(decideHoldAction({...base, sourceType: "booking", tracking: t("cancelled", "expired")}), "release");
  });

  it("clubinho: confirmado captura, aguardando espera, saiu devolve", () => {
    const t = (status: string) => ({asaasPaymentId: "pay1", status});
    assert.equal(decideHoldAction({...base, sourceType: "club", tracking: t("confirmed")}), "capture");
    assert.equal(decideHoldAction({...base, sourceType: "club", tracking: t("pending_payment")}), "keep");
    assert.equal(decideHoldAction({...base, sourceType: "club", tracking: t("expired")}), "release");
    assert.equal(decideHoldAction({...base, sourceType: "club", tracking: t("canceled_by_arena_refunded")}), "release");
  });
});

describe("runCashbackHoldSweep", () => {
  async function seedHold(
    fake: FakeFirestore,
    db: Firestore,
    trackingPath: string,
    sourceType: "registration" | "booking" | "club",
    createdAtMs: number,
    paymentId: string | null,
  ): Promise<string> {
    const {holdId} = await holdCashback(db, {
      uid: UID, maxCents: 100, sourceType, sourceId: "x",
      trackingPath, label: "Teste", nowMs: createdAtMs,
    });
    if (paymentId) await attachHoldPayment(db, UID, holdId!, paymentId);
    return holdId!;
  }

  it("devolve as mortas, captura as pagas, mantém as abertas e ignora as recém-criadas", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc(`${W}/lots/l1`, {
      uid: UID, sourceType: "booking", sourceId: "b0", tournamentId: null, arenaId: "a1",
      label: "Reserva", earnedCents: 1000, remainingCents: 1000, status: "available",
      eventAt: Timestamp.fromMillis(NOW - 1e9), releasedAt: Timestamp.fromMillis(NOW - 1e9),
      expiresAt: Timestamp.fromMillis(NOW + 1e10), expiryWarnedAt: null,
      createdAt: Timestamp.fromMillis(NOW - 1e9),
    });
    fake.seedDoc("t/dead", {asaasPaymentId: "payDead", status: "cancelled"});
    fake.seedDoc("arenaBookings/paid", {asaasPaymentId: "payPaid", status: "confirmed", paymentStatus: "paid"});
    fake.seedDoc("arenaClubSessions/s/clubParticipants/ath1", {asaasPaymentId: "payOpen", status: "pending_payment"});
    fake.seedDoc("t/young", {asaasPaymentId: "payYoung", status: "cancelled"});

    const dead = await seedHold(fake, db, "t/dead", "registration", NOW - 10 * MIN, "payDead");
    const paid = await seedHold(fake, db, "arenaBookings/paid", "booking", NOW - 10 * MIN, "payPaid");
    const open = await seedHold(fake, db, "arenaClubSessions/s/clubParticipants/ath1", "club", NOW - 10 * MIN, "payOpen");
    const young = await seedHold(fake, db, "t/young", "registration", NOW - 1 * MIN, "payYoung");

    const stats = await runCashbackHoldSweep(db, "p", NOW);

    assert.equal(fake.store.get(`${W}/holds/${dead}`)!.status, "released");
    assert.equal(fake.store.get(`${W}/holds/${paid}`)!.status, "captured");
    assert.equal(fake.store.get(`${W}/holds/${open}`)!.status, "open");
    assert.equal(fake.store.get(`${W}/holds/${young}`)!.status, "open");
    assert.equal(stats.released, 1);
    assert.equal(stats.captured, 1);
    assert.equal(stats.kept, 1);
  });

  it("reaplica intenção pendente e desiste depois do limite", async () => {
    const {fake, db} = makeDb();
    const intent = buildCashbackIntent({
      uid: UID, sourceType: "booking", sourceId: "b1", tournamentId: null, arenaId: "a1",
      label: "Reserva", eventAtMs: NOW + 1e9, cashReais: 100, appliedCents: 0, feeReais: 8,
      holdId: null, config: {...DEFAULT_CASHBACK_CONFIG, enabled: true},
    });
    fake.seedDoc(`${PROCESSED}/payOk`, {outcome: "approved", ...cashbackIntentFields(intent)});
    fake.seedDoc(`${PROCESSED}/payStuck`, {
      outcome: "approved",
      ...cashbackIntentFields({...intent, attempts: 10, lastError: "boom"}),
    });

    const stats = await runCashbackHoldSweep(db, "p", NOW);

    assert.equal(fake.store.get(`${PROCESSED}/payOk`)!.cashbackStatus, "done");
    assert.equal(fake.store.get(`${W}/lots/payOk`)!.status, "pending");
    assert.equal(fake.store.get(`${PROCESSED}/payStuck`)!.cashbackStatus, "failed");
    assert.equal(stats.intentsDone, 1);
    assert.equal(stats.intentsGivenUp, 1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc`
Expected: FAIL — `Cannot find module './cashback-hold-sweeper'`.

- [ ] **Step 3: Implementar**

Criar `functions/src/cashback-hold-sweeper.ts`:

```ts
/**
 * Varredura de 5 minutos do cashback.
 *
 * A. Reservas de saldo abertas: confere o registro da cobrança e devolve (a
 *    cobrança morreu) ou captura (pagou e o webhook se perdeu). É UMA porta
 *    para todas as formas de uma cobrança morrer — expiração, cancelamento
 *    pelo atleta, remoção pelo organizador, status negativo do Asaas, saída do
 *    clubinho, PIX gerado de novo. Ligar código em cada porta é o que deixa
 *    passar a próxima.
 * B. Intenções de cashback pendentes: reaplica; depois de
 *    `MAX_INTENT_ATTEMPTS`, desiste e loga.
 */
import {onSchedule} from "firebase-functions/v2/scheduler";
import {
  getFirestore,
  Timestamp,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import type {CashbackSourceType} from "./cashback-rules";
import type {HoldDoc} from "./athlete-wallet-state";
import {captureHold, releaseHold} from "./athlete-wallet";
import {applyCashbackIntent, MAX_INTENT_ATTEMPTS, type CashbackIntent} from "./cashback-intent";
import {getFirebaseProjectId} from "./firebase-paths";

/** Reserva recém-criada pode estar no meio da callable (cobrança ainda sendo criada). */
const HOLD_GRACE_MS = 2 * 60 * 1000;
/** Reserva que nunca ganhou cobrança: a callable caiu entre reservar e cobrar. */
const UNATTACHED_HOLD_TTL_MS = 15 * 60 * 1000;

export type HoldAction = "release" | "capture" | "keep";

export function decideHoldAction(p: {
  sourceType: CashbackSourceType;
  holdPaymentId: string | null;
  holdCreatedAtMs: number;
  tracking: Record<string, unknown> | null;
  nowMs: number;
}): HoldAction {
  if (!p.holdPaymentId) {
    return p.nowMs - p.holdCreatedAtMs > UNATTACHED_HOLD_TTL_MS ? "release" : "keep";
  }
  const t = p.tracking;
  if (!t) return "release";
  const trackingPaymentId = typeof t.asaasPaymentId === "string" ? t.asaasPaymentId.trim() : "";
  if (trackingPaymentId !== p.holdPaymentId) return "release";
  const status = String(t.status ?? "").toLowerCase();
  if (p.sourceType === "registration") {
    if (status === "paid") return "capture";
    return status === "pending" ? "keep" : "release";
  }
  if (p.sourceType === "booking") {
    const paymentStatus = String(t.paymentStatus ?? "").toLowerCase();
    if (paymentStatus === "paid" || paymentStatus === "partial") return "capture";
    return status === "pending_payment" ? "keep" : "release";
  }
  if (status === "confirmed") return "capture";
  return status === "pending_payment" ? "keep" : "release";
}

export type HoldSweepStats = {
  released: number;
  captured: number;
  kept: number;
  intentsDone: number;
  intentsFailed: number;
  intentsGivenUp: number;
};

export async function runCashbackHoldSweep(
  db: Firestore,
  projectId: string,
  nowMs: number,
): Promise<HoldSweepStats> {
  const stats: HoldSweepStats = {
    released: 0, captured: 0, kept: 0, intentsDone: 0, intentsFailed: 0, intentsGivenUp: 0,
  };

  const holdsSnap = await db
    .collectionGroup("holds")
    .where("status", "==", "open")
    .where("createdAt", "<=", Timestamp.fromMillis(nowMs - HOLD_GRACE_MS))
    .limit(200)
    .get();
  for (const doc of holdsSnap.docs) {
    const hold = doc.data() as HoldDoc;
    const uid = doc.ref.parent.parent?.id ?? hold.uid;
    try {
      const trackingSnap = hold.trackingPath ? await db.doc(hold.trackingPath).get() : null;
      const action = decideHoldAction({
        sourceType: hold.sourceType,
        holdPaymentId: hold.asaasPaymentId,
        holdCreatedAtMs: hold.createdAt.toMillis(),
        tracking: trackingSnap?.exists ? trackingSnap.data() ?? null : null,
        nowMs,
      });
      if (action === "release") {
        if (await releaseHold(db, uid, doc.id, nowMs)) stats.released++;
      } else if (action === "capture") {
        await captureHold(db, uid, doc.id, nowMs);
        stats.captured++;
      } else {
        stats.kept++;
      }
    } catch (e) {
      logger.error("cashback: falha ao conferir reserva de saldo", {uid, holdId: doc.id, error: String(e)});
    }
  }

  const intentsSnap = await db
    .collection(`artifacts/${projectId}/public/data/asaas_processed_payments`)
    .where("cashbackStatus", "==", "pending")
    .limit(100)
    .get();
  for (const doc of intentsSnap.docs) {
    const intent = doc.data().cashback as CashbackIntent | undefined;
    if ((intent?.attempts ?? 0) >= MAX_INTENT_ATTEMPTS) {
      await doc.ref.set({cashbackStatus: "failed"}, {merge: true});
      logger.error("cashback: intenção abandonada depois do limite de tentativas", {
        paymentId: doc.id,
        lastError: intent?.lastError ?? null,
      });
      stats.intentsGivenUp++;
      continue;
    }
    const result = await applyCashbackIntent(db, doc.ref as DocumentReference, doc.id, nowMs);
    if (result === "done") stats.intentsDone++;
    else if (result === "failed") stats.intentsFailed++;
  }

  return stats;
}

export const expireCashbackHolds = onSchedule(
  {schedule: "every 5 minutes", timeoutSeconds: 300},
  async () => {
    const stats = await runCashbackHoldSweep(getFirestore(), getFirebaseProjectId(), Date.now());
    logger.info("expireCashbackHolds", stats);
  },
);
```

Em `functions/src/index.ts`, logo depois do bloco que exporta `splitArenaBookingPayment`/`expireArenaBookingPaymentShares`, acrescentar:

```ts
// Cashback do atleta: reservas de saldo de cobranças mortas e intenções pendentes (5 min).
export {expireCashbackHolds} from "./cashback-hold-sweeper";
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc && node --test lib/cashback-hold-sweeper.test.js`
Expected: PASS, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add functions/src/cashback-hold-sweeper.ts functions/src/cashback-hold-sweeper.test.ts functions/src/index.ts && git commit -m "feat(cashback): varredura de 5 min devolve reservas de cobranças mortas e reaplica intenções

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Varredura diária — liberar, cancelar, vencer e avisar

**Files:**
- Create: `functions/src/cashback-daily-sweeper.ts`
- Create: `functions/src/cashback-daily-sweeper.test.ts`
- Modify: `functions/src/index.ts` (export)

**Interfaces:**
- Consumes: `releaseDecision`, `bookingEventAtMs`, `toMillisOrNull`, `formatCentsBrl`, `CashbackSourceState` (Task 1); `readCashbackConfig`, `CashbackConfig` (Task 1); `LotDoc` (Task 2); `releaseLot`, `cancelLot`, `rescheduleLot`, `expireLot`, `markExpiryWarned` (Task 3); `loadTournamentData` de `./tournament-registration-guards`; `artifactsInscriptionsPath`, `getFirebaseProjectId` de `./firebase-paths`; `EVENT_TIME_ZONE` de `./event-timezone`; `deliverNotificationToUser`, `WEB_PUSH_*` de `./notification-delivery`.
- Produces: `type CashbackNotify = (input: {userId; title; body; type; data: Record<string, string>}) => Promise<unknown>`; `loadSourceState(db, projectId, uid, lot)`; `runCashbackDailySweep(db, projectId, nowMs, config, notify)` → `{released, cancelled, rescheduled, waiting, expired, warned}`; função agendada `cashbackDailySweep` (10h, fuso do evento). Push `cashback_released` e `cashback_expiring` com `data: {url: "/cashback", webUrl: "/cashback"}`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `functions/src/cashback-daily-sweeper.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {DEFAULT_CASHBACK_CONFIG} from "./cashback-config";
import {runCashbackDailySweep} from "./cashback-daily-sweeper";

const NOW = Date.UTC(2026, 9, 10, 13, 0, 0); // 10/10/2026 10h em São Paulo
const DAY = 24 * 60 * 60 * 1000;
const UID = "ath1";
const W = `athleteWallets/${UID}`;
const INSCRIPTIONS = "artifacts/p/public/data/inscriptions";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function pendingLot(fake: FakeFirestore, lotId: string, overrides: DocData): void {
  fake.seedDoc(`${W}/lots/${lotId}`, {
    uid: UID, sourceType: "booking", sourceId: "b1", tournamentId: null, arenaId: "a1",
    label: "Reserva", earnedCents: 240, remainingCents: 0, status: "pending",
    eventAt: Timestamp.fromMillis(NOW - DAY), releasedAt: null, expiresAt: null,
    expiryWarnedAt: null, createdAt: Timestamp.fromMillis(NOW - 3 * DAY),
    ...overrides,
  });
}

function availableLot(fake: FakeFirestore, lotId: string, overrides: DocData): void {
  fake.seedDoc(`${W}/lots/${lotId}`, {
    uid: UID, sourceType: "booking", sourceId: "b1", tournamentId: null, arenaId: "a1",
    label: "Reserva", earnedCents: 500, remainingCents: 500, status: "available",
    eventAt: Timestamp.fromMillis(NOW - 100 * DAY), releasedAt: Timestamp.fromMillis(NOW - 99 * DAY),
    expiresAt: Timestamp.fromMillis(NOW + 90 * DAY), expiryWarnedAt: null,
    createdAt: Timestamp.fromMillis(NOW - 100 * DAY),
    ...overrides,
  });
}

function notifySpy() {
  const sent: Array<{userId: string; type: string; body: string; data: Record<string, string>}> = [];
  return {
    sent,
    notify: async (input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}) => {
      sent.push({userId: input.userId, type: input.type, body: input.body, data: input.data});
    },
  };
}

describe("runCashbackDailySweep — liberação", () => {
  it("reserva que aconteceu libera e avisa uma vez por atleta", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("arenaBookings/b1", {status: "confirmed", date: "2026-10-08", startTime: "19:00"});
    fake.seedDoc("arenaBookings/b2", {status: "confirmed", date: "2026-10-09", startTime: "08:00"});
    pendingLot(fake, "p1", {sourceId: "b1"});
    pendingLot(fake, "p2", {sourceId: "b2", earnedCents: 60});
    const spy = notifySpy();

    const stats = await runCashbackDailySweep(db, "p", NOW, DEFAULT_CASHBACK_CONFIG, spy.notify);

    assert.equal(fake.store.get(`${W}/lots/p1`)!.status, "available");
    assert.equal(fake.store.get(`${W}/lots/p2`)!.status, "available");
    assert.equal(stats.released, 2);
    assert.equal(spy.sent.length, 1);
    assert.equal(spy.sent[0].type, "cashback_released");
    assert.match(spy.sent[0].body, /R\$ 3,00/);
    assert.deepEqual(spy.sent[0].data, {url: "/cashback", webUrl: "/cashback"});
  });

  it("reserva cancelada cancela o lote; reserva remarcada para o futuro só move a data", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("arenaBookings/b1", {status: "cancelled", date: "2026-10-08", startTime: "19:00"});
    fake.seedDoc("arenaBookings/b2", {status: "confirmed", date: "2026-10-20", startTime: "19:00"});
    pendingLot(fake, "p1", {sourceId: "b1"});
    pendingLot(fake, "p2", {sourceId: "b2"});

    const stats = await runCashbackDailySweep(db, "p", NOW, DEFAULT_CASHBACK_CONFIG, notifySpy().notify);

    assert.equal(fake.store.get(`${W}/lots/p1`)!.status, "cancelled");
    const moved = fake.store.get(`${W}/lots/p2`)!;
    assert.equal(moved.status, "pending");
    assert.equal((moved.eventAt as Timestamp).toMillis(), Date.UTC(2026, 9, 20, 22, 0, 0));
    assert.equal(stats.cancelled, 1);
    assert.equal(stats.rescheduled, 1);
  });

  it("inscrição: pedido de cancelamento pendente espera; torneio cancelado cancela; inscrição apagada cancela", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("tournaments/t1", {startAt: Timestamp.fromMillis(NOW - DAY)});
    fake.seedDoc("tournaments/t2", {startAt: Timestamp.fromMillis(NOW - DAY), listingStatus: "cancelled"});
    fake.seedDoc(`${INSCRIPTIONS}/r1`, {tournamentId: "t1", cancellationRequest: {status: "pending"}});
    fake.seedDoc(`${INSCRIPTIONS}/r2`, {tournamentId: "t2"});
    pendingLot(fake, "p1", {sourceType: "registration", sourceId: "r1", tournamentId: "t1"});
    pendingLot(fake, "p2", {sourceType: "registration", sourceId: "r2", tournamentId: "t2"});
    pendingLot(fake, "p3", {sourceType: "registration", sourceId: "rApagada", tournamentId: "t1"});

    const stats = await runCashbackDailySweep(db, "p", NOW, DEFAULT_CASHBACK_CONFIG, notifySpy().notify);

    assert.equal(fake.store.get(`${W}/lots/p1`)!.status, "pending");
    assert.equal(fake.store.get(`${W}/lots/p2`)!.status, "cancelled");
    assert.equal(fake.store.get(`${W}/lots/p3`)!.status, "cancelled");
    assert.equal(stats.waiting, 1);
  });

  it("torneio adiado espera pela data nova", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("tournaments/t1", {startAt: Timestamp.fromMillis(NOW + 7 * DAY)});
    fake.seedDoc(`${INSCRIPTIONS}/r1`, {tournamentId: "t1"});
    pendingLot(fake, "p1", {sourceType: "registration", sourceId: "r1", tournamentId: "t1"});

    await runCashbackDailySweep(db, "p", NOW, DEFAULT_CASHBACK_CONFIG, notifySpy().notify);

    const lot = fake.store.get(`${W}/lots/p1`)!;
    assert.equal(lot.status, "pending");
    assert.equal((lot.eventAt as Timestamp).toMillis(), NOW + 7 * DAY);
  });

  it("clubinho: quem saiu com estorno tem o lote cancelado", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("arenaClubSessions/s1", {status: "completed", startAt: Timestamp.fromMillis(NOW - DAY)});
    fake.seedDoc(`arenaClubSessions/s1/clubParticipants/${UID}`, {status: "canceled_refunded"});
    pendingLot(fake, "p1", {sourceType: "club", sourceId: "s1"});

    await runCashbackDailySweep(db, "p", NOW, DEFAULT_CASHBACK_CONFIG, notifySpy().notify);

    assert.equal(fake.store.get(`${W}/lots/p1`)!.status, "cancelled");
  });
});

describe("runCashbackDailySweep — vencimento e aviso", () => {
  it("vence o lote vencido", async () => {
    const {fake, db} = makeDb();
    availableLot(fake, "v1", {expiresAt: Timestamp.fromMillis(NOW - 1000), remainingCents: 320});

    const stats = await runCashbackDailySweep(db, "p", NOW, DEFAULT_CASHBACK_CONFIG, notifySpy().notify);

    assert.equal(fake.store.get(`${W}/lots/v1`)!.status, "expired");
    assert.equal(stats.expired, 1);
  });

  it("avisa uma vez sobre o que vence nos próximos 15 dias", async () => {
    const {fake, db} = makeDb();
    availableLot(fake, "soon", {expiresAt: Timestamp.fromMillis(NOW + 10 * DAY), remainingCents: 320});
    availableLot(fake, "later", {expiresAt: Timestamp.fromMillis(NOW + 40 * DAY)});
    const spy = notifySpy();

    await runCashbackDailySweep(db, "p", NOW, DEFAULT_CASHBACK_CONFIG, spy.notify);
    await runCashbackDailySweep(db, "p", NOW + 60_000, DEFAULT_CASHBACK_CONFIG, spy.notify);

    assert.equal(spy.sent.length, 1);
    assert.equal(spy.sent[0].type, "cashback_expiring");
    assert.match(spy.sent[0].body, /R\$ 3,20/);
    assert.match(spy.sent[0].body, /20\/10/);
    assert.ok(fake.store.get(`${W}/lots/soon`)!.expiryWarnedAt);
    assert.equal(fake.store.get(`${W}/lots/later`)!.expiryWarnedAt, null);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc`
Expected: FAIL — `Cannot find module './cashback-daily-sweeper'`.

- [ ] **Step 3: Implementar**

Criar `functions/src/cashback-daily-sweeper.ts`:

```ts
/**
 * Varredura diária do cashback (10h, fuso do evento):
 * 1. Lotes pendentes cujo evento já passou: confere a origem real e libera,
 *    cancela (vínculo caiu) ou move a data (evento adiado). Um push por atleta
 *    com o total liberado — o gancho de fidelização chega logo depois do jogo.
 * 2. Lotes disponíveis vencidos: vence o que sobrou.
 * 3. Lotes que vencem nos próximos `expiryWarningDays`: um aviso por atleta,
 *    uma vez por lote.
 */
import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {readCashbackConfig, type CashbackConfig} from "./cashback-config";
import {
  bookingEventAtMs,
  formatCentsBrl,
  releaseDecision,
  toMillisOrNull,
  type CashbackSourceState,
} from "./cashback-rules";
import type {LotDoc} from "./athlete-wallet-state";
import {cancelLot, expireLot, markExpiryWarned, releaseLot, rescheduleLot} from "./athlete-wallet";
import {loadTournamentData} from "./tournament-registration-guards";
import {artifactsInscriptionsPath, getFirebaseProjectId} from "./firebase-paths";
import {EVENT_TIME_ZONE} from "./event-timezone";
import {
  deliverNotificationToUser,
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
} from "./notification-delivery";

const DAY_MS = 24 * 60 * 60 * 1000;
const CASHBACK_LINKS = {url: "/cashback", webUrl: "/cashback"};

export type CashbackNotify = (input: {
  userId: string;
  title: string;
  body: string;
  type: string;
  data: Record<string, string>;
}) => Promise<unknown>;

export async function loadSourceState(
  db: Firestore,
  projectId: string,
  uid: string,
  lot: LotDoc,
): Promise<CashbackSourceState> {
  if (lot.sourceType === "booking") {
    const snap = await db.collection("arenaBookings").doc(lot.sourceId).get();
    const booking = snap.data() ?? {};
    return {
      sourceType: "booking",
      exists: snap.exists,
      status: String(booking.status ?? ""),
      eventAtMs: bookingEventAtMs(booking.date, booking.startTime),
    };
  }
  if (lot.sourceType === "registration") {
    const snap = await db.collection(artifactsInscriptionsPath(projectId)).doc(lot.sourceId).get();
    const registration = snap.data() ?? {};
    const tournamentId = lot.tournamentId ??
      (typeof registration.tournamentId === "string" ? registration.tournamentId : "");
    const tournament = tournamentId ? await loadTournamentData(db, projectId, tournamentId) : null;
    const request = registration.cancellationRequest as {status?: unknown} | undefined;
    return {
      sourceType: "registration",
      exists: snap.exists,
      cancellationPending: request?.status === "pending",
      tournamentCancelled: tournament?.listingStatus === "cancelled",
      eventAtMs: toMillisOrNull(tournament?.startAt ?? tournament?.startDate),
    };
  }
  const sessionRef = db.collection("arenaClubSessions").doc(lot.sourceId);
  const participantSnap = await sessionRef.collection("clubParticipants").doc(uid).get();
  const sessionSnap = await sessionRef.get();
  return {
    sourceType: "club",
    exists: participantSnap.exists && sessionSnap.exists,
    participantStatus: String(participantSnap.data()?.status ?? ""),
    sessionStatus: String(sessionSnap.data()?.status ?? ""),
    eventAtMs: toMillisOrNull(sessionSnap.data()?.startAt),
  };
}

function dayMonthLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("pt-BR", {
    timeZone: EVENT_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
  });
}

export type DailySweepStats = {
  released: number;
  cancelled: number;
  rescheduled: number;
  waiting: number;
  expired: number;
  warned: number;
};

export async function runCashbackDailySweep(
  db: Firestore,
  projectId: string,
  nowMs: number,
  config: CashbackConfig,
  notify: CashbackNotify,
): Promise<DailySweepStats> {
  const stats: DailySweepStats = {
    released: 0, cancelled: 0, rescheduled: 0, waiting: 0, expired: 0, warned: 0,
  };
  const now = Timestamp.fromMillis(nowMs);

  // 1. Liberar / cancelar / adiar.
  const releasedByUid = new Map<string, number>();
  const due = await db.collectionGroup("lots")
    .where("status", "==", "pending")
    .where("eventAt", "<=", now)
    .limit(500)
    .get();
  for (const doc of due.docs) {
    const lot = doc.data() as LotDoc;
    const uid = doc.ref.parent.parent?.id ?? lot.uid;
    try {
      const decision = releaseDecision(await loadSourceState(db, projectId, uid, lot), nowMs);
      if (decision.kind === "release") {
        const cents = await releaseLot(db, uid, doc.id, nowMs, config.expiryMonths);
        if (cents > 0) {
          releasedByUid.set(uid, (releasedByUid.get(uid) ?? 0) + cents);
          stats.released++;
        }
      } else if (decision.kind === "cancel") {
        if (await cancelLot(db, uid, doc.id, nowMs)) stats.cancelled++;
        logger.info("cashback: lote cancelado", {uid, lotId: doc.id, reason: decision.reason});
      } else if (decision.eventAtMs != null) {
        await rescheduleLot(db, uid, doc.id, decision.eventAtMs);
        stats.rescheduled++;
      } else {
        stats.waiting++;
      }
    } catch (e) {
      logger.error("cashback: falha ao conferir lote pendente", {uid, lotId: doc.id, error: String(e)});
    }
  }
  for (const [uid, cents] of releasedByUid) {
    await notify({
      userId: uid,
      title: "Seu cashback foi liberado",
      body: `${formatCentsBrl(cents)} já pode ser usado na próxima reserva, inscrição ou clubinho.`,
      type: "cashback_released",
      data: CASHBACK_LINKS,
    }).catch((e) => logger.warn("cashback: push de liberação falhou", {uid, error: String(e)}));
  }

  // 2. Vencer.
  const expiredSnap = await db.collectionGroup("lots")
    .where("status", "==", "available")
    .where("expiresAt", "<=", now)
    .limit(500)
    .get();
  for (const doc of expiredSnap.docs) {
    const uid = doc.ref.parent.parent?.id ?? (doc.data() as LotDoc).uid;
    try {
      if ((await expireLot(db, uid, doc.id, nowMs)) > 0) stats.expired++;
    } catch (e) {
      logger.error("cashback: falha ao vencer lote", {uid, lotId: doc.id, error: String(e)});
    }
  }

  // 3. Avisar o que vence em breve.
  if (config.expiryWarningDays > 0) {
    const horizon = Timestamp.fromMillis(nowMs + config.expiryWarningDays * DAY_MS);
    const soonSnap = await db.collectionGroup("lots")
      .where("status", "==", "available")
      .where("expiresAt", "<=", horizon)
      .limit(1000)
      .get();
    const byUid = new Map<string, {cents: number; earliestMs: number; lotIds: string[]}>();
    for (const doc of soonSnap.docs) {
      const lot = doc.data() as LotDoc;
      const expiresAtMs = lot.expiresAt?.toMillis() ?? 0;
      if (lot.expiryWarnedAt || lot.remainingCents <= 0 || expiresAtMs <= nowMs) continue;
      const uid = doc.ref.parent.parent?.id ?? lot.uid;
      const entry = byUid.get(uid) ?? {cents: 0, earliestMs: expiresAtMs, lotIds: []};
      entry.cents += lot.remainingCents;
      entry.earliestMs = Math.min(entry.earliestMs, expiresAtMs);
      entry.lotIds.push(doc.id);
      byUid.set(uid, entry);
    }
    for (const [uid, entry] of byUid) {
      try {
        await notify({
          userId: uid,
          title: "Seu cashback vai vencer",
          body: `${formatCentsBrl(entry.cents)} vencem a partir de ${dayMonthLabel(entry.earliestMs)}. ` +
            "Use numa reserva, inscrição ou clubinho.",
          type: "cashback_expiring",
          data: CASHBACK_LINKS,
        });
        await markExpiryWarned(db, uid, entry.lotIds, nowMs);
        stats.warned++;
      } catch (e) {
        logger.warn("cashback: aviso de vencimento falhou", {uid, error: String(e)});
      }
    }
  }

  return stats;
}

export const cashbackDailySweep = onSchedule(
  {
    schedule: "0 10 * * *",
    timeZone: EVENT_TIME_ZONE,
    timeoutSeconds: 540,
    secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
  },
  async (event) => {
    const scheduled = Date.parse(event.scheduleTime);
    const nowMs = Number.isFinite(scheduled) ? scheduled : Date.now();
    const db = getFirestore();
    const stats = await runCashbackDailySweep(
      db,
      getFirebaseProjectId(),
      nowMs,
      await readCashbackConfig(db),
      deliverNotificationToUser,
    );
    logger.info("cashbackDailySweep", stats);
  },
);
```

Em `functions/src/index.ts`, logo depois do export da Task 9:

```ts
// Cashback do atleta: liberar depois do evento, vencer e avisar (diária, 10h).
export {cashbackDailySweep} from "./cashback-daily-sweeper";
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc && node --test lib/cashback-daily-sweeper.test.js`
Expected: PASS, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add functions/src/cashback-daily-sweeper.ts functions/src/cashback-daily-sweeper.test.ts functions/src/index.ts && git commit -m "feat(cashback): varredura diária libera depois do evento, vence e avisa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Estorno pelo roteador e relatório

**Files:**
- Create: `functions/src/cashback-reversal.ts`
- Create: `functions/src/cashback-reversal.test.ts`
- Modify: `functions/src/asaas-webhook.ts`
- Create: `functions/scripts/lib/cashback-report.js`
- Create: `functions/scripts/cashback-report.js`
- Create: `functions/test/cashback-report.test.mjs`
- Modify: `functions/package.json` (script `test`: acrescentar ` test/cashback-report.test.mjs` ao fim)

**Interfaces:**
- Consumes: `reverseLot`, `refundCapturedHold` (Tasks 2–3); `CashbackIntent`, `applyCashbackIntent` (Task 4, este só em teste).
- Produces: `reverseCashbackForPayment(db, processedRef, paymentId, nowMs): Promise<"reversed" | "skipped">` — marca `cashbackStatus: "reversed"` ANTES de desfazer (a varredura nunca aplica depois do estorno) e `cashback.reversedAtMs` no fim; `summarizeCashback(wallets, {fromMs, toMs})` no relatório.

- [ ] **Step 1: Escrever os testes que falham**

Criar `functions/src/cashback-reversal.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {DEFAULT_CASHBACK_CONFIG} from "./cashback-config";
import {holdCashback} from "./athlete-wallet";
import {applyCashbackIntent, buildCashbackIntent, cashbackIntentFields} from "./cashback-intent";
import {reverseCashbackForPayment} from "./cashback-reversal";

const NOW = Date.UTC(2026, 9, 1, 13, 0, 0);
const UID = "ath1";
const W = `athleteWallets/${UID}`;
const PROCESSED = "artifacts/p/public/data/asaas_processed_payments/pay1";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.seedDoc(`${W}/lots/old`, {
    uid: UID, sourceType: "booking", sourceId: "b0", tournamentId: null, arenaId: "a1",
    label: "Reserva", earnedCents: 2000, remainingCents: 2000, status: "available",
    eventAt: Timestamp.fromMillis(NOW - 1e9), releasedAt: Timestamp.fromMillis(NOW - 1e9),
    expiresAt: Timestamp.fromMillis(NOW + 1e10), expiryWarnedAt: null,
    createdAt: Timestamp.fromMillis(NOW - 1e9),
  });
  return {fake, db: fake as unknown as Firestore};
}

async function seedAppliedIntent(fake: FakeFirestore, db: Firestore, apply: boolean) {
  const {holdId} = await holdCashback(db, {
    uid: UID, maxCents: 1000, sourceType: "club", sourceId: "s1",
    trackingPath: "arenaClubSessions/s1/clubParticipants/ath1", label: "Clubinho", nowMs: NOW,
  });
  const intent = buildCashbackIntent({
    uid: UID, sourceType: "club", sourceId: "s1", tournamentId: null, arenaId: "a1",
    label: "Clubinho", eventAtMs: NOW + 1e9, cashReais: 5, appliedCents: 1000, feeReais: 0.75,
    holdId, config: {...DEFAULT_CASHBACK_CONFIG, enabled: true},
  });
  fake.seedDoc(PROCESSED, {outcome: "approved", ...cashbackIntentFields(intent)});
  const ref = db.doc(PROCESSED) as DocumentReference;
  if (apply) await applyCashbackIntent(db, ref, "pay1", NOW);
  return {holdId: holdId!, ref};
}

describe("reverseCashbackForPayment", () => {
  it("estorno do clubinho: cancela o lote pendente e devolve o saldo usado", async () => {
    const {fake, db} = makeDb();
    const {holdId, ref} = await seedAppliedIntent(fake, db, true);

    assert.equal(await reverseCashbackForPayment(db, ref, "pay1", NOW), "reversed");

    assert.equal(fake.store.get(`${W}/lots/pay1`)!.status, "cancelled");
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "refunded");
    assert.equal(fake.store.get(`${W}/lots/old`)!.remainingCents, 2000);
    assert.equal(fake.store.get(PROCESSED)!.cashbackStatus, "reversed");
    assert.equal(await reverseCashbackForPayment(db, ref, "pay1", NOW), "skipped");
  });

  it("estorno antes de a intenção ser aplicada: a varredura não captura nem cria lote depois", async () => {
    const {fake, db} = makeDb();
    const {holdId, ref} = await seedAppliedIntent(fake, db, false);

    await reverseCashbackForPayment(db, ref, "pay1", NOW);
    assert.equal(await applyCashbackIntent(db, ref, "pay1", NOW), "skipped");

    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "released");
    assert.equal(fake.store.has(`${W}/lots/pay1`), false);
    assert.equal(fake.store.get(`${W}/lots/old`)!.remainingCents, 2000);
  });

  it("pagamento sem cashback é ignorado", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc(PROCESSED, {outcome: "approved"});
    assert.equal(
      await reverseCashbackForPayment(db, db.doc(PROCESSED) as DocumentReference, "pay1", NOW),
      "skipped",
    );
  });
});
```

Criar `functions/test/cashback-report.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { createRequire } from 'node:module';

/** Números do cashback para o dono: passivo atual e movimento do período. */

const require = createRequire(import.meta.url);
const { summarizeCashback } = require('../scripts/lib/cashback-report.js');

describe('summarizeCashback', () => {
  test('soma o passivo atual e o movimento do período por tipo', () => {
    const summary = summarizeCashback([
      {
        wallet: { availableCents: 500, pendingCents: 240, heldCents: 100, lifetimeEarnedCents: 900, lifetimeRedeemedCents: 300 },
        ledger: [
          { type: 'earn', amountCents: 240, createdAtMs: 2000 },
          { type: 'redeem', amountCents: 300, createdAtMs: 2500 },
          { type: 'expire', amountCents: 50, createdAtMs: 500 },
        ],
      },
      {
        wallet: { availableCents: 1000, pendingCents: 0, heldCents: 0, lifetimeEarnedCents: 1000, lifetimeRedeemedCents: 0 },
        ledger: [{ type: 'release', amountCents: 1000, createdAtMs: 1500 }],
      },
    ], { fromMs: 1000, toMs: 3000 });

    assert.equal(summary.wallets, 2);
    assert.equal(summary.liabilityCents, 1840);
    assert.deepEqual(summary.current, { availableCents: 1500, pendingCents: 240, heldCents: 100 });
    assert.deepEqual(summary.lifetime, { earnedCents: 1900, redeemedCents: 300 });
    assert.equal(summary.period.earn, 240);
    assert.equal(summary.period.redeem, 300);
    assert.equal(summary.period.release, 1000);
    assert.equal(summary.period.expire, 0);
  });
});
```

E em `functions/package.json`, no fim do valor de `"test"`, acrescentar ` test/cashback-report.test.mjs`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc; node --test test/cashback-report.test.mjs`
Expected: FAIL — `Cannot find module './cashback-reversal'` e `'../scripts/lib/cashback-report.js'`.

- [ ] **Step 3: Implementar o estorno**

Criar `functions/src/cashback-reversal.ts`:

```ts
/**
 * Estorno de um pagamento que teve cashback (`PAYMENT_REFUNDED`): o do
 * clubinho (`leaveArenaClubSession`, sessão cancelada) e qualquer estorno
 * feito à mão no painel do Asaas. Roda pelo roteador, fora dos handlers —
 * eles param no "já processado".
 *
 * Lote do pagamento: pendente é cancelado; disponível perde o que resta.
 * Saldo usado no pagamento: volta aos lotes de origem.
 */
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {refundCapturedHold, reverseLot} from "./athlete-wallet";
import type {CashbackIntent} from "./cashback-intent";

export async function reverseCashbackForPayment(
  db: Firestore,
  processedRef: DocumentReference,
  paymentId: string,
  nowMs: number,
): Promise<"reversed" | "skipped"> {
  const data = (await processedRef.get()).data() ?? {};
  const intent = data.cashback as CashbackIntent | undefined;
  if (!intent || intent.reversedAtMs != null) return "skipped";
  // Primeiro tira a intenção da fila: aplicada depois do estorno, ela capturaria
  // a reserva devolvida aqui e criaria o lote de um pagamento que não existe mais.
  await processedRef.set({cashbackStatus: "reversed"}, {merge: true});
  const lotOutcome = await reverseLot(db, intent.uid, paymentId, nowMs);
  const restoredCents = intent.holdId ?
    await refundCapturedHold(db, intent.uid, intent.holdId, nowMs) :
    0;
  await processedRef.set({cashback: {reversedAtMs: nowMs}}, {merge: true});
  logger.info("cashback: pagamento estornado", {
    paymentId,
    uid: intent.uid,
    lotOutcome,
    restoredCents,
  });
  return "reversed";
}
```

Em `functions/src/asaas-webhook.ts`, acrescentar o import `import {reverseCashbackForPayment} from "./cashback-reversal";` e, logo depois do `try { ... } catch (e) { logger.error(\`asaasWebhook failed ...\`) }` que despacha para os handlers e antes de `res.status(200).send("OK");`, acrescentar:

```ts
  // Estorno: desfaz o cashback do pagamento (lote e saldo usado). Separado do
  // despacho acima — os handlers param no "já processado" e uma falha num não
  // pode impedir o outro.
  if (event === "PAYMENT_REFUNDED") {
    try {
      await reverseCashbackForPayment(db, processedRef, paymentId, Date.now());
    } catch (e) {
      logger.error(`asaasWebhook: estorno do cashback falhou paymentId=${paymentId}`, e);
    }
  }
```

- [ ] **Step 4: Implementar o relatório (só leitura)**

Criar `functions/scripts/lib/cashback-report.js`:

```js
/* eslint-disable */
/** Lógica pura de `cashback-report.js`: passivo atual e movimento do período. */

const LEDGER_TYPES = ['earn', 'release', 'cancel', 'redeem', 'expire', 'reverse', 'refund'];

function summarizeCashback(wallets, { fromMs, toMs }) {
  const current = { availableCents: 0, pendingCents: 0, heldCents: 0 };
  const lifetime = { earnedCents: 0, redeemedCents: 0 };
  const period = Object.fromEntries(LEDGER_TYPES.map((t) => [t, 0]));
  for (const { wallet, ledger } of wallets) {
    current.availableCents += Number(wallet.availableCents) || 0;
    current.pendingCents += Number(wallet.pendingCents) || 0;
    current.heldCents += Number(wallet.heldCents) || 0;
    lifetime.earnedCents += Number(wallet.lifetimeEarnedCents) || 0;
    lifetime.redeemedCents += Number(wallet.lifetimeRedeemedCents) || 0;
    for (const entry of ledger) {
      if (entry.createdAtMs < fromMs || entry.createdAtMs >= toMs) continue;
      if (!(entry.type in period)) continue;
      period[entry.type] += Number(entry.amountCents) || 0;
    }
  }
  return {
    wallets: wallets.length,
    liabilityCents: current.availableCents + current.pendingCents + current.heldCents,
    current,
    lifetime,
    period,
  };
}

module.exports = { summarizeCashback };
```

Criar `functions/scripts/cashback-report.js`:

```js
/* eslint-disable */
/**
 * Relatório SÓ DE LEITURA do cashback do atleta: passivo atual (disponível +
 * pendente + reservado) e movimento do período (ganho, liberado, usado,
 * vencido, cancelado, estornado, devolvido). Nada é gravado.
 *
 * Pré-requisitos: gcloud auth application-default login
 * Uso (na pasta functions/):
 *   node scripts/cashback-report.js --project <projectId> [--from 2026-10-01] [--to 2026-11-01]
 */

const admin = require('firebase-admin');
const { summarizeCashback } = require('./lib/cashback-report');

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId = argValue('--project') || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
  console.error('Informe o projeto: --project <projectId>');
  process.exit(1);
}
const fromMs = argValue('--from') ? Date.parse(`${argValue('--from')}T00:00:00-03:00`) : 0;
const toMs = argValue('--to') ? Date.parse(`${argValue('--to')}T00:00:00-03:00`) : Date.now() + 1;

admin.initializeApp({ projectId });
const db = admin.firestore();

const brl = (cents) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

async function main() {
  const walletsSnap = await db.collection('athleteWallets').get();
  const wallets = [];
  for (const doc of walletsSnap.docs) {
    const ledgerSnap = await doc.ref.collection('ledger')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromMillis(fromMs))
      .where('createdAt', '<', admin.firestore.Timestamp.fromMillis(toMs))
      .get();
    wallets.push({
      wallet: doc.data(),
      ledger: ledgerSnap.docs.map((d) => ({
        type: d.data().type,
        amountCents: d.data().amountCents,
        createdAtMs: d.data().createdAt.toMillis(),
      })),
    });
  }
  const s = summarizeCashback(wallets, { fromMs, toMs });
  console.log(`Projeto ${projectId}: ${s.wallets} carteiras`);
  console.log(`Passivo atual: ${brl(s.liabilityCents)} (disponível ${brl(s.current.availableCents)}, ` +
    `pendente ${brl(s.current.pendingCents)}, reservado ${brl(s.current.heldCents)})`);
  console.log(`Acumulado: ganho ${brl(s.lifetime.earnedCents)}, usado ${brl(s.lifetime.redeemedCents)}`);
  console.log('Período:', Object.fromEntries(Object.entries(s.period).map(([k, v]) => [k, brl(v)])));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc && node --test lib/cashback-reversal.test.js test/cashback-report.test.mjs`
Expected: PASS, `# fail 0`.

- [ ] **Step 6: Verificação completa**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npm run lint && npm test`
Expected: `tsc --noEmit` limpo; `npm test` com `# fail 0`.

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npm run test:rules`
Expected: todas as suítes de rules verdes (inclusive `athlete-wallet.rules.test.mjs`). Se o emulador não subir, registrar o erro exato no relatório.

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add functions/src/cashback-reversal.ts functions/src/cashback-reversal.test.ts functions/src/asaas-webhook.ts functions/scripts/lib/cashback-report.js functions/scripts/cashback-report.js functions/test/cashback-report.test.mjs functions/package.json && git commit -m "feat(cashback): estorno desfaz o cashback pelo roteador; relatório do passivo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
