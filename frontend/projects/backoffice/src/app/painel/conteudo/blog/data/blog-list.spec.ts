import { EMPTY_BLOG_CRITERIA, blogStats, filterPosts, normalizeSearch, pushBadge, tabCounts, upcomingPosts } from './blog-list';
import type { BlogPost } from './blog-post';

function post(id: string, over: Partial<BlogPost> = {}): BlogPost {
  return {
    id,
    title: `Post ${id}`,
    subtitle: '',
    slug: `post-${id}`,
    seoDescription: '',
    coverUrl: null,
    category: 'torneios',
    sport: 'all',
    tags: [],
    author: { name: 'Ana Souza', role: 'Equipe nexaGO' },
    body: [{ type: 'paragraph', text: 'texto' }],
    cta: null,
    channels: { app: true, site: true },
    featured: false,
    push: { enabled: false, city: null, sport: 'all' },
    pushSentAt: null,
    pushResult: null,
    status: 'published',
    publishAt: new Date('2026-10-20T12:00:00Z'),
    readMinutes: 1,
    readCount: 0,
    helpfulCount: 0,
    updatedAt: new Date('2026-10-20T12:00:00Z'),
    version: 1,
    ...over,
  };
}

const NOW = new Date('2026-11-05T15:00:00Z');

const POSTS: BlogPost[] = [
  post('liga', { title: 'Liga nexaGO: tudo sobre a 2ª etapa', readCount: 2140, helpfulCount: 80, publishAt: new Date('2026-10-28T12:00:00Z') }),
  post('saque', { title: '5 exercícios para o saque', category: 'treino', tags: ['vôlei de praia'], readCount: 1880, helpfulCount: 41 }),
  post('toalha', { title: 'Chegou a Toalha', category: 'loja', status: 'scheduled', publishAt: new Date('2026-11-12T12:00:00Z'), channels: { app: true, site: false } }),
  post('arena', { title: 'Bastidores da Arena', category: 'arenas', status: 'review', publishAt: null, author: { name: 'Rhuan Lima', role: '' } }),
  post('kotc', { title: 'King of the Court', category: 'regras', status: 'draft', publishAt: new Date('2026-11-19T12:00:00Z') }),
  post('velho', { title: 'Rascunho antigo', status: 'draft', publishAt: null, updatedAt: new Date('2026-09-01T12:00:00Z') }),
];

describe('blog · lista', () => {
  it('busca sem acento e sem caixa, por título, tag ou autor', () => {
    expect(normalizeSearch('  Revisão ÁGIL ')).toBe('revisao agil');
    const ids = (q: string) => filterPosts(POSTS, { ...EMPTY_BLOG_CRITERIA, q }).map((p) => p.id);
    expect(ids('exercicios')).toEqual(['saque']);
    expect(ids('volei de praia')).toEqual(['saque']);
    expect(ids('rhuan')).toEqual(['arena']);
    expect(ids('liga etapa')).toEqual(['liga']);
  });

  it('contagem por aba respeita busca e categoria, não a aba', () => {
    expect(tabCounts(POSTS, { q: '', category: null })).toEqual({ all: 6, published: 2, scheduled: 1, review: 1, draft: 2 });
    expect(tabCounts(POSTS, { q: '', category: 'loja' })).toEqual({ all: 1, published: 0, scheduled: 1, review: 0, draft: 0 });
  });

  it('filtra por aba e categoria; mais recentes pela data de publicação, senão do save', () => {
    expect(filterPosts(POSTS, { ...EMPTY_BLOG_CRITERIA, tab: 'draft' }).map((p) => p.id)).toEqual(['kotc', 'velho']);
    expect(filterPosts(POSTS, { ...EMPTY_BLOG_CRITERIA, category: 'treino' }).map((p) => p.id)).toEqual(['saque']);
    expect(filterPosts(POSTS, { ...EMPTY_BLOG_CRITERIA, tab: 'published' }).map((p) => p.id)).toEqual(['liga', 'saque']);
    expect(filterPosts(POSTS, { ...EMPTY_BLOG_CRITERIA, sort: 'reads' })[0]!.id).toBe('liga');
  });

  it('números só com o que existe: publicados, agendados e soma dos contadores', () => {
    expect(blogStats(POSTS)).toEqual({ published: 2, scheduled: 1, reads: 4020, helpful: 121 });
    expect(blogStats([])).toEqual({ published: 0, scheduled: 0, reads: 0, helpful: 0 });
  });

  it('próximas publicações: agendados, depois planejados, depois sem data', () => {
    const items = upcomingPosts(POSTS, NOW);
    expect(items.map((i) => i.id)).toEqual(['toalha', 'kotc', 'arena', 'velho']);
    expect(items[0]!.meta).toBe('09:00 · só no app');
    expect(items[1]!.meta).toBe('rascunho · planejado para 09:00');
    expect(items[2]).toEqual(jasmine.objectContaining({ date: null, meta: 'em revisão sem data' }));
    expect(items[3]!.meta).toBe('rascunho sem data');
    expect(upcomingPosts(POSTS, NOW, 2).length).toBe(2);
  });

  it('indicador de push: enviado com quantos, enviando, ou ligado para sair ao publicar', () => {
    const on = { enabled: true, city: null, sport: 'all' };
    expect(pushBadge(post('x', { pushSentAt: NOW, pushResult: { state: 'sent', recipients: 1240, sent: 1200 } }))).toEqual({
      text: 'push para 1.240',
      sent: true,
    });
    expect(pushBadge(post('x', { pushSentAt: NOW, pushResult: { state: 'sending', recipients: 0, sent: 0 } }))).toEqual({
      text: 'enviando push',
      sent: true,
    });
    expect(pushBadge(post('x', { status: 'scheduled', push: on }))).toEqual({ text: 'push ao publicar', sent: false });
    // Publicado com push ligado e nunca enviado: não vai sair, então nada aparece.
    expect(pushBadge(post('x', { status: 'published', push: on }))).toBeNull();
    expect(pushBadge(post('x'))).toBeNull();
  });
});
