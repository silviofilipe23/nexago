/**
 * NexaSquad no portal do atleta: o formato das três leituras que as telas usam.
 *
 *   getMySquad / getSquadRanking — `functions/src/squad-athlete.ts` (a visão do embaixador que app e
 *                                  portal dividem: `SquadMemberView`, `SquadRankingView`).
 *   getSquadPortalInfo           — `functions/src/squad-athlete-portal.ts` (só do portal: "Entrar no
 *                                  Squad", cadastros do funil e checklist da promoção).
 *
 * Espelho à mão desses tipos: mudou lá, muda aqui. Datas chegam como ISO (instante) ou `YYYY-MM-DD`
 * (data civil de SP). O servidor já saneou tudo; aqui só se confere o formato, para uma resposta
 * torta virar estado de erro em vez de tela quebrada.
 */

export type SquadTier = 'ath' | 'amb' | 'pro' | 'cap';
export type RegistrationType = 'discount' | 'freePerMonth' | 'freeUnlimited';
export type CommissionStatus = 'pending' | 'released' | 'paid' | 'canceled';
export type CancelReason = 'refund' | 'chargeback' | 'manual';
export type CommissionOrigin = 'code' | 'link' | 'qr';
export type PublicApplicationStatus = 'review' | 'invited' | 'waitlist' | 'rejected';

export const SQUAD_TIERS: readonly SquadTier[] = ['ath', 'amb', 'pro', 'cap'];

export interface AthletePackage {
  tier: SquadTier;
  tierLabel: string;
  commissionPct: number | [number, number];
  followerDiscountPct: number;
  registrations: { type: RegistrationType; value: number | null };
  kit: string;
  events: string;
  partnerHalfOff: boolean;
  campaignFee: boolean;
  tournamentOriginBonusCents: number | null;
}

export interface SquadCommission {
  id: string;
  /** Data da inscrição (ISO). */
  at: string | null;
  label: string;
  tournamentName: string;
  categoryName: string;
  origin: CommissionOrigin;
  amountCents: number;
  status: CommissionStatus;
  cancelReason: CancelReason | null;
}

export interface SquadMember {
  tier: SquadTier;
  tierLabel: string;
  code: string;
  status: 'active' | 'paused';
  pausedUntil: string | null;
  endsAt: string | null;
  start: string | null;
  end: string | null;
  cycleId: string;
  commissionPct: number;
  followerDiscountPct: number;
  followerDiscountFirstOnly: boolean;
  /** Em que compras o desconto vale. Ausente (backend antigo) = em todas. */
  followerDiscountScope?: { registration: boolean; booking: boolean; club: boolean };
  pendingAmendment: { at: string | null; package: AthletePackage } | null;
  earnings: {
    totalCents: number;
    availableCents: number;
    nextPayoutCents: number;
    pendingCents: number;
    receivedCents: number;
    revenueCents: number;
    nextPayoutDate: string;
    minPayoutCents: number;
  };
  conversions: number;
  athletes: number;
  weekly: Array<{ weekStart: string; cents: number }>;
  commissions: SquadCommission[];
  payouts: Array<{ id: string; at: string | null; amountCents: number }>;
  points: { total: number; level: string; levels: Array<{ name: string; min: number }>; perConversion: number };
  progress: { toTier: SquadTier; toTierLabel: string; conversions: number; minConversions: number; reviewDate: string | null } | null;
  package: AthletePackage;
  nextPackage: AthletePackage | null;
}

export interface SquadInviteSummary {
  id: string;
  tier: SquadTier;
  tierLabel: string;
  expiresAt: string | null;
}

export interface MySquad {
  member: SquadMember | null;
  invite: SquadInviteSummary | null;
}

export interface RankingEntry {
  position: number;
  name: string;
  photoUrl: string | null;
  points: number;
  /** Posições ganhas na semana; `null` = não estava no ranking há 7 dias. */
  delta: number | null;
  me: boolean;
}

export interface SquadRanking {
  entries: RankingEntry[];
  me: RankingEntry | null;
  level: string;
  levels: Array<{ name: string; min: number }>;
}

export interface SquadCycle {
  id: string;
  start: string;
  end: string;
  seats: number;
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

export interface SquadJoinInfo {
  profile: CandidateProfile | null;
  application: { status: PublicApplicationStatus; submittedAt: string | null } | null;
  invite: SquadInviteSummary | null;
  pastContract: { tier: SquadTier; endedAt: string | null } | null;
  cycle: SquadCycle;
  seatsLeft: number;
  nextCycleStart: string;
  followerDiscountPct: number;
}

export interface SquadPortalMemberInfo {
  signups: number;
  registrations: number;
  pending: number;
  promotionChecklist: string[];
}

export interface SquadPortalInfo {
  join: SquadJoinInfo | null;
  member: SquadPortalMemberInfo | null;
}

/** O que as telas recebem: embaixador (contrato vivo) ou candidato. */
export interface AmbassadorView {
  kind: 'ambassador';
  member: SquadMember;
  /** `null` quando o ranking não respondeu: o card avisa e o resto da tela segue. */
  ranking: SquadRanking | null;
  extras: SquadPortalMemberInfo;
}

export interface CandidateView {
  kind: 'candidate';
  join: SquadJoinInfo;
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

function memberOk(m: unknown): m is SquadMember {
  return (
    isObj(m) &&
    isTier(m['tier']) &&
    typeof m['code'] === 'string' &&
    isObj(m['earnings']) &&
    isObj(m['points']) &&
    isObj(m['package']) &&
    Array.isArray(m['commissions']) &&
    Array.isArray(m['payouts']) &&
    Array.isArray(m['weekly'])
  );
}

function rankingOk(r: unknown): r is SquadRanking {
  return isObj(r) && Array.isArray(r['entries']);
}

/**
 * Junta as três leituras. Contrato vivo no `getMySquad` = embaixador (mesmo se o portal-info, lido
 * no mesmo instante, ainda não viu o contrato); senão, candidato. Formato inesperado → `null`.
 */
export function composeSquadView(mySquad: unknown, portal: unknown, ranking: unknown): SquadAthleteView | null {
  if (!isObj(mySquad) || !isObj(portal)) return null;
  const member = mySquad['member'];
  if (member != null) {
    if (!memberOk(member)) return null;
    const extras = isObj(portal['member'])
      ? (portal['member'] as unknown as SquadPortalMemberInfo)
      : { signups: 0, registrations: 0, pending: 0, promotionChecklist: [] };
    return { kind: 'ambassador', member, ranking: rankingOk(ranking) ? ranking : null, extras };
  }
  const join = portal['join'];
  if (!isObj(join) || !isObj(join['cycle']) || typeof join['seatsLeft'] !== 'number') return null;
  return { kind: 'candidate', join: join as unknown as SquadJoinInfo };
}
