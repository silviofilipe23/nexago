import {
  championsFromDoc,
  organizerEventFromDoc,
  organizerFollowWrite,
  organizerProfileIsPublic,
  organizerPublicProfileFromDoc,
  organizerReputationDetailFromData,
  organizerReviewSummaryFromDoc,
  teamDisplayName,
} from './organizer-public-profiles';

/** Timestamp do SDK só precisa de `toDate()` aqui. */
function ts(iso: string): { toDate: () => Date } {
  return { toDate: () => new Date(iso) };
}

describe('organizerPublicProfileFromDoc', () => {
  it('lê o doc completo mantido pelo servidor', () => {
    const p = organizerPublicProfileFromDoc('org-1', {
      uid: 'org-1',
      name: ' Liga Amadora Goiânia ',
      logoUrl: 'https://x/logo.png',
      coverUrl: 'https://x/cover.jpg',
      bio: 'Ligas e torneios de areia.',
      city: 'Goiânia',
      state: 'GO',
      whatsapp: '5562999991234',
      isOrganizer: true,
      verified: true,
      listed: true,
      followersCount: 2140,
      stats: {
        listedEvents: 41,
        eventsCompleted: 38,
        openEvents: 3,
        athletes: 1240,
        organizerSince: ts('2021-03-10T03:00:00Z'),
        sports: ['beachVolleyball', 'beachTennis'],
        venues: [
          { name: 'Arena ErreJota', arenaId: 'a1', city: 'Goiânia', count: 12 },
          { name: 'Garden Beach', arenaId: null, city: null, count: 4 },
        ],
      },
    });
    expect(p.uid).toBe('org-1');
    expect(p.name).toBe('Liga Amadora Goiânia');
    expect(p.verified).toBeTrue();
    expect(p.listed).toBeTrue();
    expect(p.followersCount).toBe(2140);
    expect(p.whatsapp).toBe('5562999991234');
    expect(p.stats.eventsCompleted).toBe(38);
    expect(p.stats.athletes).toBe(1240);
    expect(p.stats.organizerSince?.toISOString()).toBe('2021-03-10T03:00:00.000Z');
    expect(p.stats.sports).toEqual(['beachVolleyball', 'beachTennis']);
    expect(p.stats.venues).toEqual([
      { name: 'Arena ErreJota', arenaId: 'a1', city: 'Goiânia', count: 12 },
      { name: 'Garden Beach', arenaId: null, city: null, count: 4 },
    ]);
  });

  it('doc com campos ausentes não estoura: zeros, nulos e listas vazias', () => {
    const p = organizerPublicProfileFromDoc('org-2', {});
    expect(p.name).toBe('Organizador');
    expect(p.logoUrl).toBeNull();
    expect(p.bio).toBeNull();
    expect(p.whatsapp).toBeNull();
    expect(p.verified).toBeFalse();
    expect(p.followersCount).toBe(0);
    expect(p.stats).toEqual({
      listedEvents: 0,
      eventsCompleted: 0,
      openEvents: 0,
      athletes: 0,
      organizerSince: null,
      sports: [],
      venues: [],
    });
  });

  it('WhatsApp só com dígitos: lixo vira null (o link wa.me não pode carregar outra coisa)', () => {
    expect(organizerPublicProfileFromDoc('o', { whatsapp: '55 62 99999-1234' }).whatsapp).toBeNull();
    expect(organizerPublicProfileFromDoc('o', { whatsapp: 'javascript:alert(1)' }).whatsapp).toBeNull();
    expect(organizerPublicProfileFromDoc('o', { whatsapp: '556299991234' }).whatsapp).toBe('556299991234');
  });

  it('contador negativo (corrida do increment) não aparece como negativo', () => {
    expect(organizerPublicProfileFromDoc('o', { followersCount: -1 }).followersCount).toBe(0);
  });

  it('local sem nome fica de fora', () => {
    const p = organizerPublicProfileFromDoc('o', { stats: { venues: [{ name: ' ', count: 3 }, { name: 'Arena', count: 'x' }] } });
    expect(p.stats.venues).toEqual([{ name: 'Arena', arenaId: null, city: null, count: 0 }]);
  });
});

