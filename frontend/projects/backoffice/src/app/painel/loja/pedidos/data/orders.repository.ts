import { Injectable } from '@angular/core';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { backofficeDb, backofficeFunctions } from '../../../data/firebase';
import { orderFromDoc, type Order, type OrderAction } from './order';

type Raw = Record<string, any>;

/** Teto da lista: a Loja ainda é pequena; acima disto a tela avisa e a lista vira paginada no servidor. */
export const ORDERS_CAP = 2000;

/** Leitura direto do Firestore; status, estoque e reembolso só mudam pelas callables de pedidos. */
@Injectable({ providedIn: 'root' })
export class OrdersRepository {
  async list(): Promise<Order[]> {
    const snap = await getDocs(query(collection(backofficeDb(), 'storeOrders'), orderBy('createdAt', 'desc'), limit(ORDERS_CAP)));
    return snap.docs.map((d) => orderFromDoc(d.id, d.data() as Raw));
  }

  /** Pedidos criados a partir de `since` (Visão geral: período atual + anterior). */
  async since(since: Date): Promise<Order[]> {
    const snap = await getDocs(
      query(collection(backofficeDb(), 'storeOrders'), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(5000)),
    );
    return snap.docs.map((d) => orderFromDoc(d.id, d.data() as Raw));
  }

  async recent(n: number): Promise<Order[]> {
    const snap = await getDocs(query(collection(backofficeDb(), 'storeOrders'), orderBy('createdAt', 'desc'), limit(n)));
    return snap.docs.map((d) => orderFromDoc(d.id, d.data() as Raw));
  }

  async byStatus(status: Order['status']): Promise<Order[]> {
    const snap = await getDocs(query(collection(backofficeDb(), 'storeOrders'), where('status', '==', status)));
    return snap.docs.map((d) => orderFromDoc(d.id, d.data() as Raw));
  }

  /** Prazo de separação (`storeConfig/shipping.handlingHours`, padrão 24 h como em Retirada & frete). */
  async handlingHours(): Promise<number> {
    try {
      const snap = await getDoc(doc(backofficeDb(), 'storeConfig', 'shipping'));
      const h = (snap.data() as Raw | undefined)?.['handlingHours'];
      return typeof h === 'number' && h > 0 ? h : 24;
    } catch {
      return 24;
    }
  }

  async get(id: string): Promise<Order | null> {
    const snap = await getDoc(doc(backofficeDb(), 'storeOrders', id));
    return snap.exists() ? orderFromDoc(id, snap.data() as Raw) : null;
  }

  async many(ids: string[]): Promise<Order[]> {
    const found = await Promise.all(ids.map((id) => this.get(id)));
    return found.filter((o): o is Order => o !== null);
  }

  /** Badge "Pedidos" da sidebar: quantos esperam separação. */
  async toPickCount(): Promise<number> {
    const snap = await getDocs(query(collection(backofficeDb(), 'storeOrders'), where('status', '==', 'sep')));
    return snap.size;
  }

  async act(input: { orderId: string; version: number; action: OrderAction } & Raw): Promise<{ version: number; status: string; returnTransferId: string | null }> {
    const r = await httpsCallable<unknown, { version: number; status: string; returnTransferId: string | null }>(
      backofficeFunctions(),
      'storeOrderAction',
    )(input);
    return r.data;
  }

  async refund(input: Raw): Promise<{ version: number; amountCents: number }> {
    const r = await httpsCallable<unknown, { version: number; amountCents: number }>(backofficeFunctions(), 'refundStoreOrder')(input);
    return r.data;
  }

  async saveNote(orderId: string, text: string): Promise<void> {
    await httpsCallable(backofficeFunctions(), 'saveStoreOrderNote')({ orderId, text });
  }

  async resend(orderId: string, kind: 'pickup_code' | 'payment'): Promise<{ sent: number }> {
    const r = await httpsCallable<unknown, { sent: number }>(backofficeFunctions(), 'resendStoreOrderNotice')({ orderId, kind });
    return r.data;
  }
}
