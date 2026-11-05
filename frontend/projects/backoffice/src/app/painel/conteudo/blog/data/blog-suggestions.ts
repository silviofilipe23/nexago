import { resolveSport } from '@nexago/sports';
import type { TournamentStatus } from '../../../torneios/data/tournaments.repository';
import { normalizeSearch } from './blog-list';
import { isCategoryId } from './blog-taxonomy';
import {
  BLOG_TITLE_MAX,
  dayMonthLabel,
  saoPauloParts,
  type BlogCategory,
  type BlogPost,
} from './blog-post';

/**
 * "Pautas sugeridas" da lista de posts: só fatos que o admin já lê (torneios, etapas do ranking,
 * vitrine da loja, os próprios posts). Nada aqui grava; "Criar rascunho" só abre o editor
 * preenchido.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const SUGGESTIONS_MAX = 4;
/** Por tipo, para quatro torneios não esconderem o resto. */
const PER_KIND_MAX = 2;
const TOURNAMENT_HORIZON_DAYS = 30;
const RANKING_LOOKBACK_DAYS = 14;
const DOC_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// ---------- entradas ----------

/** Torneio já filtrado como público e fora de rascunho (`isListedTournament`). */
export interface TournamentCandidate {
  id: string;
  name: string;
  /** Esporte cru do doc (`sport`), resolvido pelo catálogo na hora de sugerir. */
  sport: string | null;
  status: TournamentStatus;
  startAt: Date | null;
}

export interface RankingStageCandidate {
  /** `sport` do doc `rankingStages/{code}` (ou o id). */
  sport: string;
  tournamentId: string;
  tournamentName: string | null;
  at: Date;
}

export interface ProductCandidate {
  id: string;
  name: string;
  /** Fim do selo "nova" (30 dias depois da publicação na vitrine). */
  newUntil: Date | null;
}

/**
 * Mesma regra do site (`frontend/projects/site/src/lib/firestore/tournaments.ts`): só
 * `visibility == 'publicListing'` aparece na listagem, e rascunho nunca, mesmo listado.
 */
export function isListedTournament(data: Record<string, unknown>): boolean {
  if (data['visibility'] !== 'publicListing') {
    return false;
  }
  const listing = typeof data['listingStatus'] === 'string' ? data['listingStatus'].trim() : '';
  const raw = (listing || (typeof data['status'] === 'string' ? data['status'] : '')).toLowerCase();
  return !(raw.includes('draft') || raw.includes('rascunho') || raw.includes('programado'));
}

function dateOf(v: unknown): Date | null {
  const toDate = (v as { toDate?: unknown } | null)?.toDate;
  return typeof toDate === 'function' ? (toDate.call(v) as Date) : v instanceof Date ? v : null;
}

/** Doc `rankingStages/{code}` → etapas (`stages.{tournamentId} = {year, at}`). */
export function rankingStagesFromDoc(id: string, data: Record<string, unknown>): Array<Omit<RankingStageCandidate, 'tournamentName'>> {
  const sport = typeof data['sport'] === 'string' && data['sport'].trim() ? data['sport'].trim() : id;
  const stages = data['stages'];
  if (!stages || typeof stages !== 'object') {
    return [];
  }
  return Object.entries(stages as Record<string, unknown>).flatMap(([tournamentId, raw]) => {
    const at = dateOf((raw as Record<string, unknown> | null)?.['at']);
    return at ? [{ sport, tournamentId, at }] : [];
  });
}

/** Etapas dos últimos 14 dias, a mais recente de cada esporte. */
export function recentStages<T extends { sport: string; at: Date }>(stages: readonly T[], now: Date): T[] {
  const since = now.getTime() - RANKING_LOOKBACK_DAYS * DAY_MS;
  const latest = new Map<string, T>();
  for (const s of stages) {
    const t = s.at.getTime();
    if (t < since || t > now.getTime()) {
      continue;
    }
    const prev = latest.get(s.sport);
    if (!prev || prev.at.getTime() < t) {
      latest.set(s.sport, s);
    }
  }
  return [...latest.values()];
}

// ---------- rascunho pré-preenchido ----------

export type PrefillBlock =
  | { type: 'tournament'; id: string }
  | { type: 'product'; id: string }
  | { type: 'ranking'; sport: string };

export interface DraftPrefill {
  category: BlogCategory;
  /** `code` do catálogo ou "all". */
  sport: string;
  title: string;
  block: PrefillBlock | null;
}

