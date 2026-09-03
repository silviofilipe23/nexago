import type { TournamentMatch } from '../data/matches-repository';
import { knockoutRounds } from './focus/focus-journey';
import {
  campaignOf,
  categoryViewsOf,
  defaultCategoryViewOf,
  defaultTabOf,
  displaySetsOf,
  eliminatedFromKnockout,
  hasPendingKnockout,
  isSameSaoPauloDay,
  knockoutLabelOf,
  liveMatchesOf,
  myDayTimeline,
  nextMatchOf,
  outcomeOf,
  qualificationOf,
  roundDisplayNumberOf,
  roundGroupsOf,
  sideOf,
  visibleTabsOf,
} from './tournament-live.selectors';

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

/** 29/08/2026 09:00 em São Paulo (UTC-3) = 12:00Z. */
function spTime(hour: number, minute = 0, day = 29): Date {
  return new Date(Date.UTC(2026, 7, day, hour + 3, minute));
}

const MINE = new Set(['A']);

describe('sideOf / outcomeOf', () => {
  it('identifica o lado do atleta e o resultado sob a ótica dele', () => {
    const m = match({ id: 'm1', status: 'Completed', winnerId: 'B', sets: [{ a: 15, b: 21 }] });
    expect(sideOf(m, MINE)).toBe('A');
    expect(outcomeOf(m, MINE)).toBe('loss');
    expect(outcomeOf(m, new Set(['B']))).toBe('win');
  });

  it('não devolve resultado enquanto a partida não terminou', () => {
    expect(outcomeOf(match({ id: 'm1', status: 'In Progress' }), MINE)).toBeNull();
  });

  it('devolve null para partida de terceiros', () => {
    expect(sideOf(match({ id: 'm1', teamAId: 'X', teamBId: 'Y' }), MINE)).toBeNull();
  });
});

describe('nextMatchOf', () => {
  it('prioriza a partida em quadra sobre qualquer agendada mais cedo', () => {
    const matches = [
      match({ id: 'agendada', scheduleTime: spTime(9) }),
      match({ id: 'ao-vivo', status: 'In Progress', scheduleTime: spTime(11) }),
    ];
    expect(nextMatchOf(matches, MINE)?.id).toBe('ao-vivo');
  });

  it('entre agendadas, escolhe a mais próxima e ignora as encerradas', () => {
    const matches = [
      match({ id: 'passada', status: 'Completed', winnerId: 'A', scheduleTime: spTime(9) }),
      match({ id: 'depois', scheduleTime: spTime(14) }),
      match({ id: 'antes', scheduleTime: spTime(12) }),
    ];
    expect(nextMatchOf(matches, MINE)?.id).toBe('antes');
  });

  it('cai na partida sem horário quando nenhuma foi agendada ainda', () => {
    expect(nextMatchOf([match({ id: 'sem-hora', matchNumber: 7 })], MINE)?.id).toBe('sem-hora');
  });

  it('devolve null quando o atleta não tem mais partidas em aberto', () => {
    expect(nextMatchOf([match({ id: 'fim', status: 'Completed', winnerId: 'A' })], MINE)).toBeNull();
  });
});

describe('myDayTimeline', () => {
  it('inclui só as partidas do dia de referência, em ordem cronológica', () => {
    const matches = [
      match({ id: 'hoje-tarde', scheduleTime: spTime(14) }),
      match({ id: 'ontem', scheduleTime: spTime(10, 0, 28) }),
      match({ id: 'hoje-cedo', scheduleTime: spTime(9) }),
      match({ id: 'de-outra-dupla', teamAId: 'X', teamBId: 'Y', scheduleTime: spTime(10) }),
    ];
    expect(myDayTimeline(matches, MINE, spTime(12)).map((m) => m.id)).toEqual(['hoje-cedo', 'hoje-tarde']);
  });

  it('trata a virada do dia pelo fuso de São Paulo, não pelo UTC', () => {
    // 22:00 em São Paulo é 01:00Z do dia seguinte: comparar em UTC jogaria a partida
    // para o dia errado.
    const lateNight = new Date(Date.UTC(2026, 7, 30, 1, 0));
    expect(isSameSaoPauloDay(lateNight, spTime(9))).toBe(true);
    expect(myDayTimeline([match({ id: 'noite', scheduleTime: lateNight })], MINE, spTime(9)).map((m) => m.id)).toEqual(['noite']);
  });
});

