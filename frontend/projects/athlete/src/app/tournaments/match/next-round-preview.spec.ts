import type { TournamentMatch } from '../../data/matches-repository';
import { nextRoundPreviewOf } from './next-round-preview';

function bracketMatch(partial: Partial<TournamentMatch> & Pick<TournamentMatch, 'id' | 'matchNumber'>): TournamentMatch {
  return {
    tournamentId: 't1',
    categoryId: 'c1',
    round: 1,
    matchType: 'knockout',
    poolId: '',
    teamAId: '',
    teamBId: '',
    teamADescription: null,
    teamBDescription: null,
    status: 'Scheduled',
    resultA: null,
    resultB: null,
    sets: [],
    winnerId: null,
    isGroupMatch: false,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    scheduleTime: null,
    courtName: null,
    liveScore: null,
    matchStartedAt: null,
    checkIn: { teamA: null, teamB: null },
    queueStatus: null,
    bestOf: 3,
    currentSetIndex: null,
    ...partial,
  };
}

const nameOf = (teamId: string) => `Dupla ${teamId}`;

describe('nextRoundPreviewOf', () => {
  /** Duas semifinais (round 1) alimentando uma final (round 2). */
  const semi1 = bracketMatch({ id: 'semi1', matchNumber: 1, round: 1, teamAId: 'A', teamBId: 'B' });
  const semi2 = bracketMatch({ id: 'semi2', matchNumber: 2, round: 1, teamAId: 'C', teamBId: 'D' });
  const final = bracketMatch({ id: 'final', matchNumber: 3, round: 2, matchType: 'final' });

  it('anuncia os dois adversários possíveis enquanto a outra semi não terminou', () => {
    const preview = nextRoundPreviewOf([semi1, semi2, final], semi1, nameOf);
    expect(preview?.opponentNames).toEqual(['Dupla C', 'Dupla D']);
    expect(preview?.match.id).toBe('final');
  });

  it('reduz a um só nome depois que a partida irmã tem vencedor', () => {
    const decided = { ...semi2, status: 'Completed', winnerId: 'C' };
    expect(nextRoundPreviewOf([semi1, decided, final], semi1, nameOf)?.opponentNames).toEqual(['Dupla C']);
  });

  it('funciona a partir da semi de baixo, olhando para a irmã de cima', () => {
    expect(nextRoundPreviewOf([semi1, semi2, final], semi2, nameOf)?.opponentNames).toEqual(['Dupla A', 'Dupla B']);
  });

  it('não arrisca palpite em partida de fase de grupos', () => {
    const group = bracketMatch({ id: 'g', matchNumber: 1, poolId: 'pool-a', isGroupMatch: true, matchType: 'group' });
    expect(nextRoundPreviewOf([group, final], group, nameOf)).toBeNull();
  });

  it('devolve null na última fase, quando não há coluna seguinte', () => {
    expect(nextRoundPreviewOf([semi1, semi2, final], final, nameOf)).toBeNull();
  });

  it('devolve null quando a coluna seguinte não reduz pela metade (chave que não é SE)', () => {
    // Coluna 1 com 2 partidas e coluna 2 também com 2: o encaixe posicional não vale.
    const lb1 = bracketMatch({ id: 'lb1', matchNumber: 4, round: 2, matchType: 'lb' });
    const lb2 = bracketMatch({ id: 'lb2', matchNumber: 5, round: 2, matchType: 'lb' });
    const wb1 = bracketMatch({ id: 'wb1', matchNumber: 1, round: 1, matchType: 'wb', teamAId: 'A', teamBId: 'B' });
    const wb2 = bracketMatch({ id: 'wb2', matchNumber: 2, round: 1, matchType: 'wb', teamAId: 'C', teamBId: 'D' });
    expect(nextRoundPreviewOf([wb1, wb2, lb1, lb2], wb1, nameOf)).toBeNull();
  });
});
