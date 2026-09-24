import type { KocRoundState } from '../../painel/data/koc';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import { finalResultOf } from './overlay-final';

function round(overrides: Partial<KocRoundState> = {}): KocRoundState {
  return {
    teamIds: ['a', 'b', 'c'],
    kingTeamId: 'a',
    challengerTeamId: 'b',
    queue: ['c'],
    points: {},
    rallies: 0,
    servingTeamId: '',
    clock: null,
    standings: [],
    qualifiersPerRound: 1,
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
    id: 'f1',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: null,
    team1Label: '',
    team2Label: '',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: 'Quadra Central',
    status: 'completed',
    teamAId: 'campea',
    teamBId: 'vice',
    sets: [],
    courtId: 'qc',
    scheduleEndAt: null,
    dayKey: '',
    bestOf: 3,
    matchType: 'Final',
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
    ...overrides,
  };
}

describe('finalResultOf — final de duelo', () => {
  it('coroa o lado vencedor e entrega os sets na ordem', () => {
    const r = finalResultOf(
      match({
        winnerSide: 1,
        sets: [
          { a: 21, b: 18 },
          { a: 19, b: 21 },
          { a: 15, b: 12 },
        ],
      }),
    )!;

    expect(r.campeaoTeamId).toBe('campea');
    expect(r.viceTeamId).toBe('vice');
    expect(r.placar).toEqual({
      tipo: 'sets',
      vencidosCampeao: 2,
      vencidosVice: 1,
      sets: [
        { campeao: 21, vice: 18 },
        { campeao: 19, vice: 21 },
        { campeao: 15, vice: 12 },
      ],
    });
  });

  it('vira os sets para a perspectiva do campeão quando quem venceu foi o lado B', () => {
    const r = finalResultOf(
      match({
        winnerSide: 2,
        sets: [
          { a: 21, b: 18 },
          { a: 19, b: 21 },
          { a: 12, b: 15 },
        ],
      }),
    )!;

    expect(r.campeaoTeamId).toBe('vice');
    expect(r.viceTeamId).toBe('campea');
    expect(r.placar).toEqual({
      tipo: 'sets',
      vencidosCampeao: 2,
      vencidosVice: 1,
      sets: [
        { campeao: 18, vice: 21 },
        { campeao: 21, vice: 19 },
        { campeao: 15, vice: 12 },
      ],
    });
  });

  it('NÃO anuncia campeão sem vencedor declarado', () => {
    // `winnerSide` sai do `winnerId`, que já veio apontando pra doc inexistente no dev. O placar
    // é só exibição — coroar por ele poria a dupla errada na tela.
    const semVencedor = match({
      winnerSide: null,
      sets: [
        { a: 21, b: 18 },
        { a: 21, b: 15 },
      ],
    });

    expect(finalResultOf(semVencedor)).toBeNull();
  });

  it('só vale para a FINAL, e só encerrada', () => {
    expect(finalResultOf(match({ winnerSide: 1, matchType: 'Third Place' }))).toBeNull();
    expect(finalResultOf(match({ winnerSide: 1, matchType: 'WB' }))).toBeNull();
    expect(finalResultOf(match({ winnerSide: 1, status: 'in_progress' }))).toBeNull();
  });
});

describe('finalResultOf — final de KOTC', () => {
  const kocFinal = (koc: KocRoundState) =>
    match({ matchType: 'koc_final', teamAId: '', teamBId: '', koc });

  it('coroa o 1º da tabela e mostra pontos e coroas', () => {
    const r = finalResultOf(
      kocFinal(
        round({
          standings: [
            { teamId: 'a', place: 1, points: 24, crowns: 5 },
            { teamId: 'b', place: 2, points: 20, crowns: 3 },
            { teamId: 'c', place: 3, points: 11, crowns: 1 },
          ],
        }),
      ),
    )!;

    expect(r.campeaoTeamId).toBe('a');
    expect(r.viceTeamId).toBe('b');
    expect(r.placar).toEqual({
      tipo: 'pontos',
      pontosCampeao: 24,
      pontosVice: 20,
      coroasCampeao: 5,
      coroasVice: 3,
    });
  });

  it('não inventa pódio numa final KOTC sem tabela e sem pontos', () => {
    expect(finalResultOf(kocFinal(round({ standings: [], teamIds: [], points: {} })))).toBeNull();
  });

  it('rodada classificatória não é final', () => {
    const r = round({ standings: [{ teamId: 'a', place: 1, points: 9, crowns: 2 }] });

    expect(finalResultOf(match({ matchType: 'koc_round', teamAId: '', teamBId: '', koc: r }))).toBeNull();
  });
});
