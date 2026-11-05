import { mapBlogBlock, mapBlogPost, splitParagraphs } from './blog';

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

function doc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Como montar a dupla',
    subtitle: 'O que olhar antes de se inscrever',
    slug: 'como-montar-a-dupla',
    seoDescription: '',
    coverUrl: 'https://cdn.example.com/capa.jpg',
    category: 'treino',
    tags: ['dupla'],
    author: { name: 'Equipe', role: 'Redação' },
    body: [{ type: 'paragraph', text: 'Oi' }],
    cta: null,
    channels: { app: true, site: true },
    status: 'published',
    publishAt: ts('2026-11-01T12:00:00Z'),
    readMinutes: 3,
    ...overrides,
  };
}

describe('splitParagraphs', () => {
  it('linha em branco separa parágrafos; \\n simples fica dentro do parágrafo', () => {
    expect(splitParagraphs('Um\nlinha dois\n\nDois\r\n\r\n  \n\nTrês')).toEqual(['Um\nlinha dois', 'Dois', 'Três']);
  });
});

describe('mapBlogBlock', () => {
  it('descarta tipo desconhecido, vazio e imagem sem https', () => {
    expect(mapBlogBlock({ type: 'poll', text: 'x' })).toBeNull();
    expect(mapBlogBlock({ type: 'heading', text: '   ' })).toBeNull();
    expect(mapBlogBlock({ type: 'list', items: ['', 3] })).toBeNull();
    expect(mapBlogBlock({ type: 'image', url: 'http://x.com/a.jpg', caption: '' })).toBeNull();
    expect(mapBlogBlock(null)).toBeNull();
  });

  it('mantém texto cru (sem interpretar HTML) e normaliza a lista', () => {
    expect(mapBlogBlock({ type: 'quote', text: '<b>oi</b>' })).toEqual({ type: 'quote', text: '<b>oi</b>' });
    expect(mapBlogBlock({ type: 'list', items: [' a ', '', 'b'] })).toEqual({ type: 'list', items: ['a', 'b'] });
    expect(mapBlogBlock({ type: 'image', url: 'https://x.com/a.jpg' })).toEqual({
      type: 'image',
      url: 'https://x.com/a.jpg',
      caption: '',
    });
  });
});

describe('mapBlogBlock — blocos nexaGO (fase 2)', () => {
  it('torneio e produto: guarda o id; vazio ou com barra é descartado', () => {
    expect(mapBlogBlock({ type: 'tournament', tournamentId: ' t1 ' })).toEqual({ type: 'tournament', tournamentId: 't1' });
    expect(mapBlogBlock({ type: 'product', productId: 'p1' })).toEqual({ type: 'product', productId: 'p1' });
    expect(mapBlogBlock({ type: 'tournament', tournamentId: '' })).toBeNull();
    expect(mapBlogBlock({ type: 'tournament', tournamentId: 'a/b' })).toBeNull();
    expect(mapBlogBlock({ type: 'product', productId: 42 })).toBeNull();
    expect(mapBlogBlock({ type: 'product', productId: '..' })).toBeNull();
  });

  it('vídeo do YouTube: provedor e id extraídos', () => {
    expect(mapBlogBlock({ type: 'video', url: 'https://youtu.be/dQw4w9WgXcQ', caption: ' Final ' })).toEqual({
      type: 'video',
      url: 'https://youtu.be/dQw4w9WgXcQ',
      caption: 'Final',
      provider: 'youtube',
      youtubeId: 'dQw4w9WgXcQ',
    });
  });

  it('vídeo do Instagram fica sem id; host fora da lista ou http é descartado', () => {
    expect(mapBlogBlock({ type: 'video', url: 'https://www.instagram.com/reel/C1/' })).toEqual({
      type: 'video',
      url: 'https://www.instagram.com/reel/C1/',
      caption: '',
      provider: 'instagram',
      youtubeId: null,
    });
    expect(mapBlogBlock({ type: 'video', url: 'https://vimeo.com/1', caption: '' })).toBeNull();
    expect(mapBlogBlock({ type: 'video', url: 'http://youtu.be/dQw4w9WgXcQ', caption: '' })).toBeNull();
  });
});

describe('mapBlogBlock — arena e ranking', () => {
  it('arena guarda o id; inválido é descartado', () => {
    expect(mapBlogBlock({ type: 'arena', arenaId: 'ar1' })).toEqual({ type: 'arena', arenaId: 'ar1' });
    expect(mapBlogBlock({ type: 'arena', arenaId: '' })).toBeNull();
    expect(mapBlogBlock({ type: 'arena', arenaId: 'a/b' })).toBeNull();
  });

  it('ranking válido passa; modo, gênero ou esporte desconhecido/ausente descarta', () => {
    expect(mapBlogBlock({ type: 'ranking', sport: 'beachTennis', mode: 'teams', gender: 'misto' })).toEqual({
      type: 'ranking',
      sport: 'beachTennis',
      mode: 'teams',
      gender: 'misto',
    });
    expect(mapBlogBlock({ type: 'ranking', sport: 'beachTennis', mode: 'clubs', gender: 'all' })).toBeNull();
    expect(mapBlogBlock({ type: 'ranking', sport: 'beachTennis', mode: 'athletes', gender: 'male' })).toBeNull();
    expect(mapBlogBlock({ type: 'ranking', sport: '', mode: 'athletes', gender: 'all' })).toBeNull();
    expect(mapBlogBlock({ type: 'ranking', sport: 'beachTennis', mode: 'athletes' })).toBeNull();
  });
});

describe('mapBlogPost', () => {
  it('usa o subtítulo quando a descrição do Google está vazia', () => {
    const p = mapBlogPost('id1', doc());
    expect(p?.description).toBe('O que olhar antes de se inscrever');
    expect(mapBlogPost('id1', doc({ seoDescription: 'Para o Google' }))?.description).toBe('Para o Google');
  });

  it('é tolerante: categoria desconhecida, capa não-https e readMinutes inválido viram null', () => {
    const p = mapBlogPost('id1', doc({ category: 'video', coverUrl: 'javascript:alert(1)', readMinutes: 'x', author: {} }));
    expect(p?.category).toBeNull();
    expect(p?.coverUrl).toBeNull();
    expect(p?.readMinutes).toBeNull();
    expect(p?.author).toBeNull();
  });

  it('chamada: link só com destination url + https; sem rótulo não há chamada', () => {
    expect(mapBlogPost('a', doc({ cta: { label: 'Ver', destination: 'url', url: 'https://x.com' } }))?.cta).toEqual({
      label: 'Ver',
      destination: 'url',
      url: 'https://x.com',
    });
    expect(mapBlogPost('a', doc({ cta: { label: 'Ver', destination: 'tournaments', url: 'https://x.com' } }))?.cta?.url).toBeNull();
    expect(mapBlogPost('a', doc({ cta: { label: '', destination: 'tournaments', url: null } }))?.cta).toBeNull();
  });

  it('recusa post fora do site, não publicado ou sem slug/título', () => {
    expect(mapBlogPost('a', doc({ channels: { app: true, site: false } }))).toBeNull();
    expect(mapBlogPost('a', doc({ status: 'scheduled' }))).toBeNull();
    expect(mapBlogPost('a', doc({ slug: '' }))).toBeNull();
    expect(mapBlogPost('a', doc({ title: undefined }))).toBeNull();
  });
});
