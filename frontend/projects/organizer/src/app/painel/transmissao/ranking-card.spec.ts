import { rankingCardOf, type RankingCardProfile, type RankingCardSource } from './ranking-card';

const T = 'etapa1';
type E = RankingCardSource['entries'][number];

function e(id: string, total: number, gain: number | null): E {
  return { id, totalPoints: total, results: gain == null ? [{ tournamentId: 'outra', points: total }] : [{ tournamentId: T, points: gain }] };
}

function src(entries: E[], profiles: Record<string, Partial<RankingCardProfile>> = {}): RankingCardSource {
  return {
    kind: 'atleta',
    entries,
    tournamentId: T,
    tournamentName: 'Copa VH',
    categoryLabel: 'MASCULINO',
    updated: true,
    profiles: new Map(entries.map((x) => [x.id, { name: x.id.toUpperCase(), photoUrl: null, city: null, state: null, ...profiles[x.id] }])),
  };
}

describe('rankingCardOf', () => {
  it('sem ninguém com pontos devolve null', () => {
    expect(rankingCardOf(src([]), 'k')).toBeNull();
    expect(rankingCardOf(src([e('a', 0, null)]), 'k')).toBeNull();
  });

  it('antes = total - ganho; sobe, desce, igual e novo', () => {
    // antes: a 100, b 90, c 80 | depois: b 130 (+40), a 100, c 80, d 30 (+30, novo)
    const card = rankingCardOf(src([e('a', 100, null), e('b', 130, 40), e('c', 80, null), e('d', 30, 30)]), 'k')!;
    expect(card.before.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(card.after.map((x) => x.id)).toEqual(['b', 'a', 'c', 'd']);
    const b = card.after[0]!;
    expect([b.posBefore, b.posAfter, b.ptsBefore, b.ptsAfter, b.gain]).toEqual([2, 1, 90, 130, 40]);
    const a = card.after[1]!;
    expect([a.posBefore, a.posAfter]).toEqual([1, 2]);
    const c = card.after[2]!;
    expect([c.posBefore, c.posAfter, c.gain]).toEqual([3, 3, null]);
    const d = card.after[3]!;
    expect([d.posBefore, d.ptsBefore, d.gain]).toEqual([null, 0, 30]);
    expect(card.key).toBe('k');
    expect(card.stageName).toBe('Copa VH');
    expect(card.categoryLabel).toBe('MASCULINO');
  });

  it('gain 0 quando há results da etapa com 0 pontos', () => {
    const card = rankingCardOf(src([e('a', 50, 0)]), 'k')!;
    expect(card.after[0]!.gain).toBe(0);
  });

  it('empate desempata por id', () => {
    const card = rankingCardOf(src([e('b', 50, null), e('a', 50, null)]), 'k')!;
    expect(card.after.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('trunca no top 10; entra quem vinha de fora e sai quem foi ultrapassado', () => {
    const base = Array.from({ length: 11 }, (_, i) => e(`p${String(i).padStart(2, '0')}`, 1000 - i * 10, null));
    // p10 (11º, 900) ganha 200 -> 1100 e lidera; p09 (10º) sai do top 10 depois
    base[10] = e('p10', 1100, 200);
    const card = rankingCardOf(src(base), 'k')!;
    expect(card.before.length).toBe(10);
    expect(card.after.length).toBe(10);
    expect(card.before.map((x) => x.id)).not.toContain('p10');
    expect(card.after[0]!.id).toBe('p10');
    expect(card.after[0]!.posBefore).toBe(11);
    expect(card.before.map((x) => x.id)).toContain('p09');
    expect(card.after.map((x) => x.id)).not.toContain('p09');
    expect(card.climber).toEqual({ name: 'P10', photo: null, photos: [], from: 11, to: 1 });
  });

  it('líder mantém ou assume', () => {
    const keeps = rankingCardOf(src([e('a', 120, 20), e('b', 90, null)]), 'k')!;
    expect(keeps.leader).toEqual({ name: 'A', photo: null, photos: [], points: 120, keeps: true });
    const takes = rankingCardOf(src([e('a', 100, null), e('b', 130, 50)]), 'k')!;
    expect(takes.leader).toEqual({ name: 'B', photo: null, photos: [], points: 130, keeps: false });
  });

  it('climber: maior salto; empate pela menor posição final; ignora novo', () => {
    // antes: a100 b90 c80 d70; b +30 (2->1... 120), d +25 (95: 4->2), c sem ganho
    const card = rankingCardOf(src([e('a', 100, null), e('b', 120, 30), e('c', 80, null), e('d', 95, 25), e('n', 500, 500)]), 'k')!;
    // depois: n500(novo) b120 a100 d95 c80 -> b: 2->2 sem salto; d: 4->4; nenhum sobe além de nada
    expect(card.climber).toBeNull();
    const card2 = rankingCardOf(src([e('a', 100, null), e('b', 90, null), e('c', 120, 40)]), 'k')!;
    // depois: c120 a100 b90 -> c 3->1
    expect(card2.climber).toEqual({ name: 'C', photo: null, photos: [], from: 3, to: 1 });
  });

  it('topGain: maior ganho > 0, desempate pela melhor posição, com sub cidade/UF', () => {
    const card = rankingCardOf(
      src([e('a', 100, 30), e('b', 90, 30), e('c', 10, 0)], { a: { city: 'Goiânia', state: 'GO', photoUrl: 'x.jpg' } }),
      'k',
    )!;
    expect(card.topGain).toEqual({ name: 'A', photo: 'x.jpg', photos: [], sub: 'Goiânia/GO', gain: 30 });
    expect(rankingCardOf(src([e('a', 100, 0)]), 'k')!.topGain).toBeNull();
  });

  it('sub sem cidade é null', () => {
    expect(rankingCardOf(src([e('a', 10, null)]), 'k')!.after[0]!.sub).toBeNull();
  });
});

describe('rankingCardOf (dupla)', () => {
  const profiles = new Map<string, RankingCardProfile>([
    ['u1', { name: 'Berger', photoUrl: 'b.jpg', city: null, state: null }],
    ['u2', { name: 'Hölting Nilsson', photoUrl: null, city: 'Goiânia', state: 'GO' }],
    ['u3', { name: 'Ana', photoUrl: 'a.jpg', city: 'Recife', state: 'PE' }],
    ['u4', { name: 'Bia', photoUrl: 'c.jpg', city: null, state: null }],
  ]);
  const teamSrc = (entries: E[]): RankingCardSource => ({
    kind: 'dupla',
    entries,
    teams: new Map([
      ['t1', ['u1', 'u2']],
      ['t2', ['u3', 'u4']],
    ]),
    tournamentId: T,
    tournamentName: 'Copa VH',
    categoryLabel: 'MASCULINO',
    updated: true,
    profiles,
  });

  it('nomes unidos, fotos das duas, sub do 1º atleta com cidade e kind', () => {
    const card = rankingCardOf(teamSrc([e('t1', 200, 50), e('t2', 100, null)]), 'k')!;
    expect(card.kind).toBe('dupla');
    const t1 = card.after[0]!;
    expect(t1.id).toBe('t1');
    expect(t1.name).toBe('Berger / Hölting Nilsson');
    expect(t1.names).toEqual(['Berger', 'Hölting Nilsson']);
    expect(t1.photos).toEqual(['b.jpg', null]);
    expect(t1.photo).toBe('b.jpg');
    expect(t1.sub).toBe('Goiânia/GO');
    expect(card.after[1]!.sub).toBe('Recife/PE');
  });

  it('destaques levam as duas fotos', () => {
    const card = rankingCardOf(teamSrc([e('t1', 200, 50), e('t2', 160, null)]), 'k')!;
    expect(card.leader).toEqual({ name: 'Berger / Hölting Nilsson', photo: 'b.jpg', photos: ['b.jpg', null], points: 200, keeps: false });
    expect(card.topGain).toEqual({ name: 'Berger / Hölting Nilsson', photo: 'b.jpg', photos: ['b.jpg', null], sub: 'Goiânia/GO', gain: 50 });
    expect(card.climber).toEqual({ name: 'Berger / Hölting Nilsson', photo: 'b.jpg', photos: ['b.jpg', null], from: 2, to: 1 });
  });

  it('atleta mantém names e photos vazios', () => {
    const card = rankingCardOf(src([e('a', 10, null)]), 'k')!;
    expect(card.kind).toBe('atleta');
    expect(card.after[0]!.names).toEqual([]);
    expect(card.after[0]!.photos).toEqual([]);
  });
});
