import type { TournamentCategoryOffer, TournamentSummary } from '../../data/tournaments-repository';
import { SQUAD_TEST_NOW } from '../../../testing/squad-fixtures';
import { promoTournaments } from './squad-promo';

const DAY = 24 * 60 * 60 * 1000;
const inDays = (n: number) => new Date(SQUAD_TEST_NOW.getTime() + n * DAY);

function category(over: Partial<TournamentCategoryOffer> = {}): TournamentCategoryOffer {
  return { id: 'cat', categoryName: 'Masc. C', entryFee: 120, maxTeams: 32, registrationClosed: false, isCompleted: false, ...over } as TournamentCategoryOffer;
}

function tournament(over: Partial<TournamentSummary>): TournamentSummary {
  return {
    id: 't',
    name: 'Open Errejota',
    city: 'Goiânia',
    location: 'Arena Errejota',
    startAt: inDays(9),
    endAt: inDays(9),
    rawStatus: 'open',
    liveMatchesNow: 0,
    enrolledCount: 0,
    capacity: 64,
    isCancelled: false,
    coverUrl: null,
    registrationOpensAt: null,
    registrationClosesAt: null,
    categories: [category(), category({ id: 'b', entryFee: 140 })],
    ...over,
  } as TournamentSummary;
}

describe('promoTournaments', () => {
  it('os próximos com inscrição, do mais perto, com vagas, preço e prazo', () => {
    const list = [
      tournament({ id: 'late', name: 'Copa CFC', startAt: inDays(30), endAt: inDays(30) }),
      tournament({ id: 'soon', registrationClosesAt: inDays(6) }),
      tournament({ id: 'opens', name: 'Liga Etapa 4', registrationOpensAt: inDays(8), startAt: inDays(23), endAt: inDays(23) }),
      tournament({ id: 'past', startAt: inDays(-2), endAt: inDays(-2) }),
      tournament({ id: 'closed', registrationClosesAt: inDays(-1) }),
      tournament({ id: 'full', categories: [category({ registrationClosed: true })] }),
      tournament({ id: 'canceled', isCancelled: true }),
    ];
    const out = promoTournaments(list, SQUAD_TEST_NOW);
    expect(out.map((t) => t.id)).toEqual(['soon', 'opens', 'late']);
    expect(out[0]).toEqual({
      id: 'soon',
      name: 'Open Errejota',
      coverUrl: null,
      when: '26 out · Arena Errejota',
      offer: '64 vagas · a partir de R$ 120',
      note: 'Inscrições fecham em 6 dias',
    });
    expect(out[1]!.note).toBe('Inscrições abrem em 25 out');
    expect(out[2]!.note).toBe('Inscrições abertas');
  });
});
