/**
 * NexaSquad no portal do atleta: o formato da resposta de `getMySquadView`.
 *
 * Espelho à mão de `functions/src/squad-athlete.ts` (tipos `SquadAthleteView` e vizinhos):
 * mudou lá, muda aqui. Datas chegam como ISO (instante) ou `YYYY-MM-DD` (data civil de SP).
 * O servidor já saneou tudo — aqui só se confere o formato, para uma resposta torta virar
 * estado de erro em vez de tela quebrada.
 */

export type SquadTier = 'ath' | 'amb' | 'pro' | 'cap';
export type RegistrationType = 'discount' | 'freePerMonth' | 'freeUnlimited';
export type CommissionStatus = 'pending' | 'released' | 'held' | 'paid' | 'canceled';
export type CancelReason = 'refund' | 'chargeback' | 'payment_failed' | 'manual';
export type ContractStatus = 'active' | 'paused' | 'ended';
export type CommissionOrigin = 'code' | 'link' | 'qr';
export type PublicApplicationStatus = 'review' | 'invited' | 'waitlist' | 'rejected';

export const SQUAD_TIERS: readonly SquadTier[] = ['ath', 'amb', 'pro', 'cap'];

export interface PublicPackage {
  commissionPct: number | [number, number];
  followerDiscountPct: number;
  registrations: { type: RegistrationType; value: number | null };
  kit: string;
  events: string;
  partnerHalfOff: boolean;
  campaignFee: boolean;
  tournamentOriginBonusCents: number | null;
}

export interface SquadCycle {
  id: string;
  start: string;
  end: string;
  seats: number;
}

export interface SquadCommissionLine {
  id: string;
  at: string | null;
  releasedAt: string | null;
  athlete: string;
  event: string;
  origin: CommissionOrigin;
  grossCents: number;
  amountCents: number;
  status: CommissionStatus;
  cancelReason: CancelReason | null;
}

export interface SquadAdjustmentLine {
  id: string;
  at: string | null;
  amountCents: number;
  athlete: string;
}

export interface SquadWalletLine {
  id: string;
  at: string | null;
  amountCents: number;
  label: string;
}

export interface SquadRankRow {
  position: number;
  name: string;
  points: number;
  delta: number;
  me: boolean;
}

export interface SquadTotals {
  earnedCents: number;
  availableCents: number;
  heldCents: number;
  pendingCents: number;
  pendingCount: number;
  receivedCents: number;
  lastPayoutAt: string | null;
  grossCents: number;
  conversions: number;
  athletes: number;
  monthConversions: number;
}

export interface SquadPoints {
  total: number;
  conversions: number;
  events: number | null;
  content: number | null;
  perConversion: number;
  perEvent: number;
  perContent: number;
  levels: Array<{ name: string; min: number }>;
}

export type SquadPromotion =
  | {
      kind: 'promotion';
      to: SquadTier;
      conversions: number;
      min: number;
      checklist: string[];
      evaluation: string | null;
      nextPackage: PublicPackage;
    }
  | { kind: 'top' }
  | { kind: 'captain' };

export interface AmbassadorView {
  kind: 'ambassador';
  name: string;
  contract: {
    tier: SquadTier;
    code: string;
    status: ContractStatus;
    start: string | null;
    end: string | null;
    endedAt: string | null;
    pausedUntil: string | null;
    commissionPct: number;
    followerDiscountPct: number;
    followerDiscountFirstOnly: boolean;
    pendingTier: SquadTier | null;
  };
  cycle: SquadCycle;
  package: PublicPackage;
  payout: { nextDate: string; days: number[]; minNetCents: number };
  totals: SquadTotals;
  funnel: { clicks: null; signups: number; registrations: number; paid: number };
  commissions: SquadCommissionLine[];
  adjustments: SquadAdjustmentLine[];
  wallet: SquadWalletLine[];
  points: SquadPoints;
  ranking: { rows: SquadRankRow[]; of: number };
  promotion: SquadPromotion;
}

export interface CandidateProfile {
  name: string;
  city: string | null;
  state: string | null;
  arenaName: string | null;
  tournaments: number | null;
  elo: string | null;
  photoUrl: string | null;
}

export interface CandidateView {
  kind: 'candidate';
  profile: CandidateProfile | null;
  application: { status: PublicApplicationStatus; submittedAt: string | null } | null;
  invite: { tier: SquadTier; expiresAt: string | null } | null;
  cycle: SquadCycle;
  seatsLeft: number;
  nextCycleStart: string;
  followerDiscountPct: number;
}

export type SquadAthleteView = AmbassadorView | CandidateView;

/** Grupo da pergunta "Você lidera alguma turma?" — os valores que `submitSquadApplication` aceita. */
export type LeadsGroup = 'no' | 'lt10' | '10to30' | 'gt30';

export interface ApplicationAnswers {
  instagram: string | null;
  city: string;
  leadsGroup: LeadsGroup;
  why: string;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isTier(v: unknown): v is SquadTier {
  return typeof v === 'string' && (SQUAD_TIERS as readonly string[]).includes(v);
}

/** Confere o mínimo de que as telas dependem. Formato inesperado → `null` (a tela mostra erro). */
export function parseSquadView(raw: unknown): SquadAthleteView | null {
  if (!isObj(raw) || !isObj(raw['cycle'])) return null;
  if (raw['kind'] === 'candidate') {
    return typeof raw['seatsLeft'] === 'number' && typeof raw['nextCycleStart'] === 'string'
      ? (raw as unknown as CandidateView)
      : null;
  }
  if (raw['kind'] !== 'ambassador') return null;
  const c = raw['contract'];
  const ok =
    isObj(c) &&
    isTier(c['tier']) &&
    typeof c['code'] === 'string' &&
    isObj(raw['totals']) &&
    isObj(raw['points']) &&
    isObj(raw['ranking']) &&
    isObj(raw['promotion']) &&
    isObj(raw['package']) &&
    Array.isArray(raw['commissions']) &&
    Array.isArray(raw['adjustments']) &&
    Array.isArray(raw['wallet']);
  return ok ? (raw as unknown as AmbassadorView) : null;
}