describe('myDayTimeline — partidas sem horário', () => {
  const reference = spTime(12);

  it('sem horário entra quando o torneio está rolando hoje', () => {
    const matches = [match({ id: 'sem-horario' })];
    expect(myDayTimeline(matches, MINE, reference, true).map((m) => m.id)).toEqual(['sem-horario']);
  });

  it('sem horário fica fora quando o torneio não está rolando', () => {
    const matches = [match({ id: 'sem-horario' })];
    expect(myDayTimeline(matches, MINE, reference)).toEqual([]);
  });

  it('sem horário e encerrada ou cancelada fica fora — não há evidência de dia', () => {
    const matches = [
      match({ id: 'fim', status: 'Completed' }),
      match({ id: 'cancel', status: 'Canceled' }),
    ];
    expect(myDayTimeline(matches, MINE, reference, true)).toEqual([]);
  });

  it('começou hoje entra mesmo agendada para ontem', () => {
    const matches = [
      match({
        id: 'atrasada',
        status: 'In Progress',
        scheduleTime: spTime(18, 0, 28),
        matchStartedAt: spTime(9, 30),
      }),
    ];
    expect(myDayTimeline(matches, MINE, reference).map((m) => m.id)).toEqual(['atrasada']);
  });

  it('âncora de outro dia não cai no caso do torneio rolando', () => {
    const matches = [match({ id: 'ontem', scheduleTime: spTime(9, 0, 28) })];
    expect(myDayTimeline(matches, MINE, reference, true)).toEqual([]);
  });

  it('agendadas primeiro, sem horário no fim por matchNumber', () => {
    const matches = [
      match({ id: 'sem-b', matchNumber: 9 }),
      match({ id: 'com', scheduleTime: spTime(15) }),
      match({ id: 'sem-a', matchNumber: 4 }),
    ];
    expect(myDayTimeline(matches, MINE, reference, true).map((m) => m.id)).toEqual(['com', 'sem-a', 'sem-b']);
  });
});

describe('liveMatchesOf', () => {
  it('filtra por status e, opcionalmente, por categoria', () => {
    const matches = [
      match({ id: 'live-c1', status: 'In Progress' }),
      match({ id: 'live-c2', status: 'In Progress', categoryId: 'c2' }),
      match({ id: 'parada' }),
    ];
    expect(liveMatchesOf(matches).map((m) => m.id)).toEqual(['live-c1', 'live-c2']);
    expect(liveMatchesOf(matches, 'c2').map((m) => m.id)).toEqual(['live-c2']);
  });
});

describe('roundGroupsOf', () => {
  it('agrupa por rodada, marca a que está ao vivo e usa o horário mais cedo da rodada', () => {
    const matches = [
      match({ id: 'r1a', round: 1, status: 'Completed', winnerId: 'A', scheduleTime: spTime(9) }),
      match({ id: 'r1b', round: 1, status: 'Completed', winnerId: 'A', scheduleTime: spTime(9, 30) }),
      match({ id: 'r2a', round: 2, status: 'In Progress', scheduleTime: spTime(11) }),
      match({ id: 'outro-grupo', round: 1, poolId: 'pool-b' }),
    ];
    const groups = roundGroupsOf(matches, 'pool-a');
    expect(groups.map((g) => g.round)).toEqual([1, 2]);
    expect(groups.map((g) => g.displayNumber)).toEqual([1, 2]);
    expect(groups[0]!.allCompleted).toBe(true);
    expect(groups[0]!.startAt?.getTime()).toBe(spTime(9).getTime());
    expect(groups[1]!.hasLive).toBe(true);
    expect(groups[1]!.allCompleted).toBe(false);
  });

  it('numera as rodadas de 1 mesmo quando o campo `round` do Firestore começa em 0', () => {
    const matches = [match({ id: 'a', round: 0 }), match({ id: 'b', round: 1 })];
    const groups = roundGroupsOf(matches, 'pool-a');
    expect(groups.map((g) => g.displayNumber)).toEqual([1, 2]);
    expect(roundDisplayNumberOf(matches, 'pool-a', 0)).toBe(1);
    expect(roundDisplayNumberOf(matches, 'pool-a', 1)).toBe(2);
  });
});

