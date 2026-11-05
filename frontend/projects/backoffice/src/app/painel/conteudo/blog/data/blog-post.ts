import { DESTINATIONS, type HomeBannerDestination } from '../../../app/novidades/data/home-banner';

/** Espelha `functions/src/blog.ts` — mudar os dois. */
export const BLOG_TITLE_MAX = 90;
export const BLOG_SUBTITLE_MAX = 160;
export const BLOG_SEO_DESCRIPTION_MAX = 155;
export const BLOG_SLUG_MAX = 80;
export const BLOG_TAGS_MAX = 8;
export const BLOG_TAG_MAX = 24;
export const BLOG_AUTHOR_FIELD_MAX = 40;
export const BLOG_BLOCKS_MAX = 80;
export const BLOG_PARAGRAPH_MAX = 2000;
export const BLOG_HEADING_MAX = 90;
export const BLOG_LIST_ITEMS_MAX = 12;
export const BLOG_LIST_ITEM_MAX = 300;
export const BLOG_QUOTE_MAX = 300;
export const BLOG_CAPTION_MAX = 140;
export const BLOG_CTA_LABEL_MAX = 32;
/** Blocos nexaGO (torneio, produto) por post: cada um é uma leitura a mais no save e no leitor. */
export const BLOG_EMBEDS_MAX = 10;
export const BLOG_PUSH_CITY_MAX = 60;
const WORDS_PER_MINUTE = 200;

/** Onde o site publica o blog (`frontend/projects/site`, rotas `/blog` e `/blog/:slug`). */
export const BLOG_SITE_HOST = 'nexago.com.br';
export const BLOG_SITE_URL = `https://${BLOG_SITE_HOST}/blog`;

export const BLOG_CATEGORIES = [
  { id: 'torneios', label: 'Torneios', color: '#FF6A1A' },
  { id: 'treino', label: 'Treino', color: '#2BD17E' },
  { id: 'regras', label: 'Regras', color: '#C9A7FF' },
  { id: 'arenas', label: 'Arenas', color: '#E3B85C' },
  { id: 'guia', label: 'Guia do app', color: '#9AB4FF' },
  { id: 'loja', label: 'Loja', color: '#FF8A4A' },
] as const;
export type BlogCategory = (typeof BLOG_CATEGORIES)[number]['id'];

export const BLOG_STATUSES = ['draft', 'review', 'scheduled', 'published'] as const;
export type BlogStatus = (typeof BLOG_STATUSES)[number];

export const BLOG_STATUS_LABELS: Record<BlogStatus, string> = {
  draft: 'Rascunho',
  review: 'Em revisão',
  scheduled: 'Agendado',
  published: 'Publicado',
};

/** Destinos da chamada: os mesmos do banner de novidades (`HOME_BANNER_DESTINATIONS`). */
export const BLOG_CTA_DESTINATIONS = DESTINATIONS;
export type BlogCtaDestination = HomeBannerDestination;

export type BlogBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'image'; url: string; caption: string }
  // Blocos nexaGO (fase 2): o servidor confere no save que o torneio/produto existe.
  | { type: 'tournament'; tournamentId: string }
  | { type: 'product'; productId: string }
  | { type: 'video'; url: string; caption: string };
export type BlogBlockType = BlogBlock['type'];

/** Push no horário da publicação. `city` `null` = todas; `sport` "all" = todos. */
export interface BlogPushSettings {
  enabled: boolean;
  city: string | null;
  sport: string;
}

export const BLOG_PUSH_OFF: BlogPushSettings = { enabled: false, city: null, sport: 'all' };

/** Gravado só pelo servidor (`functions/src/blog-push.ts`) quando o envio começa e termina. */
export interface BlogPushResult {
  state: 'sending' | 'sent';
  recipients: number;
  sent: number;
}

/** Retorno da callable `estimateBlogPushReach`. */
export interface BlogPushReach {
  /** Recebem o push hoje (filtro + preferências + app atualizado). */
  reachable: number;
  /** Atletas no filtro de cidade e esporte, com ou sem o app atualizado. */
  athletes: number;
  minBuild: number;
  /** Cidades dos atletas no filtro de esporte, mais frequentes primeiro (até 30). */
  cities: Array<{ city: string; count: number }>;
}

export interface BlogCta {
  label: string;
  destination: BlogCtaDestination;
  /** Só com `destination: "url"`. */
  url: string | null;
}

/** O que a callable `saveBlogPost` recebe em `post`. */
export interface BlogPostInput {
  title: string;
  subtitle: string;
  slug: string;
  seoDescription: string;
  coverUrl: string | null;
  category: BlogCategory;
  sport: string;
  tags: string[];
  author: { name: string; role: string };
  body: BlogBlock[];
  cta: BlogCta | null;
  channels: { app: boolean; site: boolean };
  featured: boolean;
  push: BlogPushSettings;
  status: BlogStatus;
  /** ISO 8601. Obrigatório só para `scheduled`; ignorado ao publicar agora. */
  publishAt: string | null;
}

