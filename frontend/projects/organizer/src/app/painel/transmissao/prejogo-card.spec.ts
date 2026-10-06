import type { PrejogoCard } from '../data/broadcast-prejogo';
import type { TournamentMatch } from '../data/matches-repository';
import type { RankingParticipant } from '../data/ranking-positions';
import type { AthleteRatingLite } from '../data/team-level-score';
import { prejogoCandidatesOf, prejogoCardOf, prejogoRuleOf, swapPrejogoSides, type PrejogoSource } from './prejogo-card';
import type { TeamRoster } from './transmissao-selectors';

function match(over: Partial<TournamentMatch>): TournamentMatch {
  return {
    id: 'm',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: 'Grupo A',
    team1Label: 'A',
    team2Label: 'B',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: null,
    status: 'completed',
    teamAId: 'ta',
    teamBId: 'tb',
    sets: [],
    courtId: 'q1',
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
    ...over,
  };
}

function roster(...names: string[]): TeamRoster {
  return { teamName: null, members: names.map((n, i) => ({ uid: `u-${n}`, name: n, photoUrl: i === 0 ? `http://f/${n}` : null })) };
}

const ROSTERS = new Map<string, TeamRoster>([
  ['ta', roster('Ana Andrade', 'Bia Lacerda')],
  ['tb', roster('Carla Dias', 'Dani Ávila')],
  ['tc', roster('Eva Rocha', 'Fer Alves')],
]);

function rank(id: string, points: number): RankingParticipant {
  return { id, points, tournaments: 1, sport: 'beachVolleyball', gender: null, format: 'dupla' };
}

function source(over: Partial<PrejogoSource> = {}): PrejogoSource {
  return {
    matches: [],
    rosters: ROSTERS,
    teamRanking: [],
    ratings: new Map(),
    previous: [],
    tournamentNames: new Map([['t0', 'Etapa Cumbuco']]),
    categoryName: 'Feminina B',
    courtName: 'Quadra 1',
    ...over,
  };
}

const NEXT = match({ id: 'next', status: 'scheduled', round: 'Semifinal', scheduledAt: new Date('2026-10-06T18:40:00Z') });

