import { mergeBlogFeed } from './feed';
import { staticPostDate, type BlogPost } from './posts';
import type { SiteBlogPost } from '../firestore/blog';

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
    author: { name: 'Ana', role: '' },
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
    const items = mergeBlogFeed([remote('a', new Date(2026, 10, 1))], [local('a', '2026-06-20'), local('b', '2026-06-21')]);
    expect(items.map((i) => i.title)).toEqual(['Remoto a', 'Local b']);
  });

  it('ordena por data, mais recente primeiro, e sem data vai pro fim', () => {
    const items = mergeBlogFeed(
      [remote('sem-data', null), remote('nov', new Date(2026, 10, 1))],
      [local('jul', '2026-07-01')],
    );
    expect(items.map((i) => i.slug)).toEqual(['nov', 'jul', 'sem-data']);
  });

  it('item estático: rótulo da 1ª tag, sem categoria, autor da equipe e leitura ≥ 1 min', () => {
    const [item] = mergeBlogFeed([], [local('x', '2026-06-20')]);
    expect(item.category).toBeNull();
    expect(item.label).toBe('Liga');
    expect(item.authorName).toBe('Equipe nexaGO');
    expect(item.readMinutes).toBe(1);
  });

  it('item do Firestore: rótulo é o nome da categoria', () => {
    const [item] = mergeBlogFeed([remote('r', new Date())], []);
    expect(item.label).toBe('Regras');
  });
});

describe('staticPostDate', () => {
  it('lê YYYY-MM-DD como dia local (não meia-noite UTC)', () => {
    const d = staticPostDate(local('x', '2026-06-20'));
    expect(d?.getDate()).toBe(20);
    expect(d?.getMonth()).toBe(5);
  });
});