export interface SaveBlogPostInput {
  id: string | null;
  version: number;
  post: BlogPostInput;
}

export interface SaveBlogPostResult {
  id: string;
  version: number;
  slug: string;
  status: BlogStatus;
  publishAt: string | null;
}

/** Um doc de `blogPosts/{id}` lido pelo backoffice. */
export interface BlogPost {
  id: string;
  title: string;
  subtitle: string;
  slug: string;
  seoDescription: string;
  coverUrl: string | null;
  category: BlogCategory;
  sport: string;
  tags: string[];
  author: { name: string; role: string };
  body: BlogBlock[];
  cta: BlogCta | null;
  channels: { app: boolean; site: boolean };
  featured: boolean;
  push: BlogPushSettings;
  /** Quando o envio do push começou; preenchido = nunca mais envia. */
  pushSentAt: Date | null;
  pushResult: BlogPushResult | null;
  status: BlogStatus;
  publishAt: Date | null;
  readMinutes: number;
  readCount: number;
  helpfulCount: number;
  updatedAt: Date | null;
  version: number;
}

export function categoryMeta(id: string): { id: string; label: string; color: string } {
  return BLOG_CATEGORIES.find((c) => c.id === id) ?? { id, label: id, color: '#9AB4FF' };
}

export function ctaDestinationLabel(id: string): string {
  return BLOG_CTA_DESTINATIONS.find((d) => d.id === id)?.label ?? id;
}

const VIDEO_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'instagram.com', 'www.instagram.com']);

