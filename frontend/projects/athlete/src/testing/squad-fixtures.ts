import type { AmbassadorView, CandidateView, SquadCommissionLine } from '../app/squad/data/squad-view';

/** Agora fixo dos specs do Squad: sábado, 17/10/2026, 12h em São Paulo. */
export const SQUAD_TEST_NOW = new Date('2026-10-17T15:00:00Z');

const DAY = 24 * 60 * 60 * 1000;
export const daysAgoIso = (n: number) => new Date(SQUAD_TEST_NOW.getTime() - n * DAY).toISOString();

export function commissionLine(over: Partial<SquadCommissionLine> = {}): SquadCommissionLine {
  return {
    id: 'c1',
    at: daysAgoIso(0),
    releasedAt: daysAgoIso(0),
    athlete: 'Lucas M.',
    event: 'Open Errejota · Masc. C',
    origin: 'code',
    grossCents: 120_00,
    amountCents: 12_00,
    status: 'released',
    cancelReason: null,
    ...over,
  };
}

export function ambassadorView(over: Partial<AmbassadorView> = {}): AmbassadorView {
  return {
    kind: 'ambassador',
    name: 'João Victor',
    contract: {
      tier: 'amb',
      code: 'JOAO10',
      status: 'active',
      start: '2026-09-08T03:00:00.000Z',
      end: '2026-12-07T02:59:59.000Z',
      endedAt: null,
      pausedUntil: null,
      commissionPct: 10,
      followerDiscountPct: 10,
      followerDiscountFirstOnly: true,
      pendingTier: null,
    },
    cycle: { id: 'piloto', start: '2026-09-08', end: '2026-12-06', seats: 20 },
    package: {
      commissionPct: 10,
      followerDiscountPct: 10,
      registrations: { type: 'freePerMonth', value: 1 },
      kit: 'Kit completo',
      events: 'Prioridade',
      partnerHalfOff: false,
      campaignFee: false,
      tournamentOriginBonusCents: null,
    },
    payout: { nextDate: '2026-10-20', days: [6, 20], minNetCents: 20_00 },
    totals: {
      earnedCents: 324_00,
      availableCents: 132_00,
      heldCents: 0,
      pendingCents: 12_00,
      pendingCount: 1,
      receivedCents: 180_00,
      lastPayoutAt: '2026-10-06T12:00:00.000Z',
      grossCents: 3240_00,
      conversions: 27,
      athletes: 27,
      monthConversions: 11,
    },
    funnel: { clicks: null, signups: 74, registrations: 31, paid: 27 },
    commissions: [
      commissionLine({ id: 'c1', status: 'pending', athlete: 'Lucas M.' }),
      commissionLine({ id: 'c2', athlete: 'Tatiane R.', event: 'Liga NexaGO · Etapa 3', origin: 'link', amountCents: 14_00, at: daysAgoIso(1) }),
      commissionLine({ id: 'c3', athlete: 'Henrique A.', status: 'canceled', cancelReason: 'refund', amountCents: 10_00, at: daysAgoIso(4) }),
    ],
    adjustments: [],
    wallet: [{ id: '2026-10-06', at: '2026-10-06T12:00:00.000Z', amountCents: 180_00, label: 'Repasse de 06/10 · indicações' }],
    points: {
      total: 1280,
      conversions: 27,
      events: null,
      content: null,
      perConversion: 40,
      perEvent: 20,
      perContent: 10,
      levels: [
        { name: 'Bronze', min: 0 },
        { name: 'Silver', min: 500 },
        { name: 'Gold', min: 1000 },
        { name: 'Elite', min: 2000 },
      ],
    },
    ranking: {
      rows: [
        { position: 1, name: 'João V.', points: 1280, delta: 2, me: true },
        { position: 2, name: 'Marcos R.', points: 1240, delta: -1, me: false },
        { position: 3, name: 'Rayssa B.', points: 1180, delta: 0, me: false },
      ],
      of: 3,
    },
    promotion: {
      kind: 'promotion',
      to: 'pro',
      conversions: 27,
      min: 30,
      checklist: ['Influência relevante', 'Participação consistente'],
      evaluation: '2026-12-06',
      nextPackage: {
        commissionPct: [10, 15],
        followerDiscountPct: 15,
        registrations: { type: 'freeUnlimited', value: null },
        kit: 'Kit premium + uniforme',
        events: 'Prioridade + exclusivos',
        partnerHalfOff: true,
        campaignFee: true,
        tournamentOriginBonusCents: null,
      },
    },
    ...over,
  };
}

export function candidateView(over: Partial<CandidateView> = {}): CandidateView {
  return {
    kind: 'candidate',
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
    cycle: { id: 'piloto', start: '2026-09-08', end: '2026-12-06', seats: 20 },
    seatsLeft: 0,
    nextCycleStart: '2026-12-07',
    followerDiscountPct: 10,
    ...over,
  };
}
