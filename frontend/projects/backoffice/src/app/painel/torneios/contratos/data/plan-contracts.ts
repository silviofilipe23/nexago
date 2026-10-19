/**
 * Contratos de plano pedidos pelos organizadores (Torneios › Contratos): leitura dos docs de
 * `tournamentPlanContracts/{tournamentId}` e `/sponsors`, e a régua de status. Espelho à mão de
 * `functions/src/tournament-plan-contracts-admin.ts` (`NEXT_STATUS`, conclusão só depois do
 * último dia) — mudou lá, muda aqui. Dinheiro em centavos; datas civis de São Paulo.
 */
import type { PillTone } from '../../../ui/pill.component';
import { brl, type CancelPolicy } from '../../planos/data/tournament-plans';

export { CANCEL_LABEL } from '../../planos/data/tournament-plans';

export type ContractStatus = 'requested' | 'deposit_paid' | 'paid' | 'completed' | 'cancelled';
export type SponsorLogoStatus = 'missing' | 'review' | 'approved' | 'rejected';

const CONTRACT_STATUSES: readonly ContractStatus[] = ['requested', 'deposit_paid', 'paid', 'completed', 'cancelled'];
const LOGO_STATUSES: readonly SponsorLogoStatus[] = ['missing', 'review', 'approved', 'rejected'];
const CANCEL_POLICIES: readonly CancelPolicy[] = ['total', 'parcial', 'nenhum'];

/** O plano como ficou congelado no pedido. */
export interface ContractPlan {
  name: string;
  description: string;
  priceCents: number;
  depositPct: number;
  balanceDays: number;
  cancelPolicy: CancelPolicy;
  courts: number;
  refsPerCourt: number;
  live: boolean;
  narrator: boolean;
  hours: number;
  extraHourCents: number;
  leadDays: number;
  cities: string[];
}

export interface ContractTier {
  id: string;
  name: string;
  color: string;
  priceCents: number;
  appearances: number;
  seconds: number;
  mentions: number;
  maxPerEvent: number;
}

export interface HistoryEntry {
  status: ContractStatus;
  at: Date | null;
  by: string | null;
  note: string | null;
}

export interface PlanContract {
  /** = tournamentId (um contrato por evento). */
  id: string;
  tournamentName: string;
  city: string;
  startDate: string;
  endDate: string;
  organizerId: string;
  organizerName: string;
  planId: string;
  planVersion: number | null;
  plan: ContractPlan;
  priceCents: number;
  depositCents: number;
  balanceCents: number;
  balanceDueDate: string;
  sponsors: { enabled: boolean; organizerSharePct: number; logoApproval: boolean; tiers: ContractTier[] };
  status: ContractStatus;
  createdAt: Date | null;
  cancelReason: string | null;
  history: HistoryEntry[];
}

export interface PlanSponsor {
  id: string;
  name: string;
  tierId: string;
  tier: ContractTier;
  logoUrl: string | null;
  logoStatus: SponsorLogoStatus;
  logoRejectReason: string | null;
  /** Quem trouxe: o organizador (a NexaGO só aprova a logo) ou a própria NexaGO. */
  source: 'organizer' | 'nexago';
  createdAt: Date | null;
}

// ── leitura ────────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