/** Query params de `painel/conteudo/blog/novo` (sobrevivem a recarregar a página). */
export function prefillParams(p: DraftPrefill): Record<string, string> {
  const params: Record<string, string> = { categoria: p.category, esporte: p.sport, titulo: p.title };
  if (p.block?.type === 'tournament') {
    params['torneio'] = p.block.id;
  } else if (p.block?.type === 'product') {
    params['produto'] = p.block.id;
  } else if (p.block?.type === 'ranking') {
    params['ranking'] = p.block.sport;
  }
  return params;
}

/** Lê os query params de volta; valor estranho é ignorado (URL editada à mão). `null` = sem pauta. */
export function prefillFromParams(get: (key: string) => string | null): DraftPrefill | null {
  const title = (get('titulo') ?? '').replace(/\s+/g, ' ').trim().slice(0, BLOG_TITLE_MAX);
  const rawCategory = get('categoria');
  // Categoria criada no backoffice também vale; se não existir mais, o editor mostra "(não existe mais)".
  const category = isCategoryId(rawCategory) ? rawCategory : null;
  const tournament = get('torneio');
  const product = get('produto');
  const ranking = resolveSport(get('ranking'))?.code ?? null;
  const block: PrefillBlock | null =
    tournament && DOC_ID_RE.test(tournament)
      ? { type: 'tournament', id: tournament }
      : product && DOC_ID_RE.test(product)
        ? { type: 'product', id: product }
        : ranking
          ? { type: 'ranking', sport: ranking }
          : null;
  if (!title && !category && !block) {
    return null;
  }
  const rawSport = get('esporte');
  return {
    category: category ?? 'torneios',
    sport: rawSport === 'all' ? 'all' : (resolveSport(rawSport)?.code ?? 'all'),
    title,
    block,
  };
}

function clampTitle(text: string): string {
  return text.length <= BLOG_TITLE_MAX ? text : `${text.slice(0, BLOG_TITLE_MAX - 1).trimEnd()}…`;
}

// ---------- pautas ----------

export type SuggestionKind = 'tournament' | 'ranking' | 'product' | 'push';

export interface Suggestion {
  key: string;
  kind: SuggestionKind;
  kicker: string;
  title: string;
  /** Mais cedo = mais urgente. */
  dueAt: number;
  /** Rascunho a abrir (`null` para "falta o push": abre o post). */
  prefill: DraftPrefill | null;
  /** Post que o botão abre (só "falta o push"). */
  postId: string | null;
}

/** Diferença em dias de calendário de São Paulo (hoje = 0). */
export function calendarDaysUntil(date: Date, now: Date): number {
  const a = saoPauloParts(date);
  const b = saoPauloParts(now);
  return Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / DAY_MS);
}

function inDays(n: number): string {
  return n === 0 ? 'hoje' : n === 1 ? 'amanhã' : `em ${n} dias`;
}

function agoLabel(n: number): string {
  return n <= 0 ? 'hoje' : n === 1 ? 'ontem' : `há ${n} dias`;
}

/** Ids citados em blocos de qualquer post (qualquer status). */
function referencedIds(posts: readonly BlogPost[], type: 'tournament' | 'product'): Set<string> {
  const ids = new Set<string>();
  for (const post of posts) {
    for (const b of post.body) {
      if (b.type === 'tournament' && type === 'tournament') {
        ids.add(b.tournamentId);
      } else if (b.type === 'product' && type === 'product') {
        ids.add(b.productId);
      }
    }
  }
  return ids;
}

function tournamentSuggestion(t: TournamentCandidate, now: Date): Suggestion | null {
  if (t.status === 'concluido' || t.status === 'cancelado' || t.status === 'andamento') {
    return null;
  }
  const days = t.startAt ? calendarDaysUntil(t.startAt, now) : null;
  if (days !== null && days < 0) {
    return null;
  }
  const open = t.status === 'inscricoes';
  const soon = days !== null && days <= TOURNAMENT_HORIZON_DAYS;
  if (!open && !soon) {
    return null;
  }
  const sport = resolveSport(t.sport)?.code ?? 'all';
  return {
    key: `tournament:${t.id}`,
    kind: 'tournament',
    kicker: days === null ? 'TORNEIO · INSCRIÇÕES ABERTAS' : `TORNEIO · ${inDays(days).toUpperCase()}`,
    title: open
      ? `${t.name} abre inscrições e ainda não tem post`
      : `${t.name} começa ${inDays(days!)} e ainda não tem post`,
    dueAt: t.startAt ? t.startAt.getTime() : now.getTime() + TOURNAMENT_HORIZON_DAYS * DAY_MS,
    prefill: {
      category: 'torneios',
      sport,
      title: clampTitle(open ? `Inscrições abertas: ${t.name}` : `${t.name}: tudo o que você precisa saber`),
      block: { type: 'tournament', id: t.id },
    },
    postId: null,
  };
}

