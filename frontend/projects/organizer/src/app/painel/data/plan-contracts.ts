import type { PillTone } from './mock-data';
import type { OrganizerTournament } from './tournament.model';

/**
 * Planos NexaGO e cotas Sponsors do lado do organizador — leitura e regras de tela. O servidor
 * (`functions/src/tournament-plan-contracts.ts`) é quem valida e grava; o que se repete aqui
 * (antecedência, cidade atendida, sinal, vencimento do saldo) é só pra tela avisar antes do
 * clique, com a mesma régua. Mudou lá, muda aqui.
 */

export type CancelPolicy = 'total' | 'parcial' | 'nenhum';

export interface CatalogPlan {
  id: string;
  order: number;
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

export interface SponsorTier {
  id: string;
  name: string;
  color: string;
  priceCents: number;
  appearances: number;
  seconds: number;
  mentions: number;
  maxPerEvent: number;
}

export interface CatalogSponsors {
  tiers: SponsorTier[];
  organizerSharePct: number;
  organizerCanSell: boolean;
  logoApproval: boolean;
}

export interface PlanCatalog {
  plans: CatalogPlan[];
  sponsors: CatalogSponsors;
  feePercent: number;
  /** `YYYY-MM-DD` em São Paulo, do servidor. */
  today: string;
}

export type ContractStatus = 'requested' | 'deposit_paid' | 'paid' | 'completed' | 'cancelled';

export interface ContractSponsors {
  enabled: boolean;
  organizerSharePct: number;
  logoApproval: boolean;
  tiers: SponsorTier[];
}

export interface PlanContract {
  tournamentId: string;
  tournamentName: string;
  city: string;
  startDate: string;
  endDate: string;
  planId: string;
  plan: CatalogPlan;
  priceCents: number;
  depositCents: number;
  balanceCents: number;
  balanceDueDate: string;
  sponsors: ContractSponsors;
  status: ContractStatus;
  createdAt: Date | null;
}

export type SponsorLogoStatus = 'missing' | 'review' | 'approved' | 'rejected';

export interface PlanSponsor {
  id: string;
  name: string;
  tierId: string;
  tier: SponsorTier;
  logoUrl: string | null;
  logoStatus: SponsorLogoStatus;
  /** Quem trouxe o patrocinador: o organizador ou a própria NexaGO. */
  source: 'organizer' | 'nexago';
  createdAt: Date | null;
}

export const SPONSOR_NAME_MAX = 40;

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

function bool(v: unknown): boolean {
  return v === true;
}

function dateOf(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const o = obj(v);
  return typeof o['toDate'] === 'function' ? (o['toDate'] as () => Date)() : null;
}

const CANCEL_POLICIES: readonly CancelPolicy[] = ['total', 'parcial', 'nenhum'];
const CONTRACT_STATUSES: readonly ContractStatus[] = ['requested', 'deposit_paid', 'paid', 'completed', 'cancelled'];
const LOGO_STATUSES: readonly SponsorLogoStatus[] = ['missing', 'review', 'approved', 'rejected'];

export function catalogPlanFromRaw(raw: unknown): CatalogPlan {
  const p = obj(raw);
  const cancel = str(p['cancelPolicy']) as CancelPolicy;
  return {
    id: str(p['id']),
    order: num(p['order']),
    name: str(p['name'], 'Plano'),
    description: str(p['description']),
    priceCents: num(p['priceCents']),
    depositPct: num(p['depositPct'], 50),
    balanceDays: num(p['balanceDays']),
    cancelPolicy: CANCEL_POLICIES.includes(cancel) ? cancel : 'parcial',
    courts: Math.max(1, num(p['courts'], 1)),
    refsPerCourt: num(p['refsPerCourt']),
    live: bool(p['live']),
    narrator: bool(p['live']) && bool(p['narrator']),
    hours: num(p['hours']),
    extraHourCents: num(p['extraHourCents']),
    leadDays: num(p['leadDays']),
    cities: Array.isArray(p['cities']) ? p['cities'].filter((c): c is string => typeof c === 'string') : [],
  };
}

export function sponsorTierFromRaw(raw: unknown): SponsorTier {
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

function tiersOf(v: unknown): SponsorTier[] {
  return Array.isArray(v) ? v.map(sponsorTierFromRaw).filter((t) => t.id) : [];
}

export function catalogFromRaw(raw: unknown): PlanCatalog {
  const r = obj(raw);
  const s = obj(r['sponsors']);
  return {
    plans: (Array.isArray(r['plans']) ? r['plans'] : []).map(catalogPlanFromRaw).filter((p) => p.id),
    sponsors: {
      tiers: tiersOf(s['tiers']),
      organizerSharePct: num(s['organizerSharePct']),
      organizerCanSell: bool(s['organizerCanSell']),
      logoApproval: bool(s['logoApproval']),
    },
    feePercent: num(r['feePercent'], 8),
    today: str(r['today']) || saoPauloDate(new Date()),
  };
}

export function contractFromRaw(id: string, raw: unknown): PlanContract | null {
  const c = obj(raw);
  const status = str(c['status']) as ContractStatus;
  if (!CONTRACT_STATUSES.includes(status) || !str(c['startDate'])) return null;
  const s = obj(c['sponsors']);
  const plan = catalogPlanFromRaw({ ...obj(c['plan']), id: str(c['planId']) });
  return {
    tournamentId: id,
    tournamentName: str(c['tournamentName'], 'Torneio'),
    city: str(c['city']),
    startDate: str(c['startDate']),
    endDate: str(c['endDate']) || str(c['startDate']),
    planId: str(c['planId']),
    plan,
    priceCents: num(c['priceCents'], plan.priceCents),
    depositCents: num(c['depositCents']),
    balanceCents: num(c['balanceCents']),
    balanceDueDate: str(c['balanceDueDate']),
    sponsors: {
      enabled: bool(s['enabled']),
      organizerSharePct: num(s['organizerSharePct']),
      logoApproval: bool(s['logoApproval']),
      tiers: tiersOf(s['tiers']),
    },
    status,
    createdAt: dateOf(c['createdAt']),
  };
}

export function planSponsorFromRaw(id: string, raw: unknown): PlanSponsor | null {
  const s = obj(raw);
  const name = str(s['name']).trim();
  if (!name) return null;
  const logoStatus = str(s['logoStatus']) as SponsorLogoStatus;
  const tier = sponsorTierFromRaw({ ...obj(s['tier']), id: str(s['tierId']) || str(obj(s['tier'])['id']) });
  return {
    id,
    name,
    tierId: tier.id,
    tier,
    logoUrl: str(s['logoUrl']) || null,
    logoStatus: LOGO_STATUSES.includes(logoStatus) ? logoStatus : 'missing',
    source: s['source'] === 'nexago' ? 'nexago' : 'organizer',
    createdAt: dateOf(s['createdAt']),
  };
}

// ── datas e dinheiro ───────────────────────────────────────────────────────

/** Dia civil em São Paulo (`YYYY-MM-DD`) — a régua do servidor para antecedência e agenda. */
export function saoPauloDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** "2026-11-28" → "28 Nov". */
export function dayLabel(day: string): string {
  const [, m, d] = day.split('-');
  const month = MONTHS[Number(m) - 1];
  return month && d ? `${d} ${month}` : day;
}

/** "28–30 Nov" no mesmo mês; "30 Nov – 01 Dez" quando vira o mês; um dia só = "28 Nov". */
export function dayRangeLabel(start: string, end: string): string {
  if (!end || end === start) return dayLabel(start);
  if (start.slice(0, 7) === end.slice(0, 7)) return `${start.slice(8)}–${dayLabel(end)}`;
  return `${dayLabel(start)} – ${dayLabel(end)}`;
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const BRL_CENTS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Redondo quando não tem centavos ("R$ 3.500"), cheio quando tem ("R$ 1.750,50"). */
export function brl(cents: number): string {
  return cents % 100 === 0 ? BRL.format(cents / 100) : BRL_CENTS.format(cents / 100);
}

export function contractAmounts(plan: Pick<CatalogPlan, 'priceCents' | 'depositPct'>): {
  depositCents: number;
  balanceCents: number;
} {
  const depositCents = Math.round((plan.priceCents * plan.depositPct) / 100);
  return { depositCents, balanceCents: plan.priceCents - depositCents };
}

export function balanceDueDateOf(startDate: string, balanceDays: number, today: string): string {
  const due = addDays(startDate, -balanceDays);
  return due < today ? today : due;
}

// ── catálogo na tela ───────────────────────────────────────────────────────

export const CANCEL_LABEL: Record<CancelPolicy, string> = {
  total: 'Reembolso total até 15 dias antes',
  parcial: 'Retém o sinal',
  nenhum: 'Sem reembolso',
};

export function planRefs(p: Pick<CatalogPlan, 'courts' | 'refsPerCourt'>): number {
  return p.courts * p.refsPerCourt;
}

/** O plano que cobre exatamente as quadras do evento; senão o menor que cobre todas; senão o maior. */
export function recommendedPlanId(plans: readonly CatalogPlan[], courts: number): string | null {
  if (plans.length === 0) return null;
  const exact = plans.find((p) => p.courts === courts);
  if (exact) return exact.id;
  const covering = plans.filter((p) => p.courts >= courts).sort((a, b) => a.courts - b.courts || a.priceCents - b.priceCents);
  if (covering[0]) return covering[0].id;
  return [...plans].sort((a, b) => b.courts - a.courts)[0]!.id;
}

/** Faixa de horas de cobertura dos planos ("10" ou "8 a 12"), pra régua do topo. */
export function hoursRangeLabel(plans: readonly CatalogPlan[]): string | null {
  if (plans.length === 0) return null;
  const hours = plans.map((p) => p.hours);
  const min = Math.min(...hours);
  const max = Math.max(...hours);
  return min === max ? `${max}` : `${min} a ${max}`;
}

function cityKey(city: string): string {
  return city.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

export interface ContractTarget {
  startDate: string;
  city: string | null;
}

/** O que impede o pedido — mesmas checagens do servidor, pra tela travar o botão antes. */
export function contractBlockers(plan: CatalogPlan, target: ContractTarget, today: string): string[] {
  const out: string[] = [];
  const earliest = addDays(today, plan.leadDays);
  if (target.startDate < earliest) {
    out.push(`O ${plan.name} pede ${plan.leadDays} dias de antecedência: o evento precisaria começar a partir de ${dayLabel(earliest)}.`);
  }
  if (plan.cities.length > 0) {
    const city = target.city?.trim() ?? '';
    if (!city) out.push('Informe a cidade do torneio (Editar torneio) antes de contratar.');
    else if (!plan.cities.some((c) => cityKey(c) === cityKey(city))) {
      out.push(`O ${plan.name} ainda não atende ${city}. Cidades: ${plan.cities.join(', ')}.`);
    }
  }
  return out;
}

/** Aviso (não bloqueia): o plano cobre menos quadras do que o evento tem. */
export function courtsWarning(plan: CatalogPlan, eventCourts: number): string | null {
  if (plan.courts >= eventCourts) return null;
  const rest = eventCourts - plan.courts;
  return `O ${plan.name} cobre ${plan.courts} ${plan.courts > 1 ? 'quadras' : 'quadra'}. ${rest > 1 ? `As outras ${rest} ficam` : 'A outra fica'} sem arbitragem NexaGO.`;
}

/** Torneios do dono, ainda por acontecer, sem contrato ativo — os que podem receber um plano. */
export function contractableTournaments(
  tournaments: readonly OrganizerTournament[],
  contracts: readonly PlanContract[],
  today: string,
): OrganizerTournament[] {
  const taken = new Set(contracts.filter((c) => isActiveContract(c.status)).map((c) => c.tournamentId));
  return tournaments
    .filter((t) => t.myRole === 'owner' && t.startAt != null)
    .filter((t) => t.status !== 'cancelado' && t.status !== 'concluido')
    .filter((t) => saoPauloDate(t.startAt!) >= today && !taken.has(t.id))
    .sort((a, b) => a.startAt!.getTime() - b.startAt!.getTime());
}

// ── contratos na tela ──────────────────────────────────────────────────────

export function isActiveContract(status: ContractStatus): boolean {
  return status === 'requested' || status === 'deposit_paid' || status === 'paid';
}

export const CONTRACT_STATUS_VIEW: Record<ContractStatus, { label: string; tone: PillTone }> = {
  requested: { label: 'Solicitado', tone: 'orange' },
  deposit_paid: { label: 'Sinal pago', tone: 'yellow' },
  paid: { label: 'Pago', tone: 'green' },
  completed: { label: 'Concluído', tone: 'dim' },
  cancelled: { label: 'Cancelado', tone: 'dim' },
};

/** A segunda linha do contrato: o próximo passo do dinheiro, ou como terminou. */
export function contractNextStep(c: PlanContract): string {
  switch (c.status) {
    case 'requested':
      return `A NexaGO confirma a data e envia o sinal de ${brl(c.depositCents)}`;
    case 'deposit_paid':
      return `Saldo de ${brl(c.balanceCents)} até ${dayLabel(c.balanceDueDate)}`;
    case 'paid':
      return 'Equipe confirmada';
    case 'completed':
      return 'Evento concluído';
    case 'cancelled':
      return 'Pedido cancelado';
  }
}

/** Ativos primeiro (pela data do evento), depois o histórico (mais recente antes). */
export function sortContracts(list: readonly PlanContract[]): PlanContract[] {
  return [...list].sort((a, b) => {
    const aa = isActiveContract(a.status);
    const ba = isActiveContract(b.status);
    if (aa !== ba) return aa ? -1 : 1;
    return aa ? a.startDate.localeCompare(b.startDate) : b.startDate.localeCompare(a.startDate);
  });
}

// ── cotas na tela ──────────────────────────────────────────────────────────

export const SPONSOR_STATUS_VIEW: Record<SponsorLogoStatus, { label: string; tone: PillTone }> = {
  missing: { label: 'Enviar logo', tone: 'red' },
  review: { label: 'Logo em análise', tone: 'yellow' },
  approved: { label: 'Aprovado', tone: 'green' },
  rejected: { label: 'Logo recusada', tone: 'red' },
};

export interface TierUsage {
  tier: SponsorTier;
  used: number;
  left: number;
}

export function tierUsage(tiers: readonly SponsorTier[], sponsors: readonly PlanSponsor[]): TierUsage[] {
  return tiers.map((tier) => {
    const used = sponsors.filter((s) => s.tierId === tier.id).length;
    return { tier, used, left: Math.max(0, tier.maxPerEvent - used) };
  });
}

/** Valor das cotas no preço congelado de cada patrocinador. */
export function sponsorsRevenueCents(sponsors: readonly PlanSponsor[]): number {
  return sponsors.reduce((sum, s) => sum + s.tier.priceCents, 0);
}

export function organizerShareCents(revenueCents: number, sharePct: number): number {
  return Math.round((revenueCents * sharePct) / 100);
}

/** "50 aparições de 5s + 2 menções do narrador". */
export function tierDeliveryLabel(t: Pick<SponsorTier, 'appearances' | 'seconds' | 'mentions'>): string {
  const base = `${t.appearances} ${t.appearances === 1 ? 'aparição' : 'aparições'} de ${t.seconds}s`;
  if (!t.mentions) return base;
  return `${base} + ${t.mentions} ${t.mentions === 1 ? 'menção' : 'menções'} do narrador`;
}

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const MAX_LOGO_BYTES = 4 * 1024 * 1024;

export function validatePlanSponsorLogo(file: Pick<File, 'type' | 'size'>): string | null {
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
