import { PRODUCT_CATEGORY_LABELS, PRODUCT_COLLECTIONS } from '../../produtos/data/products.repository';

/** Espelha `functions/src/store-campaigns.ts` — mudar os dois. */
export const MAX_CAMPAIGNS = 12;
export const TITLE_MAX = 50;
export const SUBTITLE_MAX = 90;
export const KICKER_MAX = 40;
export const CTA_LABEL_MAX = 30;
/** A vitrine (web e app) mostra os 3 primeiros no ar, na ordem da lista. */
export const MAX_LIVE = 3;

/** Um banner de `storeConfig/campaigns.banners`, já como a callable grava. */
export interface CampaignBanner {
  id: string;
  kicker: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  primary: { label: string; collectionId: string };
  secondary: { label: string; categoryId: string | null; url: string | null } | null;
  /** Datas civis de São Paulo (YYYY-MM-DD), inclusivas; `null` = sem limite. */
  startDate: string | null;
  endDate: string | null;
  active: boolean;
}

export type CampaignStatus = 'no-ar' | 'fila' | 'agendada' | 'encerrada' | 'pausada';

type Raw = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function dateOrNull(v: unknown): string | null {
  const s = str(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function bannerFromRaw(raw: Raw): CampaignBanner | null {
  const id = str(raw['id']);
  if (!id) {
    return null;
  }
  const primary = (raw['primary'] ?? {}) as Raw;
  const sec = raw['secondary'] as Raw | null | undefined;
  return {
    id,
    kicker: str(raw['kicker']),
    title: str(raw['title']),
    subtitle: str(raw['subtitle']),
    imageUrl: str(raw['imageUrl']) || null,
    primary: { label: str(primary['label']), collectionId: str(primary['collectionId']) },
    secondary:
      sec && typeof sec === 'object'
        ? { label: str(sec['label']), categoryId: str(sec['categoryId']) || null, url: str(sec['url']) || null }
        : null,
    startDate: dateOrNull(raw['startDate']),
    endDate: dateOrNull(raw['endDate']),
    // Gravado pelo script antigo sem o campo: estava no ar.
    active: raw['active'] !== false,
  };
}

/** Doc ausente = nenhuma campanha, versão 0 (a callable compara a versão ao salvar). */
export function campaignsFromDoc(data: Raw | undefined): { banners: CampaignBanner[]; version: number } {
  const list = Array.isArray(data?.['banners']) ? (data!['banners'] as unknown[]) : [];
  const version = data?.['version'];
  return {
    banners: list
      .map((b) => (b && typeof b === 'object' ? bannerFromRaw(b as Raw) : null))
      .filter((b): b is CampaignBanner => b !== null),
    version: typeof version === 'number' && Number.isInteger(version) && version > 0 ? version : 0,
  };
}

function inWindow(b: CampaignBanner, today: string): boolean {
  return (b.startDate === null || b.startDate <= today) && (b.endDate === null || b.endDate >= today);
}

/**
 * Status de cada banner na ordem da lista, com a regra da vitrine (`liveBanners` no portal e no
 * app): ativo e dentro do período entra no ar até completar 3; o 4º em diante espera na fila.
 */
export function campaignStatuses(banners: readonly CampaignBanner[], today: string): CampaignStatus[] {
  let live = 0;
  return banners.map((b) => {
    if (!b.active) {
      return 'pausada';
    }
    if (b.endDate !== null && b.endDate < today) {
      return 'encerrada';
    }
    if (b.startDate !== null && b.startDate > today) {
      return 'agendada';
    }
    live += 1;
    return live <= MAX_LIVE ? 'no-ar' : 'fila';
  });
}

/** Os banners que a vitrine mostra hoje, na ordem. */
export function liveCampaigns(banners: readonly CampaignBanner[], today: string): CampaignBanner[] {
  return banners.filter((b) => b.active && inWindow(b, today)).slice(0, MAX_LIVE);
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function day(date: string): number {
  return Number(date.slice(8, 10));
}

function month(date: string): string {
  return MONTHS[Number(date.slice(5, 7)) - 1] ?? '';
}

/** "Sem prazo" · "Até 24 dez" · "A partir de 1 dez" · "27 nov" · "27–30 nov" · "20 out – 30 nov". */
export function periodLabel(b: Pick<CampaignBanner, 'startDate' | 'endDate'>): string {
  const { startDate: s, endDate: e } = b;
  if (s === null && e === null) {
    return 'Sem prazo';
  }
  if (s === null) {
    return `Até ${day(e!)} ${month(e!)}`;
  }
  if (e === null) {
    return `A partir de ${day(s)} ${month(s)}`;
  }
  if (s === e) {
    return `${day(s)} ${month(s)}`;
  }
  return s.slice(0, 7) === e.slice(0, 7)
    ? `${day(s)}–${day(e)} ${month(e)}`
    : `${day(s)} ${month(s)} – ${day(e)} ${month(e)}`;
}

export function collectionLabel(id: string): string {
  return PRODUCT_COLLECTIONS.find((c) => c.id === id)?.label ?? id;
}

export function categoryLabel(id: string): string {
  return (PRODUCT_CATEGORY_LABELS as Record<string, string>)[id] ?? id;
}

/** "Ver coleção → Verão 2026 · Kits pra arena → Kits". */
export function ctaSummary(b: CampaignBanner): string {
  const primary = `${b.primary.label} → ${collectionLabel(b.primary.collectionId)}`;
  const sec = b.secondary;
  if (!sec) {
    return primary;
  }
  const target = sec.categoryId ? categoryLabel(sec.categoryId) : (sec.url ?? '');
  return `${primary} · ${sec.label} → ${target}`;
}

/** Id legível pro analytics (`campanha_id`), a partir do título; nunca repete um da lista. */
export function campaignIdFrom(title: string, taken: ReadonlySet<string>): string {
  const base =
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/, '') || 'campanha';
  let id = base;
  for (let n = 2; taken.has(id); n++) {
    id = `${base}-${n}`;
  }
  return id;
}

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) {
    return next;
  }
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}
