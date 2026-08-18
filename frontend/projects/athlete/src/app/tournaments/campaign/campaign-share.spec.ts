import type { TournamentMatch } from '../../data/matches-repository';
import { campaignPlacementOf, campaignRowsOf } from './campaign-share';

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

const NAME_OF = (teamId: string, fallback: string | null) => (teamId ? `Dupla ${teamId}` : (fallback ?? 'A definir'));

describe('campaignRowsOf', () => {
  it('monta uma linha por partida encerrada, em ordem cronológica', () => {
    const matches = [
      match({ id: 'g2', teamAId: 'mine', teamBId: 'b', status: 'Completed', winnerId: 'mine', round: 1, scheduleTime: new Date('2026-04-25T13:00:00Z'), sets: [{ a: 21, b: 15 }, { a: 21, b: 18 }] }),
      match({ id: 'g1', teamAId: 'mine', teamBId: 'a', status: 'Completed', winnerId: 'mine', round: 0, scheduleTime: new Date('2026-04-25T12:00:00Z'), sets: [{ a: 21, b: 10 }, { a: 21, b: 12 }] }),
    ];
    const rows = campaignRowsOf(matches, 'c1', MINE, NAME_OF);
    expect(rows.map((r) => r.kind)).toEqual(['match', 'match']);
    expect(rows.map((r) => (r.kind === 'match' ? r.opponentName : ''))).toEqual(['Dupla a', 'Dupla b']);
  });

  it('deixa de fora pendente, ao vivo e cancelada', () => {
    const matches = [
      match({ id: 'ok', teamAId: 'mine', status: 'Completed', winnerId: 'mine', sets: [{ a: 21, b: 15 }, { a: 21, b: 18 }] }),
      match({ id: 'pend', teamAId: 'mine', status: 'Scheduled' }),
      match({ id: 'live', teamAId: 'mine', status: 'In Progress', sets: [{ a: 11, b: 9 }] }),
      match({ id: 'canc', teamAId: 'mine', status: 'Canceled' }),
    ];
    expect(campaignRowsOf(matches, 'c1', MINE, NAME_OF).length).toBe(1);
  });

  it('deixa de fora partida encerrada sem vencedor gravado', () => {
    const matches = [match({ id: 'x', teamAId: 'mine', status: 'Completed', winnerId: null, sets: [{ a: 21, b: 15 }] })];
    expect(campaignRowsOf(matches, 'c1', MINE, NAME_OF)).toEqual([]);
  });

  // A ÓTICA DO ATLETA: `sets` é sempre cru (lado A primeiro). Lido direto, o atleta do lado B
  // pareceria ter perdido o set que venceu — é a lição que `mySetsLabelOf` já carrega.
  it('inverte placar e parciais quando o atleta é o lado B', () => {
    const asA = match({ id: 'a', teamAId: 'mine', teamBId: 'them', status: 'Completed', winnerId: 'mine', sets: [{ a: 21, b: 15 }, { a: 18, b: 21 }, { a: 15, b: 12 }] });
    const asB = match({ id: 'b', teamAId: 'them', teamBId: 'mine', status: 'Completed', winnerId: 'mine', sets: [{ a: 15, b: 21 }, { a: 21, b: 18 }, { a: 12, b: 15 }] });

    const rowA = campaignRowsOf([asA], 'c1', MINE, NAME_OF)[0]!;
    const rowB = campaignRowsOf([asB], 'c1', MINE, NAME_OF)[0]!;
    if (rowA.kind !== 'match' || rowB.kind !== 'match') throw new Error('esperava linhas de partida');

    expect(rowA.setScore).toBe('2–1');
    expect(rowA.partials).toEqual(['21-15', '18-21', '15-12']);
    expect(rowB.setScore).toBe('2–1');
    expect(rowB.partials).toEqual(['21-15', '18-21', '15-12']);
    expect(rowB.opponentName).toBe('Dupla them');
  });

  // O prefixo do grupo VOLTA no card: a tela do Focus corta "Grupo A ·" porque a seção já se
  // intitula assim, mas numa imagem solta esse contexto não existe.
  it('rotula fase de grupo com grupo e jogo', () => {
    const matches = [
      match({ id: 'g1', poolId: 'pool-a', teamAId: 'mine', status: 'Completed', winnerId: 'mine', round: 0, sets: [{ a: 21, b: 15 }] }),
      match({ id: 'g2', poolId: 'pool-a', teamAId: 'x', teamBId: 'y', round: 1 }),
    ];
    const row = campaignRowsOf(matches, 'c1', MINE, NAME_OF)[0]!;
    expect(row.phaseLabel).toBe('Grupo A · J1');
    expect(row.kind === 'match' && row.isGroup).toBe(true);
  });

  it('rotula mata-mata pela fase', () => {
    const matches = [ko('sf', 'knockout', 1, 'mine'), ko('f', 'Final', 2, 'mine')];
    const rows = campaignRowsOf(matches, 'c1', MINE, NAME_OF);
    expect(rows.map((r) => r.phaseLabel)).toEqual(['Semifinal', 'Final']);
  });

  // Decisão do dono: o card usa o rótulo do app, não "Repescagem" do protótipo — o card nunca
  // discorda da tela.
  it('mantém o rótulo do app na chave dos perdedores', () => {
    const rows = campaignRowsOf([ko('lb', 'LB', 2, 'mine')], 'c1', MINE, NAME_OF);
    expect(rows[0]!.phaseLabel).toBe('LB · Rodada 2');
  });

  it('marca derrota', () => {
    const rows = campaignRowsOf([ko('qf', 'knockout', 1, 'them')], 'c1', MINE, NAME_OF);
    expect(rows[0]!.kind === 'match' && rows[0]!.outcome).toBe('loss');
  });
});
