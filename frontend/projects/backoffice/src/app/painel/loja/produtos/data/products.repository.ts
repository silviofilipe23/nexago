import { Injectable } from '@angular/core';
import { STORE_PRODUCTS } from './products.mock';

export type ProductCategory = 'bolas' | 'vestuario' | 'acessorios' | 'rede-quadra' | 'kits';
export type ProductChannel = 'web' | 'app';

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  bolas: 'Bolas',
  vestuario: 'Vestuário',
  acessorios: 'Acessórios',
  'rede-quadra': 'Rede & quadra',
  kits: 'Kits',
};

export interface StoreProduct {
  id: string;
  name: string;
  sku: string;
  /** Códigos das variações, só para a busca ter o que casar. */
  barcodes: string[];
  category: ProductCategory;
  collections: string[];
  /** Quantidade de SKUs filhos. */
  variations: number;
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
 * Leitura dos produtos da loja.
 *
 * Fase de desenho: devolve os dados de exemplo. A assinatura é a mesma que a versão
 * com Firestore vai ter, então a troca não encosta na tela.
 */
@Injectable({ providedIn: 'root' })
export class ProductsRepository {
  list(): Promise<StoreProduct[]> {
    return Promise.resolve(STORE_PRODUCTS.map((p) => ({ ...p })));
  }
}