function obj(v: unknown): Raw {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {};
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function dateOf(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const o = obj(v);
  return typeof o['toDate'] === 'function' ? (o['toDate'] as () => Date)() : null;
}

function planFromRaw(raw: unknown): ContractPlan {
  const p = obj(raw);
  const cancel = str(p['cancelPolicy']) as CancelPolicy;
  return {
    name: str(p['name'], 'Plano'),
    description: str(p['description']),
    priceCents: num(p['priceCents']),
    depositPct: num(p['depositPct'], 50),
    balanceDays: num(p['balanceDays']),
    cancelPolicy: CANCEL_POLICIES.includes(cancel) ? cancel : 'parcial',
    courts: Math.max(1, num(p['courts'], 1)),
    refsPerCourt: num(p['refsPerCourt']),
    live: p['live'] === true,
    narrator: p['live'] === true && p['narrator'] === true,
    hours: num(p['hours']),
    extraHourCents: num(p['extraHourCents']),
    leadDays: num(p['leadDays']),
    cities: Array.isArray(p['cities']) ? p['cities'].filter((c): c is string => typeof c === 'string') : [],
  };
}

function tierFromRaw(raw: unknown): ContractTier {
  const t = obj(raw);
  return {
    id: str(t['id']),
    name: str(t['name'], 'Cota'),
    color: /^#[0-9A-Fa-f]{6}$/.test(str(t['color'])) ? str(t['color']) : '#C9CDD4',
    priceCents: num(t['priceCents']),
    appearances: num(t['appearances']),
    seconds: num(t['seconds'], 5),
    mentions: num(t['mentions']),
    maxPerEvent: num(t['maxPerEvent']),
  };
}

function historyFromRaw(v: unknown): HistoryEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .map(obj)
    .filter((h) => CONTRACT_STATUSES.includes(h['status'] as ContractStatus))
    .map((h) => ({
      status: h['status'] as ContractStatus,
      at: dateOf(h['at']),
      by: str(obj(h['by'])['name']) || null,
      note: str(h['note']).trim() || null,
    }));
}

export function contractFromRaw(id: string, raw: unknown): PlanContract | null {
  const c = obj(raw);
  const status = str(c['status']) as ContractStatus;
  if (!CONTRACT_STATUSES.includes(status) || !str(c['startDate'])) return null;
  const s = obj(c['sponsors']);
  const plan = planFromRaw(c['plan']);
  return {
    id,
    tournamentName: str(c['tournamentName'], 'Torneio'),
    city: str(c['city']),
    startDate: str(c['startDate']),
    endDate: str(c['endDate']) || str(c['startDate']),
    organizerId: str(c['organizerId']),
    organizerName: str(obj(c['createdBy'])['name']) || 'Organizador',
    planId: str(c['planId']),
    planVersion: typeof c['planVersion'] === 'number' ? c['planVersion'] : null,
    plan,
    priceCents: num(c['priceCents'], plan.priceCents),
    depositCents: num(c['depositCents']),
    balanceCents: num(c['balanceCents']),
    balanceDueDate: str(c['balanceDueDate']),
    sponsors: {
      enabled: s['enabled'] === true,
      organizerSharePct: num(s['organizerSharePct']),
      logoApproval: s['logoApproval'] === true,
      tiers: Array.isArray(s['tiers']) ? s['tiers'].map(tierFromRaw).filter((t) => t.id) : [],
    },
    status,
    createdAt: dateOf(c['createdAt']),
    cancelReason: str(c['cancelReason']).trim() || null,
    history: historyFromRaw(c['history']),
  };
}

export function sponsorFromRaw(id: string, raw: unknown): PlanSponsor | null {
  const s = obj(raw);
  const name = str(s['name']).trim();
  if (!name) return null;
  const logoStatus = str(s['logoStatus']) as SponsorLogoStatus;
  const tier = tierFromRaw({ ...obj(s['tier']), id: str(s['tierId']) || str(obj(s['tier'])['id']) });
  return {
    id,
    name,
    tierId: tier.id,
    tier,
    logoUrl: str(s['logoUrl']) || null,
    logoStatus: LOGO_STATUSES.includes(logoStatus) ? logoStatus : 'missing',
    logoRejectReason: str(s['logoRejectReason']).trim() || null,
    source: s['source'] === 'nexago' ? 'nexago' : 'organizer',
    createdAt: dateOf(s['createdAt']),
  };
}

// ── datas ──────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** "2026-11-28" → "28 Nov". */
export function dayLabel(day: string): string {
  const [, m, d] = day.split('-');
  const month = MONTHS[Number(m) - 1];
  return month && d ? `${d} ${month}` : day;
}

/** "28–30 Nov 2026"; "30 Nov – 01 Dez 2026" quando vira o mês; um dia só = "28 Nov 2026". */
export function dayRangeLabel(start: string, end: string): string {
  const year = (end || start).slice(0, 4);
  if (!end || end === start) return `${dayLabel(start)} ${year}`;
  if (start.slice(0, 7) === end.slice(0, 7)) return `${start.slice(8)}–${dayLabel(end)} ${year}`;
  return `${dayLabel(start)} – ${dayLabel(end)} ${year}`;
}

