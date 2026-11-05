import type { BlogCategory, SiteBlogPost } from '../firestore/blog';
import { BLOG_CATEGORY_META } from './categories';
import { STATIC_POST_AUTHOR, staticPostDate, staticReadMinutes, type BlogPost } from './posts';

/** Item da listagem `/blog` — mesma forma para post do Firestore e post estático. */
export interface BlogFeedItem {
  slug: string;
  title: string;
  summary: string;
  category: BlogCategory | null;
  /** Rótulo do chip: nome da categoria, ou a 1ª tag nos estáticos. */
  label: string | null;
  coverUrl: string | null;
  authorName: string | null;
  readMinutes: number | null;
  date: Date | null;
}

export function feedItemFromFirestore(p: SiteBlogPost): BlogFeedItem {
  return {
    slug: p.slug,
    title: p.title,
    summary: p.subtitle,
    category: p.category,
    label: p.category ? BLOG_CATEGORY_META[p.category].label : (p.tags[0] ?? null),
    coverUrl: p.coverUrl,
    authorName: p.author?.name ?? null,
    readMinutes: p.readMinutes,
    date: p.publishAt,
  };
}

export function feedItemFromStatic(p: BlogPost): BlogFeedItem {
  return {
    slug: p.slug,
    title: p.title,
    summary: p.excerpt,
    category: null,
    label: p.tags?.[0] ?? null,
    coverUrl: null,
    authorName: STATIC_POST_AUTHOR,
    readMinutes: staticReadMinutes(p),
    date: staticPostDate(p),
  };
}

/**
 * Junta os posts do Firestore com os estáticos: slug repetido fica com o do Firestore, e a
 * lista sai por data, mais recente primeiro (sem data vai pro fim).
 */
export function mergeBlogFeed(remote: SiteBlogPost[], local: BlogPost[]): BlogFeedItem[] {
  const remoteSlugs = new Set(remote.map((p) => p.slug));
  const items = [
    ...remote.map(feedItemFromFirestore),
    ...local.filter((p) => !remoteSlugs.has(p.slug)).map(feedItemFromStatic),
  ];
  return items.sort((a, b) => {
    if (!a.date || !b.date) return a.date ? -1 : b.date ? 1 : 0;
    return b.date.getTime() - a.date.getTime();
  });
}

/** Dia local em ISO (`YYYY-MM-DD`) para `<time datetime>`. */
export function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
