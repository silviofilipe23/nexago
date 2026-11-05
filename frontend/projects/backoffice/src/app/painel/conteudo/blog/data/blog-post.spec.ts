import {
  blogPostFromDoc,
  publicationLabel,
  readMinutes,
  saoPauloIso,
  saoPauloParts,
  savedAgoLabel,
  slugify,
} from './blog-post';

describe('blog · post', () => {
  it('slugify igual ao servidor: acento, ordinal, pontuação e limite', () => {
    expect(slugify('Liga nexaGO: tudo sobre a 2ª etapa')).toBe('liga-nexago-tudo-sobre-a-2a-etapa');
    expect(slugify('  Ação & Reação — 1º lugar!  ')).toBe('acao-reacao-1o-lugar');
    expect(slugify('')).toBe('');
    const long = slugify('palavra '.repeat(30));
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith('-')).toBeFalse();
  });

  it('tempo de leitura: título + corpo a 200 palavras/min, mínimo 1', () => {
    expect(readMinutes('Curto', [{ type: 'paragraph', text: 'duas palavras' }])).toBe(1);
    const body = [
      { type: 'paragraph' as const, text: 'palavra '.repeat(300) },
      { type: 'list' as const, items: ['um dois', 'três'] },
      { type: 'image' as const, url: 'https://x/y.png', caption: 'legenda conta' },
    ];
    // 1 (título) + 300 + 3 + 2 = 306 → 1,53 → 2
    expect(readMinutes('Título', body)).toBe(2);
  });

  it('lê o doc com padrões seguros e converte Timestamp', () => {
    const at = new Date('2026-11-12T12:00:00Z');
    const post = blogPostFromDoc('p1', {
      title: 'Oi',
      status: 'scheduled',
      category: 'loja',
      publishAt: { toDate: () => at },
      body: [{ type: 'paragraph', text: 'a' }, { type: 'video', url: 'x' }],
      cta: { label: 'Ir', destination: 'loja', url: null },
      channels: { app: true, site: false },
      readCount: 12,
    });
    expect(post.publishAt).toEqual(at);
    expect(post.body).toEqual([{ type: 'paragraph', text: 'a' }]);
    expect(post.channels).toEqual({ app: true, site: false });
    expect(post.cta).toEqual({ label: 'Ir', destination: 'loja', url: null });
    expect(post.sport).toBe('all');
    expect(post.helpfulCount).toBe(0);
    const bad = blogPostFromDoc('p2', { status: 'x', category: 'y' });
    expect(bad.status).toBe('draft');
    expect(bad.category).toBe('torneios');
    expect(bad.cta).toBeNull();
  });

  it('parede de São Paulo ida e volta (UTC−3)', () => {
    const iso = saoPauloIso('2026-11-12', '09:00');
    expect(iso).toBe('2026-11-12T12:00:00.000Z');
    expect(saoPauloParts(new Date(iso!))).toEqual(jasmine.objectContaining({ date: '2026-11-12', time: '09:00' }));
    expect(saoPauloIso('', '09:00')).toBeNull();
    expect(saoPauloIso('2026-11-12', '9h')).toBeNull();
  });

  it('coluna Publicação: publicado só o dia, agendado com hora, rascunho com traço', () => {
    const now = new Date('2026-11-05T15:00:00Z');
    const at = new Date('2026-11-12T12:00:00Z');
    expect(publicationLabel({ status: 'published', publishAt: new Date('2026-10-28T13:00:00Z') }, now)).toBe('28 out');
    expect(publicationLabel({ status: 'scheduled', publishAt: at }, now)).toBe('12 nov · 09:00');
    expect(publicationLabel({ status: 'draft', publishAt: at }, now)).toBe('—');
    expect(publicationLabel({ status: 'published', publishAt: new Date('2025-03-02T15:00:00Z') }, now)).toBe('2 mar 2025');
  });

  it('"Salvo há X"', () => {
    const now = new Date('2026-11-05T15:00:00Z');
    expect(savedAgoLabel(new Date('2026-11-05T14:59:30Z'), now)).toBe('Salvo agora');
    expect(savedAgoLabel(new Date('2026-11-05T14:57:00Z'), now)).toBe('Salvo há 3 min');
    expect(savedAgoLabel(new Date('2026-11-05T12:00:00Z'), now)).toBe('Salvo há 3 h');
    expect(savedAgoLabel(new Date('2026-11-03T12:00:00Z'), now)).toBe('Salvo em 3 nov · 09:00');
  });
});
