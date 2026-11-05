import { filterCategories, mergeBlogFeed } from './feed';
import { staticPostDate, type BlogPost } from './posts';
import { BLOG_DEFAULT_CATEGORIES, mergeBlogCategories } from './categories';
import type { SiteBlogPost } from '../firestore/blog';

const CATS = BLOG_DEFAULT_CATEGORIES;

function remote(slug: string, publishAt: Date | null, extra: Partial<SiteBlogPost> = {}): SiteBlogPost {
  return {
    id: slug,
    slug,
    title: `Remoto ${slug}`,
    subtitle: 'sub',
    description: 'sub',
    coverUrl: null,
    category: 'regras',
    tags: [],
    author: { name: 'Ana', role: '', photoUrl: null },
    body: [],
    cta: null,
    publishAt,
    readMinutes: 4,
    ...extra,
  };
}

function local(slug: string, date: string): BlogPost {
  return { slug, title: `Local ${slug}`, excerpt: 'ex', date, tags: ['Liga'], bodyHtml: '<p>um dois</p>' };
}

describe('mergeBlogFeed', () => {
  it('o post do Firestore vence quando o slug colide', () => {
    const items = mergeBlogFeed([remote('a', new Date(2026, 10, 1))], [local('a', '2026-06-20'), local('b', '2026-06-21')], CATS);
    expect(items.map((i) => i.title)).toEqual(['Remoto a', 'Local b']);
  });

  it('ordena por data, mais recente primeiro, e sem data vai pro fim', () => {
    const items = mergeBlogFeed(
      [remote('sem-data', null), remote('nov', new Date(2026, 10, 1))],
      [local('jul', '2026-07-01')],
      CATS,
    );
    expect(items.map((i) => i.slug)).toEqual(['nov', 'jul', 'sem-data']);
  });

  it('item estático: rótulo da 1ª tag, sem categoria, autor da equipe e leitura ≥ 1 min', () => {
    const [item] = mergeBlogFeed([], [local('x', '2026-06-20')], CATS);
    expect(item.category).toBeNull();
    expect(item.label).toBe('Liga');
    expect(item.authorName).toBe('Equipe nexaGO');
    expect(item.readMinutes).toBe(1);
  });

  it('item do Firestore: rótulo é o nome da categoria e a foto vem do autor', () => {
    const [item] = mergeBlogFeed(
      [remote('r', new Date(), { author: { name: 'Ana', role: '', photoUrl: 'https://x/a.jpg' } })],
      [],
      CATS,
    );
    expect(item.label).toBe('Regras');
    expect(item.category?.id).toBe('regras');
    expect(item.authorPhotoUrl).toBe('https://x/a.jpg');
  });

  it('categoria que não existe mais = sem chip; inativa continua com rótulo e cor', () => {
    const cats = mergeBlogCategories([{ id: 'loja', data: { active: false } }]);
    const [gone, inactive] = mergeBlogFeed(
      [remote('a', new Date(2026, 10, 2), { category: 'apagada' }), remote('b', new Date(2026, 10, 1), { category: 'loja' })],
      [],
      cats,
    );
    expect(gone.label).toBeNull();
    expect(gone.category).toBeNull();
    expect(inactive.label).toBe('Loja');
    expect(inactive.category?.active).toBeFalse();
  });
});

describe('filterCategories', () => {
  it('só ativas que têm post, na ordem da lista efetiva', () => {
    const cats = mergeBlogCategories([
      { id: 'loja', data: { active: false } },
      { id: 'saude', data: { label: 'Saúde', color: '#22aa88', colorLight: '#116644', order: 0, active: true } },
    ]);
    const items = mergeBlogFeed(
      [
        remote('1', new Date(), { category: 'treino' }),
        remote('2', new Date(), { category: 'loja' }),
        remote('3', new Date(), { category: 'saude' }),
      ],
      [local('x', '2026-06-20')],
      cats,
    );
    expect(filterCategories(items, cats).map((c) => c.id)).toEqual(['saude', 'treino']);
  });
});

describe('staticPostDate', () => {
  it('lê YYYY-MM-DD como dia local (não meia-noite UTC)', () => {
    const d = staticPostDate(local('x', '2026-06-20'));
    expect(d?.getDate()).toBe(20);
    expect(d?.getMonth()).toBe(5);
  });
});
