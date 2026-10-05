import { resolveCourtNames, type TournamentMatch } from './matches-repository';

function match(overrides: Partial<TournamentMatch>): TournamentMatch {
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
    courtId: '',
    scheduleEndAt: null,
    dayKey: '',
    bestOf: 3,
    matchType: 'group',
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

const COURTS = [
  { id: 'Q1', name: 'Quadra 1' },
  { id: 'Q2', name: 'Quadra Central' },
];

describe('resolveCourtNames', () => {
  it('resolve a quadra pelo courtId quando o jogo não tem courtName', () => {
    const [resolved] = resolveCourtNames([match({ courtId: 'Q2', court: null })], COURTS);

    expect(resolved!.court).toBe('Quadra Central');
  });

  it('preserva o courtName gravado no jogo', () => {
    const [resolved] = resolveCourtNames([match({ courtId: 'Q2', court: 'Quadra do organizador' })], COURTS);

    expect(resolved!.court).toBe('Quadra do organizador');
  });

  it('deixa sem quadra o jogo ainda não agendado', () => {
    const [resolved] = resolveCourtNames([match({ courtId: '', court: null })], COURTS);

    expect(resolved!.court).toBeNull();
  });

  it('cai pro próprio courtId quando a quadra não está no torneio', () => {
    const [resolved] = resolveCourtNames([match({ courtId: 'Q9', court: null })], COURTS);

    expect(resolved!.court).toBe('Q9');
  });

  it('devolve a mesma lista quando não há nada a resolver', () => {
    const matches = [match({ courtId: 'Q1', court: 'Quadra 1' })];

    expect(resolveCourtNames(matches, COURTS)).toBe(matches);
  });

describe('resolveCourtNames · sport do torneio como fallback', () => {
  it('partida sem sport herda o do torneio; a que já tem sport é preservada', () => {
    const out = resolveCourtNames([match({ id: 'a' }), match({ id: 'b', sport: 'beachVolleyball' })], COURTS, 'footvolley');

    expect(out[0]!.sport).toBe('footvolley');
    expect(out[1]!.sport).toBe('beachVolleyball');
  });

  it('sem sport no torneio nada muda (mesma lista) e o placar segue 21', () => {
    const matches = [match({ id: 'a' })];

    expect(resolveCourtNames(matches, COURTS, null)).toBe(matches);
    expect(resolveCourtNames(matches, COURTS)).toBe(matches);
  });
});
