import type { SiteBlogPost } from '../firestore/blog';
import type { BlogCategoryView } from './categories';
import { STATIC_POST_AUTHOR, staticPostDate, staticReadMinutes, type BlogPost } from './posts';

/** Item da listagem `/blog` — mesma forma para post do Firestore e post estático. */
export interface BlogFeedItem {
  slug: string;
  title: string;
  summary: string;
  /** Categoria resolvida (inclusive inativa); null quando o id não existe mais ou nos estáticos. */
  category: BlogCategoryView | null;
  /** Rótulo do chip: nome da categoria, ou a 1ª tag nos estáticos. null = sem chip. */
  label: string | null;
  coverUrl: string | null;
  authorName: string | null;
  authorPhotoUrl: string | null;
  readMinutes: number | null;
  date: Date | null;
}

/** Categoria do post pela lista efetiva. Inativa continua valendo (post antigo mantém rótulo/cor). */
export function resolveCategory(id: string | null, categories: readonly BlogCategoryView[]): BlogCategoryView | null {
  return id ? (categories.find((c) => c.id === id) ?? null) : null;
}

export function feedItemFromFirestore(p: SiteBlogPost, categories: readonly BlogCategoryView[]): BlogFeedItem {
  const category = resolveCategory(p.category, categories);
  return {
    slug: p.slug,
    title: p.title,
    summary: p.subtitle,
    category,
    // Id sem categoria (doc apagado, build antigo) = sem chip.
    label: category?.label ?? null,
    coverUrl: p.coverUrl,
    authorName: p.author?.name ?? null,
    authorPhotoUrl: p.author?.photoUrl ?? null,
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
    authorPhotoUrl: null,
    readMinutes: staticReadMinutes(p),
    date: staticPostDate(p),
  };
}

/**
 * Junta os posts do Firestore com os estáticos: slug repetido fica com o do Firestore, e a
 * lista sai por data, mais recente primeiro (sem data vai pro fim).
 */
export function mergeBlogFeed(
  remote: SiteBlogPost[],
  local: BlogPost[],
  categories: readonly BlogCategoryView[],
): BlogFeedItem[] {
  const remoteSlugs = new Set(remote.map((p) => p.slug));
  const items = [
    ...remote.map((p) => feedItemFromFirestore(p, categories)),
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

/** Chips do filtro "Tema": categorias ativas que têm post na lista, na ordem da lista efetiva. */
export function filterCategories(items: readonly BlogFeedItem[], categories: readonly BlogCategoryView[]): BlogCategoryView[] {
  const present = new Set(items.map((i) => i.category?.id).filter(Boolean));
  return categories.filter((c) => c.active && present.has(c.id));
}
