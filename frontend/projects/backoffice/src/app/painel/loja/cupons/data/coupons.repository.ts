import { Injectable, inject } from '@angular/core';
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { backofficeDb, backofficeFunctions } from '../../../data/firebase';
import { TournamentsRepository } from '../../../torneios/data/tournaments.repository';
import { PRODUCT_CATEGORY_LABELS, PRODUCT_COLLECTIONS, ProductsRepository } from '../../produtos/data/products.repository';
import { couponFromDoc, discountsFromDoc, type AutoDiscount, type AutoDiscountId, type Coupon, type ScopeType } from './coupon';
import type { CouponPayload } from './coupon-form';

export interface ScopeOption {
  id: string;
  label: string;
}

/**
 * Leitura direto do Firestore; escrita só pelas callables de `functions/src/store-coupons.ts`
 * — as rules negam escrita de cliente.
 */
@Injectable({ providedIn: 'root' })
export class CouponsRepository {
  private readonly products = inject(ProductsRepository);
  private readonly tournaments = inject(TournamentsRepository);

  async load(): Promise<{ coupons: Coupon[]; discounts: AutoDiscount[] }> {
    const db = backofficeDb();
    const [couponSnap, discountSnap] = await Promise.all([
      getDocs(query(collection(db, 'storeCoupons'), orderBy('createdAt', 'desc'))),
      getDoc(doc(db, 'storeConfig', 'discounts')),
    ]);
    return {
      coupons: couponSnap.docs.map((d) => couponFromDoc(d.id, d.data())),
      discounts: discountsFromDoc(discountSnap.exists() ? discountSnap.data() : undefined),
    };
  }

  /** Alvos do segundo select de "Vale para". */
  async scopeOptions(type: ScopeType): Promise<ScopeOption[]> {
    switch (type) {
      case 'store':
        return [];
      case 'category':
        return Object.entries(PRODUCT_CATEGORY_LABELS).map(([id, label]) => ({ id, label }));
      case 'collection':
        return PRODUCT_COLLECTIONS.map((c) => ({ id: c.id, label: c.label }));
      case 'products':
        return (await this.products.list()).map((p) => ({ id: p.id, label: p.name }));
      case 'tournament':
        // Os mais recentes por data de início: é onde um cupom de inscritos faz sentido.
        return (await this.tournaments.listTournaments('', null)).rows.map((t) => ({ id: t.id, label: t.name }));
      case 'arena': {
        const snap = await getDocs(collection(backofficeDb(), 'storePickupPoints'));
        return snap.docs
          .map((d) => ({ id: d.id, label: String(d.data()['name'] ?? d.id) }))
          .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
      }
    }
  }

  async save(payload: CouponPayload): Promise<string> {
    const r = await httpsCallable<CouponPayload, { couponId: string }>(backofficeFunctions(), 'saveStoreCoupon')(payload);
    return r.data.couponId;
  }

  async setPaused(couponId: string, paused: boolean): Promise<void> {
    await httpsCallable(backofficeFunctions(), 'setStoreCouponPaused')({ couponId, paused });
  }

  async end(couponId: string): Promise<void> {
    await httpsCallable(backofficeFunctions(), 'endStoreCoupon')({ couponId });
  }

  async setAutoDiscountActive(id: AutoDiscountId, active: boolean): Promise<void> {
    await httpsCallable(backofficeFunctions(), 'setStoreAutoDiscountActive')({ id, active });
  }
}
