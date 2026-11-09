import { BLOG_STATUS_LABELS, formatCount, saoPauloParts, type BlogPost, type BlogStatus } from './blog-post';

export type BlogTab = 'all' | BlogStatus;

export const BLOG_TABS: ReadonlyArray<{ id: BlogTab; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'published', label: 'Publicados' },
  { id: 'scheduled', label: 'Agendados' },
  { id: 'review', label: 'Em revisão' },
  { id: 'draft', label: 'Rascunhos' },
];

export type BlogSort = 'recent' | 'reads';

export const BLOG_SORTS: ReadonlyArray<{ id: BlogSort; label: string }> = [
  { id: 'recent', label: 'Mais recentes' },
  { id: 'reads', label: 'Mais lidos' },
];

export interface BlogCriteria {
  tab: BlogTab;
  q: string;
  category: string | null;
  sort: BlogSort;
}

export const EMPTY_BLOG_CRITERIA: BlogCriteria = { tab: 'all', q: '', category: null, sort: 'recent' };

/** Minúsculas e sem acento: "Revisão" acha "revisao". */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function matchesSearch(post: BlogPost, q: string): boolean {
  const needle = normalizeSearch(q);
  if (!needle) {
    return true;
  }
  const haystack = normalizeSearch([post.title, post.author.name, ...post.tags].join(' '));
  return needle.split(/\s+/).every((token) => haystack.includes(token));
}

/** Data que ordena "mais recentes": a de publicação (ou a planejada), senão a do último save. */
function recency(post: BlogPost): number {
  return (post.publishAt ?? post.updatedAt)?.getTime() ?? 0;
}

/** Contagem por aba com a busca e a categoria aplicadas (a aba em si não filtra a contagem). */
export function tabCounts(posts: readonly BlogPost[], criteria: Omit<BlogCriteria, 'tab' | 'sort'>): Record<BlogTab, number> {
  const counts: Record<BlogTab, number> = { all: 0, published: 0, scheduled: 0, review: 0, draft: 0 };
  for (const post of posts) {
    if (criteria.category && post.category !== criteria.category) {
      continue;
    }
    if (!matchesSearch(post, criteria.q)) {
      continue;
    }
    counts.all += 1;
    counts[post.status] += 1;
  }
  return counts;
}

export function filterPosts(posts: readonly BlogPost[], criteria: BlogCriteria): BlogPost[] {
  const rows = posts.filter(
    (post) =>
      (criteria.tab === 'all' || post.status === criteria.tab) &&
      (!criteria.category || post.category === criteria.category) &&
      matchesSearch(post, criteria.q),
  );
  const byRecent = (a: BlogPost, b: BlogPost) => recency(b) - recency(a) || a.title.localeCompare(b.title, 'pt-BR');
  return rows.sort(criteria.sort === 'reads' ? (a, b) => b.readCount - a.readCount || byRecent(a, b) : byRecent);
}

export interface BlogStats {
  published: number;
  scheduled: number;
  reads: number;
  helpful: number;
}

/** Só o que existe de verdade nos docs: contagem por status e os contadores dos gatilhos. */
export function blogStats(posts: readonly BlogPost[]): BlogStats {
  return posts.reduce<BlogStats>(
    (acc, post) => ({
      published: acc.published + (post.status === 'published' ? 1 : 0),
      scheduled: acc.scheduled + (post.status === 'scheduled' ? 1 : 0),
      reads: acc.reads + post.readCount,
      helpful: acc.helpful + post.helpfulCount,
    }),
    { published: 0, scheduled: 0, reads: 0, helpful: 0 },
  );
}

export interface UpcomingItem {
  id: string;
  title: string;
  /** `null` = rascunho sem data. */
  date: Date | null;
  meta: string;
}

function channelsLabel(post: BlogPost): string {
  if (post.channels.app && post.channels.site) {
    return 'app e site';
  }
  if (post.channels.app) {
    return 'só no app';
  }
  return post.channels.site ? 'só no site' : 'sem canal';
}

/**
 * Lateral "Próximas publicações": agendados por data; depois rascunhos e posts em revisão com data
 * planejada (por data) e, por último, os sem data (o editado mais recente primeiro).
 */
export function upcomingPosts(posts: readonly BlogPost[], now: Date, limit = 6): UpcomingItem[] {
  const scheduled = posts
    .filter((p) => p.status === 'scheduled' && p.publishAt)
    .sort((a, b) => a.publishAt!.getTime() - b.publishAt!.getTime());
  const pending = posts.filter((p) => p.status === 'draft' || p.status === 'review');
  const planned = pending
    .filter((p) => p.publishAt && p.publishAt.getTime() >= now.getTime())
    .sort((a, b) => a.publishAt!.getTime() - b.publishAt!.getTime());
  const undated = pending
    .filter((p) => !p.publishAt || p.publishAt.getTime() < now.getTime())
    .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));

  return [
    ...scheduled.map((p) => ({
      id: p.id,
      title: p.title,
      date: p.publishAt,
      meta: `${saoPauloParts(p.publishAt!).time} · ${channelsLabel(p)}`,
    })),
    ...planned.map((p) => ({
      id: p.id,
      title: p.title,
      date: p.publishAt,
      meta: `${BLOG_STATUS_LABELS[p.status].toLowerCase()} · planejado para ${saoPauloParts(p.publishAt!).time}`,
    })),
    ...undated.map((p) => ({
      id: p.id,
      title: p.title,
      date: null,
      meta: `${BLOG_STATUS_LABELS[p.status].toLowerCase()} sem data`,
    })),
  ].slice(0, limit);
}

/**
 * Indicador discreto de push na coluna Status: enviado (com quantos), enviando, ou ligado para sair
 * quando o post for ao ar. Publicado com push ligado e nunca enviado não ganha nada: não vai sair.
 */
export function pushBadge(post: Pick<BlogPost, 'status' | 'channels' | 'pushSentAt' | 'pushResult'>): { text: string; sent: boolean } | null {
  if (post.pushResult?.state === 'sent') {
    return { text: `aviso para ${formatCount(post.pushResult.recipients)}`, sent: true };
  }
  if (post.pushSentAt || post.pushResult) {
    return { text: 'enviando aviso', sent: true };
  }
  if (post.channels.app && post.status !== 'published') {
    return { text: 'avisa ao publicar', sent: false };
  }
  return null;
}
