/** Espelha `functions/src/home-banners.ts` — mudar os dois. */
export const MAX_HOME_BANNERS = 20;
export const TITLE_MAX = 22;
export const DESCRIPTION_MAX = 60;
export const CTA_MAX = 16;
/** A partir daqui o carrossel perde clique: a tela avisa (não barra). */
export const CROWDED_CAROUSEL = 5;

export type HomeBannerFormat = 'carousel' | 'compact';

/** Telas do app que o botão abre. O app mapeia cada chave para a rota (`home_banner_destination.dart`). */
export const DESTINATIONS = [
  { id: 'reservar', label: 'Reservar quadra' },
  { id: 'bora-jogar', label: 'Bora Jogar' },
  { id: 'peladas', label: 'Peladas' },
  { id: 'torneios', label: 'Torneios' },
  { id: 'ranking', label: 'Ranking' },
  { id: 'duplas', label: 'Duplas' },
  { id: 'treinos', label: 'Treinos' },
  { id: 'aulas', label: 'Aulas e professores' },
  { id: 'loja', label: 'Loja' },
  { id: 'indicar', label: 'Indique amigos' },
  { id: 'missoes', label: 'Missões' },
  { id: 'minhas-reservas', label: 'Minhas reservas' },
  { id: 'creditos-chuva', label: 'Créditos de chuva' },
  { id: 'url', label: 'Link externo' },
] as const;
export type HomeBannerDestination = (typeof DESTINATIONS)[number]['id'];

/** Quem vê. O app decide com o que já carrega na Home (conta, reservas, inscrições). */
export const AUDIENCES = [
  { id: 'all', label: 'Todos os atletas' },
  { id: 'new', label: 'Novos · até 30 dias' },
  { id: 'no-booking', label: 'Nunca reservou quadra' },
  { id: 'booked', label: 'Já reservou quadra' },
  { id: 'no-tournament', label: 'Nunca se inscreveu em torneio' },
] as const;
export type HomeBannerAudience = (typeof AUDIENCES)[number]['id'];

/** Um banner de `appAdminConfig/homeBanners.banners`, já como a callable grava. */
export interface HomeBanner {
  id: string;
  format: HomeBannerFormat;
  title: string;
  description: string;
  /** Texto do botão; o compacto não tem botão (a linha inteira é o toque). */
  ctaLabel: string;
  imageUrl: string | null;
  destination: HomeBannerDestination;
  /** Só com destino `url`. */
  url: string | null;
  audience: HomeBannerAudience;
  /** Datas civis de São Paulo (YYYY-MM-DD), inclusivas; `null` = sem limite. */
  startDate: string | null;
  endDate: string | null;
  hideAfterClick: boolean;
  dismissible: boolean;
  /** `false` = rascunho. */
  published: boolean;
  /** `false` = pausado (só faz sentido publicado). */
  active: boolean;
}

/** Contagem de atletas (cada um conta uma vez): viu, tocou no botão, dispensou no X. */
export interface HomeBannerStats {
  seen: number;
  clicked: number;
  dismissed: number;
}

export const NO_STATS: HomeBannerStats = { seen: 0, clicked: 0, dismissed: 0 };

export type HomeBannerStatus = 'no-ar' | 'agendado' | 'pausado' | 'rascunho' | 'encerrado';

