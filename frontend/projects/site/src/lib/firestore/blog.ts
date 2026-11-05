import { collection, getDocs, limit, orderBy, query, where, type DocumentData } from 'firebase/firestore/lite';
import { liteDb } from '../firebase-lite';
import { videoProvider, youtubeVideoId, type VideoProvider } from '../blog/video';

/**
 * Posts do blog escritos no backoffice (`blogPosts`, callable `saveBlogPost`). Contrato em
 * `docs/superpowers/specs/2026-11-05-blog-fase-1-design.md`.
 *
 * Toda consulta filtra `status == 'published'` (a rule pública só libera esses) e
 * `channels.site == true` (o post pode ter sido publicado só pro app), ordenando por
 * `publishAt` desc — o índice composto existe para essa combinação.
 *
 * Diferente dos vizinhos (`leagues.ts`, `tournaments.ts`), aqui as funções **não** engolem o
 * erro: o blog tem os posts estáticos de `lib/blog/posts.ts` como reserva, e a página precisa
 * distinguir "não há post no Firestore" (cai no estático / 404) de "a leitura falhou" (estado
 * de erro). Quem chama trata o `catch`.
 *
 * Texto é texto puro: o mapeamento só normaliza, e a renderização usa binding normal (escapado).
 */

/**
 * Id de categoria (`blogCategories/{id}` ou uma das 6 de origem). Qualquer id no formato do
 * servidor é aceito; quem resolve rótulo/cor é `lib/blog/categories.ts` (id sem categoria = sem chip).
 */
export type BlogCategory = string;
const CATEGORY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const BLOG_RANKING_MODES = ['athletes', 'teams'] as const;
export const BLOG_RANKING_GENDERS = ['all', 'masculino', 'feminino', 'misto'] as const;
export type BlogRankingMode = (typeof BLOG_RANKING_MODES)[number];
export type BlogRankingGender = (typeof BLOG_RANKING_GENDERS)[number];

/** Blocos do corpo já normalizados. O parágrafo vem quebrado em `parts` (um `<p>` por parte). */
export type BlogBlock =
  | { type: 'paragraph'; parts: string[] }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'image'; url: string; caption: string }
  // Blocos nexaGO (fase 2): o leitor busca o torneio/produto ao vivo e some com o bloco se não achar.
  | { type: 'tournament'; tournamentId: string }
  | { type: 'product'; productId: string }
  | { type: 'video'; url: string; caption: string; provider: VideoProvider; youtubeId: string | null }
  | { type: 'arena'; arenaId: string }
  /** `sport` é o `code` do catálogo (ex.: `beachTennis`), não o código de perfil do ranking. */
  | { type: 'ranking'; sport: string; mode: BlogRankingMode; gender: BlogRankingGender };

export interface BlogCta {
  label: string;
  /** Chave de destino do app (`HomeBannerDestination`) — o site não navega para elas. */
  destination: string;
  /** Só com `destination == 'url'` e https; senão null. */
  url: string | null;
}

/** Retrato do autor gravado no post (com `photoUrl` só nos posts salvos com autor cadastrado). */
export interface BlogAuthor {
  name: string;
  role: string;
  /** https, ou null. */
  photoUrl: string | null;
}

export interface SiteBlogPost {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  /** `seoDescription`, ou o subtítulo quando vazio. */
  description: string;
  coverUrl: string | null;
  /** Id da categoria; null quando ausente ou fora do formato. Pode não existir mais (sem chip). */
  category: BlogCategory | null;
  tags: string[];
  author: BlogAuthor | null;
  body: BlogBlock[];
  cta: BlogCta | null;
  publishAt: Date | null;
  readMinutes: number | null;
}

const COLLECTION = 'blogPosts';
const LIST_MAX = 60;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Id de documento seguro para `doc(...)`: sem barra (viraria outro caminho) e sem `.`/`..`. */
function docId(value: unknown): string | null {
  const s = text(value);
  return s && s.length <= 128 && !s.includes('/') && s !== '.' && s !== '..' ? s : null;
}

function httpsUrl(value: unknown): string | null {
  const s = text(value);
  return /^https:\/\/\S+$/i.test(s) ? s : null;
}

