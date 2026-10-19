import { Injectable } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { backofficeDb, backofficeFunctions } from '../../../data/firebase';
import { rowsFromDoc, type ReviewRow } from './reviews';

/** Pedidos avaliados por página (cada um vira 1+ linhas). */
export const REVIEWS_PAGE = 100;

export interface ReviewsPage {
  rows: ReviewRow[];
  /** Último doc lido; `null` = não há mais. */
  cursor: QueryDocumentSnapshot | null;
}

export interface ModerationInput {
  orderId: string;
  productId: string;
  hidden: boolean;
  reason?: string;
}

/** Leitura direto do Firestore (rule: admin lê); esconder/reexibir só pela callable. */
@Injectable({ providedIn: 'root' })
export class ReviewsRepository {
  async list(after: QueryDocumentSnapshot | null = null): Promise<ReviewsPage> {
    const base = collection(backofficeDb(), 'storeOrderReviews');
    const q = after
      ? query(base, orderBy('updatedAt', 'desc'), startAfter(after), limit(REVIEWS_PAGE))
      : query(base, orderBy('updatedAt', 'desc'), limit(REVIEWS_PAGE));
    const snap = await getDocs(q);
    return {
      rows: snap.docs.flatMap((d) => rowsFromDoc(d.id, d.data())),
      cursor: snap.docs.length === REVIEWS_PAGE ? snap.docs[snap.docs.length - 1] : null,
    };
  }

  /** As linhas de um pedido, relidas depois de moderar. */
  async order(orderId: string): Promise<ReviewRow[]> {
    const snap = await getDoc(doc(backofficeDb(), 'storeOrderReviews', orderId));
    return snap.exists() ? rowsFromDoc(snap.id, snap.data()) : [];
  }

  async moderate(input: ModerationInput): Promise<{ hidden: boolean; changed: boolean }> {
    const fn = httpsCallable<ModerationInput, { hidden: boolean; changed: boolean }>(backofficeFunctions(), 'moderateStoreReview');
    return (await fn(input)).data;
  }
}
