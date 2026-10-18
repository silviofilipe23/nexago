/**
 * NexaSquad: números que as telas 01 · Visão geral e 03 · Perfil montam a partir das comissões.
 *
 * Conversão = comissão liberada ou paga (o pagamento foi confirmado), a mesma conta da tela 02.
 * Inscrição = qualquer comissão que o checkout criou, inclusive aguardando pagamento e cancelada.
 * Cadastro = conta que chegou por link ou QR (`squadAttributions`); código digitado entra direto
 * na inscrição, sem passar por aqui. Cliques no link ainda não são medidos (`null` → "—").
 */
import { addDaysToKey, type Cycle } from './squad-program';
import { dayMonthOfKey, spDateKey, type Commission, type CommissionOrigin } from '../comissoes/data/commission';

const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

export function isConversion(c: Pick<Commission, 'status'>): boolean {
  return c.status === 'released' || c.status === 'paid';
}

// ── ciclo ───────────────────────────────────────────────────────────────────

export interface CycleProgress {
  state: 'before' | 'running' | 'done';
  /** Dia do ciclo (1 = primeiro dia); 0 antes de começar. */
  day: number;
  total: number;
  /** Quanto da barra já andou (0–100). */
  pct: number;
  /** Revisão de meio de ciclo (dia 45 no piloto de 90). */
  reviewDay: number;
  startLabel: string;
  endLabel: string;
  /** Texto da pílula ao lado do título: "Piloto · dia 38 de 90". */
  pill: string;
}

function daysBetweenKeys(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS);
}

export function cycleProgress(cycle: Cycle, now: Date): CycleProgress {
  const total = daysBetweenKeys(cycle.start, cycle.end) + 1;
  const today = spDateKey(now);
  const name = cycle.id === 'piloto' ? 'Piloto' : 'Ciclo';
  const base = {
    total,
    reviewDay: Math.round(total / 2),
    startLabel: dayMonthOfKey(cycle.start),
    endLabel: dayMonthOfKey(cycle.end),
  };
  if (today < cycle.start) {
    return { ...base, state: 'before', day: 0, pct: 0, pill: `${name} · começa em ${base.startLabel}` };
  }
  if (today > cycle.end) {
    return { ...base, state: 'done', day: total, pct: 100, pill: `${name} · encerrado em ${base.endLabel}` };
  }
  const day = daysBetweenKeys(cycle.start, today) + 1;
  return { ...base, state: 'running', day, pct: (day / total) * 100, pill: `${name} · dia ${day} de ${total}` };
}

/** Primeiro dia do próximo ciclo, para quando o atual já acabou. */
export function nextCycleLabel(cycle: Cycle): string {
  return dayMonthOfKey(addDaysToKey(cycle.end, 1));
}

// ── funil e origem ──────────────────────────────────────────────────────────

export interface Funnel {
  /** Cliques no link/QR: sem medição ainda. */
  clicks: number | null;
  signups: number;
  registrations: number;
  paid: number;
}

export function funnelOf(commissions: Pick<Commission, 'status'>[], signups: number): Funnel {
  return {
    clicks: null,
    signups,
    registrations: commissions.length,
    paid: commissions.filter(isConversion).length,
  };
}

export interface FunnelStep {
  label: string;
  value: number | null;
  /** Largura da barra (0–100), relativa ao maior número conhecido. */
  pct: number;
}

export function funnelSteps(f: Funnel): FunnelStep[] {
  const steps: Array<[string, number | null]> = [
    ['Cliques', f.clicks],
    ['Cadastros', f.signups],
    ['Inscrições', f.registrations],
    ['Pagas', f.paid],
  ];
  const max = Math.max(1, ...steps.map(([, v]) => v ?? 0));
  return steps.map(([label, value]) => ({ label, value, pct: value === null ? 0 : Math.max(4, (value / max) * 100) }));
}

/** % das conversões por origem, inteiros que somam 100 (maior resto). Sem conversão: tudo 0. */
export function originSplit(commissions: Pick<Commission, 'status' | 'origin'>[]): Record<CommissionOrigin, number> {
  const out: Record<CommissionOrigin, number> = { code: 0, link: 0, qr: 0 };
  const paid = commissions.filter(isConversion);
  if (paid.length === 0) return out;
  const origins: CommissionOrigin[] = ['code', 'link', 'qr'];
  const raw = origins.map((o) => (paid.filter((c) => c.origin === o).length / paid.length) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, rest: v - floors[i]! })).sort((a, b) => b.rest - a.rest);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i]!++;
    left--;
  }
  origins.forEach((o, i) => (out[o] = floors[i]!));
  return out;
}

/** Conversões e receita líquida da última semana (pela data da inscrição). */
export function weekOf(commissions: Pick<Commission, 'status' | 'netCents' | 'registeredAt'>[], now: Date): {
  conversions: number;
  revenueCents: number;
} {
  const from = now.getTime() - WEEK_MS;
  const recent = commissions.filter((c) => isConversion(c) && c.registeredAt !== null && c.registeredAt.getTime() >= from);
  return { conversions: recent.length, revenueCents: recent.reduce((n, c) => n + c.netCents, 0) };
}

// ── formatação ──────────────────────────────────────────────────────────────

export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;
}

/** "1,5x" com 1 casa, sem o "x" sobrando quando não há número. */
export function multiplier(v: number): string {
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`;
}
