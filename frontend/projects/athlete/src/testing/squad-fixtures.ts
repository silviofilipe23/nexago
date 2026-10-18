import type {
  AmbassadorView,
  AthletePackage,
  CandidateView,
  MySquad,
  SquadCommission,
  SquadJoinInfo,
  SquadMember,
  SquadPortalInfo,
  SquadRanking,
} from '../app/squad/data/squad-view';

/** Agora fixo dos specs do Squad: sábado, 17/10/2026, 12h em São Paulo. */
export const SQUAD_TEST_NOW = new Date('2026-10-17T15:00:00Z');

const DAY = 24 * 60 * 60 * 1000;
export const daysAgoIso = (n: number) => new Date(SQUAD_TEST_NOW.getTime() - n * DAY).toISOString();

export function commission(over: Partial<SquadCommission> = {}): SquadCommission {
  return {
    id: 'a1b2c3d4e5f60718',
    at: daysAgoIso(0),
    label: 'Lucas M.',
    tournamentName: 'Open Errejota',
    categoryName: 'Masc. C',
    origin: 'code',
    amountCents: 12_00,
    status: 'released',
    cancelReason: null,
    ...over,
  };
}

const AMB_PACKAGE: AthletePackage = {
  tier: 'amb',
  tierLabel: 'Ambassador',
  commissionPct: 10,
  followerDiscountPct: 10,
  registrations: { type: 'freePerMonth', value: 1 },
  kit: 'Kit completo',
  events: 'Prioridade',
  partnerHalfOff: false,
  campaignFee: false,
  tournamentOriginBonusCents: null,
};

const PRO_PACKAGE: AthletePackage = {
  tier: 'pro',
  tierLabel: 'Pro Ambassador',
  commissionPct: [10, 15],
  followerDiscountPct: 15,
  registrations: { type: 'freeUnlimited', value: null },
  kit: 'Kit premium + uniforme',
  events: 'Prioridade + exclusivos',
  partnerHalfOff: true,
  campaignFee: true,
  tournamentOriginBonusCents: null,
};

export function member(over: Partial<SquadMember> = {}): SquadMember {
  return {
    tier: 'amb',
    tierLabel: 'Ambassador',
    code: 'JOAO10',
    status: 'active',
    pausedUntil: null,
    endsAt: null,
    start: '2026-09-08T03:00:00.000Z',
    end: '2026-12-07T02:59:59.000Z',
    cycleId: 'piloto',
    commissionPct: 10,
    followerDiscountPct: 10,
    followerDiscountFirstOnly: true,
    pendingAmendment: null,
    earnings: {
      totalCents: 336_00,
      availableCents: 132_00,
      nextPayoutCents: 132_00,
      pendingCents: 12_00,
      receivedCents: 180_00,
      revenueCents: 3240_00,
      nextPayoutDate: '2026-10-20',
      minPayoutCents: 20_00,
    },
    conversions: 27,
    athletes: 27,
    weekly: [
      { weekStart: '2026-09-07', cents: 24_00 },
      { weekStart: '2026-09-14', cents: 36_00 },
      { weekStart: '2026-09-21', cents: 48_00 },
      { weekStart: '2026-09-28', cents: 60_00 },
      { weekStart: '2026-10-05', cents: 84_00 },
      { weekStart: '2026-10-12', cents: 72_00 },
    ],
    commissions: [
      commission({ id: 'c1', status: 'pending', label: 'Lucas M.' }),
      commission({ id: 'c2', label: 'Tatiane R.', tournamentName: 'Liga NexaGO', categoryName: 'Etapa 3', origin: 'link', amountCents: 14_00, at: daysAgoIso(1) }),
      commission({ id: 'c3', label: 'Henrique A.', status: 'canceled', cancelReason: 'refund', amountCents: 10_00, at: daysAgoIso(4) }),
    ],
    payouts: [{ id: '2026-10-06', at: '2026-10-06T12:00:00.000Z', amountCents: 180_00 }],
    points: {
      total: 1280,
      level: 'Gold',
      levels: [
        { name: 'Bronze', min: 0 },
        { name: 'Silver', min: 500 },
        { name: 'Gold', min: 1000 },
        { name: 'Elite', min: 2000 },
      ],
      perConversion: 40,
    },
    progress: { toTier: 'pro', toTierLabel: 'Pro Ambassador', conversions: 27, minConversions: 30, reviewDate: '2026-12-07T02:59:59.000Z' },
    package: AMB_PACKAGE,
    nextPackage: PRO_PACKAGE,
    ...over,
  };
}

export function ranking(over: Partial<SquadRanking> = {}): SquadRanking {
  const me = { position: 1, name: 'João Victor', photoUrl: null, points: 1280, delta: 2, me: true };
  return {
    entries: [
      me,
      { position: 2, name: 'Marcos Reis', photoUrl: null, points: 1240, delta: -1, me: false },
      { position: 3, name: 'Rayssa Brito', photoUrl: null, points: 1180, delta: 0, me: false },
    ],
    me,
    level: 'Gold',
    levels: member().points.levels,
    ...over,
  };
}

export function ambassadorView(over: Partial<SquadMember> = {}, rank: SquadRanking | null = ranking()): AmbassadorView {
  return {
    kind: 'ambassador',
    member: member(over),
    ranking: rank,
    extras: { signups: 74, registrations: 31, pending: 1, promotionChecklist: ['Influência relevante', 'Participação consistente'] },
  };
}

export function joinInfo(over: Partial<SquadJoinInfo> = {}): SquadJoinInfo {
  return {
    profile: {
      name: 'Caio Teixeira',
      city: 'Goiânia',
      state: 'GO',
      arenaName: 'Arena Errejota',
      tournaments: 11,
      elo: 'Competidor II',
      photoUrl: null,
    },
    application: null,
    invite: null,
    pastContract: null,
    cycle: { id: 'piloto', start: '2026-09-08', end: '2026-12-06', seats: 20 },
    seatsLeft: 0,
    nextCycleStart: '2026-12-07',
    followerDiscountPct: 10,
    ...over,
  };
}

export function candidateView(over: Partial<SquadJoinInfo> = {}): CandidateView {
  return { kind: 'candidate', join: joinInfo(over) };
}

/** As três respostas das callables para uma visão (o que a `SquadApi` falsa devolve). */
export function callableResponses(view: AmbassadorView | CandidateView): {
  mySquad: MySquad;
  portal: SquadPortalInfo;
  ranking: SquadRanking | null;
} {
  if (view.kind === 'ambassador') {
    return { mySquad: { member: view.member, invite: null }, portal: { join: null, member: view.extras }, ranking: view.ranking };
  }
  return { mySquad: { member: null, invite: view.join.invite }, portal: { join: view.join, member: null }, ranking: null };
}
