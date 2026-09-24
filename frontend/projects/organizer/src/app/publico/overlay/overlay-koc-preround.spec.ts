import type { KocRoundState } from '../../painel/data/koc';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import { kocPreRoundOf } from './overlay-koc-preround';

function round(overrides: Partial<KocRoundState> = {}): KocRoundState {
  return {
    teamIds: ['trono', 'desafia', 'seq', 'esperaA', 'esperaB'],
    kingTeamId: '',
    challengerTeamId: '',
    queue: [],
    points: {},
    rallies: 0,
    servingTeamId: '',
    clock: null,
    standings: [],
    qualifiersPerRound: 1,
    teamsPerCourt: 4,
    roundsPerBracket: 2,
    configuredDurationSec: 900,
    rallySeq: 0,
    rallyLog: [],
    roundLabel: 3,
    qualifierSlots: [],
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
    status: 'scheduled',
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

describe('kocPreRoundOf', () => {
  it('lista todas as duplas da rodada, do trono ao fim da fila', () => {
    const pre = kocPreRoundOf(match())!;

    expect(pre.tronoTeamId).toBe('trono');
    expect(pre.rows.map((r) => r.teamId)).toEqual([
      'trono',
      'desafia',
      'seq',
      'esperaA',
      'esperaB',
    ]);
    expect(pre.rows.map((r) => r.posicao)).toEqual([1, 2, 3, 4, 5]);
  });

  it('rotula quem começa no trono, quem desafia, a sequência e quem aguarda', () => {
    const pre = kocPreRoundOf(match())!;

    expect(pre.rows.map((r) => r.papel)).toEqual([
      'trono',
      'desafia',
      'sequencia',
      'aguardando',
      'aguardando',
    ]);
  });

  it('funciona na rodada mínima de três duplas', () => {
    const pre = kocPreRoundOf(match({ koc: round({ teamIds: ['a', 'b', 'c'] }) }))!;

    expect(pre.tronoTeamId).toBe('a');
    expect(pre.rows.map((r) => r.papel)).toEqual(['trono', 'desafia', 'sequencia']);
  });

  it('rodada já começada não é assunto desta tela', () => {
    expect(kocPreRoundOf(match({ status: 'in_progress' }))).toBeNull();
    expect(kocPreRoundOf(match({ status: 'completed' }))).toBeNull();
  });

  it('sem elenco resolvido não anuncia ninguém', () => {
    // Fase seguinte antes de a anterior terminar: só existem os slots ("1º Rodada 1").
    expect(kocPreRoundOf(match({ koc: round({ teamIds: [] }) }))).toBeNull();
    expect(kocPreRoundOf(match({ koc: round({ teamIds: ['a', 'b'] }) }))).toBeNull();
  });

  it('partida de duelo não tem elenco de rodada', () => {
    expect(kocPreRoundOf(match({ matchType: 'knockout', koc: null }))).toBeNull();
  });
});
