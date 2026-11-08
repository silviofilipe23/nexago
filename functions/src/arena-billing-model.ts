/**
 * Modelo comercial das arenas para depois do período gratuito de implantação (2027).
 *
 * Regra do dono (08/11/2026):
 *  - existe um mínimo de reservas pagas pela NexaGO (app ou site) por mês;
 *  - abaixo dele, a arena paga uma mensalidade;
 *  - a NexaGO fica com uma comissão sobre os pagamentos feitos pela plataforma;
 *  - quanto mais reservas pagas, menor a comissão.
 *
 * Tudo isso vira uma lista de faixas: cada faixa começa num número de reservas pagas no mês e
 * define a mensalidade e o % de comissão. A faixa alcançada vale para o mês inteiro (não é
 * progressiva como IR). Quantidades, valores e percentuais são editáveis no backoffice
 * (`arenaBillingConfig/model`, só pela callable `saveArenaBillingModel`) e versionados.
 *
 * Este arquivo é só a regra pura: validação, normalização, cálculo do mês de uma arena e o
 * resumo do extrato da carteira. Nada aqui cobra ninguém — a cobrança automática (Asaas) fica
 * para uma etapa futura. Espelho no backoffice: `painel/arenas/modelo-comercial/data/billing-model.ts`.
 */
import {dateOf, monthKeyOf, isMonthKey, shiftMonth} from "./company-finance";

export const ARENA_BILLING_CONFIG = "arenaBillingConfig";
export const ARENA_BILLING_MODEL_DOC = "model";
export const ARENA_BILLING_VERSIONS = "versions";

export const MAX_TIERS = 8;
export const MAX_MIN_BOOKINGS = 100_000;
/** Teto de mensalidade (R$ 10 mil): protege contra valor digitado com zeros a mais. */
export const MAX_MONTHLY_FEE_CENTS = 10_000_00;
/** Mesmo teto da comissão negociada de torneio (`platform-fees.MAX_COMMISSION_PERCENT`). */
export const MAX_COMMISSION_PERCENT = 20;
export const MAX_NEW_ARENA_FREE_MONTHS = 24;
export const NOTE_MAX = 140;

export interface ArenaBillingTier {
  /** Reservas pagas no mês a partir das quais a faixa vale. A 1ª faixa começa em 0. */
  minBookings: number;
  /** Mensalidade da faixa, em centavos (0 = sem mensalidade). */
  monthlyFeeCents: number;
  /** Comissão da NexaGO sobre o valor pago pela plataforma (%), até 2 casas. */
  commissionPercent: number;
}

export interface ArenaBillingModel {
  /** Primeiro mês cobrado (`YYYY-MM`, mês civil de São Paulo). Antes disso é implantação. */
  effectiveFrom: string;
  /** Meses grátis para a arena que entra depois da vigência, contados do mês de entrada. */
  newArenaFreeMonths: number;
  /** Ordenadas por `minBookings` crescente. */
  tiers: ArenaBillingTier[];
}

/**
 * Valores de EXEMPLO, nunca salvos: o dono ainda vai definir os números. A tela mostra o aviso
 * enquanto o doc não existe. Partem da tabela de hoje (Starter R$ 99, taxa 8/6/5%).
 */
export const DEFAULT_ARENA_BILLING_MODEL: ArenaBillingModel = {
  effectiveFrom: "2027-01",
  newArenaFreeMonths: 3,
  tiers: [
    {minBookings: 0, monthlyFeeCents: 9900, commissionPercent: 8},
    {minBookings: 30, monthlyFeeCents: 0, commissionPercent: 8},
    {minBookings: 100, monthlyFeeCents: 0, commissionPercent: 6},
    {minBookings: 200, monthlyFeeCents: 0, commissionPercent: 5},
  ],
};

type Raw = Record<string, unknown>;

