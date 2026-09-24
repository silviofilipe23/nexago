import type { KocRoundState, KocStanding } from '../../painel/data/koc';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import { kocQualifiedBoardOf } from './overlay-koc-qualified';

function round(overrides: Partial<KocRoundState> = {}): KocRoundState {
  return {
    teamIds: [],
    kingTeamId: '',
    challengerTeamId: '',
    queue: [],
    points: {},
    rallies: 0,
    servingTeamId: '',
    clock: null,
    standings: [],
    qualifiersPerRound: 2,
    teamsPerCourt: 4,
    roundsPerBracket: 1,
    configuredDurationSec: 900,
    rallySeq: 0,
    rallyLog: [],
    roundLabel: 1,
    qualifierSlots: [],
    ...overrides,
  };
}

function match(overrides: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: 'm',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: null,
    team1Label: '',
    team2Label: '',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: 'Quadra 1',
    status: 'completed',
    teamAId: '',
    teamBId: '',
    sets: [],
    courtId: 'q1',
    scheduleEndAt: null,
    dayKey: '',
    bestOf: 3,
    matchType: 'koc_round',
    roundNumber: 1,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    liveScore: null,
    currentSetIndex: null,
    servingTeamId: '',
    servingPlayerSlot: 0,
    medicalTimeout: null,
    matchStartedAt: null,
    matchEndedAt: null,
    koc: round(),
    ...overrides,
  };
}

function standings(...rows: [string, number][]): KocStanding[] {
  return rows.map(([teamId, place]) => ({ teamId, place, points: 10 - place, crowns: 0 }));
}

/** Fase com 7 rodadas: 4 encerradas, 3 por vir. */
function fase(overrides: Partial<KocRoundState> = {}): TournamentMatch[] {
  const encerradas = [1, 2, 3, 4].map((n) =>
    match({
      id: 'r' + n,
      status: 'completed',
      koc: round({
        roundLabel: n,
        standings: standings([`vencedora${n}`, 1], [`vice${n}`, 2], [`terceira${n}`, 3]),
        ...overrides,
      }),
    }),
  );
  const futuras = [5, 6, 7].map((n) =>
    match({ id: 'r' + n, status: 'scheduled', koc: round({ roundLabel: n, ...overrides }) }),
  );
  return [...encerradas, ...futuras];
}

describe('kocQualifiedBoardOf', () => {
  it('lista quem já garantiu vaga, em ordem de rodada', () => {
    const rodadas = fase({ roundsPerBracket: 2 });
    const board = kocQualifiedBoardOf(rodadas[3], rodadas);

    expect(board.entries.map((e) => e.teamId)).toEqual([
      'vencedora1',
      'vencedora2',
      'vencedora3',
      'vencedora4',
    ]);
    expect(board.entries.map((e) => e.roundLabel)).toEqual([1, 2, 3, 4]);
    expect(board.entries.every((e) => e.place === 1)).toBeTrue();
  });

  it('com várias rodadas por chave, é uma vaga por rodada', () => {
    const rodadas = fase({ roundsPerBracket: 2 });
    const board = kocQualifiedBoardOf(rodadas[3], rodadas);

    expect(board.vagasPorRodada).toBe(1);
    expect(board.entries.length).toBe(4);
  });

  it('com uma rodada por chave, vale a cota configurada', () => {
    const rodadas = fase({ roundsPerBracket: 1, qualifiersPerRound: 2 });
    const board = kocQualifiedBoardOf(rodadas[3], rodadas);

    expect(board.vagasPorRodada).toBe(2);
    expect(board.entries.map((e) => e.teamId)).toEqual([
      'vencedora1',
      'vice1',
      'vencedora2',
      'vice2',
      'vencedora3',
      'vice3',
      'vencedora4',
      'vice4',
    ]);
  });

  it('não conta rodada que ainda não terminou', () => {
    const rodadas = fase();
    const board = kocQualifiedBoardOf(rodadas[3], rodadas);

    expect(board.roundsDone).toBe(4);
    expect(board.totalRounds).toBe(7);
    expect(board.entries.some((e) => e.roundLabel > 4)).toBeFalse();
  });

  it('aponta a fase que recebe as vagas', () => {
    const rodadas = fase();
    const board = kocQualifiedBoardOf(rodadas[3], [
      ...rodadas,
      match({ id: 'sf', matchType: 'koc_semifinal', status: 'scheduled' }),
    ]);

    expect(board.destino).toBe('Semifinal');
  });

  it('prefere o doc ao vivo quando a lista da categoria ainda tem a rodada aberta', () => {
    const rodadas = fase({ roundsPerBracket: 2 });
    // Lista velha: rodada 4 ainda "in_progress", mas o match ao vivo já encerrou.
    const listaVelha = rodadas.map((m) =>
      m.id === 'r4' ? { ...m, status: 'in_progress' as const } : m,
    );
    const aoVivo = rodadas[3];

    const board = kocQualifiedBoardOf(aoVivo, listaVelha);

    expect(board.entries.map((e) => e.teamId)).toEqual([
      'vencedora1',
      'vencedora2',
      'vencedora3',
      'vencedora4',
    ]);
    expect(board.roundsDone).toBe(4);
  });
});
