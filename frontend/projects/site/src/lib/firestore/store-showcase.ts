import { doc, getDoc, type DocumentData } from 'firebase/firestore/lite';
import { liteDb } from '../firebase-lite';

/**
 * Produto da vitrine da Loja (`storeShowcase/{id}`, leitura pública). O doc é um espelho escrito
 * pelo gatilho `store-showcase-sync` só enquanto o produto está à venda (ativo) — se sumiu, o
 * produto saiu da vitrine. O site não tem loja: usa só o resumo para o bloco "Produto" do blog.
 */
export interface ShowcaseProductSummary {
  id: string;
  name: string;
  coverUrl: string | null;
  minPriceCents: number;
  maxPriceCents: number;
  soldOut: boolean;
}

function cents(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/** Doc → resumo. null sem nome/preço, ou quando o produto não é vendido pelo app. */
export function mapShowcaseProduct(id: string, d: DocumentData): ShowcaseProductSummary | null {
  const name = typeof d['name'] === 'string' ? d['name'].trim() : '';
  const price = cents(d['priceCents']);
  const min = cents(d['minPriceCents']) || price;
  if (!name || !min) return null;
  // O botão do bloco leva ao app; produto só da web não teria onde ser comprado.
  if (d['channels']?.['app'] === false) return null;
  const cover = typeof d['coverUrl'] === 'string' && /^https:\/\//i.test(d['coverUrl']) ? d['coverUrl'] : null;
  return {
    id,
    name,
    coverUrl: cover,
    minPriceCents: min,
    maxPriceCents: Math.max(min, cents(d['maxPriceCents'])),
    soldOut: d['soldOut'] === true,
  };
}

/** Produto na vitrine, ou null se não existir / não estiver à venda / a leitura falhar. */
export async function getShowcaseProduct(id: string): Promise<ShowcaseProductSummary | null> {
  try {
    const snap = await getDoc(doc(liteDb, 'storeShowcase', id));
    return snap.exists() ? mapShowcaseProduct(snap.id, snap.data()) : null;
  } catch (err) {
    console.error('[store-showcase] getShowcaseProduct failed:', err);
    return null;
  }
}
