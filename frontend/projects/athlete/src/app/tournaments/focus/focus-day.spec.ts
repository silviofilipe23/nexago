import type { ArenaMatch } from '../../data/teams-repository';
import { focusDayTargetOf, isFocusDismissed } from './focus-day';

function arenaMatch(partial: Partial<ArenaMatch> & Pick<ArenaMatch, 'id'>): ArenaMatch {
  return {
    tournamentId: 't1',
    categoryId: 'c1',
    matchType: 'group',
    status: 'scheduled',
    winnerId: null,
    teamAId: 'teamMine',
    teamBId: 'teamOther',
    teamADescription: null,
    teamBDescription: null,
    resultA: null,
    resultB: null,
    sets: [],
    scheduleTime: null,
    matchEndedAt: null,
    courtName: null,
    ...partial,
  };
}

/** 14:00 em São Paulo (UTC-3) no dia 29/08/2026. */
const TODAY = new Date('2026-08-29T17:00:00Z');

describe('focusDayTargetOf', () => {
  it('devolve null quando não há partida hoje', () => {
    const matches = [arenaMatch({ id: 'm1', scheduleTime: new Date('2026-08-30T17:00:00Z') })];
    expect(focusDayTargetOf(matches, TODAY)).toBeNull();
  });

  it('escolhe a partida de hoje ainda em aberto', () => {
    const matches = [
      arenaMatch({ id: 'm1', tournamentId: 'tA', scheduleTime: new Date('2026-08-29T15:00:00Z') }),
    ];
    expect(focusDayTargetOf(matches, TODAY)).toEqual({ tournamentId: 'tA', matchId: 'm1' });
  });

  it('ignora partida encerrada e cancelada', () => {
    const matches = [
      arenaMatch({ id: 'm1', status: 'completed', scheduleTime: new Date('2026-08-29T12:00:00Z') }),
      arenaMatch({ id: 'm2', status: 'canceled', scheduleTime: new Date('2026-08-29T13:00:00Z') }),
    ];
    expect(focusDayTargetOf(matches, TODAY)).toBeNull();
  });

  it('mantém a partida em quadra — é quando o Focus mais serve', () => {
    const matches = [
      arenaMatch({ id: 'm1', status: 'in progress', scheduleTime: new Date('2026-08-29T16:00:00Z') }),
    ];
    expect(focusDayTargetOf(matches, TODAY)?.matchId).toBe('m1');
  });

  it('entre dois torneios no mesmo dia, o mais cedo manda', () => {
    const matches = [
      arenaMatch({ id: 'm2', tournamentId: 'tB', scheduleTime: new Date('2026-08-29T19:00:00Z') }),
      arenaMatch({ id: 'm1', tournamentId: 'tA', scheduleTime: new Date('2026-08-29T15:00:00Z') }),
    ];
    expect(focusDayTargetOf(matches, TODAY)?.tournamentId).toBe('tA');
  });

  it('não confunde o dia pelo fuso: 22h de São Paulo ainda é hoje', () => {
    // 2026-08-30T01:00:00Z = 29/08 às 22:00 em São Paulo.
    const matches = [arenaMatch({ id: 'm1', scheduleTime: new Date('2026-08-30T01:00:00Z') })];
    expect(focusDayTargetOf(matches, TODAY)?.matchId).toBe('m1');
  });

  it('ignora partida sem torneio', () => {
    const matches = [
      arenaMatch({ id: 'm1', tournamentId: '', scheduleTime: new Date('2026-08-29T15:00:00Z') }),
    ];
    expect(focusDayTargetOf(matches, TODAY)).toBeNull();
  });
});

describe('isFocusDismissed', () => {
  it('é falso sem marca', () => {
    expect(isFocusDismissed(null, TODAY)).toBe(false);
  });

  it('é verdadeiro com a marca de hoje', () => {
    expect(isFocusDismissed('2026-08-29', TODAY)).toBe(true);
  });

  it('a marca de ontem não silencia hoje', () => {
    expect(isFocusDismissed('2026-08-28', TODAY)).toBe(false);
  });
});