function isObj(v: unknown): v is Raw {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function int(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

function twoDecimals(v: number): boolean {
  return Math.abs(Math.round(v * 100) - v * 100) < 1e-6;
}

// ── validação ───────────────────────────────────────────────────────────────

/**
 * Campos inválidos, no formato que a tela entende (`tiers.1.commissionPercent`). Além dos
 * limites de cada campo, a regra do dono: a comissão nunca sobe de uma faixa para a seguinte, e a
 * mensalidade também não (mais reservas nunca pode custar mais caro).
 */
export function arenaBillingModelErrors(model: unknown): string[] {
  if (!isObj(model)) return ["model"];
  const out: string[] = [];
  if (!isMonthKey(model["effectiveFrom"])) out.push("effectiveFrom");
  if (!int(model["newArenaFreeMonths"], 0, MAX_NEW_ARENA_FREE_MONTHS)) out.push("newArenaFreeMonths");

  const tiers = model["tiers"];
  if (!Array.isArray(tiers) || tiers.length < 1 || tiers.length > MAX_TIERS) {
    out.push("tiers");
    return out;
  }
  tiers.forEach((t: unknown, i) => {
    const at = (f: string) => `tiers.${i}.${f}`;
    if (!isObj(t)) {
      out.push(`tiers.${i}`);
      return;
    }
    const min = t["minBookings"];
    if (!int(min, 0, MAX_MIN_BOOKINGS) || (i === 0 && min !== 0)) out.push(at("minBookings"));
    if (!int(t["monthlyFeeCents"], 0, MAX_MONTHLY_FEE_CENTS)) out.push(at("monthlyFeeCents"));
    const pct = t["commissionPercent"];
    if (typeof pct !== "number" || !Number.isFinite(pct) || pct < 0 || pct > MAX_COMMISSION_PERCENT ||
      !twoDecimals(pct)) {
      out.push(at("commissionPercent"));
    }
    if (i === 0) return;
    const prev = tiers[i - 1];
    if (!isObj(prev)) return;
    if (typeof min === "number" && typeof prev["minBookings"] === "number" && min <= prev["minBookings"]) {
      out.push(at("minBookings"));
    }
    if (typeof pct === "number" && typeof prev["commissionPercent"] === "number" &&
      pct > prev["commissionPercent"]) {
      out.push(at("commissionPercent"));
    }
    const fee = t["monthlyFeeCents"];
    if (typeof fee === "number" && typeof prev["monthlyFeeCents"] === "number" && fee > prev["monthlyFeeCents"]) {
      out.push(at("monthlyFeeCents"));
    }
  });
  return [...new Set(out)];
}

/** Só os campos conhecidos, na ordem do modelo (o que vai para o Firestore). */
export function normalizeArenaBillingModel(m: ArenaBillingModel): ArenaBillingModel {
  return {
    effectiveFrom: m.effectiveFrom,
    newArenaFreeMonths: m.newArenaFreeMonths,
    tiers: m.tiers.map((t) => ({
      minBookings: t.minBookings,
      monthlyFeeCents: t.monthlyFeeCents,
      commissionPercent: Math.round(t.commissionPercent * 100) / 100,
    })),
  };
}

/** Modelo gravado no doc; ausente ou corrompido cai no exemplo (a tela avisa que não foi salvo). */
export function arenaBillingModelFromDoc(data: Raw | undefined): ArenaBillingModel {
  const raw = data?.["model"];
  return arenaBillingModelErrors(raw).length === 0 ?
    normalizeArenaBillingModel(raw as ArenaBillingModel) :
    DEFAULT_ARENA_BILLING_MODEL;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Resumo do que mudou, para o histórico ("Vigência", "Faixa 2"…). */
export function arenaBillingModelChanges(prev: ArenaBillingModel, next: ArenaBillingModel): string[] {
  const out: string[] = [];
  if (prev.effectiveFrom !== next.effectiveFrom) out.push("Vigência");
  if (prev.newArenaFreeMonths !== next.newArenaFreeMonths) out.push("Meses grátis da arena nova");
  if (prev.tiers.length !== next.tiers.length) out.push("Quantidade de faixas");
  const n = Math.min(prev.tiers.length, next.tiers.length);
  for (let i = 0; i < n; i++) {
    if (!same(prev.tiers[i], next.tiers[i])) out.push(`Faixa ${i + 1}`);
  }
  return out;
}

// ── cálculo do mês ──────────────────────────────────────────────────────────

/** O que a arena movimentou pela plataforma num mês (vem do extrato da carteira). */
export interface ArenaMonthActivity {
  /** Reservas avulsas distintas pagas pela plataforma (rateio entre jogadores conta 1). */
  paidBookings: number;
  /** Valor bruto pago nas reservas avulsas (centavos). */
  bookingVolumeCents: number;
  /** Valor bruto pago nos planos de horário (centavos). Entra na comissão, não na contagem. */
  schedulePlanVolumeCents: number;
  /** Taxa que o modelo de hoje (8/6/5% por plano, com piso) já cobrou nessas linhas. */
  currentFeeCents: number;
}

export const EMPTY_ACTIVITY: ArenaMonthActivity = {
  paidBookings: 0,
  bookingVolumeCents: 0,
  schedulePlanVolumeCents: 0,
  currentFeeCents: 0,
};

export type FreeReason = "implantation" | "new_arena";

export interface ArenaMonthBilling {
  /** `false` = mês sem cobrança (implantação ou meses grátis da arena nova); valores são simulação. */
  billable: boolean;
  freeReason: FreeReason | null;
  /** Primeiro mês cobrado desta arena. */
  firstBilledMonth: string;
  tierIndex: number;
  tier: ArenaBillingTier;
  monthlyFeeCents: number;
  commissionBaseCents: number;
  commissionCents: number;
  /** Mensalidade + comissão pelo modelo (mesmo quando o mês não é cobrado, para comparar). */
  totalCents: number;
  /** O que de fato seria devido no mês: `totalCents` se cobrado, senão 0. */
  dueCents: number;
  /** Modelo novo − taxa cobrada hoje nas mesmas linhas. */
  deltaVsCurrentCents: number;
  /** Próxima faixa e quantas reservas faltam para ela; `null` na última. */
  next: {tierIndex: number; bookingsMissing: number; commissionPercent: number; monthlyFeeCents: number} | null;
}

/** Faixa alcançada: a última cujo mínimo é ≤ reservas pagas. */
export function tierIndexFor(model: ArenaBillingModel, paidBookings: number): number {
  let idx = 0;
  model.tiers.forEach((t, i) => {
    if (paidBookings >= t.minBookings) idx = i;
  });
  return idx;
}

/**
 * Primeiro mês cobrado da arena: a vigência, ou — se ela entrou na vigência ou depois — o mês de
 * entrada mais os meses grátis. Sem mês de entrada conhecido, vale a vigência.
 */
export function firstBilledMonth(model: ArenaBillingModel, arenaStartMonth: string | null): string {
  if (!arenaStartMonth || !isMonthKey(arenaStartMonth) || arenaStartMonth < model.effectiveFrom) {
    return model.effectiveFrom;
  }
  return shiftMonth(arenaStartMonth, model.newArenaFreeMonths);
}

/** Mensalidade e comissão de uma arena num mês, pelo modelo. Função pura, em centavos. */
export function computeArenaMonthBilling(
  model: ArenaBillingModel,
  month: string,
  activity: ArenaMonthActivity,
  arenaStartMonth: string | null = null,
): ArenaMonthBilling {
  const paid = Math.max(0, Math.floor(activity.paidBookings));
  const tierIndex = tierIndexFor(model, paid);
  const tier = model.tiers[tierIndex];
  const first = firstBilledMonth(model, arenaStartMonth);
  const billable = month >= first;
  const freeReason: FreeReason | null = billable ? null :
    month < model.effectiveFrom ? "implantation" : "new_arena";

  const commissionBaseCents = Math.max(0, Math.round(activity.bookingVolumeCents)) +
    Math.max(0, Math.round(activity.schedulePlanVolumeCents));
  const commissionCents = Math.round((commissionBaseCents * tier.commissionPercent) / 100);
  const totalCents = tier.monthlyFeeCents + commissionCents;
  const nextTier = model.tiers[tierIndex + 1];

  return {
    billable,
    freeReason,
    firstBilledMonth: first,
    tierIndex,
    tier,
    monthlyFeeCents: tier.monthlyFeeCents,
    commissionBaseCents,
    commissionCents,
    totalCents,
    dueCents: billable ? totalCents : 0,
    deltaVsCurrentCents: totalCents - Math.max(0, Math.round(activity.currentFeeCents)),
    next: nextTier ? {
      tierIndex: tierIndex + 1,
      bookingsMissing: nextTier.minBookings - paid,
      commissionPercent: nextTier.commissionPercent,
      monthlyFeeCents: nextTier.monthlyFeeCents,
    } : null,
  };
}

// ── extrato da carteira → atividade do mês ──────────────────────────────────

function reaisToCents(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) : 0;
}

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Soma as linhas de `arenaWallets/{id}/ledger` de um mês (pelo `createdAt`, mês civil de SP).
 * Conta só aluguel de quadra pago pela plataforma:
 *  - crédito sem `source` = reserva avulsa (conta 1 por `bookingId`, mesmo com rateio);
 *  - `source: "schedule_plan"` = plano de horário (entra no valor, não na contagem);
 *  - estorno sem `source` desconta o valor (a contagem fica: a reserva foi paga).
 * Aulas, clubinho e repasses a professor ficam fora — têm regra própria.
 */
export function summarizeArenaLedger(lines: readonly Raw[], month: string): ArenaMonthActivity {
  const bookings = new Set<string>();
  let bookingVolumeCents = 0;
  let schedulePlanVolumeCents = 0;
  let currentFeeCents = 0;
  let anonymous = 0;

  for (const raw of lines) {
    const date = dateOf(raw["createdAt"]);
    if (!date || monthKeyOf(date) !== month) continue;
    const type = raw["type"];
    const source = text(raw["source"]);
    const gross = reaisToCents(raw["grossReais"]);
    const fee = reaisToCents(raw["platformFeeReais"]);

    if (type === "credit" && source === null) {
      const id = text(raw["bookingId"]);
      if (id) bookings.add(id);
      else anonymous++;
      bookingVolumeCents += gross;
      currentFeeCents += fee;
    } else if (type === "credit" && source === "schedule_plan") {
      schedulePlanVolumeCents += gross;
      currentFeeCents += fee;
    } else if (type === "refund" && source === null) {
      bookingVolumeCents += gross; // estorno grava bruto negativo
      currentFeeCents += fee;
    }
  }

  return {
    paidBookings: bookings.size + anonymous,
    bookingVolumeCents: Math.max(0, bookingVolumeCents),
    schedulePlanVolumeCents: Math.max(0, schedulePlanVolumeCents),
    currentFeeCents: Math.max(0, currentFeeCents),
  };
}

/** Janela `[início, fim)` do mês civil de São Paulo (sem horário de verão desde 2019). */
export function monthBounds(month: string): {start: Date; end: Date} {
  return {
    start: new Date(`${month}-01T00:00:00-03:00`),
    end: new Date(`${shiftMonth(month, 1)}-01T00:00:00-03:00`),
  };
}
