import type { ArenaListItem } from '@nexago/arena-discovery';
import type { TournamentRow } from '../../../torneios/data/tournaments.repository';
import { normalizeSearch } from './blog-list';
import { dayMonthLabel } from './blog-post';

/** Produto da vitrine pública (`storeShowcase/{id}`), só o que o bloco mostra no editor. */
export interface ShowcaseProduct {
  id: string;
  name: string;
  minPriceCents: number;
  maxPriceCents: number;
  coverUrl: string | null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const cents = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

/** Doc → produto; sem nome ou sem preço fica de fora (a vitrine também descarta). */
export function showcaseProductFromDoc(id: string, data: Record<string, unknown> | undefined): ShowcaseProduct | null {
  const name = str(data?.['name']);
  const price = cents(data?.['priceCents']);
  if (!data || !name || price === 0) {
    return null;
  }
  const min = cents(data['minPriceCents']) || price;
  const photos = Array.isArray(data['photos']) ? (data['photos'] as Array<Record<string, unknown> | null>) : [];
  return {
    id,
    name,
    minPriceCents: min,
    maxPriceCents: Math.max(cents(data['maxPriceCents']) || price, min),
    coverUrl: str(data['coverUrl']) || photos.map((p) => str(p?.['url'])).find(Boolean) || null,
  };
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** "R$ 89,90" ou "a partir de R$ 79,90" quando as variações têm preços diferentes. */
export function productPriceLabel(p: Pick<ShowcaseProduct, 'minPriceCents' | 'maxPriceCents'>): string {
  const min = BRL.format(p.minPriceCents / 100).replace(/ /g, ' ');
  return p.maxPriceCents > p.minPriceCents ? `a partir de ${min}` : min;
}

export function filterProducts(products: readonly ShowcaseProduct[], q: string): ShowcaseProduct[] {
  const needle = normalizeSearch(q);
  const rows = needle ? products.filter((p) => normalizeSearch(p.name).includes(needle)) : [...products];
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/**
 * Busca de torneio: o Firestore só faz prefixo exato de `name` (com caixa e acento), então junta o
 * resultado dele com os recentes que contêm o termo sem acento. Sem repetir, na ordem que chegou.
 */
export function mergeTournamentResults(
  prefixHits: readonly TournamentRow[],
  recent: readonly TournamentRow[],
  q: string,
): TournamentRow[] {
  const needle = normalizeSearch(q);
  const fromRecent = needle ? recent.filter((t) => normalizeSearch(t.name).includes(needle)) : [...recent];
  const seen = new Set<string>();
  return [...prefixHits, ...fromRecent].filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}

/** "Goiânia · 24 out" — o que der para dizer do torneio na linha de baixo. */
export function tournamentMeta(t: Pick<TournamentRow, 'place' | 'startAt'>, now: Date): string {
  return [t.place, t.startAt ? dayMonthLabel(t.startAt, now) : null].filter(Boolean).join(' · ') || 'Sem cidade nem data';
}

/** Arena no seletor e na prévia do bloco. */
export interface ArenaPick {
  id: string;
  name: string;
  /** "Goiânia, GO" (ou o endereço, quando não há cidade). */
  location: string;
  coverUrl: string | null;
  /** Pré-cadastro: não é parceira (sem quadra nem reserva pelo app). */
  unclaimed: boolean;
}

export function arenaPickOf(item: ArenaListItem): ArenaPick {
  return {
    id: item.id,
    name: item.name,
    location: item.locationLabel,
    coverUrl: item.coverUrl ?? item.logoUrl,
    unclaimed: item.isUnclaimed,
  };
}

/** Busca por nome ou cidade, sem acento; só parceiras (pré-cadastro não tem reserva). */
export function filterArenas(arenas: readonly ArenaPick[], q: string): ArenaPick[] {
  const tokens = normalizeSearch(q).split(/\s+/).filter(Boolean);
  return arenas
    .filter((a) => !a.unclaimed)
    .filter((a) => {
      const hay = normalizeSearch(`${a.name} ${a.location}`);
      return tokens.every((t) => hay.includes(t));
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