/** Vídeo do YouTube ou do Instagram, como `isVideoUrl` do servidor (o leitor abre fora do app). */
export function isVideoUrl(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 1000 || !/^https:\/\/\S+$/.test(v)) {
    return false;
  }
  try {
    return VIDEO_HOSTS.has(new URL(v).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Id do vídeo do YouTube (para a miniatura `img.youtube.com/vi/<id>/hqdefault.jpg`), ou `null`. */
export function youtubeVideoId(url: string): string | null {
  if (!isVideoUrl(url)) {
    return null;
  }
  const u = new URL(url);
  const host = u.hostname.toLowerCase();
  const id =
    host === 'youtu.be'
      ? u.pathname.slice(1).split('/')[0]
      : host.endsWith('youtube.com')
        ? (u.searchParams.get('v') ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] ?? null)
        : null;
  return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
}

/** "Liga nexaGO: tudo sobre a 2ª etapa" → "liga-nexago-tudo-sobre-a-2a-etapa". Igual ao servidor. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ª/g, 'a')
    .replace(/º/g, 'o')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, BLOG_SLUG_MAX)
    .replace(/-+$/g, '');
}

function blockWords(b: BlogBlock): string {
  if (b.type === 'list') {
    return b.items.join(' ');
  }
  if (b.type === 'image' || b.type === 'video') {
    return b.caption;
  }
  if (b.type === 'tournament' || b.type === 'product') {
    return '';
  }
  return b.text;
}

/** Minutos de leitura: título + corpo a 200 palavras/min, nunca menos de 1. Igual ao servidor. */
export function readMinutes(title: string, body: BlogBlock[]): number {
  const text = [title, ...body.map(blockWords)].join(' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

// ---------- leitura do doc ----------

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function dateOf(v: unknown): Date | null {
  if (v instanceof Date) {
    return v;
  }
  const toDate = (v as { toDate?: unknown } | null)?.toDate;
  return typeof toDate === 'function' ? (toDate.call(v) as Date) : null;
}

function blockFrom(raw: unknown): BlogBlock | null {
  const b = (raw ?? {}) as Record<string, unknown>;
  switch (b['type']) {
    case 'paragraph':
    case 'heading':
    case 'quote':
      return { type: b['type'], text: str(b['text']) };
    case 'list':
      return { type: 'list', items: Array.isArray(b['items']) ? b['items'].map(str) : [] };
    case 'image':
    case 'video':
      return { type: b['type'], url: str(b['url']), caption: str(b['caption']) };
    case 'tournament':
      return str(b['tournamentId']) ? { type: 'tournament', tournamentId: str(b['tournamentId']) } : null;
    case 'product':
      return str(b['productId']) ? { type: 'product', productId: str(b['productId']) } : null;
    default:
      return null;
  }
}

export function blogPostFromDoc(id: string, data: Record<string, unknown>): BlogPost {
  const author = (data['author'] ?? {}) as Record<string, unknown>;
  const channels = (data['channels'] ?? {}) as Record<string, unknown>;
  const cta = data['cta'] as Record<string, unknown> | null | undefined;
  const push = (data['push'] ?? {}) as Record<string, unknown>;
  const pushResult = data['pushResult'] as Record<string, unknown> | null | undefined;
  const status = BLOG_STATUSES.includes(data['status'] as BlogStatus) ? (data['status'] as BlogStatus) : 'draft';
  const category = BLOG_CATEGORIES.some((c) => c.id === data['category'])
    ? (data['category'] as BlogCategory)
    : 'torneios';
  return {
    id,
    title: str(data['title']),
    subtitle: str(data['subtitle']),
    slug: str(data['slug']),
    seoDescription: str(data['seoDescription']),
    coverUrl: str(data['coverUrl']) || null,
    category,
    sport: str(data['sport']) || 'all',
    tags: Array.isArray(data['tags']) ? data['tags'].map(str).filter(Boolean) : [],
    author: { name: str(author['name']), role: str(author['role']) },
    body: Array.isArray(data['body']) ? data['body'].map(blockFrom).filter((b): b is BlogBlock => b !== null) : [],
    cta:
      cta && typeof cta === 'object'
        ? {
            label: str(cta['label']),
            destination: (str(cta['destination']) || 'url') as BlogCtaDestination,
            url: str(cta['url']) || null,
          }
        : null,
    channels: { app: channels['app'] !== false, site: channels['site'] !== false },
    featured: data['featured'] === true,
    push: {
      enabled: push['enabled'] === true,
      city: str(push['city']) || null,
      sport: str(push['sport']) || 'all',
    },
    pushSentAt: dateOf(data['pushSentAt']),
    pushResult:
      pushResult && typeof pushResult === 'object'
        ? {
            state: pushResult['state'] === 'sent' ? 'sent' : 'sending',
            recipients: num(pushResult['recipients']),
            sent: num(pushResult['sent']),
          }
        : null,
    status,
    publishAt: dateOf(data['publishAt']),
    readMinutes: num(data['readMinutes']),
    readCount: num(data['readCount']),
    helpfulCount: num(data['helpfulCount']),
    updatedAt: dateOf(data['updatedAt']),
    version: num(data['version']),
  };
}

// ---------- datas de São Paulo ----------

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const SP_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Data e hora de parede em São Paulo: `{date: 'YYYY-MM-DD', time: 'HH:mm'}`. */
export function saoPauloParts(d: Date): { date: string; time: string; day: number; month: number; year: number } {
  const p = Object.fromEntries(SP_PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  const year = Number(p['year']);
  const month = Number(p['month']);
  const day = Number(p['day']);
  return { date: `${p['year']}-${p['month']}-${p['day']}`, time: `${p['hour']}:${p['minute']}`, day, month, year };
}

/** Parede de São Paulo → ISO. O Brasil não tem horário de verão desde 2019: UTC−3 fixo. */
export function saoPauloIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }
  const d = new Date(`${date}T${time}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "28 out" (ano só quando não é o corrente). */
export function dayMonthLabel(d: Date, now: Date): string {
  const p = saoPauloParts(d);
  const label = `${p.day} ${MONTHS[p.month - 1]}`;
  return p.year === saoPauloParts(now).year ? label : `${label} ${p.year}`;
}

export function monthAbbr(d: Date): string {
  return MONTHS[saoPauloParts(d).month - 1]!;
}

/** Coluna Publicação: publicado → dia; agendado → dia · hora; rascunho/revisão → —. */
export function publicationLabel(post: Pick<BlogPost, 'status' | 'publishAt'>, now: Date): string {
  if (!post.publishAt || post.status === 'draft' || post.status === 'review') {
    return '—';
  }
  const day = dayMonthLabel(post.publishAt, now);
  return post.status === 'scheduled' ? `${day} · ${saoPauloParts(post.publishAt).time}` : day;
}

/** "Salvo há 3 min" a partir da hora do save. */
export function savedAgoLabel(savedAt: Date, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - savedAt.getTime()) / 1000));
  if (seconds < 60) {
    return 'Salvo agora';
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `Salvo há ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Salvo há ${hours} h`;
  }
  const p = saoPauloParts(savedAt);
  return `Salvo em ${dayMonthLabel(savedAt, now)} · ${p.time}`;
}

export function formatCount(n: number): string {
  return n.toLocaleString('pt-BR');
}

// ---------- push ----------

/** Linha do alcance estimado no editor. */
export function reachLabel(reach: Pick<BlogPushReach, 'reachable' | 'athletes'>): string {
  const n = (v: number, one: string, many: string) => `${formatCount(v)} ${v === 1 ? one : many}`;
  return (
    `Alcance estimado: ${n(reach.reachable, 'atleta', 'atletas')} com o app atualizado · ` +
    `de ${formatCount(reach.athletes)} no público · respeita quem desligou avisos do blog`
  );
}

/** Resumo do push já disparado: `null` = ainda não saiu. */
export function pushSentLabel(post: Pick<BlogPost, 'pushSentAt' | 'pushResult'>, now: Date): string | null {
  if (!post.pushSentAt && !post.pushResult) {
    return null;
  }
  if (!post.pushResult || post.pushResult.state === 'sending') {
    return 'Enviando push…';
  }
  const n = post.pushResult.recipients;
  const at = post.pushSentAt ? ` em ${dayMonthLabel(post.pushSentAt, now)} · ${saoPauloParts(post.pushSentAt).time}` : '';
  return `Push enviado${at} para ${formatCount(n)} ${n === 1 ? 'atleta' : 'atletas'}`;
}
