import type { KocRoundState, KocStanding } from '../../painel/data/koc';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import { kocStandingsBoardOf } from './overlay-koc-standings';

function round(overrides: Partial<KocRoundState> = {}): KocRoundState {
  return {
    teamIds: ['a', 'b', 'c', 'd', 'e'],
    kingTeamId: 'e',
    challengerTeamId: 'd',
    queue: ['c', 'b', 'a'],
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
    roundLabel: 3,
    qualifierSlots: [],
    batteryLabel: 1,
    phases: null,
    maxTeamsPerRound: 5,
    ...overrides,
  };
}

function match(overrides: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: null,
    team1Label: '',
    team2Label: '',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: 'Quadra 2',
    status: 'completed',
    teamAId: '',
    teamBId: '',
    sets: [],
    courtId: 'q2',
    scheduleEndAt: null,
    dayKey: '',
    bestOf: 3,
    matchType: 'koc_round',
    roundNumber: 1,
    matchNumber: 3,
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

function standings(...rows: [string, number, number][]): KocStanding[] {
  return rows.map(([teamId, place, points]) => ({ teamId, place, points, crowns: 0 }));
}

describe('kocStandingsBoardOf', () => {
  it('ordena por colocação e marca rei, classificadas e eliminadas pela cota', () => {
    const board = kocStandingsBoardOf(
      match({
        koc: round({
          qualifiersPerRound: 2,
    teamsPerCourt: 4,
    roundsPerBracket: 1,
          standings: standings(['e', 1, 8], ['d', 2, 7], ['a', 3, 4], ['b', 4, 2], ['c', 5, 1]),
        }),
      }),
      [],
    );

    expect(board.rows.map((r) => r.teamId)).toEqual(['e', 'd', 'a', 'b', 'c']);
    expect(board.rows.map((r) => r.points)).toEqual([8, 7, 4, 2, 1]);
    expect(board.rows.map((r) => r.status)).toEqual([
      'king',
      'qualified',
      'out',
      'out',
      'out',
    ]);
    expect(board.vagas).toBe(2);
  });

  it('cai na ordem por pontos quando a rodada encerrou sem gravar a tabela oficial', () => {
    const board = kocStandingsBoardOf(
      match({
        koc: round({
          standings: [],
          teamIds: ['a', 'b', 'c'],
          points: { a: 2, b: 9, c: 5 },
        }),
      }),
      [],
    );

    expect(board.rows.map((r) => r.teamId)).toEqual(['b', 'c', 'a']);
    expect(board.rows.map((r) => r.place)).toEqual([1, 2, 3]);
  });
});

/** Rodadas da fase + as fases seguintes, como `listMatches` devolveria. */
function categoria(): TournamentMatch[] {
  const rodadas = [1, 2, 3, 4, 5, 6, 7].map((n) =>
    match({ id: 'r' + n, matchNumber: n, koc: round({ roundLabel: n }) }),
  );
  return [
    ...rodadas,
    match({ id: 'sf', matchType: 'koc_semifinal', koc: round({ roundLabel: 1 }) }),
    match({ id: 'fi', matchType: 'koc_final', koc: round({ roundLabel: 1 }) }),
  ];
}

describe('kocStandingsBoardOf — cota real da rodada', () => {
  // `buildKingOfCourtRounds` (backend): "Acima de 1, cada rodada classifica UMA dupla e a
  // vencedora sai". Anunciar 2 vagas nesse caso seria informação errada no ar.
  it('com mais de uma rodada por chave, a classificatória dá UMA vaga', () => {
    const board = kocStandingsBoardOf(
      match({
        koc: round({
          qualifiersPerRound: 2,
          roundsPerBracket: 2,
          standings: standings(['e', 1, 8], ['d', 2, 7], ['a', 3, 4]),
        }),
      }),
      [],
    );

    expect(board.vagas).toBe(1);
    expect(board.rows.map((r) => r.status)).toEqual(['king', 'out', 'out']);
  });

  it('as fases seguintes mantêm a cota configurada', () => {
    const board = kocStandingsBoardOf(
      match({
        matchType: 'koc_semifinal',
        koc: round({
          qualifiersPerRound: 2,
          roundsPerBracket: 2,
          standings: standings(['e', 1, 8], ['d', 2, 7], ['a', 3, 4]),
        }),
      }),
      [],
    );

    expect(board.vagas).toBe(2);
    expect(board.rows.map((r) => r.status)).toEqual(['king', 'qualified', 'out']);
  });
});

describe('kocStandingsBoardOf — contexto da fase', () => {
  it('diz para onde vão as vagas e qual é a próxima rodada', () => {
    const board = kocStandingsBoardOf(match({ koc: round({ roundLabel: 3 }) }), categoria());

    expect(board.destino).toBe('Semifinal');
    expect(board.proxima).toBe('Rodada 4');
    expect(board.totalRounds).toBe(7);
  });

  it('na última rodada da fase não anuncia próxima', () => {
    const board = kocStandingsBoardOf(match({ koc: round({ roundLabel: 7 }) }), categoria());

    expect(board.proxima).toBeNull();
  });

  it('não promete destino quando a categoria não tem fase seguinte', () => {
    const soRodadas = categoria().filter((m) => m.matchType === 'koc_round');
    const board = kocStandingsBoardOf(match({ koc: round({ roundLabel: 3 }) }), soRodadas);

    expect(board.destino).toBeNull();
  });

  it('a semifinal manda as vagas para a final', () => {
    const board = kocStandingsBoardOf(
      match({ matchType: 'koc_semifinal', koc: round({ roundLabel: 1 }) }),
      categoria(),
    );

    expect(board.destino).toBe('Final');
  });
});