describe('displaySetsOf', () => {
  it('acrescenta o set em andamento vindo de liveScore aos sets já fechados', () => {
    const m = match({
      id: 'm',
      status: 'In Progress',
      sets: [{ a: 21, b: 18 }],
      liveScore: { setsA: 1, setsB: 0, currentGamesA: 10, currentGamesB: 6 },
    });
    expect(displaySetsOf(m)).toEqual([
      { index: 1, a: 21, b: 18, inProgress: false },
      { index: 2, a: 10, b: 6, inProgress: true },
    ]);
  });

  it('não duplica o set em andamento depois que a partida encerra', () => {
    const m = match({
      id: 'm',
      status: 'Completed',
      winnerId: 'A',
      sets: [
        { a: 21, b: 18 },
        { a: 21, b: 15 },
      ],
      liveScore: { setsA: 1, setsB: 0, currentGamesA: 21, currentGamesB: 15 },
    });
    expect(displaySetsOf(m).length).toBe(2);
  });

  it('lê o formato legado resultA/resultB quando sets[] está vazio', () => {
    const m = match({ id: 'm', status: 'Completed', winnerId: 'A', resultA: '21,19', resultB: '18,21' });
    expect(displaySetsOf(m)).toEqual([
      { index: 1, a: 21, b: 18, inProgress: false },
      { index: 2, a: 19, b: 21, inProgress: false },
    ]);
  });

  // A mesa ponto a ponto (app I1 / mesa web do organizador) mantém o set EM ANDAMENTO dentro
  // de sets[] com currentSetIndex — o portal precisa marcá-lo como corrente, não como fechado.
  it('marca como em andamento o set corrente gravado pela mesa dentro de sets[]', () => {
    const m = match({
      id: 'm',
      status: 'In Progress',
      sets: [
        { a: 21, b: 18 },
        { a: 5, b: 3 },
      ],
      currentSetIndex: 1,
    });
    expect(displaySetsOf(m)).toEqual([
      { index: 1, a: 21, b: 18, inProgress: false },
      { index: 2, a: 5, b: 3, inProgress: true },
    ]);
  });

  it('no primeiro set da mesa, o único set é o corrente', () => {
    const m = match({ id: 'm', status: 'In Progress', sets: [{ a: 2, b: 1 }], currentSetIndex: 0 });
    expect(displaySetsOf(m)).toEqual([{ index: 1, a: 2, b: 1, inProgress: true }]);
  });

  it('não duplica o set corrente quando há liveScore residual do start junto dos sets da mesa', () => {
    const m = match({
      id: 'm',
      status: 'In Progress',
      sets: [{ a: 2, b: 1 }],
      currentSetIndex: 0,
      liveScore: { setsA: 0, setsB: 0, currentGamesA: 0, currentGamesB: 0 },
    });
    expect(displaySetsOf(m)).toEqual([{ index: 1, a: 2, b: 1, inProgress: true }]);
  });
});

describe('qualificationOf', () => {
  const standings = [{ teamId: 'A' }, { teamId: 'B' }, { teamId: 'C' }];

  it('não declara classificação enquanto restam partidas no grupo', () => {
    const matches = [match({ id: 'aberta' }), match({ id: 'fechada', status: 'Completed', winnerId: 'A' })];
    const info = qualificationOf(matches, 'pool-a', 'A', standings, 2);
    expect(info).toEqual({ rank: 1, qualifies: true, decided: false, remainingMatches: 1, qualifiersPerGroup: 2 });
  });

  it('marca como decidido quando todas as partidas do grupo terminaram', () => {
    const matches = [match({ id: 'x', status: 'Completed', winnerId: 'A' })];
    expect(qualificationOf(matches, 'pool-a', 'A', standings, 2)?.decided).toBe(true);
  });

  it('devolve null quando o atleta não está na tabela do grupo', () => {
    expect(qualificationOf([match({ id: 'x' })], 'pool-a', 'Z', standings, 2)).toBeNull();
    expect(qualificationOf([match({ id: 'x' })], 'pool-a', null, standings, 2)).toBeNull();
  });
});

describe('hasPendingKnockout', () => {
  it('só considera partidas de mata-mata ainda em aberto', () => {
    const bracket = (id: string, status: string) => match({ id, status, poolId: '', isGroupMatch: false, matchType: 'knockout' });
    expect(hasPendingKnockout([bracket('semi', 'Scheduled')], 'c1')).toBe(true);
    expect(hasPendingKnockout([bracket('semi', 'Completed')], 'c1')).toBe(false);
    expect(hasPendingKnockout([match({ id: 'grupo' })], 'c1')).toBe(false);
  });
});