/** Já há post com ranking desse esporte depois da etapa? Então a pauta foi feita. */
function rankingCovered(posts: readonly BlogPost[], sport: string, at: Date): boolean {
  return posts.some(
    (p) =>
      (p.publishAt ?? p.updatedAt ?? new Date(0)).getTime() >= at.getTime() &&
      p.body.some((b) => b.type === 'ranking' && resolveSport(b.sport)?.code === sport),
  );
}

function rankingSuggestion(s: RankingStageCandidate, posts: readonly BlogPost[], now: Date): Suggestion | null {
  const sport = resolveSport(s.sport);
  if (!sport || rankingCovered(posts, sport.code, s.at)) {
    return null;
  }
  const base = `Quem subiu no ranking de ${sport.label}`;
  return {
    key: `ranking:${sport.code}`,
    kind: 'ranking',
    kicker: `RANKING · ATUALIZADO ${agoLabel(-calendarDaysUntil(s.at, now)).toUpperCase()}`,
    title: s.tournamentName ? `${base} com a etapa ${s.tournamentName}` : base,
    dueAt: s.at.getTime() + 7 * DAY_MS,
    prefill: { category: 'torneios', sport: sport.code, title: clampTitle(base), block: { type: 'ranking', sport: sport.code } },
    postId: null,
  };
}

function productSuggestion(p: ProductCandidate, now: Date): Suggestion | null {
  if (p.newUntil && p.newUntil.getTime() <= now.getTime()) {
    return null;
  }
  return {
    key: `product:${p.id}`,
    kind: 'product',
    kicker: 'LOJA · LANÇAMENTO',
    title: `${p.name} chegou à loja e ainda não tem post`,
    dueAt: p.newUntil ? p.newUntil.getTime() : now.getTime() + 30 * DAY_MS,
    prefill: { category: 'loja', sport: 'all', title: clampTitle(`Chegou: ${p.name}`), block: { type: 'product', id: p.id } },
    postId: null,
  };
}

function pushSuggestion(post: BlogPost, now: Date): Suggestion | null {
  if (
    post.status !== 'scheduled' ||
    !post.publishAt ||
    !post.channels.app ||
    post.push.enabled ||
    post.pushSentAt ||
    post.publishAt.getTime() <= now.getTime()
  ) {
    return null;
  }
  return {
    key: `push:${post.id}`,
    kind: 'push',
    kicker: `AGENDADO · ${dayMonthLabel(post.publishAt, now).toUpperCase()} · ${saoPauloParts(post.publishAt).time}`,
    title: `${post.title || 'Sem título'}: post agendado, falta o push`,
    dueAt: post.publishAt.getTime(),
    prefill: null,
    postId: post.id,
  };
}

/** Até 4 pautas, mais urgentes primeiro, no máximo 2 de cada tipo. */
export function buildSuggestions(
  input: {
    posts: readonly BlogPost[];
    tournaments: readonly TournamentCandidate[];
    stages: readonly RankingStageCandidate[];
    products: readonly ProductCandidate[];
  },
  now: Date,
): Suggestion[] {
  const tournamentsInPosts = referencedIds(input.posts, 'tournament');
  const productsInPosts = referencedIds(input.posts, 'product');
  const all = [
    ...input.posts.map((p) => pushSuggestion(p, now)),
    ...input.tournaments.filter((t) => !tournamentsInPosts.has(t.id)).map((t) => tournamentSuggestion(t, now)),
    ...recentStages(input.stages, now).map((s) => rankingSuggestion(s, input.posts, now)),
    ...input.products.filter((p) => !productsInPosts.has(p.id)).map((p) => productSuggestion(p, now)),
  ]
    .filter((s): s is Suggestion => s !== null)
    .sort((a, b) => a.dueAt - b.dueAt || normalizeSearch(a.title).localeCompare(normalizeSearch(b.title)));

  const perKind = new Map<SuggestionKind, number>();
  const out: Suggestion[] = [];
  for (const s of all) {
    const n = perKind.get(s.kind) ?? 0;
    if (n >= PER_KIND_MAX) {
      continue;
    }
    perKind.set(s.kind, n + 1);
    out.push(s);
    if (out.length === SUGGESTIONS_MAX) {
      break;
    }
  }
  return out;
}
