import {
  athleteName,
  initialsFor,
  mapPublicProfile,
  mapTeam,
  normalizeRankingGender,
  rankingOwnerId,
  seasonCandidates,
  seasonPoints,
  seasonYear,
  selectTop,
  teamName,
  type RankingCandidate,
} from './rankings';

const cand = (n: number): RankingCandidate[] =>
  Array.from({ length: n }, (_, i) => ({ id: `a${String(i).padStart(2, '0')}`, points: 1000 - i }));

describe('rankings — mapeamento', () => {
  it('temporada = ano em São Paulo (virada do ano em UTC ainda é o ano anterior lá)', () => {
    expect(seasonYear(new Date('2027-01-01T02:00:00Z'))).toBe(2026);
    expect(seasonYear(new Date('2027-01-01T04:00:00Z'))).toBe(2027);
  });

  it('dono do doc: campo vence; sem campo, id sem o sufixo do esporte', () => {
    expect(rankingOwnerId('x_BEACH_TENNIS', { athleteId: ' u1 ' }, 'athleteId', 'BEACH_TENNIS')).toBe('u1');
    expect(rankingOwnerId('u2_BEACH_TENNIS', {}, 'athleteId', 'BEACH_TENNIS')).toBe('u2');
    expect(rankingOwnerId('t9', {}, 'teamId', 'VOLEI_PRAIA')).toBe('t9');
  });

  it('pontos da temporada saem de pointsByYear (string ou ausente = 0)', () => {
    expect(seasonPoints({ pointsByYear: { '2026': 120.4, '2025': 50 } }, 2026)).toBe(120);
    expect(seasonPoints({ pointsByYear: { '2026': '120' } }, 2026)).toBe(0);
    expect(seasonPoints({}, 2026)).toBe(0);
  });

  it('candidatos: só quem pontuou, mais pontos primeiro, empate pelo id', () => {
    expect(
      seasonCandidates([
        { id: 'b', points: 10 },
        { id: 'z', points: 0 },
        { id: 'a', points: 10 },
        { id: 'c', points: 30 },
      ]).map((c) => c.id),
    ).toEqual(['c', 'a', 'b']);
  });

  it('gênero normalizado como o app', () => {
    expect(normalizeRankingGender('Masculino')).toBe('masculino');
    expect(normalizeRankingGender('female')).toBe('feminino');
    expect(normalizeRankingGender('x')).toBe('misto');
    expect(normalizeRankingGender('outro')).toBeNull();
    expect(normalizeRankingGender(undefined)).toBeNull();
  });

  it('perfil: apelido sem @ vence; nome com cara de uid é ignorado; foto só https', () => {
    const p = mapPublicProfile({ nickname: '@Juca', fullName: 'João Carlos', avatarUrl: 'https://x/a.jpg', gender: 'M' });
    expect(athleteName(p, 'uid123456')).toBe('Juca');
    expect(p.photoUrl).toBe('https://x/a.jpg');
    expect(p.gender).toBe('masculino');
    const semNome = mapPublicProfile({ fullName: 'AbCdEfGhIjKlMnOpQrStUv', photoURL: 'http://x/a.jpg' });
    expect(athleteName(semNome, 'abcdef123')).toBe('Atleta abcdef');
    expect(semNome.photoUrl).toBeNull();
  });

  it('iniciais: 1 palavra = 2 letras; várias = primeira + última', () => {
    expect(initialsFor(mapPublicProfile({ fullName: 'Ana Maria Souza' }), 'u')).toBe('AS');
    expect(initialsFor(mapPublicProfile({ nickname: 'bia' }), 'u')).toBe('BI');
    expect(initialsFor(undefined, 'xy123')).toBe('XY');
  });

  it('equipe: teamName vence; senão "Ana S. / Bia C."; sem nada, "Dupla"', () => {
    const p1 = mapPublicProfile({ fullName: 'Ana Silva' });
    const p2 = mapPublicProfile({ fullName: 'Bia Costa' });
    expect(teamName(mapTeam({ teamName: 'Os Brabos', player1Id: 'a', player2Id: 'b' }), p1, p2)).toBe('Os Brabos');
    expect(teamName(mapTeam({ player1Id: 'a', player2Id: 'b' }), p1, p2)).toBe('Ana S. / Bia C.');
    expect(teamName(mapTeam({}), undefined, undefined)).toBe('Dupla');
  });

  it('equipe nomeada sem player1/player2 usa os 2 primeiros do elenco', () => {
    expect(mapTeam({ memberUids: ['m1', 'm2', 'm3'], gender: 'feminino' })).toEqual({
      teamName: null,
      gender: 'feminino',
      player1Id: 'm1',
      player2Id: 'm2',
    });
  });
});

describe('rankings — seleção do top 5', () => {
  it('sem filtro: os 5 primeiros, lendo só os 5', async () => {
    const asked: string[][] = [];
    const { rows } = await selectTop(cand(20), 'all', async (ids) => {
      asked.push(ids);
      return new Map(ids.map((id) => [id, 'masculino' as const]));
    }, (g) => g ?? null);
    expect(rows.map((r) => [r.rank, r.id])).toEqual([[1, 'a00'], [2, 'a01'], [3, 'a02'], [4, 'a03'], [5, 'a04']]);
    expect(asked).toEqual([['a00', 'a01', 'a02', 'a03', 'a04']]);
  });

  it('com filtro: renumera depois do filtro e para de ler ao completar 5', async () => {
    // pares = feminino, ímpares = masculino
    const genderOf = (id: string) => (Number(id.slice(1)) % 2 === 0 ? 'feminino' : 'masculino');
    const asked: string[][] = [];
    const { rows } = await selectTop(
      cand(40),
      'feminino',
      async (ids) => {
        asked.push(ids);
        return new Map(ids.map((id) => [id, genderOf(id)] as const));
      },
      (g) => (g as 'feminino' | 'masculino' | undefined) ?? null,
      { batch: 6 },
    );
    expect(rows.map((r) => [r.rank, r.id])).toEqual([[1, 'a00'], [2, 'a02'], [3, 'a04'], [4, 'a06'], [5, 'a08']]);
    expect(asked.length).toBe(2); // 12 lidos, não os 40
  });

  it('teto: não lê além de cap; devolve o que achou, com posições certas', async () => {
    let read = 0;
    const { rows } = await selectTop(
      cand(100),
      'misto',
      async (ids) => {
        read += ids.length;
        return new Map(ids.map((id) => [id, id === 'a03' ? 'misto' : 'masculino'] as const));
      },
      (g) => (g as 'misto' | 'masculino' | undefined) ?? null,
      { batch: 10, cap: 30 },
    );
    expect(read).toBe(30);
    expect(rows).toEqual([{ rank: 1, id: 'a03', points: 997 }]);
  });

  it('perfil sem gênero não entra em filtro de gênero', async () => {
    const { rows } = await selectTop(cand(3), 'masculino', async () => new Map(), () => null);
    expect(rows).toEqual([]);
  });
});