describe('eliminatedFromKnockout', () => {
  const bracket = (partial: Partial<TournamentMatch> & Pick<TournamentMatch, 'id'>) =>
    match({ poolId: '', isGroupMatch: false, matchType: 'knockout', ...partial });

  it('perdeu uma partida encerrada do mata-mata: eliminado', () => {
    const matches = [bracket({ id: 'quartas', status: 'Completed', teamAId: 'A', teamBId: 'B', winnerId: 'B' })];
    expect(eliminatedFromKnockout(matches, 'c1', MINE)).toBe(true);
  });

  it('venceu a partida encerrada do mata-mata: não eliminado', () => {
    const matches = [bracket({ id: 'quartas', status: 'Completed', teamAId: 'A', teamBId: 'B', winnerId: 'A' })];
    expect(eliminatedFromKnockout(matches, 'c1', MINE)).toBe(false);
  });

  it('mata-mata do atleta ainda pendente: não eliminado', () => {
    const matches = [bracket({ id: 'quartas', status: 'Scheduled', teamAId: 'A', teamBId: 'B' })];
    expect(eliminatedFromKnockout(matches, 'c1', MINE)).toBe(false);
  });

  // Mesma decisão de `winsToTitleOf`: perder só na fase de grupos não é "eliminado do
  // mata-mata" pra esta função — o atleta nunca chegou a ter um jogo de mata-mata seu.
  it('perdeu só na fase de grupos (nunca teve jogo de mata-mata seu): não eliminado', () => {
    const matches = [
      match({ id: 'grupo', status: 'Completed', teamAId: 'A', teamBId: 'B', winnerId: 'B' }),
      bracket({ id: 'semi-de-outra-dupla', status: 'Scheduled', teamAId: 'X', teamBId: 'Y' }),
    ];
    expect(eliminatedFromKnockout(matches, 'c1', MINE)).toBe(false);
  });

  it('partida de mata-mata de outra dupla, encerrada: não conta como eliminação do atleta', () => {
    const matches = [bracket({ id: 'semi', status: 'Completed', teamAId: 'X', teamBId: 'Y', winnerId: 'X' })];
    expect(eliminatedFromKnockout(matches, 'c1', MINE)).toBe(false);
  });
});

describe('campaignOf', () => {
  it('resume o grupo e lista os mata-matas vencidos', () => {
    const matches = [
      match({ id: 'g1', status: 'Completed', winnerId: 'A', teamBId: 'B' }),
      match({ id: 'g2', status: 'Completed', winnerId: 'C', teamAId: 'A', teamBId: 'C' }),
      match({
        id: 'quartas',
        status: 'Completed',
        winnerId: 'A',
        teamBId: 'D',
        poolId: '',
        isGroupMatch: false,
        matchType: 'quarter-final',
        sets: [
          { a: 21, b: 15 },
          { a: 21, b: 17 },
        ],
      }),
    ];
    // `matchType: 'quarter-final'` resolve pelo mapa (`KNOCKOUT_LABELS`) — a lista de rounds só
    // importa pro caso `'knockout'` sem entrada no mapa, testado à parte em `knockoutLabelOf`.
    expect(campaignOf(matches, 'A', (id) => `Dupla ${id}`, [])).toEqual([
      { label: 'Grupo A', detail: '1V 1D' },
      { label: 'Quartas', detail: 'V 2–0 vs Dupla D' },
    ]);
  });

  it('devolve lista vazia para dupla sem partida concluída', () => {
    expect(campaignOf([match({ id: 'x' })], 'A', () => 'Dupla', [])).toEqual([]);
  });
});

