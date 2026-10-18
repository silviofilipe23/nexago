import { InjectionToken } from '@angular/core';
import { collection, doc, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, where, type Firestore } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import { environment } from '../../environments/environment';
import { athleteFirestore } from './firestore';
import { athleteFunctions } from './functions';
import {
  addressToDoc,
  addressesFromDoc,
  cartLineKey,
  orderViewFromDoc,
  quoteFromData,
  type CheckoutQuote,
  type CheckoutRequest,
  type StoreAddress,
  type StoreOrderView,
} from './store-checkout-model';
import { cartItemsFromDoc, MAX_QTY_PER_ITEM } from './store-showcase-model';

export interface CreateOrderInput extends CheckoutRequest {
  expectedTotalCents: number;
  cpf: string | null;
}

export interface CreateOrderResult {
  orderId: string;
  number: string;
  totalCents: number;
  pix: { copyPaste: string; expiresAt: string };
}

/**
 * Checkout no servidor (callables) e o que é do atleta no Firestore: endereços, linhas do
 * carrinho e a visão dos pedidos. Interface para as telas serem testadas sem Firebase.
 */
export interface StoreCheckoutApi {
  quote(input: CheckoutRequest): Promise<CheckoutQuote>;
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  watchAddresses(uid: string, onChange: (items: StoreAddress[]) => void): () => void;
  saveAddresses(uid: string, items: StoreAddress[]): Promise<void>;
  /** Muda a quantidade de uma linha (0 remove), preservando as outras inteiras. */
  setCartLineQty(uid: string, key: string, qty: number): Promise<void>;
  watchOrders(uid: string, onChange: (orders: StoreOrderView[]) => void, onError: (e: unknown) => void): () => void;
  watchOrder(orderId: string, onChange: (order: StoreOrderView | null) => void, onError: (e: unknown) => void): () => void;
}

export function firebaseStoreCheckoutApi(functions: Functions, db: Firestore): StoreCheckoutApi {
  const quote = httpsCallable<CheckoutRequest, unknown>(functions, 'quoteStoreCheckout');
  const create = httpsCallable<CreateOrderInput, CreateOrderResult>(functions, 'createStoreOrder');
  return {
    quote: async (input) => {
      const q = quoteFromData((await quote(input)).data);
      if (!q) throw new Error('Resposta da cotação inválida.');
      return q;
    },
    createOrder: async (input) => (await create(input)).data,
    watchAddresses: (uid, onChange) =>
      onSnapshot(
        doc(db, 'storeAddresses', uid),
        (snap) => onChange(addressesFromDoc(snap.data())),
        () => onChange([]),
      ),
    saveAddresses: (uid, items) =>
      setDoc(doc(db, 'storeAddresses', uid), { items: items.map(addressToDoc), updatedAt: serverTimestamp() }),
    // Transação, igual ao "adicionar": outro aparelho pode ter mexido no carrinho. A lista vai
    // inteira e sem FieldValue dentro (a rule só aceita `items` + `updatedAt`).
    setCartLineQty: (uid, key, qty) => {
      const ref = doc(db, 'storeCarts', uid);
      return runTransaction(db, async (tx) => {
        const items = cartItemsFromDoc((await tx.get(ref)).data());
        const next = Math.max(0, Math.min(Math.round(qty), MAX_QTY_PER_ITEM));
        const updated = next === 0 ? items.filter((i) => cartLineKey(i) !== key) : items.map((i) => (cartLineKey(i) === key ? { ...i, qty: next } : i));
        tx.set(ref, { items: updated, updatedAt: serverTimestamp() });
      });
    },
    watchOrders: (uid, onChange, onError) =>
      onSnapshot(
        query(collection(db, 'storeOrderViews'), where('uid', '==', uid), orderBy('createdAt', 'desc')),
        (snap) => onChange(snap.docs.map((d) => orderViewFromDoc(d.id, d.data())).filter((o): o is StoreOrderView => o !== null)),
        onError,
      ),
    // Doc que ainda não existe (o gatilho espelha o pedido em ~1 s) chega como `null`, não erro:
    // a rule deixa o `get` de doc inexistente passar justamente pra este listener.
    watchOrder: (orderId, onChange, onError) =>
      onSnapshot(
        doc(db, 'storeOrderViews', orderId),
        (snap) => onChange(snap.exists() ? orderViewFromDoc(snap.id, snap.data()) : null),
        onError,
      ),
  };
}

/** `null` sem chave de Firebase (specs): a tela mostra o erro. */
export const STORE_CHECKOUT_API = new InjectionToken<StoreCheckoutApi | null>('STORE_CHECKOUT_API', {
  providedIn: 'root',
  factory: () => {
    const db = athleteFirestore();
    return environment.firebase.apiKey && db ? firebaseStoreCheckoutApi(athleteFunctions(), db) : null;
  },
});

export type CheckoutErrorKind = 'cpf' | 'changed' | 'blocked' | 'session' | 'unavailable' | 'other';

export interface CheckoutError {
  kind: CheckoutErrorKind;
  message: string;
  /** A cotação nova que o servidor mandou junto (total mudou, carrinho com problema, cupom). */
  quote: CheckoutQuote | null;
}

/** `HttpsError` do checkout → o que a tela faz (a mensagem já vem pronta em português). */
export function checkoutErrorOf(e: unknown): CheckoutError {
  const err = e as { code?: unknown; message?: unknown; details?: unknown } | null;
  const code = typeof err?.code === 'string' ? err.code.replace(/^functions\//, '') : '';
  const raw = typeof err?.message === 'string' ? err.message : '';
  const message = raw.replace(/^Firebase:\s*/i, '').replace(/\s*\(functions\/[^)]+\)\.?\s*$/i, '').trim();
  const details = (err?.details ?? null) as Record<string, unknown> | null;
  const quote = quoteFromData(details?.['quote']);
  switch (code) {
    case 'unauthenticated':
      return { kind: 'session', message: 'Sua sessão expirou. Entre de novo para continuar.', quote: null };
    // Callable ainda não deployada: o SDK devolve "not-found" cru.
    case 'not-found':
      return { kind: 'unavailable', message: 'O checkout ainda não está disponível. Tente de novo em instantes.', quote: null };
    case 'aborted':
      return { kind: 'changed', message: message || 'Os valores do carrinho mudaram. Confira o novo total.', quote };
    case 'failed-precondition':
      if (details?.['reason'] === 'cpf_required') return { kind: 'cpf', message: message || 'Informe seu CPF para pagar com Pix.', quote: null };
      return { kind: 'blocked', message: message || 'Revise o carrinho antes de pagar.', quote };
    case 'invalid-argument':
    case 'permission-denied':
    case 'resource-exhausted':
      return { kind: 'other', message: message || 'Não deu pra fechar o pedido. Tente de novo.', quote };
    default:
      return { kind: 'other', message: 'Não deu pra fechar o pedido. Tente de novo em instantes.', quote: null };
  }
}
