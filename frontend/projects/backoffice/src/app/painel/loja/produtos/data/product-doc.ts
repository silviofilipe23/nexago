import type { ProductCategory, ProductChannel, StoreProduct } from './products.repository';

/** O documento como a fatia A o grava em `storeProducts/{id}`. */
export interface StoreProductDoc {
  name: string;
  baseSku: string;
  /** Desnormalizado dos SKUs pela callable de variações: a busca da tela casa por aqui. */
  barcodes?: string[];
  category?: ProductCategory;
  collection?: string | null;
  skuCount?: number;
  priceCents?: number;
  compareAtPriceCents?: number | null;
  stockTotal?: number;
  lowStockThreshold?: number;
  soldLast30?: number;
  channels?: { app: boolean; web: boolean };
  status?: 'rascunho' | 'ativo' | 'arquivado';
  active?: boolean;
  photos?: { id: string; url: string }[];
}

/**
 * Documento → o que a tela consome.
 *
 * Tolerante a campo ausente de propósito: um documento gravado por uma versão
 * anterior não pode derrubar a listagem inteira. O mapeamento fica fora do
 * repositório para ter teste sem precisar fingir o SDK do Firestore.
 */
export function storeProductFromDoc(id: string, data: StoreProductDoc): StoreProduct {
  const channels: ProductChannel[] = [];
  if (data.channels?.web) {
    channels.push('web');
  }
  if (data.channels?.app) {
    channels.push('app');
  }

  return {
    id,
    name: data.name,
    sku: data.baseSku,
    barcodes: data.barcodes ?? [],
    category: data.category ?? 'acessorios',
    collections: data.collection ? [data.collection] : [],
    skuCount: data.skuCount ?? 0,
    priceCents: data.priceCents ?? 0,
    compareAtPriceCents: data.compareAtPriceCents ?? null,
    stock: data.stockTotal ?? 0,
    lowStockThreshold: data.lowStockThreshold ?? 0,
    soldLast30: data.soldLast30 ?? 0,
    channels,
    // `arquivado` não chega aqui: o repositório filtra, porque a tela não tem aba para ele.
    status: data.status === 'ativo' ? 'ativo' : 'rascunho',
    active: data.active ?? false,
    imageUrl: data.photos?.[0]?.url ?? null,
  };
}