describe('knockoutLabelOf', () => {
  // O gerador real (`buildSingleEliminationMatches`/`buildGroupsKnockoutMatches`,
  // `functions/src/category-bracket-builders.ts:271-273`) grava `matchType: 'knockout'` pra TODA
  // rodada de mata-mata que não é a final — sem distinguir quartas de semifinal. `KNOCKOUT_LABELS`
  // não tem chave `knockout`, então antes desta correção o fallback devolvia "Knockout" em inglês
  // pro atleta. A fase certa é a distância até a final dentro das rodadas de mata-mata da
  // categoria (`knockoutRounds`, `focus/focus-journey.ts`): 1 rodada até o fim = Final, 2 =
  // Semifinal, 3 = Quartas, 4 = Oitavas, 5 = 16 avos.
  it('matchType "knockout" a 3 rodadas da final vira Quartas', () => {
    expect(knockoutLabelOf(match({ id: 'q', matchType: 'knockout', round: 1, poolId: '', isGroupMatch: false }), [1, 2, 3])).toBe('Quartas');
  });

  it('matchType "knockout" a 2 rodadas da final vira Semifinal', () => {
    expect(knockoutLabelOf(match({ id: 's', matchType: 'knockout', round: 2, poolId: '', isGroupMatch: false }), [1, 2, 3])).toBe('Semifinal');
  });

  it('matchType "knockout" a 4 rodadas da final vira Oitavas', () => {
    expect(knockoutLabelOf(match({ id: 'r16', matchType: 'knockout', round: 1, poolId: '', isGroupMatch: false }), [1, 2, 3, 4])).toBe('Oitavas');
  });

  it('o mapa vence a posição: matchType "Final" nunca depende da distância até a final', () => {
    // Round 1 aqui é só pra provar que o mapa resolve ANTES de qualquer derivação posicional —
    // "Final" no round errado continuaria "Final", nunca "Quartas".
    expect(knockoutLabelOf(match({ id: 'f', matchType: 'Final', round: 1, poolId: '', isGroupMatch: false }), [1, 2, 3])).toBe('Final');
  });

  it('matchType "Third Place" resolve pelo mapa — mesmo round da final (achado de `bracketWorstPlaceOf`), nunca vira "Final" por posição', () => {
    expect(knockoutLabelOf(match({ id: 'tp', matchType: 'Third Place', round: 3, poolId: '', isGroupMatch: false }), [1, 2, 3])).toBe('3º lugar');
  });

  it('dupla eliminação preserva WB/LB/Grand final — WB e LB numeram a própria chave a partir de 1, nunca a distância até a final', () => {
    // As rodadas passadas aqui misturariam WB e LB se fossem usadas posicionalmente — a prova é
    // que o resultado bate mesmo com `rounds` claramente errado pra essa leitura.
    const misleadingRounds = [1, 2, 3];
    expect(knockoutLabelOf(match({ id: 'wb', matchType: 'WB', round: 1, poolId: '', isGroupMatch: false }), misleadingRounds)).toBe('WB');
    expect(knockoutLabelOf(match({ id: 'lb', matchType: 'LB', round: 2, poolId: '', isGroupMatch: false }), misleadingRounds)).toBe('LB');
    expect(knockoutLabelOf(match({ id: 'gf', matchType: 'grand final', round: 1, poolId: '', isGroupMatch: false }), misleadingRounds)).toBe('Grand final');
  });

  it('chave de 6 rodadas (33-64 duplas, sem teto no gerador): a 1ª rodada, a 6 rodadas da final, vira 32 avos', () => {
    // Achado do round 1 de fix: a tabela posicional parava em distância 5 (16 avos). Uma categoria
    // de 33-64 duplas (`buildSingleEliminationMatches` não tem teto — `organizer-category-ops.ts`)
    // produz 6 rodadas de mata-mata; a 1ª rodada ficava sem entrada na tabela e caía no fallback
    // que capitalizava o `matchType` cru — "Knockout" na 1ª rodada de toda chave grande.
    const rounds = [1, 2, 3, 4, 5, 6];
    expect(knockoutLabelOf(match({ id: 'r64', matchType: 'knockout', round: 1, poolId: '', isGroupMatch: false }), rounds)).toBe('32 avos');
  });

  it('round da partida fora da lista de rounds da categoria (dado inconsistente): "Rodada N", nunca o matchType cru', () => {
    // O fallback final não pode mais vazar o `matchType` bruto capitalizado (removido no round 1
    // de fix) — nem pra `'knockout'` fora de posição, nem pra qualquer outro valor desconhecido.
    expect(knockoutLabelOf(match({ id: 'x', matchType: 'knockout', round: 9, poolId: '', isGroupMatch: false }), [1, 2, 3])).toBe('Rodada 9');
  });

  it('gerador real de eliminatória simples (8 duplas) — fixture que reproduz o formato do gerador: nenhuma partida rotula "Knockout"', () => {
    // Formato EXATO do que `buildSingleEliminationMatches(8 times)` grava
    // (`functions/src/category-bracket-builders.ts:198-344`): `functions/` e `frontend/` são
    // projetos independentes (toolchains diferentes — `node:test` lá, Karma aqui — sem precedente
    // de import cruzado no repo), então o fixture reproduz o formato em vez de importar o gerador.
    // 8 times → log2(8) = 3 rodadas de mata-mata: 4 quartas (round 1), 2 semifinais (round 2), a
    // final (round 3, `matchType: 'Final'`) e a disputa de 3º lugar (round 3, `n >= 4` —
    // `matchType: 'Third Place'`). Só a final ganha `matchType` próprio; quartas e semifinais são
    // ambas `'knockout'` (linha 273: `matchType: isFinal ? 'Final' : 'knockout'`) — é exatamente
    // essa ambiguidade que este teste prova estar resolvida.
    const categoryId = 'c1';
    const bracketMatch = (id: string, round: number, matchType: string, matchNumber: number): TournamentMatch =>
      match({ id, categoryId, round, matchType, matchNumber, poolId: '', isGroupMatch: false });
    const generated: TournamentMatch[] = [
      bracketMatch('qf1', 1, 'knockout', 1),
      bracketMatch('qf2', 1, 'knockout', 2),
      bracketMatch('qf3', 1, 'knockout', 3),
      bracketMatch('qf4', 1, 'knockout', 4),
      bracketMatch('sf1', 2, 'knockout', 5),
      bracketMatch('sf2', 2, 'knockout', 6),
      bracketMatch('final', 3, 'Final', 7),
      bracketMatch('terceiro', 3, 'Third Place', 8),
    ];
    const rounds = knockoutRounds(generated, categoryId);
    const labels = generated.map((m) => knockoutLabelOf(m, rounds));
    expect(labels).not.toContain('Knockout');
    expect(labels).toEqual(['Quartas', 'Quartas', 'Quartas', 'Quartas', 'Semifinal', 'Semifinal', 'Final', '3º lugar']);
  });
});

