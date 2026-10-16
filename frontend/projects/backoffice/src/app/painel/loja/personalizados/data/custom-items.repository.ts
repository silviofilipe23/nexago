import { Injectable } from '@angular/core';
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { backofficeDb, backofficeFunctions } from '../../../data/firebase';
import { customizationFromDoc, type CustomizationConfig } from '../../produtos/personalizacao/data/customization';
import { customItemFromDoc, type CustomItem, type NewImageReason, type RefundScope } from './custom-item';

export interface CustomQueueSnapshot {
  items: CustomItem[];
  /** Config de personalização por produto (o padrão quando o produto não tem doc). */
  configs: Map<string, CustomizationConfig>;
  blocklist: string[];
}

export type ReviewRequest =
  | { action: 'aprovar' | 'pronto' }
  | { action: 'nova_imagem'; reason: NewImageReason; note: string }
  | { action: 'reprovar'; refundScope: RefundScope };

/** Leitura direto do Firestore; escrita só pelas callables de `functions/src/store-custom.ts`. */
@Injectable({ providedIn: 'root' })
export class CustomItemsRepository {
  async load(): Promise<CustomQueueSnapshot> {
    const db = backofficeDb();
    const [itemSnap, blockSnap] = await Promise.all([
      getDocs(query(collection(db, 'storeCustomItems'), orderBy('createdAt', 'desc'))),
      getDoc(doc(db, 'storeConfig', 'blocklist')),
    ]);
    const items = itemSnap.docs.map((d) => customItemFromDoc(d.id, d.data()));
    const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))];
    // Em paralelo: são poucos produtos personalizáveis, um getDoc cada.
    const configSnaps = await Promise.all(productIds.map((id) => getDoc(doc(db, 'storeProductCustomization', id))));
    const configs = new Map(
      productIds.map((id, i) => [id, customizationFromDoc(configSnaps[i]!.exists() ? configSnaps[i]!.data() : undefined)]),
    );
    return {
      items,
      configs,
      blocklist: blockSnap.exists() && Array.isArray(blockSnap.data()['terms']) ? blockSnap.data()['terms'] : [],
    };
  }

  async review(item: CustomItem, request: ReviewRequest): Promise<{ status: string; version: number }> {
    const r = await httpsCallable<unknown, { status: string; version: number }>(backofficeFunctions(), 'reviewStoreCustomItem')({
      itemId: item.id,
      version: item.version,
      ...request,
    });
    return r.data;
  }

  async createBatch(): Promise<{ batchId: string; itemIds: string[] }> {
    const r = await httpsCallable<unknown, { batchId: string; rows: { itemId: string }[] }>(
      backofficeFunctions(),
      'createStoreCustomBatch',
    )({});
    return { batchId: r.data.batchId, itemIds: r.data.rows.map((row) => row.itemId) };
  }
}