describe('prejogoCardOf', () => {
  it('partida sem as duas duplas devolve null', () => {
    expect(prejogoCardOf(source(), match({ teamBId: '' }), 'k')).toBeNull();
    expect(prejogoCardOf(source(), match({ teamAId: '' }), 'k')).toBeNull();
  });

  it('cabeçalho: categoria, fase, quadra, regra, horário, atletas e club null', () => {
    const c = prejogoCardOf(source(), NEXT, 'k1')!;
    expect(c).toEqual(jasmine.objectContaining({ matchId: 'next', key: 'k1', category: 'Feminina B', phase: 'Semifinal', court: 'Quadra 1', startTime: '15:40' }));
    expect(c.a).toEqual({ names: ['Ana Andrade', 'Bia Lacerda'], photos: ['http://f/Ana Andrade', null], rankPos: null, club: null });
    expect(c.b.names).toEqual(['Carla Dias', 'Dani Ávila']);
    expect(c.rows.map((r) => r.label)).toEqual(['Ranking', 'Elo NexaGO', 'Vitórias na etapa', 'Sets na etapa', 'Pontos por set']);
    expect(c.h2h).toBeNull();
    expect(c.last).toEqual([]);
  });

  it('sem horário, startTime é null', () => {
    expect(prejogoCardOf(source(), match({ scheduledAt: null }), 'k')!.startTime).toBeNull();
  });

  describe('regra', () => {
    it('vôlei MD3: melhor de 3 com alvo do set e do decisivo', () => {
      expect(prejogoRuleOf(match({ bestOf: 3 }))).toBe('Melhor de 3 · 21 / 15');
    });
    it('set único mostra o alvo', () => {
      expect(prejogoRuleOf(match({ bestOf: 1 }))).toBe('Set único · 21');
    });
    it('games: só o número de sets', () => {
      const games = { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: false, decidingSet: 'full', superTiebreakTo: 10 } as const;
      expect(prejogoRuleOf(match({ scoringProfile: games }))).toBe('Melhor de 3 sets');
      expect(prejogoRuleOf(match({ scoringProfile: { ...games, bestOf: 1 }, bestOf: 1 }))).toBe('Set único');
    });
  });

  describe('linhas', () => {
    it('ranking: menor posição, barra cheia e lead', () => {
      const c = prejogoCardOf(source({ teamRanking: [rank('tb', 900), rank('x', 700), rank('ta', 500)] }), NEXT, 'k')!;
      expect(c.a.rankPos).toBe(3);
      expect(c.b.rankPos).toBe(1);
      expect(c.rows[0]).toEqual({ label: 'Ranking', a: '#3', b: '#1', pctA: 33, pctB: 100, lead: 'B' });
    });

    it('ranking: sem dado = "–", barra 0 e sem lead', () => {
      expect(prejogoCardOf(source(), NEXT, 'k')!.rows[0]).toEqual({ label: 'Ranking', a: '–', b: '–', pctA: 0, pctB: 0, lead: null });
    });

    it('elo: composto arredondado; maior lidera', () => {
      const ratings = new Map<string, AthleteRatingLite>([
        ['u-Ana Andrade', { rating: 1800, ratedMatches: 30 }],
        ['u-Bia Lacerda', { rating: 1797, ratedMatches: 30 }],
        ['u-Carla Dias', { rating: 1500, ratedMatches: 30 }],
        ['u-Dani Ávila', { rating: 1500, ratedMatches: 30 }],
      ]);
      const r = prejogoCardOf(source({ ratings }), NEXT, 'k')!.rows[1]!;
      expect(r).toEqual(jasmine.objectContaining({ a: '1799', b: '1500', pctA: 100, pctB: 83, lead: 'A' }));
    });

    it('elo: sem rating firme cai na média dos disponíveis; ninguém = "–"', () => {
      const ratings = new Map<string, AthleteRatingLite>([['u-Ana Andrade', { rating: 1600, ratedMatches: 1 }]]);
      const r = prejogoCardOf(source({ ratings }), NEXT, 'k')!.rows[1]!;
      expect(r).toEqual(jasmine.objectContaining({ a: '1600', b: '–', pctA: 100, pctB: 0, lead: 'A' }));
    });

    it('etapa: vitórias, sets e pontos por set só das partidas encerradas', () => {
      const matches = [
        match({ id: 'm1', teamAId: 'ta', teamBId: 'tb', winnerSide: 1, sets: [{ a: 21, b: 15 }, { a: 21, b: 18 }] }),
        match({ id: 'm2', teamAId: 'tc', teamBId: 'ta', winnerSide: 1, sets: [{ a: 21, b: 10 }, { a: 18, b: 21 }, { a: 15, b: 13 }] }),
        match({ id: 'm3', teamAId: 'tb', teamBId: 'tc', winnerSide: 1, sets: [{ a: 21, b: 19 }, { a: 21, b: 19 }] }),
        match({ id: 'live', status: 'in_progress', teamAId: 'ta', teamBId: 'tc', sets: [{ a: 5, b: 3 }] }),
        NEXT,
      ];
      const c = prejogoCardOf(source({ matches }), NEXT, 'k')!;
      // A: venceu m1 (2–0), perdeu m2 (1–2) → 1–1, sets 3–2, pontos (21+21+10+21+13)/5 = 17.2
      // B: perdeu m1 (0–2), venceu m3 (2–0) → 1–1, sets 2–2, pontos (15+18+21+21)/4 = 18.75
      expect(c.rows[2]).toEqual({ label: 'Vitórias na etapa', a: '1–1', b: '1–1', pctA: 50, pctB: 50, lead: null });
      expect(c.rows[3]).toEqual({ label: 'Sets na etapa', a: '3–2', b: '2–2', pctA: 60, pctB: 50, lead: 'A' });
      expect(c.rows[4]).toEqual(jasmine.objectContaining({ label: 'Pontos por set', a: '17.2', b: '18.8', lead: 'B' }));
      expect(c.rows[4]!.pctB).toBe(100);
      expect(c.rows[4]!.pctA).toBe(92);
    });

    it('sem partidas na etapa: 0–0, barras 0, pontos "–"', () => {
      const c = prejogoCardOf(source(), NEXT, 'k')!;
      expect(c.rows[2]).toEqual({ label: 'Vitórias na etapa', a: '0–0', b: '0–0', pctA: 0, pctB: 0, lead: null });
      expect(c.rows[3]).toEqual(jasmine.objectContaining({ a: '0–0', b: '0–0', pctA: 0, lead: null }));
      expect(c.rows[4]).toEqual({ label: 'Pontos por set', a: '–', b: '–', pctA: 0, pctB: 0, lead: null });
    });
  });

  describe('confrontos anteriores', () => {
    const d = (day: number) => new Date(`2026-09-${String(day).padStart(2, '0')}T12:00:00Z`);
    const previous = [
      match({ id: 'p1', tournamentId: 't0', teamAId: 'ta', teamBId: 'tb', winnerSide: 1, sets: [{ a: 21, b: 10 }, { a: 21, b: 12 }], matchEndedAt: d(1) }),
      match({ id: 'p2', tournamentId: 't0', teamAId: 'tb', teamBId: 'ta', winnerSide: 1, sets: [{ a: 21, b: 15 }, { a: 18, b: 21 }, { a: 15, b: 9 }], matchEndedAt: d(10) }),
      match({ id: 'p3', tournamentId: 't0', teamAId: 'ta', teamBId: 'tc', winnerSide: 1, sets: [], matchEndedAt: d(12) }),
      match({ id: 'p4', status: 'scheduled', teamAId: 'ta', teamBId: 'tb' }),
      match({ id: 'next', teamAId: 'ta', teamBId: 'tb', winnerSide: 1, matchEndedAt: d(20) }),
    ];

    it('retrospecto e últimos, do mais novo pro mais antigo, na ótica dos lados desta partida', () => {
      const c = prejogoCardOf(source({ previous }), NEXT, 'k')!;
      expect(c.h2h).toEqual({ a: 1, b: 1 });
      expect(c.last).toEqual([
        { winner: 'B', text: 'DIAS / ÁVILA 2–1 · Etapa Cumbuco' },
        { winner: 'A', text: 'ANDRADE / LACERDA 2–0 · Etapa Cumbuco' },
      ]);
    });

    it('vale com os lados invertidos na partida atual', () => {
      const c = prejogoCardOf(source({ previous }), match({ id: 'next', status: 'scheduled', teamAId: 'tb', teamBId: 'ta' }), 'k')!;
      expect(c.last.map((x) => x.winner)).toEqual(['A', 'B']);
    });

    it('guarda no máximo 3 e set único mostra os pontos', () => {
      const many = [1, 2, 3, 4].map((i) => match({ id: `x${i}`, teamAId: 'ta', teamBId: 'tb', winnerSide: 1, sets: [{ a: 21, b: 19 }], matchEndedAt: d(i), bestOf: 1 }));
      const c = prejogoCardOf(source({ previous: many }), NEXT, 'k')!;
      expect(c.h2h).toEqual({ a: 4, b: 0 });
      expect(c.last.length).toBe(3);
      expect(c.last[0]!.text).toBe('ANDRADE / LACERDA 21–19');
    });
  });
});

