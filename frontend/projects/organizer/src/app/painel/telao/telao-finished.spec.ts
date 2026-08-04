import type { TournamentMatch } from '../data/matches-repository';
import { FINISHED_SHOWCASE_MS, finishedAtOf, nextFinishMemoryOf, type MatchFinishMemory } from './telao-finished';

const NOW = Date.UTC(2026, 7, 3, 18, 0, 0);

function m(overrides: Partial<TournamentMatch>): TournamentMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: null,
    round: null,
    team1Label: 'A',
    team2Label: 'B',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: null,
    status: 'scheduled',
    teamAId: '',
    teamBId: '',
    sets: [],
    courtId: 'Q1',
    scheduleEndAt: null,
    bestOf: 3,
    matchType: 'knockout',
    roundNumber: 1,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    liveScore: null,
    currentSetIndex: null,
    servingTeamId: '',
    matchStartedAt: null,
    matchEndedAt: null,
    ...overrides,
  };
}

describe('telao-finished', () => {
  it('transição observada ao vivo → completed marca o fim AGORA', () => {
    let mem: ReadonlyMap<string, MatchFinishMemory> = nextFinishMemoryOf(new Map(), [m({ status: 'in_progress' })], NOW - 5000);
    mem = nextFinishMemoryOf(mem, [m({ status: 'completed' })], NOW);
    expect(finishedAtOf(mem, 'm1')).toBe(NOW);
  });

  it('o momento do fim fica estável nos snapshots seguintes', () => {
    let mem: ReadonlyMap<string, MatchFinishMemory> = nextFinishMemoryOf(new Map(), [m({ status: 'in_progress' })], NOW - 5000);
    mem = nextFinishMemoryOf(mem, [m({ status: 'completed' })], NOW);
    mem = nextFinishMemoryOf(mem, [m({ status: 'completed' })], NOW + 10_000);
    expect(finishedAtOf(mem, 'm1')).toBe(NOW);
  });

  it('primeira vista já completed SEM matchEndedAt não celebra (partida antiga)', () => {
    const mem = nextFinishMemoryOf(new Map(), [m({ status: 'completed' })], NOW);
    expect(finishedAtOf(mem, 'm1')).toBeNull();
  });

  it('primeira vista já completed com matchEndedAt recente celebra (TV recarregada no ponto)', () => {
    const ended = NOW - 10_000;
    const mem = nextFinishMemoryOf(new Map(), [m({ status: 'completed', matchEndedAt: new Date(ended) })], NOW);
    expect(finishedAtOf(mem, 'm1')).toBe(ended);
  });

  it('matchEndedAt antigo (fora da janela) não celebra', () => {
    const ended = NOW - FINISHED_SHOWCASE_MS - 1000;
    const mem = nextFinishMemoryOf(new Map(), [m({ status: 'completed', matchEndedAt: new Date(ended) })], NOW);
    expect(finishedAtOf(mem, 'm1')).toBeNull();
  });

  it('agendada → completed (lançamento direto de placar) também celebra', () => {
    let mem: ReadonlyMap<string, MatchFinishMemory> = nextFinishMemoryOf(new Map(), [m({ status: 'scheduled' })], NOW - 5000);
    mem = nextFinishMemoryOf(mem, [m({ status: 'completed' })], NOW);
    expect(finishedAtOf(mem, 'm1')).toBe(NOW);
  });
});
