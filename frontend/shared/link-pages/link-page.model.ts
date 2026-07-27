/** Página pública de links (estilo link-in-bio) de uma arena ou de um organizador.
 *
 *  Um dono tem no máximo uma página, por isso o id do documento é determinístico
 *  (`{ownerType}_{ownerId}`): o painel lê a própria página com um `getDoc` direto, sem query
 *  nem índice. O `slug` é a chave pública da URL e vive num registro separado
 *  (`linkPageSlugs/{slug}`) escrito só por Cloud Function, o que garante unicidade sem
 *  depender de uma query "existe alguém com esse slug?" (que não é atômica).
 *
 *  Contadores (`views`, `clicks`) nunca são escritos pelo cliente — só pela function
 *  `trackLinkPageEvent`, que também mantém a janela de 30 dias em `dailyViews`/`dailyClicks`.
 */

export type LinkPageOwnerType = 'arena' | 'organizer';

/** Ícones disponíveis para um link. O catálogo é fechado porque o mesmo nome é
 *  desenhado em três lugares (painel Angular, prévia e página pública em React). */
export type LinkIconName =
  | 'link'
  | 'calendar'
  | 'whatsapp'
  | 'instagram'
  | 'trophy'
  | 'ticket'
  | 'pin'
  | 'shirt'
  | 'menu'
  | 'cash'
  | 'star'
  | 'users'
  | 'video'
  | 'globe';

export interface LinkIconOption {
  readonly name: LinkIconName;
  readonly label: string;
}

export const LINK_ICON_OPTIONS: readonly LinkIconOption[] = [
  { name: 'link', label: 'Link' },
  { name: 'calendar', label: 'Agenda / reserva' },
  { name: 'whatsapp', label: 'WhatsApp' },
  { name: 'instagram', label: 'Instagram' },
  { name: 'trophy', label: 'Torneio' },
  { name: 'ticket', label: 'Inscrição' },
  { name: 'pin', label: 'Localização' },
  { name: 'shirt', label: 'Loja / uniforme' },
  { name: 'menu', label: 'Cardápio' },
  { name: 'cash', label: 'Pagamento' },
  { name: 'star', label: 'Avaliação' },
  { name: 'users', label: 'Comunidade' },
  { name: 'video', label: 'Vídeo' },
  { name: 'globe', label: 'Site' },
];

const LINK_ICON_NAMES = new Set<string>(LINK_ICON_OPTIONS.map((o) => o.name));

export function isLinkIconName(value: unknown): value is LinkIconName {
  return typeof value === 'string' && LINK_ICON_NAMES.has(value);
}

/** Destaque exibido no topo da página pública (ex.: "4.8 · AVALIAÇÃO"). */
export interface LinkPageHighlight {
  value: string;
  label: string;
}

export interface LinkPage {
  /** `{ownerType}_{ownerId}` — determinístico, uma página por dono. */
  readonly id: string;
  readonly ownerType: LinkPageOwnerType;
  readonly ownerId: string;
  /** Chave pública da URL: `/a/{slug}` (arena) ou `/o/{slug}` (organizador). */
  readonly slug: string;
  readonly title: string;
  readonly handle: string;
  readonly bio: string;
  readonly avatarUrl: string | null;
  readonly highlights: readonly LinkPageHighlight[];
  readonly published: boolean;
  readonly views: number;
  readonly views30d: number;
  readonly viewsPrev30d: number;
}

export interface PageLink {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly url: string;
  readonly icon: LinkIconName;
  readonly active: boolean;
  /** Cartão laranja em destaque no topo da lista pública. */
  readonly featured: boolean;
  /** Selo "AO VIVO" — para torneio acontecendo agora. */
  readonly live: boolean;
  readonly order: number;
  readonly clicks: number;
  readonly clicks30d: number;
}

export const LINK_PAGE_MAX_LINKS = 30;
export const LINK_PAGE_SLUG_MIN = 3;
export const LINK_PAGE_SLUG_MAX = 40;

