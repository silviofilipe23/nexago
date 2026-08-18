import type { TournamentMatch } from '../../data/matches-repository';
import {
  campaignPlacementOf,
  campaignRowsOf,
  campaignShareDataOf,
  fitCampaignRows,
  type CampaignPlayer,
  type CampaignRow,
  type CampaignShareInput,
} from './campaign-share';

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

function winRow(phase: string, isGroup = false): CampaignRow {
  return { kind: 'match', outcome: 'win', isGroup, phaseLabel: phase, opponentName: 'Dupla x', setScore: '2–0', partials: ['21-15', '21-18'] };
}

function lossRow(phase: string, isGroup = false): CampaignRow {
  return { kind: 'match', outcome: 'loss', isGroup, phaseLabel: phase, opponentName: 'Dupla y', setScore: '0–2', partials: ['15-21', '18-21'] };
}

describe('fitCampaignRows', () => {
  it('não mexe numa campanha que cabe', () => {
    const rows = [winRow('Grupo A · J1', true), winRow('Quartas'), winRow('Semifinal'), winRow('Final')];
    const fitted = fitCampaignRows(rows);
    expect(fitted.rows).toEqual(rows);
    expect(fitted.hiddenCount).toBe(0);
  });

  it('colapsa a fase de grupos quando passa do teto', () => {
    const rows = [
      winRow('Grupo A · J1', true),
      lossRow('Grupo A · J2', true),
      winRow('Grupo A · J3', true),
      winRow('Oitavas'),
      winRow('Quartas'),
      winRow('Semifinal'),
      winRow('Final'),
      winRow('LB · Rodada 1'),
      winRow('LB · Rodada 2'),
      winRow('LB · Rodada 3'),
    ];
    const fitted = fitCampaignRows(rows);
    expect(fitted.rows.length).toBe(8);
    expect(fitted.rows[0]).toEqual({ kind: 'group-summary', phaseLabel: 'Grupo A', games: 3, wins: 2, losses: 1 });
    expect(fitted.hiddenCount).toBe(0);
  });

  it('não colapsa um grupo de uma partida só (não economiza linha)', () => {
    const rows = [winRow('Grupo A · J1', true), ...Array.from({ length: 9 }, (_, i) => winRow(`KO ${i}`))];
    const fitted = fitCampaignRows(rows);
    expect(fitted.rows[0]!.kind).toBe('match');
  });

  it('corta as mais antigas e reporta quantas ficaram de fora', () => {
    const rows = Array.from({ length: 13 }, (_, i) => winRow(`KO ${i + 1}`));
    const fitted = fitCampaignRows(rows);
    expect(fitted.rows.length).toBe(9);
    expect(fitted.hiddenCount).toBe(4);
    // Corta pelo começo: o fim da campanha é a parte que conta a história.
    expect(fitted.rows[0]!.kind === 'match' && fitted.rows[0]!.phaseLabel).toBe('KO 5');
    expect(fitted.rows[8]!.kind === 'match' && fitted.rows[8]!.phaseLabel).toBe('KO 13');
  });

  it('colapsa o grupo ANTES de cortar', () => {
    const rows = [
      winRow('Grupo A · J1', true),
      winRow('Grupo A · J2', true),
      winRow('Grupo A · J3', true),
      ...Array.from({ length: 8 }, (_, i) => winRow(`KO ${i + 1}`)),
    ];
    const fitted = fitCampaignRows(rows);
    expect(fitted.rows[0]!.kind).toBe('group-summary');
    expect(fitted.rows.length).toBe(9);
    expect(fitted.hiddenCount).toBe(0);
  });

  it('respeita um teto passado à mão', () => {
    const rows = Array.from({ length: 5 }, (_, i) => winRow(`KO ${i + 1}`));
    expect(fitCampaignRows(rows, 3).rows.length).toBe(3);
    expect(fitCampaignRows(rows, 3).hiddenCount).toBe(2);
  });
});

const PLAYERS: [CampaignPlayer, CampaignPlayer] = [
  { initial: 'BR', photo: null },
  { initial: 'DB', photo: null },
];

function input(partial: Partial<CampaignShareInput> = {}): CampaignShareInput {
  return {
    matches: [],
    categoryId: 'c1',
    myTeamIds: MINE,
    duoNameOf: NAME_OF,
    teamName: 'Bruninho / Diego Barros',
    players: PLAYERS,
    categoryName: 'Masculino B',
    teamSize: null,
    tournamentName: 'Circuito NexaGO · Etapa Goiânia',
    locationName: 'Arena Vila Nova',
    startAt: new Date('2026-04-25T12:00:00Z'),
    endAt: new Date('2026-04-26T22:00:00Z'),
    ...partial,
  };
}

describe('campaignShareDataOf', () => {
  it('monta o card do campeão com números e trajetória', () => {
    const matches = [
      match({ id: 'g1', teamAId: 'mine', teamBId: 'a', status: 'Completed', winnerId: 'mine', round: 0, sets: [{ a: 21, b: 15 }, { a: 21, b: 18 }] }),
      ko('f', 'Final', 3, 'mine'),
    ];
    const data = campaignShareDataOf(input({ matches }));
    expect(data.placement).toBe('champion');
    expect(data.categoryLine).toBe('Masculino B · Duplas');
    expect(data.teamName).toBe('Bruninho / Diego Barros');
    expect(data.wins).toBe(2);
    expect(data.losses).toBe(0);
    expect(data.setsWon).toBe(4);
    expect(data.setsLost).toBe(0);
    expect(data.trajectory.rows.length).toBe(2);
    expect(data.trajectory.hiddenCount).toBe(0);
  });

  it('conta derrotas e calcula o aproveitamento', () => {
    const matches = [
      ko('g1', 'knockout', 1, 'mine'),
      ko('g2', 'knockout', 2, 'mine'),
      ko('g3', 'knockout', 3, 'them'),
    ];
    const data = campaignShareDataOf(input({ matches }));
    expect(data.wins).toBe(2);
    expect(data.losses).toBe(1);
    expect(data.winRateLabel).toBe('Aprov. 67%');
  });

  it('devolve null de aproveitamento sem partida encerrada', () => {
    expect(campaignShareDataOf(input()).winRateLabel).toBeNull();
  });

  // O mês abreviado sai de tabela própria, NUNCA de `toLocaleDateString`: o pt-BR do navegador
  // devolve "abr." COM ponto, e o protótipo escreve "ABR". É a mesma divergência já registrada
  // entre o app (Dart) e a web.
  it('formata intervalo de datas dentro do mesmo mês', () => {
    expect(campaignShareDataOf(input()).dateRangeLabel).toBe('25–26 ABR 2026');
  });

  it('formata evento de um dia só', () => {
    const data = campaignShareDataOf(input({ endAt: null }));
    expect(data.dateRangeLabel).toBe('25 ABR 2026');
  });

  it('formata intervalo que cruza o mês', () => {
    const data = campaignShareDataOf(input({ startAt: new Date('2026-04-30T12:00:00Z'), endAt: new Date('2026-05-02T22:00:00Z') }));
    expect(data.dateRangeLabel).toBe('30 ABR – 02 MAI 2026');
  });

  it('omite a data sem início declarado', () => {
    expect(campaignShareDataOf(input({ startAt: null })).dateRangeLabel).toBeNull();
  });

  it('conta só as partidas da categoria pedida', () => {
    const matches = [ko('f', 'Final', 3, 'mine'), ko('outra', 'Final', 3, 'mine', { categoryId: 'c2' })];
    const data = campaignShareDataOf(input({ matches }));
    expect(data.wins).toBe(1);
  });
});
