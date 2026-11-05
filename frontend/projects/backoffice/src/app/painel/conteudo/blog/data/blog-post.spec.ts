import {
  blogPostFromDoc,
  isVideoUrl,
  pushSentLabel,
  reachLabel,
  youtubeVideoId,
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
      body: [{ type: 'paragraph', text: 'a' }, { type: 'poll', question: 'x' }],
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

  it('vídeo: só YouTube e Instagram em https, como o servidor', () => {
    expect(isVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeTrue();
    expect(isVideoUrl('https://youtu.be/dQw4w9WgXcQ')).toBeTrue();
    expect(isVideoUrl('https://www.instagram.com/reel/Cx1/')).toBeTrue();
    expect(isVideoUrl('http://youtube.com/watch?v=x')).toBeFalse();
    expect(isVideoUrl('https://vimeo.com/123')).toBeFalse();
    expect(isVideoUrl('https://youtube.com.golpe.io/x')).toBeFalse();
    expect(isVideoUrl('')).toBeFalse();
  });

  it('miniatura do YouTube: id de watch, youtu.be e shorts; Instagram não tem', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://www.instagram.com/reel/Cx1/')).toBeNull();
    expect(youtubeVideoId('https://www.youtube.com/')).toBeNull();
  });

  it('lê os blocos nexaGO e o push do doc; post da fase 1 sai com push desligado', () => {
    const sentAt = new Date('2026-11-12T12:00:05Z');
    const post = blogPostFromDoc('p', {
      body: [
        { type: 'tournament', tournamentId: 't1' },
        { type: 'product', productId: '' },
        { type: 'video', url: 'https://youtu.be/abcdefghijk', caption: 'Saque' },
      ],
      push: { enabled: true, city: 'Goiânia', sport: 'beachTennis' },
      pushSentAt: { toDate: () => sentAt },
      pushResult: { state: 'sent', recipients: 1240, sent: 1100 },
    });
    expect(post.body).toEqual([
      { type: 'tournament', tournamentId: 't1' },
      { type: 'video', url: 'https://youtu.be/abcdefghijk', caption: 'Saque' },
    ]);
    expect(post.push).toEqual({ enabled: true, city: 'Goiânia', sport: 'beachTennis' });
    expect(post.pushSentAt).toEqual(sentAt);
    expect(post.pushResult).toEqual({ state: 'sent', recipients: 1240, sent: 1100 });
    const old = blogPostFromDoc('v', {});
    expect(old.push).toEqual({ enabled: false, city: null, sport: 'all' });
    expect([old.pushSentAt, old.pushResult]).toEqual([null, null]);
  });

  it('texto do alcance e resumo do push enviado', () => {
    expect(reachLabel({ reachable: 1240, athletes: 3106 })).toBe(
      'Alcance estimado: 1.240 atletas com o app atualizado · de 3.106 no público · respeita quem desligou avisos do blog',
    );
    expect(reachLabel({ reachable: 1, athletes: 1 })).toContain('1 atleta com o app');
    const now = new Date('2026-11-13T12:00:00Z');
    const sentAt = new Date('2026-11-12T12:00:05Z');
    expect(pushSentLabel({ pushSentAt: null, pushResult: null }, now)).toBeNull();
    expect(pushSentLabel({ pushSentAt: sentAt, pushResult: { state: 'sending', recipients: 0, sent: 0 } }, now)).toBe('Enviando push…');
    expect(pushSentLabel({ pushSentAt: sentAt, pushResult: { state: 'sent', recipients: 1240, sent: 1100 } }, now)).toBe(
      'Push enviado em 12 nov · 09:00 para 1.240 atletas',
    );
  });
});
