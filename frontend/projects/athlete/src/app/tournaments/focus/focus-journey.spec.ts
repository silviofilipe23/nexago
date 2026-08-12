import type { TournamentMatch } from '../../data/matches-repository';
import type { TournamentPrize } from '../../data/tournaments-repository';
import { guaranteedPrizeOf, tournamentNumbersOf, winsToTitleOf } from './focus-journey';

function match(partial: Partial<TournamentMatch> & Pick<TournamentMatch, 'id'>): TournamentMatch {
  return {
    tournamentId: 't1',
    categoryId: 'c1',
    round: 1,
    matchType: 'group',
    poolId: 'pool-a',
    teamAId: 'A',
    teamBId: 'B',
    teamADescription: null,
    teamBDescription: null,
    status: 'Scheduled',
    resultA: null,
    resultB: null,
    sets: [],
    winnerId: null,
    isGroupMatch: true,
    matchNumber: 1,
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

const MINE = new Set(['mine']);

describe('winsToTitleOf', () => {
  it('devolve null sem chave sorteada', () => {
    const groups = [match({ id: 'g1', poolId: 'p1', categoryId: 'c1', teamAId: 'mine', teamBId: 'x' })];
    expect(winsToTitleOf(groups, 'c1', MINE)).toBeNull();
  });

  it('conta as fases de mata-mata quando o atleta ainda está nos grupos', () => {
    const matches = [
      match({ id: 'g1', poolId: 'p1', categoryId: 'c1', teamAId: 'mine', teamBId: 'x' }),
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'quarterfinal', isGroupMatch: false }),
      match({ id: 's1', poolId: '', categoryId: 'c1', round: 2, matchType: 'semifinal', isGroupMatch: false }),
      match({ id: 'f1', poolId: '', categoryId: 'c1', round: 3, matchType: 'final', isGroupMatch: false }),
    ];
    expect(winsToTitleOf(matches, 'c1', MINE)).toBe(3);
  });

  it('desconta as fases já vencidas quando o atleta está no mata-mata', () => {
    const matches = [
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'quarterfinal', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine' }),
      match({ id: 's1', poolId: '', categoryId: 'c1', round: 2, matchType: 'semifinal', isGroupMatch: false, teamAId: 'mine', teamBId: 'y' }),
      match({ id: 'f1', poolId: '', categoryId: 'c1', round: 3, matchType: 'final', isGroupMatch: false }),
    ];
    expect(winsToTitleOf(matches, 'c1', MINE)).toBe(2);
  });
});

describe('tournamentNumbersOf', () => {
  it('soma sets e pontos das partidas encerradas do atleta', () => {
    const matches = [
      match({ id: 'm1', status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine', sets: [{ a: 21, b: 15 }, { a: 21, b: 12 }] }),
      match({ id: 'm2', status: 'completed', teamAId: 'y', teamBId: 'mine', winnerId: 'mine', sets: [{ a: 19, b: 21 }, { a: 21, b: 17 }, { a: 7, b: 10 }] }),
    ];
    const numbers = tournamentNumbersOf(matches, MINE);
    expect(numbers.matches).toBe(2);
    expect(numbers.setsWon).toBe(4);
    expect(numbers.setsLost).toBe(1);
    // 21+21 do lado A na m1; 21+17+10 do lado B na m2.
    expect(numbers.points).toBe(21 + 21 + 21 + 17 + 10);
    expect(numbers.sets.length).toBe(5);
  });

  it('não conta partida que ainda não terminou', () => {
    const matches = [match({ id: 'm1', teamAId: 'mine', teamBId: 'x' })];
    expect(tournamentNumbersOf(matches, MINE).matches).toBe(0);
  });

  it('devolve zeros sem partida nenhuma', () => {
    const numbers = tournamentNumbersOf([], MINE);
    expect(numbers.points).toBe(0);
    expect(numbers.pointsPerSet).toBe(0);
  });
});

// Cobertura adicional — não veio no teste do brief (Step 1), mas a própria ambiguidade
// resolvida do Task 5 avisa que inverter o sentido de `bestPossiblePlace` promete premiação que
// o atleta ainda não garantiu. Escrita depois da implementação (não é TDD estrito pra esta
// função), só pra não deixar essa direção sem nenhuma rede de segurança.
describe('guaranteedPrizeOf', () => {
  const prizes: TournamentPrize[] = [
    { position: 1, value: 1000, label: '1º lugar' },
    { position: 2, value: 500, label: '2º lugar' },
    { position: 3, value: 200, label: '3º lugar' },
  ];

  it('quem está na final (pior colocação possível: 2º) já garante o prêmio de 2º, não o de 1º', () => {
    expect(guaranteedPrizeOf(prizes, 2)).toEqual({ position: 2, value: 500, label: '2º lugar' });
  });

  it('campeão confirmado (pior colocação possível: 1º) garante o prêmio de 1º', () => {
    expect(guaranteedPrizeOf(prizes, 1)).toEqual({ position: 1, value: 1000, label: '1º lugar' });
  });

  it('sem prêmio cadastrado pra uma colocação tão ruim quanto a pior possível, não garante nada', () => {
    expect(guaranteedPrizeOf(prizes, 4)).toBeNull();
  });

  it('funciona com os prêmios fora de ordem', () => {
    const shuffled = [prizes[2]!, prizes[0]!, prizes[1]!];
    expect(guaranteedPrizeOf(shuffled, 3)).toEqual({ position: 3, value: 200, label: '3º lugar' });
  });

  it('lista de prêmios vazia nunca garante nada', () => {
    expect(guaranteedPrizeOf([], 1)).toBeNull();
  });
});