describe('swapPrejogoSides', () => {
  it('inverte duplas, h2h, linhas, vencedores e troca a key', () => {
    const card: PrejogoCard = {
      matchId: 'm',
      key: 'old',
      category: null,
      phase: null,
      court: null,
      rule: null,
      startTime: null,
      a: { names: ['A'], photos: [null], rankPos: 1, club: null },
      b: { names: ['B'], photos: [null], rankPos: 2, club: null },
      h2h: { a: 2, b: 1 },
      last: [{ winner: 'A', text: 'x' }, { winner: null, text: 'y' }],
      rows: [{ label: 'Ranking', a: '#1', b: '#2', pctA: 100, pctB: 50, lead: 'A' }],
    };
    const s = swapPrejogoSides(card, 'new');
    expect(s.key).toBe('new');
    expect(s.a.names).toEqual(['B']);
    expect(s.b.rankPos).toBe(1);
    expect(s.h2h).toEqual({ a: 1, b: 2 });
    expect(s.last.map((x) => x.winner)).toEqual(['B', null]);
    expect(s.rows[0]).toEqual({ label: 'Ranking', a: '#2', b: '#1', pctA: 50, pctB: 100, lead: 'B' });
    expect(swapPrejogoSides(s, 'k3').rows[0]).toEqual(card.rows[0]);
  });
});

describe('prejogoCandidatesOf', () => {
  it('só agendadas com as duas duplas, por horário', () => {
    const late = match({ id: 'late', status: 'scheduled', scheduledAt: new Date('2026-10-06T20:00:00Z') });
    const early = match({ id: 'early', status: 'scheduled', scheduledAt: new Date('2026-10-06T18:00:00Z') });
    const open = match({ id: 'open', status: 'scheduled', teamBId: '' });
    const live = match({ id: 'live', status: 'in_progress' });
    expect(prejogoCandidatesOf([late, open, live, early]).map((m) => m.id)).toEqual(['early', 'late']);
  });
});
