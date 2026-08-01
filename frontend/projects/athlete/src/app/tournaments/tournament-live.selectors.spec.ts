import type { TournamentMatch } from '../data/matches-repository';
import {
  campaignOf,
  defaultTabOf,
  displaySetsOf,
  hasPendingKnockout,
  isSameSaoPauloDay,
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
    scheduleTime: null,
    courtName: null,
    liveScore: null,
    matchStartedAt: null,
    checkIn: { teamA: null, teamB: null },
    queueStatus: null,
    bestOf: 3,
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
    expect(campaignOf(matches, 'A', (id) => `Dupla ${id}`)).toEqual([
      { label: 'Grupo A', detail: '1V 1D' },
      { label: 'Quartas', detail: 'V 2–0 vs Dupla D' },
    ]);
  });

  it('devolve lista vazia para dupla sem partida concluída', () => {
    expect(campaignOf([match({ id: 'x' })], 'A', () => 'Dupla')).toEqual([]);
  });
});

describe('visibleTabsOf / defaultTabOf', () => {
  it('mostra só visão geral e chaves para quem não está inscrito e não tem partidas', () => {
    const tabs = visibleTabsOf({ hasMatches: false, hasMyMatchToday: false, isRegistered: false });
    expect(tabs).toEqual(['visao-geral', 'chaves']);
    expect(defaultTabOf(tabs)).toBe('visao-geral');
  });

  it('abre em "hoje" para quem tem jogo no dia', () => {
    const tabs = visibleTabsOf({ hasMatches: true, hasMyMatchToday: true, isRegistered: true });
    expect(tabs).toEqual(['visao-geral', 'hoje', 'partidas', 'chaves', 'minha-inscricao']);
    expect(defaultTabOf(tabs)).toBe('hoje');
  });

  it('esconde "partidas" enquanto a chave não foi publicada', () => {
    expect(visibleTabsOf({ hasMatches: false, hasMyMatchToday: false, isRegistered: true })).toEqual([
      'visao-geral',
      'chaves',
      'minha-inscricao',
    ]);
  });
});
