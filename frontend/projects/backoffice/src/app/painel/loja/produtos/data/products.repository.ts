import { Injectable } from '@angular/core';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { backofficeDb } from '../../../data/firebase';
import { storeProductFromDoc, type StoreProductDoc } from './product-doc';

export type ProductCategory = 'bolas' | 'vestuario' | 'acessorios' | 'rede-quadra' | 'kits';
export type ProductChannel = 'web' | 'app';

/** Ordem e rótulos espelhados em `STORE_CATEGORIES` (functions/src/store-showcase.ts), que a
 *  vitrine do atleta lê — mudar os dois. */
export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  bolas: 'Bolas',
  vestuario: 'Vestuário',
  acessorios: 'Acessórios',
  'rede-quadra': 'Rede & quadra',
  kits: 'Kits',
};

/** Coleções do catálogo. Fica junto das categorias para a validação da URL ter uma fonte só.
 *  Espelhadas em `STORE_COLLECTIONS` (functions/src/store-showcase.ts) — mudar os dois. */
export const PRODUCT_COLLECTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'verao-2026', label: 'Verão 2026' },
  { id: 'linha-pro', label: 'Linha Pro' },
];

export interface StoreProduct {
  id: string;
  name: string;
  sku: string;
  /** Códigos das variações, só para a busca ter o que casar. */
  barcodes: string[];
  category: ProductCategory;
  collections: string[];
  /** Quantidade de SKUs filhos (campo `skuCount` do documento). */
  skuCount: number;
  priceCents: number;
  /** Preço antigo, riscado na tela. */
  compareAtPriceCents: number | null;
  stock: number;
  lowStockThreshold: number;
  soldLast30: number;
  channels: ProductChannel[];
  /** `rascunho` nunca foi ao ar; `active` é o toggle de um publicado. */
  status: 'ativo' | 'rascunho';
  active: boolean;
  imageUrl: string | null;
}

/**
 * Leitura dos produtos da loja, direto do Firestore — o padrão do painel
 * (`arenas.repository`, `tournaments.repository`). Escrita é só por callable.
 */
@Injectable({ providedIn: 'root' })
export class ProductsRepository {
  async list(): Promise<StoreProduct[]> {
    const products = collection(backofficeDb(), 'storeProducts');
    const snap = await getDocs(query(products, orderBy('name')));
    // Arquivado some da lista: a tela não tem aba para ele. Filtrado aqui, e não na
    // consulta, porque `where` + `orderBy` em campos diferentes exigiria índice composto.
    return snap.docs
      .map((d) => ({ id: d.id, data: d.data() as StoreProductDoc }))
      .filter((d) => d.data.status !== 'arquivado')
      .map((d) => storeProductFromDoc(d.id, d.data));
  }
}