type Raw = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function dateOrNull(v: unknown): string | null {
  const s = str(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function oneOf<T extends string>(list: ReadonlyArray<{ id: T }>, v: unknown, fallback: T): T {
  return list.some((o) => o.id === v) ? (v as T) : fallback;
}

function bannerFromRaw(raw: Raw): HomeBanner | null {
  const id = str(raw['id']);
  if (!id) {
    return null;
  }
  return {
    id,
    format: raw['format'] === 'compact' ? 'compact' : 'carousel',
    title: str(raw['title']),
    description: str(raw['description']),
    ctaLabel: str(raw['ctaLabel']),
    imageUrl: str(raw['imageUrl']) || null,
    destination: oneOf(DESTINATIONS, raw['destination'], 'reservar'),
    url: str(raw['url']) || null,
    audience: oneOf(AUDIENCES, raw['audience'], 'all'),
    startDate: dateOrNull(raw['startDate']),
    endDate: dateOrNull(raw['endDate']),
    hideAfterClick: raw['hideAfterClick'] === true,
    dismissible: raw['dismissible'] !== false,
    published: raw['published'] === true,
    active: raw['active'] !== false,
  };
}

/** Doc ausente = nenhum banner, versão 0 (a callable compara a versão ao salvar). */
export function homeBannersFromDoc(data: Raw | undefined): { banners: HomeBanner[]; version: number } {
  const list = Array.isArray(data?.['banners']) ? (data!['banners'] as unknown[]) : [];
  const version = data?.['version'];
  return {
    banners: list
      .map((b) => (b && typeof b === 'object' ? bannerFromRaw(b as Raw) : null))
      .filter((b): b is HomeBanner => b !== null),
    version: typeof version === 'number' && Number.isInteger(version) && version > 0 ? version : 0,
  };
}

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

export function statsFromDoc(data: Raw | undefined): HomeBannerStats {
  return { seen: count(data?.['seen']), clicked: count(data?.['clicked']), dismissed: count(data?.['dismissed']) };
}

/** Rascunho ganha de tudo; depois encerrado, pausado e agendado. */
export function homeBannerStatus(b: HomeBanner, today: string): HomeBannerStatus {
  if (!b.published) {
    return 'rascunho';
  }
  if (b.endDate !== null && b.endDate < today) {
    return 'encerrado';
  }
  if (!b.active) {
    return 'pausado';
  }
  return b.startDate !== null && b.startDate > today ? 'agendado' : 'no-ar';
}

/** Os que estão no app hoje, na ordem (antes do filtro de público de cada atleta). */
export function liveHomeBanners(banners: readonly HomeBanner[], today: string): HomeBanner[] {
  return banners.filter((b) => homeBannerStatus(b, today) === 'no-ar');
}

/**
 * O que a Home mostra para quem está em todos os públicos: o carrossel com os do formato
 * carrossel; sem nenhum, o primeiro compacto. Mesma regra de `homeBannerSlot` no app.
 */
export function homeSlot(live: readonly HomeBanner[]): { format: HomeBannerFormat; banners: HomeBanner[] } | null {
  const carousel = live.filter((b) => b.format === 'carousel');
  if (carousel.length > 0) {
    return { format: 'carousel', banners: carousel };
  }
  const compact = live.find((b) => b.format === 'compact');
  return compact ? { format: 'compact', banners: [compact] } : null;
}

function dayMonth(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** Período curto da lista: "20/10 → 20/11" · "01/11 → sem fim" · "até 30/11" · "Sem prazo". */
export function shortPeriod(b: Pick<HomeBanner, 'startDate' | 'endDate'>): string {
  const { startDate: s, endDate: e } = b;
  if (s === null && e === null) {
    return 'Sem prazo';
  }
  if (s === null) {
    return `até ${dayMonth(e!)}`;
  }
  return `${dayMonth(s)} → ${e === null ? 'sem fim' : dayMonth(e)}`;
}

export function destinationLabel(id: HomeBannerDestination): string {
  return DESTINATIONS.find((d) => d.id === id)?.label ?? id;
}

export function audienceLabel(id: HomeBannerAudience): string {
  return AUDIENCES.find((a) => a.id === id)?.label ?? id;
}

/** "4,2%" com vírgula; sem quem viu, "—". */
export function pct(part: number, total: number): string {
  return total > 0 ? `${((part / total) * 100).toFixed(1).replace('.', ',')}%` : '—';
}

export function num(n: number): string {
  return n.toLocaleString('pt-BR');
}

/** Id estável (doc das marcas do atleta e dos contadores), do título; nunca repete um da lista. */
export function homeBannerIdFrom(title: string, taken: ReadonlySet<string>): string {
  const base =
    title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/, '') || 'novidade';
  let id = base;
  for (let n = 2; taken.has(id); n++) {
    id = `${base}-${n}`;
  }
  return id;
}
