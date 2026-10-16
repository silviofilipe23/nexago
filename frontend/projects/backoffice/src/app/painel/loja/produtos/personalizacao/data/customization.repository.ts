import { Injectable } from '@angular/core';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { backofficeDb, backofficeFunctions } from '../../../../data/firebase';
import { photoSides, type PhotoSides } from '../../data/photo-sides';
import { customizationFromDoc, type CustomizationConfig } from './customization';

export interface CustomizationSnapshot {
  productName: string;
  priceCents: number;
  /** Foto de cada lado da peça, o fundo da prévia. */
  sides: PhotoSides;
  config: CustomizationConfig;
  blocklist: string[];
}

/** Leitura direto do Firestore; escrita só pelas callables de `functions/src/store-custom.ts`. */
@Injectable({ providedIn: 'root' })
export class CustomizationRepository {
  /** `null` quando o produto não existe. */
  async load(productId: string): Promise<CustomizationSnapshot | null> {
    const db = backofficeDb();
    const [product, custom, blocklist] = await Promise.all([
      getDoc(doc(db, 'storeProducts', productId)),
      getDoc(doc(db, 'storeProductCustomization', productId)),
      getDoc(doc(db, 'storeConfig', 'blocklist')),
    ]);
    if (!product.exists()) {
      return null;
    }
    const p = product.data();
    return {
      productName: String(p['name'] ?? 'Produto'),
      priceCents: typeof p['priceCents'] === 'number' ? p['priceCents'] : 0,
      sides: photoSides(p['photos']),
      config: customizationFromDoc(custom.exists() ? custom.data() : undefined),
      blocklist: blocklist.exists() && Array.isArray(blocklist.data()['terms']) ? blocklist.data()['terms'] : [],
    };
  }

  async save(productId: string, config: CustomizationConfig): Promise<void> {
    await httpsCallable(backofficeFunctions(), 'saveStoreCustomization')({ productId, config });
  }

  async saveBlocklist(terms: string[]): Promise<number> {
    const r = await httpsCallable<{ terms: string[] }, { count: number }>(backofficeFunctions(), 'saveStoreBlocklist')({ terms });
    return r.data.count;
  }
}
