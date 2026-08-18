import type { TournamentMatch } from '../../data/matches-repository';
import { campaignPlacementOf } from './campaign-share';

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

/** Partida de mata-mata encerrada com o atleta no lado A. */
function ko(id: string, matchType: string, round: number, winner: 'mine' | 'them', extra: Partial<TournamentMatch> = {}): TournamentMatch {
  return match({
    id,
    matchType,
    round,
    poolId: '',
    isGroupMatch: false,
    teamAId: 'mine',
    teamBId: 'them',
    status: 'Completed',
    winnerId: winner,
    sets: [
      { a: 21, b: 15 },
      { a: 21, b: 18 },
    ],
    ...extra,
  });
}

describe('campaignPlacementOf', () => {
  it('coroa quem venceu a final', () => {
    const matches = [ko('sf', 'knockout', 2, 'mine'), ko('f', 'Final', 3, 'mine')];
    expect(campaignPlacementOf(matches, 'c1', MINE)).toBe('champion');
  });

  it('devolve vice para quem perdeu a final', () => {
    const matches = [ko('sf', 'knockout', 2, 'mine'), ko('f', 'Final', 3, 'them')];
    expect(campaignPlacementOf(matches, 'c1', MINE)).toBe('runner-up');
  });

  it('devolve terceiro para quem venceu a disputa de 3º', () => {
    const matches = [ko('sf', 'knockout', 2, 'them'), ko('tp', 'Third Place', 3, 'mine')];
    expect(campaignPlacementOf(matches, 'c1', MINE)).toBe('third');
  });

  it('devolve none para quem PERDEU a disputa de 3º (4º lugar não tem card próprio)', () => {
    const matches = [ko('sf', 'knockout', 2, 'them'), ko('tp', 'Third Place', 3, 'them')];
    expect(campaignPlacementOf(matches, 'c1', MINE)).toBe('none');
  });

  it('devolve none para quem foi eliminado antes da decisão', () => {
    expect(campaignPlacementOf([ko('qf', 'knockout', 1, 'them')], 'c1', MINE)).toBe('none');
  });

  it('devolve none para quem só jogou a fase de grupos', () => {
    const groups = [match({ id: 'g1', teamAId: 'mine', status: 'Completed', winnerId: 'mine' })];
    expect(campaignPlacementOf(groups, 'c1', MINE)).toBe('none');
  });

  // A BLINDAGEM: a disputa de 3º recebe o MESMO round da final
  // (`category-bracket-builders.ts`: "3º lugar: perdedores das semifinais", round idêntico).
  // Uma implementação que decida por round coroa este atleta como campeão.
  it('não coroa como campeão quem venceu a disputa de 3º no mesmo round da final', () => {
    const matches = [
      ko('sf', 'knockout', 2, 'them'),
      ko('tp', 'Third Place', 3, 'mine'),
      // A final, entre outras duas duplas, no MESMO round da disputa de 3º.
      match({ id: 'f', matchType: 'Final', round: 3, poolId: '', isGroupMatch: false, teamAId: 'x', teamBId: 'y', status: 'Completed', winnerId: 'x' }),
    ];
    expect(campaignPlacementOf(matches, 'c1', MINE)).toBe('third');
  });

  it('ignora partida de outra categoria', () => {
    const matches = [ko('f', 'Final', 3, 'mine', { categoryId: 'outra' })];
    expect(campaignPlacementOf(matches, 'c1', MINE)).toBe('none');
  });

  it('não afirma nada com a final ainda pendente', () => {
    const matches = [match({ id: 'f', matchType: 'Final', round: 3, poolId: '', isGroupMatch: false, teamAId: 'mine', teamBId: 'them', status: 'Scheduled' })];
    expect(campaignPlacementOf(matches, 'c1', MINE)).toBe('none');
  });

  // Dupla eliminação: quem cai pra LB e volta pra vencer a grande final é campeão COM uma
  // derrota no currículo. A regra 1 roda antes de qualquer coisa, então isso já funciona.
  it('coroa o campeão da dupla eliminação que perdeu na WB', () => {
    const matches = [ko('wb2', 'WB', 2, 'them'), ko('lb3', 'LB', 3, 'mine'), ko('gf', 'Final', 1, 'mine')];
    expect(campaignPlacementOf(matches, 'c1', MINE)).toBe('champion');
  });

  it('devolve terceiro na dupla eliminação (vice WB × vice LB)', () => {
    const matches = [ko('wbf', 'WB', 3, 'them'), ko('tp', 'Third Place', 1, 'mine')];
    expect(campaignPlacementOf(matches, 'c1', MINE)).toBe('third');
  });
});