function toDate(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

/** Linha em branco separa parágrafos; `\n` simples continua dentro do parágrafo (quebra de linha). */
export function splitParagraphs(value: string): string[] {
  return value
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Bloco desconhecido, vazio ou malformado vira null (e é descartado). */
export function mapBlogBlock(raw: unknown): BlogBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  switch (b['type']) {
    case 'paragraph': {
      const parts = splitParagraphs(typeof b['text'] === 'string' ? b['text'] : '');
      return parts.length > 0 ? { type: 'paragraph', parts } : null;
    }
    case 'heading': {
      const t = text(b['text']);
      return t ? { type: 'heading', text: t } : null;
    }
    case 'quote': {
      const t = text(b['text']);
      return t ? { type: 'quote', text: t } : null;
    }
    case 'list': {
      const items = Array.isArray(b['items']) ? b['items'].map(text).filter(Boolean) : [];
      return items.length > 0 ? { type: 'list', items } : null;
    }
    case 'image': {
      const url = httpsUrl(b['url']);
      return url ? { type: 'image', url, caption: text(b['caption']) } : null;
    }
    case 'tournament': {
      const id = docId(b['tournamentId']);
      return id ? { type: 'tournament', tournamentId: id } : null;
    }
    case 'product': {
      const id = docId(b['productId']);
      return id ? { type: 'product', productId: id } : null;
    }
    case 'arena': {
      const id = docId(b['arenaId']);
      return id ? { type: 'arena', arenaId: id } : null;
    }
    case 'ranking': {
      const sport = text(b['sport']);
      const mode = b['mode'];
      const gender = b['gender'];
      // Modo ou gênero fora da lista = bloco de um build mais novo que este não entende.
      if (!sport || !includes(BLOG_RANKING_MODES, mode) || !includes(BLOG_RANKING_GENDERS, gender)) return null;
      return { type: 'ranking', sport, mode, gender };
    }
    case 'video': {
      const url = httpsUrl(b['url']);
      const provider = url ? videoProvider(url) : null;
      if (!url || !provider) return null; // host fora de YouTube/Instagram
      return { type: 'video', url, caption: text(b['caption']), provider, youtubeId: youtubeVideoId(url) };
    }
    default:
      return null;
  }
}

function mapCta(raw: unknown): BlogCta | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const label = text(c['label']);
  if (!label) return null;
  const destination = text(c['destination']);
  return { label, destination, url: destination === 'url' ? httpsUrl(c['url']) : null };
}

function includes<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function isCategory(value: unknown): value is BlogCategory {
  return typeof value === 'string' && value.length <= 32 && CATEGORY_ID.test(value);
}

/** `author` do post: `{name, role}` (antigos) ou `{id, name, role, photoUrl}`. Sem nome = sem autor. */
export function mapBlogAuthor(raw: unknown): BlogAuthor | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const name = text(a['name']);
  if (!name) return null;
  return { name, role: text(a['role']), photoUrl: httpsUrl(a['photoUrl']) };
}

/**
 * Doc → post do site. null quando falta o essencial (slug/título) ou quando o doc não é um post
 * publicado no site — redundante com a query, mas barato e protege contra um uso futuro sem filtro.
 */
export function mapBlogPost(id: string, d: DocumentData): SiteBlogPost | null {
  const slug = text(d['slug']);
  const title = text(d['title']);
  if (!slug || !title) return null;
  if (d['status'] !== 'published' || d['channels']?.['site'] !== true) return null;

  const subtitle = text(d['subtitle']);
  const minutes = Number(d['readMinutes']);

  return {
    id,
    slug,
    title,
    subtitle,
    description: text(d['seoDescription']) || subtitle,
    coverUrl: httpsUrl(d['coverUrl']),
    category: isCategory(d['category']) ? d['category'] : null,
    tags: Array.isArray(d['tags']) ? d['tags'].map(text).filter(Boolean) : [],
    author: mapBlogAuthor(d['author']),
    body: Array.isArray(d['body'])
      ? d['body'].map(mapBlogBlock).filter((b: BlogBlock | null): b is BlogBlock => b !== null)
      : [],
    cta: mapCta(d['cta']),
    publishAt: toDate(d['publishAt']),
    readMinutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null,
  };
}

function publishedOnSite() {
  return [where('status', '==', 'published'), where('channels.site', '==', true)] as const;
}

/** Posts publicados no site, mais recentes primeiro. Lança em caso de falha de leitura. */
export async function getSiteBlogPosts(max = LIST_MAX): Promise<SiteBlogPost[]> {
  const snap = await getDocs(
    query(collection(liteDb, COLLECTION), ...publishedOnSite(), orderBy('publishAt', 'desc'), limit(max)),
  );
  return snap.docs
    .map((doc) => mapBlogPost(doc.id, doc.data()))
    .filter((p): p is SiteBlogPost => p !== null);
}

/** Post publicado no site pelo slug, ou null se não existir. Lança em caso de falha de leitura. */
export async function getSiteBlogPostBySlug(slug: string): Promise<SiteBlogPost | null> {
  const snap = await getDocs(
    query(collection(liteDb, COLLECTION), where('slug', '==', slug), ...publishedOnSite(), limit(1)),
  );
  const doc = snap.docs[0];
  return doc ? mapBlogPost(doc.id, doc.data()) : null;
}