// ── status ─────────────────────────────────────────────────────────────────

export const CONTRACT_STATUS_VIEW: Record<ContractStatus, { label: string; tone: PillTone }> = {
  requested: { label: 'Solicitado', tone: 'orange' },
  deposit_paid: { label: 'Sinal pago', tone: 'yellow' },
  paid: { label: 'Pago', tone: 'green' },
  completed: { label: 'Concluído', tone: 'dim' },
  cancelled: { label: 'Cancelado', tone: 'dim' },
};

export const LOGO_STATUS_VIEW: Record<SponsorLogoStatus, { label: string; tone: PillTone }> = {
  missing: { label: 'Sem logo', tone: 'dim' },
  review: { label: 'Logo em análise', tone: 'yellow' },
  approved: { label: 'Aprovada', tone: 'green' },
  rejected: { label: 'Recusada', tone: 'red' },
};

/** Fim da frase do aviso depois de mudar o status ("Open Goiânia: sinal confirmado."). */
export const STATUS_DONE: Record<ContractStatus, string> = {
  requested: 'contrato reaberto.',
  deposit_paid: 'sinal confirmado.',
  paid: 'contrato quitado.',
  completed: 'contrato concluído.',
  cancelled: 'contrato cancelado.',
};

export function isOpen(status: ContractStatus): boolean {
  return status === 'requested' || status === 'deposit_paid' || status === 'paid';
}

export interface NextStep {
  to: ContractStatus;
  label: string;
  /** Texto do diálogo de confirmação. */
  confirm: string;
  /** Por que ainda não dá (botão desabilitado com o motivo no title). */
  blocked: string | null;
}

/** O próximo passo do contrato, na ordem requested → deposit_paid → paid → completed. */
export function nextStep(c: PlanContract, today: string): NextStep | null {
  switch (c.status) {
    case 'requested':
      return {
        to: 'deposit_paid',
        label: c.depositCents > 0 ? 'Confirmar sinal' : 'Confirmar contrato',
        confirm: c.depositCents > 0
          ? `Confirma que o sinal de ${brl(c.depositCents)} foi recebido? A data fica garantida na agenda e o organizador passa a ver "Sinal pago".`
          : 'Este plano não pede sinal. Confirma o contrato? A data fica garantida na agenda.',
        blocked: null,
      };
    case 'deposit_paid':
      return {
        to: 'paid',
        label: c.balanceCents > 0 ? 'Confirmar saldo' : 'Marcar como pago',
        confirm: c.balanceCents > 0
          ? `Confirma que o saldo de ${brl(c.balanceCents)} foi recebido? O contrato fica quitado.`
          : 'O plano foi pago todo no sinal. Marca o contrato como quitado?',
        blocked: null,
      };
    case 'paid':
      return {
        to: 'completed',
        label: 'Concluir',
        confirm: 'O evento aconteceu e o plano foi entregue? O contrato sai da fila em aberto.',
        blocked: today < c.endDate ? `O evento vai até ${dayLabel(c.endDate)}: conclua depois disso.` : null,
      };
    default:
      return null;
  }
}

export type Attention = { text: string; tone: 'warn' | 'late' | 'dim' };

/** O que o contrato espera da NexaGO, para a coluna da fila. */
export function attentionOf(c: PlanContract, today: string): Attention | null {
  switch (c.status) {
    case 'requested':
      return c.depositCents > 0
        ? { text: `Aguardando sinal de ${brl(c.depositCents)}`, tone: 'warn' }
        : { text: 'Confirmar contrato', tone: 'warn' };
    case 'deposit_paid':
      if (c.balanceCents === 0) return { text: 'Marcar como pago', tone: 'warn' };
      return c.balanceDueDate && c.balanceDueDate < today
        ? { text: `Saldo vencido em ${dayLabel(c.balanceDueDate)}`, tone: 'late' }
        : { text: `Saldo vence ${dayLabel(c.balanceDueDate)}`, tone: 'dim' };
    case 'paid':
      return today >= c.endDate ? { text: 'Evento terminou: concluir', tone: 'warn' } : null;
    default:
      return null;
  }
}

// ── fila ───────────────────────────────────────────────────────────────────