/** Ids reservados para rotas do próprio site — não podem virar slug de ninguém. */
export const RESERVED_LINK_SLUGS: readonly string[] = [
  'a',
  'o',
  'api',
  'app',
  'admin',
  'arena',
  'arenas',
  'blog',
  'contato',
  'ligas',
  'login',
  'nexago',
  'organizadores',
  'privacidade',
  'rankings',
  'sobre',
  'suporte',
  'termos',
  'torneios',
];

/** kebab-case sem acentos, adequado para uma URL pública. */
export function slugifyLinkPage(input: string): string {
  return input
    .normalize('NFD')
    // Remove marcas diacríticas (faixa combining U+0300 a U+036F).
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LINK_PAGE_SLUG_MAX)
    .replace(/-+$/g, '');
}

/** `null` quando o slug é válido; senão a mensagem a exibir. */
export function validateLinkPageSlug(slug: string): string | null {
  if (slug.length < LINK_PAGE_SLUG_MIN) {
    return `O endereço precisa de pelo menos ${LINK_PAGE_SLUG_MIN} caracteres.`;
  }
  if (slug.length > LINK_PAGE_SLUG_MAX) {
    return `O endereço pode ter no máximo ${LINK_PAGE_SLUG_MAX} caracteres.`;
  }
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    return 'Use apenas letras minúsculas, números e hífen.';
  }
  if (RESERVED_LINK_SLUGS.includes(slug)) {
    return 'Esse endereço é reservado. Escolha outro.';
  }
  return null;
}

export function linkPageIdFor(ownerType: LinkPageOwnerType, ownerId: string): string {
  return `${ownerType}_${ownerId}`;
}

/** Caminho público da página, sem host — o host varia por ambiente. */
export function linkPagePath(page: Pick<LinkPage, 'ownerType' | 'slug'>): string {
  return `/${page.ownerType === 'arena' ? 'a' : 'o'}/${page.slug}`;
}

/** Iniciais para o avatar quando não há foto (mesma regra do resto do painel). */
export function linkPageInitials(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Aceita o que o usuário digitar ("wa.me/…", "instagram.com/…") e devolve uma URL absoluta. */
export function normalizeLinkUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(mailto|tel):/i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

/** Versão curta para a tabela do painel — sem esquema nem barra final. */
export function displayLinkUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

export function validateLinkUrl(url: string): string | null {
  const normalized = normalizeLinkUrl(url);
  if (!normalized) return 'Informe o destino do link.';
  if (/^(mailto|tel):/i.test(normalized)) return null;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'Use um endereço http ou https.';
    }
    if (!parsed.hostname.includes('.')) return 'Endereço inválido.';
    return null;
  } catch {
    return 'Endereço inválido.';
  }
}

/** Ordena como a página pública mostra: destaque primeiro, depois `order`. */
export function sortPageLinks(links: readonly PageLink[]): PageLink[] {
  return [...links].sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return a.order - b.order;
  });
}

export function activePageLinks(links: readonly PageLink[]): PageLink[] {
  return sortPageLinks(links.filter((l) => l.active));
}

/** Variação percentual de visitas vs. os 30 dias anteriores; `null` sem base de comparação. */
export function viewsTrendPercent(page: Pick<LinkPage, 'views30d' | 'viewsPrev30d'>): number | null {
  if (page.viewsPrev30d <= 0) return null;
  return Math.round(((page.views30d - page.viewsPrev30d) / page.viewsPrev30d) * 100);
}

/** Link mais clicado nos últimos 30 dias, com a fatia que representa do total. */
export function topLinkOf(links: readonly PageLink[]): { link: PageLink; share: number } | null {
  const total = links.reduce((sum, l) => sum + l.clicks30d, 0);
  if (total <= 0) return null;
  const link = links.reduce((best, l) => (l.clicks30d > best.clicks30d ? l : best), links[0]!);
  if (link.clicks30d <= 0) return null;
  return { link, share: Math.round((link.clicks30d / total) * 100) };
}