describe('organizerProfileIsPublic', () => {
  it('só com isOrganizer: doc criado só pelos números ou pelo contador de seguidores não é perfil', () => {
    expect(organizerProfileIsPublic(organizerPublicProfileFromDoc('o', { name: 'Liga', isOrganizer: true }))).toBeTrue();
    expect(organizerProfileIsPublic(organizerPublicProfileFromDoc('o', { uid: 'o', stats: { listedEvents: 2 }, listed: false }))).toBeFalse();
    expect(organizerProfileIsPublic(organizerPublicProfileFromDoc('o', { followersCount: 3 }))).toBeFalse();
    expect(organizerProfileIsPublic(organizerPublicProfileFromDoc('o', { name: 'Liga', isOrganizer: false }))).toBeFalse();
    expect(organizerProfileIsPublic(null)).toBeFalse();
  });
});

describe('organizerReputationDetailFromData', () => {
  it('lê média, distribuição e os aspectos com nota', () => {
    const r = organizerReputationDetailFromData({
      reviewsCount: 312,
      tournamentsRated: 9,
      average: 4.81,
      distribution: { '1': 2, '2': 3, '3': 10, '4': 40, '5': 257 },
      aspects: { organization: { count: 300, average: 4.9 }, schedule: { count: 290, average: 4.6 }, bogus: { count: 1, average: 1 } },
    })!;
    expect(r.reviewsCount).toBe(312);
    expect(r.average).toBe(4.81);
    expect(r.distribution).toEqual({ 1: 2, 2: 3, 3: 10, 4: 40, 5: 257 });
    expect(r.aspects).toEqual({ organization: 4.9, schedule: 4.6 });
  });

  it('abaixo de 3 avaliações o servidor manda nulos: nada inventado', () => {
    const r = organizerReputationDetailFromData({ reviewsCount: 2, tournamentsRated: 1, average: null, distribution: null, aspects: null })!;
    expect(r.average).toBeNull();
    expect(r.distribution).toBeNull();
    expect(r.aspects).toEqual({});
    expect(organizerReputationDetailFromData(undefined)).toBeNull();
  });
});

describe('organizerReviewSummaryFromDoc', () => {
  it('lê o resumo do evento', () => {
    expect(
      organizerReviewSummaryFromDoc('t1', {
        tournamentId: 't1',
        tournamentName: 'Copa Verão',
        tournamentStartAt: ts('2026-08-04T03:00:00Z'),
        status: 'closed',
        count: 23,
        average: 4.62,
      }),
    ).toEqual({
      tournamentId: 't1',
      tournamentName: 'Copa Verão',
      tournamentStartAt: new Date('2026-08-04T03:00:00Z'),
      status: 'closed',
      count: 23,
      average: 4.62,
    });
  });

  it('sem nome nem data: id do doc e nulos', () => {
    expect(organizerReviewSummaryFromDoc('t9', {})).toEqual({
      tournamentId: 't9',
      tournamentName: '',
      tournamentStartAt: null,
      status: '',
      count: 0,
      average: null,
    });
  });
});