describe('visibleTabsOf / defaultTabOf', () => {
  it('mostra só visão geral e categorias para quem não está inscrito', () => {
    const tabs = visibleTabsOf({ hasMyMatchToday: false, isRegistered: false, hasDefinedMatchups: false });
    expect(tabs).toEqual(['visao-geral', 'categorias']);
    expect(defaultTabOf(false)).toBe('visao-geral');
  });

  it('não emite mais a aba Hoje — o dia do atleta vive no Focus', () => {
    const tabs = visibleTabsOf({ hasMyMatchToday: true, isRegistered: true, hasDefinedMatchups: true });
    expect(tabs).toEqual(['visao-geral', 'categorias', 'minha-inscricao', 'palpites']);
    expect(defaultTabOf(true)).toBe('minha-inscricao');
  });

  it('mantém "minha inscrição" para o inscrito sem jogo hoje', () => {
    expect(visibleTabsOf({ hasMyMatchToday: false, isRegistered: true, hasDefinedMatchups: false })).toEqual([
      'visao-geral',
      'categorias',
      'minha-inscricao',
    ]);
  });

  it('libera "palpites" assim que existe confronto definido, sempre por último', () => {
    expect(visibleTabsOf({ hasMyMatchToday: false, isRegistered: false, hasDefinedMatchups: true })).toEqual([
      'visao-geral',
      'categorias',
      'palpites',
    ]);
  });
});

describe('categoryViewsOf / defaultCategoryViewOf', () => {
  it('oferece as três sub-visões numa categoria de grupos com jogos publicados', () => {
    const views = categoryViewsOf({ hasMatches: true, hasGroups: true });
    expect(views).toEqual(['partidas', 'grupos', 'chave']);
    expect(defaultCategoryViewOf(views)).toBe('partidas');
  });

  it('esconde "grupos" no mata-mata puro', () => {
    expect(categoryViewsOf({ hasMatches: true, hasGroups: false })).toEqual(['partidas', 'chave']);
  });

  it('cai na chave enquanto nada foi publicado', () => {
    const views = categoryViewsOf({ hasMatches: false, hasGroups: false });
    expect(views).toEqual(['chave']);
    expect(defaultCategoryViewOf(views)).toBe('chave');
  });
});
