/**
 * Loja · Favoritos (web 07): ordem, selo, ação do card, filtros e "Combina com".
 *
 * Regras em `docs/business-rules/loja-favoritos.md`, espelhadas no app — mudar aqui é mudar lá.
 * Tudo puro, para teste sem Firestore.
 */
import { formatCentsBRL } from './cashback-model';
import { hasCustomOptions } from './store-customize-model';
import {
  MAX_QTY_PER_ITEM,
  sortProducts,
  strikePriceCents,
  displayPriceCents,
  type StoreProduct,
  type StoreVariant,
} from './store-showcase-model';

/** O último favoritado primeiro; favorito fora do catálogo do canal fica de fora. */
export function orderedFavorites(favoriteIds: readonly string[], catalog: readonly StoreProduct[]): StoreProduct[] {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const out: StoreProduct[] = [];
  for (let i = favoriteIds.length - 1; i >= 0; i--) {
    const id = favoriteIds[i]!;
    const p = byId.get(id);
    if (p && !seen.has(id)) {
      seen.add(id);
      out.push(p);
    }
  }
  return out;
}

export type FavoriteBadgeKind = 'esgotado' | 'desconto' | 'ultimas';

export interface FavoriteBadge {
  kind: FavoriteBadgeKind;
  label: string;
}

/** Quanto o "de" está acima do preço (0 = sem desconto). */
export function favoriteDiscountCents(p: StoreProduct): number {
  const strike = strikePriceCents(p);
  return strike === null ? 0 : strike - displayPriceCents(p);
}

/** Unidades no fim: todos os SKUs com saldo em `lowStock`. `null` quando não é o caso. */
export function lastUnits(p: StoreProduct): number | null {
  const inStock = p.variants.filter((v) => v.inStock);
  if (inStock.length === 0 || !inStock.every((v) => v.lowStock)) return null;
  return inStock.reduce((n, v) => n + v.maxQty, 0);
}

/** "R$ 20" quando o valor é redondo, "R$ 20,50" quando tem centavos (selo e destaque). */
export function formatDropBRL(cents: number): string {
  return cents % 100 === 0 ? formatCentsBRL(cents).replace(/,00$/, '') : formatCentsBRL(cents);
}

/** Um selo só: esgotado > desconto > últimas unidades. */
export function favoriteBadge(p: StoreProduct): FavoriteBadge | null {
  if (p.soldOut) return { kind: 'esgotado', label: 'Esgotado' };
  const off = favoriteDiscountCents(p);
  if (off > 0) return { kind: 'desconto', label: `Baixou ${formatDropBRL(off)}` };
  const n = lastUnits(p);
  if (n !== null && n > 0) {
    return { kind: 'ultimas', label: n >= MAX_QTY_PER_ITEM ? 'Últimas unidades' : `Últimas ${n} unidades` };
  }
  return null;
}

/** SKU que dá para pôr no carrinho sem escolher nada: o único do produto, com saldo. */
export function directVariant(p: StoreProduct): StoreVariant | null {
  if (p.soldOut || p.variants.length !== 1) return null;
  const v = p.variants[0]!;
  return v.inStock ? v : null;
}

export type FavoriteAction = 'avise' | 'personalizar' | 'adicionar' | 'opcoes';

export function favoriteAction(p: StoreProduct): FavoriteAction {
  if (p.soldOut) return 'avise';
  if (hasCustomOptions(p.customization)) return 'personalizar';
  return directVariant(p) ? 'adicionar' : 'opcoes';
}

export const FAVORITE_ACTION_LABELS: Readonly<Record<FavoriteAction, string>> = {
  avise: 'Avise-me quando chegar',
  personalizar: 'Personalizar',
  adicionar: 'Adicionar',
  opcoes: 'Ver opções',
};

export type FavoritesFilter = 'todos' | 'desconto' | 'disponiveis';

export const FAVORITES_FILTERS: ReadonlyArray<{ id: FavoritesFilter; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'desconto', label: 'Com desconto' },
  { id: 'disponiveis', label: 'Disponíveis' },
];

export function matchesFavoritesFilter(p: StoreProduct, filter: FavoritesFilter): boolean {
  switch (filter) {
    case 'todos':
      return true;
    case 'desconto':
      return !p.soldOut && favoriteDiscountCents(p) > 0;
    case 'disponiveis':
      return !p.soldOut;
  }
}

/** Os que entram no "Adicionar disponíveis ao carrinho" e os que pedem escolha. */
export function bulkAddPlan(favorites: readonly StoreProduct[]): { add: StoreProduct[]; needChoice: number } {
  const add = favorites.filter((p) => !p.soldOut && directVariant(p) !== null);
  const needChoice = favorites.filter((p) => !p.soldOut && directVariant(p) === null).length;
  return { add, needChoice };
}

/** "3 itens no carrinho · 2 pedem cor ou tamanho na página do produto". */
export function bulkAddMessage(added: number, needChoice: number): { title: string; detail: string | undefined } {
  const title = added === 1 ? '1 item no carrinho' : `${added} itens no carrinho`;
  const detail =
    needChoice === 0
      ? undefined
      : needChoice === 1
        ? '1 pede cor ou tamanho na página do produto'
        : `${needChoice} pedem cor ou tamanho na página do produto`;
  return { title, detail };
}

/** Até `limit` à venda fora dos favoritos: categorias dos favoritos primeiro, mais vendidos antes. */
export function relatedToFavorites(
  favorites: readonly StoreProduct[],
  catalog: readonly StoreProduct[],
  limit = 6,
): StoreProduct[] {
  const favIds = new Set(favorites.map((p) => p.id));
  const cats = new Set(favorites.map((p) => p.category));
  const ranked = sortProducts(
    catalog.filter((p) => !favIds.has(p.id) && !p.soldOut),
    'mais-vendidos',
  );
  return [...ranked.filter((p) => cats.has(p.category)), ...ranked.filter((p) => !cats.has(p.category))].slice(0, limit);
}

/** O favorito com o maior desconto (destaque do app); `null` sem desconto. */
export function biggestDiscount(favorites: readonly StoreProduct[]): { product: StoreProduct; cents: number } | null {
  let best: { product: StoreProduct; cents: number } | null = null;
  for (const p of favorites) {
    if (p.soldOut) continue;
    const cents = favoriteDiscountCents(p);
    if (cents > 0 && (best === null || cents > best.cents)) best = { product: p, cents };
  }
  return best;
}