describe('organizerEventFromDoc — "evento listado" da spec', () => {
  const base = {
    name: 'Copa Verão',
    managerId: 'org-1',
    startAt: ts('2026-08-04T03:00:00Z'),
    categories: [
      { id: 'c1', categoryName: 'Open Masculino', maxTeams: 16, entryFee: 140 },
      { id: 'c2', categoryName: 'Feminino B', maxTeams: 16, entryFee: 120 },
    ],
  };

  it('open, closed e completed entram, com o status do doc', () => {
    expect(organizerEventFromDoc('t1', { ...base, listingStatus: 'open' })?.listingStatus).toBe('open');
    expect(organizerEventFromDoc('t1', { ...base, listingStatus: 'closed' })?.listingStatus).toBe('closed');
    expect(organizerEventFromDoc('t1', { ...base, listingStatus: 'completed' })?.listingStatus).toBe('completed');
  });

  it('status legado em `status` (sem listingStatus) também vale', () => {
    expect(organizerEventFromDoc('t1', { ...base, status: 'Completed' })?.listingStatus).toBe('completed');
  });

  it('rascunho, cancelado e status desconhecido ficam de fora', () => {
    expect(organizerEventFromDoc('t1', { ...base, listingStatus: 'draft' })).toBeNull();
    expect(organizerEventFromDoc('t1', { ...base, listingStatus: 'cancelled' })).toBeNull();
    expect(organizerEventFromDoc('t1', { ...base })).toBeNull();
  });

  it('"por link" fica de fora; doc sem visibility é listado', () => {
    expect(organizerEventFromDoc('t1', { ...base, listingStatus: 'open', visibility: 'linkOnly' })).toBeNull();
    expect(organizerEventFromDoc('t1', { ...base, listingStatus: 'open', visibility: 'publicListing' })).not.toBeNull();
    expect(organizerEventFromDoc('t1', { ...base, listingStatus: 'open' })).not.toBeNull();
  });

  it('carrega o resumo do torneio já parseado', () => {
    const e = organizerEventFromDoc('t1', { ...base, listingStatus: 'open' })!;
    expect(e.summary.id).toBe('t1');
    expect(e.summary.name).toBe('Copa Verão');
    expect(e.summary.categories.map((c) => c.maxTeams)).toEqual([16, 16]);
  });
});

describe('championsFromDoc', () => {
  it('campeões na ordem das categorias do doc, com o nome da categoria', () => {
    expect(
      championsFromDoc({
        categories: [
          { id: 'c1', categoryName: 'Open Masculino' },
          { id: 'c2', categoryName: 'Feminino B' },
          { id: 'c3', categoryName: 'Misto' },
        ],
        categoryOps: {
          c2: { championTeamId: 'team-b', bracketStatus: 'completed' },
          c1: { championTeamId: ' team-a ' },
          c3: { bracketStatus: 'running' },
        },
      }),
    ).toEqual([
      { categoryId: 'c1', categoryName: 'Open Masculino', teamId: 'team-a' },
      { categoryId: 'c2', categoryName: 'Feminino B', teamId: 'team-b' },
    ]);
  });

  it('categoria apagada que ainda tem campeão em categoryOps vai pro fim, com o id', () => {
    expect(championsFromDoc({ categories: [], categoryOps: { velha: { championTeamId: 't' } } })).toEqual([
      { categoryId: 'velha', categoryName: 'velha', teamId: 't' },
    ]);
  });

  it('sem categoryOps: nenhum campeão', () => {
    expect(championsFromDoc({ categories: [{ id: 'c1' }] })).toEqual([]);
  });
});

describe('teamDisplayName', () => {
  const profiles = new Map([
    ['u1', { displayName: 'Ana Lima' }],
    ['u2', { displayName: 'Bia Prado' }],
    ['u3', { displayName: 'Cris' }],
  ]);
  const team = { teamName: null, player1Id: 'u1', player2Id: 'u2', memberUids: [] as string[] };

  it('dupla: primeiros nomes', () => {
    expect(teamDisplayName(team, profiles)).toBe('Ana / Bia');
  });

  it('equipe nomeada vence; trio usa o elenco', () => {
    expect(teamDisplayName({ ...team, teamName: 'Os Brabos' }, profiles)).toBe('Os Brabos');
    expect(teamDisplayName({ ...team, memberUids: ['u1', 'u2', 'u3'] }, profiles)).toBe('Ana / Bia / Cris');
  });

  it('sem perfis legíveis: null (nada de "Atleta / Atleta")', () => {
    expect(teamDisplayName(team, new Map())).toBeNull();
  });
});

describe('organizerFollowWrite', () => {
  it('doc com id = meu uid e exatamente as chaves que a rule aceita', () => {
    expect(organizerFollowWrite(' me ', 'org-1')).toEqual({
      path: ['organizerPublicProfiles', 'org-1', 'followers', 'me'],
      data: { userId: 'me', organizerId: 'org-1' },
    });
  });

  it('não segue a si mesmo nem com id vazio', () => {
    expect(organizerFollowWrite('org-1', 'org-1')).toBeNull();
    expect(organizerFollowWrite('', 'org-1')).toBeNull();
    expect(organizerFollowWrite('me', ' ')).toBeNull();
  });
});
