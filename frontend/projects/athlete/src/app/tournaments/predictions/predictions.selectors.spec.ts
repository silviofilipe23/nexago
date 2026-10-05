import type { TournamentMatch } from '../../data/matches-repository';
import type { TournamentPredictionEntry } from '../../data/tournament-predictions-repository';
import {
  buildPredictionLeaderboard,
  canPredictMatch,
  championPickOf,
  groupMatchesByCategory,
  isChampionDecidingMatch,
  isPredictionLocked,
  openMatchPicksToSubmit,
  predictableMatches,
  predictionResultOf,
  predictionStatsOf,
} from './predictions.selectors';

function match(partial: Partial<TournamentMatch> & Pick<TournamentMatch, 'id'>): TournamentMatch {
  return {
    tournamentId: 't1',
    categoryId: 'c1',
    round: 1,
    matchType: 'quarterfinal',
    poolId: '',
    teamAId: 'A',
    teamBId: 'B',
    teamADescription: null,
    teamBDescription: null,
    status: 'Scheduled',
    resultA: null,
    resultB: null,
    sets: [],
    winnerId: null,
    isGroupMatch: false,
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

function entry(partial: Partial<TournamentPredictionEntry> & Pick<TournamentPredictionEntry, 'userId'>): TournamentPredictionEntry {
  return { picks: {}, championPick: null, score: 0, previousRank: null, ...partial };
}

describe('canPredictMatch / isPredictionLocked', () => {
  it('aceita palpite só na partida agendada com os dois lados definidos', () => {
    expect(canPredictMatch(match({ id: 'm1' }))).toBe(true);
    expect(canPredictMatch(match({ id: 'm2', status: 'In Progress' }))).toBe(false);
    expect(canPredictMatch(match({ id: 'm3', status: 'Completed' }))).toBe(false);
    expect(canPredictMatch(match({ id: 'm4', teamBId: '' }))).toBe(false);
  });

  it('trava tudo que não está agendado, inclusive cancelada', () => {
    expect(isPredictionLocked(match({ id: 'm1' }))).toBe(false);
    expect(isPredictionLocked(match({ id: 'm2', status: 'Canceled' }))).toBe(true);
  });
});

describe('predictableMatches', () => {
  it('esconde slot sem os dois competidores e ordena por número do jogo', () => {
    const list = predictableMatches([
      match({ id: 'm3', matchNumber: 3 }),
      match({ id: 'm-tbd', matchNumber: 4, teamAId: '' }),
      match({ id: 'm1', matchNumber: 1 }),
    ]);
    expect(list.map((m) => m.id)).toEqual(['m1', 'm3']);
  });

  it('mantém visível a partida já travada — é onde o atleta revê o palpite dado', () => {
    const list = predictableMatches([match({ id: 'm1', status: 'Completed', winnerId: 'A' })]);
    expect(list.map((m) => m.id)).toEqual(['m1']);
  });
});

describe('openMatchPicksToSubmit', () => {
  it('descarta palpite de partida travada para não derrubar a chamada inteira', () => {
    const matches = [match({ id: 'aberta' }), match({ id: 'travada', status: 'In Progress' })];
    const picks = openMatchPicksToSubmit({ aberta: 'A', travada: 'B' }, matches);
    expect(picks).toEqual({ aberta: 'A' });
  });

  it('ignora palpite vazio e partida que não está na lista', () => {
    const picks = openMatchPicksToSubmit({ aberta: '  ', fantasma: 'A' }, [match({ id: 'aberta' })]);
    expect(picks).toEqual({});
  });
});

describe('groupMatchesByCategory', () => {
  it('agrupa por categoria na ordem cadastrada no torneio, não na ordem das partidas', () => {
    const groups = groupMatchesByCategory(
      [
        match({ id: 'm1', categoryId: 'fem', matchNumber: 1 }),
        match({ id: 'm2', categoryId: 'masc', matchNumber: 2 }),
        match({ id: 'm3', categoryId: 'fem', matchNumber: 3 }),
      ],
      ['masc', 'fem'],
    );

    expect(groups.map((g) => g.categoryId)).toEqual(['masc', 'fem']);
    expect(groups[1]!.matches.map((m) => m.id)).toEqual(['m1', 'm3']);
  });

  it('joga para o fim a categoria que sumiu do torneio, sem esconder as partidas dela', () => {
    const groups = groupMatchesByCategory(
      [match({ id: 'orfa', categoryId: 'removida' }), match({ id: 'ok', categoryId: 'masc' })],
      ['masc'],
    );

    expect(groups.map((g) => g.categoryId)).toEqual(['masc', 'removida']);
    expect(groups[1]!.matches.map((m) => m.id)).toEqual(['orfa']);
  });

  it('devolve lista vazia sem partidas', () => {
    expect(groupMatchesByCategory([], ['masc'])).toEqual([]);
  });
});

describe('championPickOf / isChampionDecidingMatch', () => {
  it('deriva o campeão do palpite dado na final', () => {
    const matches = [match({ id: 'semi' }), match({ id: 'final', matchType: 'Final' })];
    expect(isChampionDecidingMatch(matches[1]!)).toBe(true);
    expect(championPickOf({ semi: 'A', final: 'B' }, matches)).toBe('B');
  });

  it('devolve null enquanto a final não foi palpitada', () => {
    expect(championPickOf({ semi: 'A' }, [match({ id: 'final', matchType: 'Final' })])).toBeNull();
  });
});

describe('predictionResultOf', () => {
  it('compara o palpite com o vencedor só depois da partida encerrada', () => {
    const done = match({ id: 'm1', status: 'Completed', winnerId: 'A' });
    expect(predictionResultOf(done, { m1: 'A' })).toBe('hit');
    expect(predictionResultOf(done, { m1: 'B' })).toBe('miss');
    expect(predictionResultOf(done, {})).toBeNull();
    expect(predictionResultOf(match({ id: 'm1' }), { m1: 'A' })).toBeNull();
  });
});

describe('buildPredictionLeaderboard', () => {
  it('ordena por pontuação, numera em sequência e marca o atleta logado', () => {
    const rows = buildPredictionLeaderboard(
      [entry({ userId: 'u1', score: 3 }), entry({ userId: 'u2', score: 9 }), entry({ userId: 'u3', score: 3 })],
      'u3',
    );
    expect(rows.map((r) => [r.rank, r.userId])).toEqual([
      [1, 'u2'],
      [2, 'u1'],
      [3, 'u3'],
    ]);
    expect(rows.find((r) => r.isMe)?.userId).toBe('u3');
  });

  it('desempata por número de palpites, para a ordem não dançar entre carregamentos', () => {
    const rows = buildPredictionLeaderboard(
      [entry({ userId: 'poucos', score: 5, picks: { m1: 'A' } }), entry({ userId: 'muitos', score: 5, picks: { m1: 'A', m2: 'B' } })],
      null,
    );
    expect(rows.map((r) => r.userId)).toEqual(['muitos', 'poucos']);
  });

  // O app ordena com `compareTo` do Dart, que é por code unit. Se aqui fosse `localeCompare`,
  // 'B1' e 'a1' trocariam de lugar e as duas superfícies mostrariam posições diferentes — num
  // número que agora vai estampado na imagem compartilhada.
  it('desempata por id em code unit, e não por locale', () => {
    const rows = buildPredictionLeaderboard([entry({ userId: 'a1', score: 5 }), entry({ userId: 'B1', score: 5 })], null);
    expect(rows.map((r) => r.userId)).toEqual(['B1', 'a1']);
    expect('B1'.localeCompare('a1')).toBeGreaterThan(0);
  });

  it('conta acertos por linha só sobre partidas concluídas', () => {
    const matches = [
      match({ id: 'm1', status: 'Completed', winnerId: 'A' }),
      match({ id: 'm2', status: 'Completed', winnerId: 'B' }),
      match({ id: 'm3' }),
    ];
    const rows = buildPredictionLeaderboard([entry({ userId: 'u1', picks: { m1: 'A', m2: 'A', m3: 'A' } })], null, matches);
    expect(rows[0]).toEqual(jasmine.objectContaining({ hits: 1, picksCount: 3 }));
  });

  it('deriva a variação comparando previousRank com a posição calculada aqui', () => {
    const rows = buildPredictionLeaderboard(
      [entry({ userId: 'subiu', score: 9, previousRank: 4 }), entry({ userId: 'caiu', score: 1, previousRank: 1 })],
      null,
    );
    expect(rows.find((r) => r.userId === 'subiu')?.delta).toBe(3);
    expect(rows.find((r) => r.userId === 'caiu')?.delta).toBe(-1);
  });

  it('sem foto do servidor não inventa variação', () => {
    const rows = buildPredictionLeaderboard([entry({ userId: 'u1', score: 2 })], null);
    expect(rows[0]?.delta).toBeNull();
  });
});

describe('predictionStatsOf', () => {
  it('separa acertos de palpites ainda em jogo e informa a posição', () => {
    const matches = [
      match({ id: 'm1', status: 'Completed', winnerId: 'A' }),
      match({ id: 'm2', status: 'Completed', winnerId: 'B' }),
      match({ id: 'm3' }),
    ];
    const mine = entry({ userId: 'eu', score: 1, picks: { m1: 'A', m2: 'A', m3: 'B' } });
    const stats = predictionStatsOf(mine, matches, buildPredictionLeaderboard([mine, entry({ userId: 'outro', score: 4 })], 'eu'));

    expect(stats).toEqual({ points: 1, hits: 1, decided: 2, pending: 1, rank: 2, totalPlayers: 2, delta: null });
  });

  it('zera tudo para quem ainda não palpitou', () => {
    const stats = predictionStatsOf(null, [match({ id: 'm1' })], []);
    expect(stats).toEqual({ points: 0, hits: 0, decided: 0, pending: 0, rank: null, totalPlayers: 0, delta: null });
  });
});
