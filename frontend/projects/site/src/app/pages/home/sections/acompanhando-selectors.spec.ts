import { visibleFollowedTournaments } from './acompanhando-selectors';
import type { TournamentSummary } from '../../../../lib/firestore/types';

function fixture(
  overrides: Partial<TournamentSummary> & Pick<TournamentSummary, 'id' | 'listingStatus'>,
): TournamentSummary {
  return {
    name: 'Torneio',
    sport: 'beachTennis',
    city: null,
    state: null,
    locationName: null,
    dateLabel: null,
    startAt: null,
    endAt: null,
    featured: false,
    enrolledCount: 0,
    capacity: null,
    liveMatchesNow: 0,
    categoriesCount: 0,
    leagueId: null,
    leagueStageName: null,
    coverUrl: null,
    ...overrides,
  };
}

describe('visibleFollowedTournaments', () => {
  it('descarta ids que não resolveram (torneio apagado/despublicado)', () => {
    const active = fixture({ id: 'a', listingStatus: 'open' });
    expect(visibleFollowedTournaments([null, active])).toEqual([active]);
  });

  it('ordena por relevância (ativos primeiro)', () => {
    const ended = fixture({ id: 'ended', listingStatus: 'ended' });
    const active = fixture({ id: 'active', listingStatus: 'open' });
    expect(visibleFollowedTournaments([ended, active])).toEqual([active, ended]);
  });

  it('retorna vazio quando nenhum id resolveu', () => {
    expect(visibleFollowedTournaments([null, null])).toEqual([]);
  });
});