export type ContractTab = 'abertos' | ContractStatus | 'todos';

export const CONTRACT_TABS: ReadonlyArray<{ id: ContractTab; label: string }> = [
  { id: 'abertos', label: 'Em aberto' },
  { id: 'requested', label: 'Solicitados' },
  { id: 'deposit_paid', label: 'Sinal pago' },
  { id: 'paid', label: 'Pagos' },
  { id: 'completed', label: 'Concluídos' },
  { id: 'cancelled', label: 'Cancelados' },
  { id: 'todos', label: 'Todos' },
];

export function tabOf(v: string | null | undefined): ContractTab {
  return CONTRACT_TABS.some((t) => t.id === v) ? (v as ContractTab) : 'abertos';
}

export function inTab(c: PlanContract, tab: ContractTab): boolean {
  if (tab === 'todos') return true;
  if (tab === 'abertos') return isOpen(c.status);
  return c.status === tab;
}

export function tabCounts(list: readonly PlanContract[]): Record<ContractTab, number> {
  return Object.fromEntries(CONTRACT_TABS.map((t) => [t.id, list.filter((c) => inTab(c, t.id)).length])) as Record<
    ContractTab,
    number
  >;
}

/** Pela data do evento (o mais próximo primeiro); mesmo dia, o pedido mais antigo primeiro. */
export function sortByEvent(list: readonly PlanContract[]): PlanContract[] {
  return [...list].sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) ||
      a.id.localeCompare(b.id),
  );
}

export function matchesSearch(c: PlanContract, q: string): boolean {
  const term = fold(q.trim());
  if (!term) return true;
  return [c.tournamentName, c.organizerName, c.city, c.plan.name].some((v) => fold(v).includes(term));
}

function fold(v: string): string {
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// ── cotas ──────────────────────────────────────────────────────────────────

export interface TierUsage {
  tier: ContractTier;
  used: number;
  left: number;
}

export function tierUsage(tiers: readonly ContractTier[], sponsors: readonly PlanSponsor[]): TierUsage[] {
  return tiers.map((tier) => {
    const used = sponsors.filter((s) => s.tierId === tier.id).length;
    return { tier, used, left: Math.max(0, tier.maxPerEvent - used) };
  });
}

/** Logos esperando decisão: em análise vêm primeiro na lista do detalhe. */
export function sortSponsors(list: readonly PlanSponsor[]): PlanSponsor[] {
  const rank: Record<SponsorLogoStatus, number> = { review: 0, rejected: 1, missing: 2, approved: 3 };
  return [...list].sort(
    (a, b) => rank[a.logoStatus] - rank[b.logoStatus] || b.tier.priceCents - a.tier.priceCents || a.name.localeCompare(b.name, 'pt-BR'),
  );
}

export function sponsorsRevenueCents(sponsors: readonly PlanSponsor[]): number {
  return sponsors.reduce((sum, s) => sum + s.tier.priceCents, 0);
}

/** "50 aparições de 5s + 2 menções do narrador". */
export function tierDeliveryLabel(t: Pick<ContractTier, 'appearances' | 'seconds' | 'mentions'>): string {
  const base = `${t.appearances} ${t.appearances === 1 ? 'aparição' : 'aparições'} de ${t.seconds}s`;
  if (!t.mentions) return base;
  return `${base} + ${t.mentions} ${t.mentions === 1 ? 'menção' : 'menções'} do narrador`;
}

export const SPONSOR_NAME_MAX = 40;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const MAX_LOGO_BYTES = 4 * 1024 * 1024;

export function validateSponsorLogo(file: Pick<File, 'type' | 'size'>): string | null {
  if (!LOGO_TYPES.includes(file.type)) return 'Envie a logo em PNG (de preferência com fundo transparente), JPG, WebP ou SVG.';
  if (file.size > MAX_LOGO_BYTES) return 'Imagem muito grande (máximo 4 MB).';
  return null;
}

export function sponsorNameIssue(name: string): string | null {
  const n = name.trim();
  if (n.length < 2) return 'Informe o nome do patrocinador.';
  if (n.length > SPONSOR_NAME_MAX) return `Use até ${SPONSOR_NAME_MAX} caracteres.`;
  return null;
}
