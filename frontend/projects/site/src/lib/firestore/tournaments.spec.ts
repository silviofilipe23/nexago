import { byRelevance } from './tournaments';
import type { TournamentSummary } from './types';

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

describe('byRelevance', () => {
  it('coloca ativos antes de encerrados', () => {
    const active = fixture({ id: 'a', listingStatus: 'open' });
    const ended = fixture({ id: 'b', listingStatus: 'ended' });
    expect([ended, active].sort(byRelevance)).toEqual([active, ended]);
  });

  it('entre ativos, o mais próximo vem primeiro', () => {
    const soon = fixture({ id: 'soon', listingStatus: 'open', startAt: new Date('2026-09-01') });
    const later = fixture({ id: 'later', listingStatus: 'open', startAt: new Date('2026-10-01') });
    expect([later, soon].sort(byRelevance)).toEqual([soon, later]);
  });

  it('entre encerrados, o mais recente vem primeiro', () => {
    const old = fixture({ id: 'old', listingStatus: 'ended', startAt: new Date('2026-01-01') });
    const recent = fixture({
      id: 'recent',
      listingStatus: 'ended',
      startAt: new Date('2026-07-01'),
    });
    expect([old, recent].sort(byRelevance)).toEqual([recent, old]);
  });

  it('sem data vai pro fim do próprio grupo', () => {
    const withDate = fixture({
      id: 'withDate',
      listingStatus: 'open',
      startAt: new Date('2026-09-01'),
    });
    const noDate = fixture({ id: 'noDate', listingStatus: 'open', startAt: null });
    expect([noDate, withDate].sort(byRelevance)).toEqual([withDate, noDate]);
  });
});
