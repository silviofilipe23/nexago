import { InjectionToken } from '@angular/core';
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { athleteFirestore } from './firestore';
import {
  cartItemsFromDoc,
  storeConfigFromDoc,
  storeProductFromDoc,
  type StoreCartItem,
  type StoreProduct,
  type StoreShowcaseConfig,
} from './store-showcase-model';

export interface StoreShopper {
  favoriteIds: string[];
  pickupArenaId: string | null;
  recentSearches: string[];
}

export const EMPTY_SHOPPER: StoreShopper = { favoriteIds: [], pickupArenaId: null, recentSearches: [] };

/** Teto das buscas recentes — o mesmo da rule de `storeShoppers`. */
export const MAX_RECENT_SEARCHES = 5;

/** [termo, ...anteriores sem ele], cortado no teto. Igualdade ignora caixa. */
export function withRecentSearch(current: readonly string[], term: string): string[] {
  const t = term.trim();
  if (!t) return [...current];
  return [t, ...current.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENT_SEARCHES);
}

/**
 * Leitura da vitrine (espelho público, `storeShowcase` + `storePublic/showcase`) e as
 * preferências do atleta (`storeShoppers/{uid}`, `storeCarts/{uid}`). Interface para o store
 * ser testado sem Firestore — listener real no Karma trava a suíte.
 */
export interface StoreShowcaseSource {
  watchProducts(onChange: (products: StoreProduct[], fromCache: boolean) => void, onError: (e: unknown) => void): () => void;
  watchConfig(onChange: (config: StoreShowcaseConfig) => void, onError: (e: unknown) => void): () => void;
  watchShopper(uid: string, onChange: (shopper: StoreShopper) => void): () => void;
  watchCart(uid: string, onChange: (items: StoreCartItem[]) => void): () => void;
  setFavorite(uid: string, productId: string, on: boolean): Promise<void>;
  saveRecentSearches(uid: string, searches: string[]): Promise<void>;
}

export function firestoreStoreShowcaseSource(db: Firestore): StoreShowcaseSource {
  return {
    watchProducts: (onChange, onError) =>
      onSnapshot(
        query(collection(db, 'storeShowcase'), where('channels.web', '==', true)),
        (snap) =>
          onChange(
            snap.docs.map((d) => storeProductFromDoc(d.id, d.data())).filter((p): p is StoreProduct => p !== null),
            snap.metadata.fromCache,
          ),
        onError,
      ),
    watchConfig: (onChange, onError) =>
      onSnapshot(
        doc(db, 'storePublic', 'showcase'),
        (snap) => onChange(storeConfigFromDoc(snap.exists() ? snap.data() : undefined)),
        onError,
      ),
    watchShopper: (uid, onChange) =>
      onSnapshot(
        doc(db, 'storeShoppers', uid),
        (snap) => {
          const data = snap.data();
          onChange({
            favoriteIds: Array.isArray(data?.['favoriteIds']) ? (data['favoriteIds'] as unknown[]).filter((x): x is string => typeof x === 'string') : [],
            pickupArenaId: typeof data?.['pickupArenaId'] === 'string' ? data['pickupArenaId'] : null,
            recentSearches: Array.isArray(data?.['recentSearches'])
              ? (data['recentSearches'] as unknown[]).filter((x): x is string => typeof x === 'string')
              : [],
          });
        },
        // Sem as preferências a vitrine segue de pé: só sem coração aceso e sem recentes.
        () => onChange(EMPTY_SHOPPER),
      ),
    watchCart: (uid, onChange) =>
      onSnapshot(
        doc(db, 'storeCarts', uid),
        (snap) => onChange(cartItemsFromDoc(snap.data())),
        () => onChange([]),
      ),
    setFavorite: (uid, productId, on) =>
      setDoc(
        doc(db, 'storeShoppers', uid),
        { favoriteIds: on ? arrayUnion(productId) : arrayRemove(productId), updatedAt: serverTimestamp() },
        { merge: true },
      ),
    saveRecentSearches: (uid, searches) =>
      setDoc(doc(db, 'storeShoppers', uid), { recentSearches: searches, updatedAt: serverTimestamp() }, { merge: true }),
  };
}

/** `null` sem chave de Firebase (specs com `apiKey` em branco): a vitrine mostra o erro. */
export const STORE_SHOWCASE_SOURCE = new InjectionToken<StoreShowcaseSource | null>('STORE_SHOWCASE_SOURCE', {
  providedIn: 'root',
  factory: () => {
    const db = athleteFirestore();
    return db ? firestoreStoreShowcaseSource(db) : null;
  },
});

/** `appConfig/store.enabled`: liga as ENTRADAS da Loja (sidebar, atalho). Falha = desligado. */
export async function fetchStoreEnabled(db: Firestore): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'appConfig', 'store'));
    return snap.exists() && snap.data()['enabled'] === true;
  } catch {
    return false;
  }
}
