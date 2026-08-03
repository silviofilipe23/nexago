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
    matchStartedAt: null,
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
});
