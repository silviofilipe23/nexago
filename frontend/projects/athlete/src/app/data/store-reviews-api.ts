import { InjectionToken } from '@angular/core';
import { collection, limit, onSnapshot, orderBy, query, where, type Firestore } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import { ref, uploadBytesResumable, type FirebaseStorage } from 'firebase/storage';
import { environment } from '../../environments/environment';
import { prepareAvatarJpeg } from './athlete-avatar-upload';
import { athleteFirestore } from './firestore';
import { athleteFunctions } from './functions';
import { athleteStorage } from './storage';
import {
  PRODUCT_REVIEWS_LIMIT,
  REVIEW_UPLOAD_PREFIX,
  orderReviewFromDoc,
  publicReviewFromDoc,
  type OrderReview,
  type PublicReview,
  type SubmitReviewInput,
} from './store-reviews-model';

export interface SubmitReviewResult {
  ok: true;
  created: boolean;
  editableUntil: string;
}

/** Foto da avaliação: maior lado até 1600 px, em JPEG (o que o servidor aceita e a página carrega rápido). */
const PHOTO_MAX_SIDE = 1600;

/**
 * Avaliação da compra: o que o atleta avaliou (só dele), as avaliações públicas do produto, a
 * callable que publica e o upload das fotos. Interface para as telas serem testadas sem Firebase.
 */
export interface StoreReviewsApi {
  watchMyReviews(uid: string, onChange: (reviews: Map<string, OrderReview>) => void, onError: (e: unknown) => void): () => void;
  watchProductReviews(productId: string, onChange: (reviews: PublicReview[]) => void, onError: (e: unknown) => void): () => void;
  /** Reduz, sobe em `store/review-uploads/{uid}/` e resolve com o caminho. */
  uploadPhoto(uid: string, file: File): Promise<string>;
  submit(input: SubmitReviewInput): Promise<SubmitReviewResult>;
}

export function reviewUploadPath(uid: string, id: string = crypto.randomUUID()): string {
  return `${REVIEW_UPLOAD_PREFIX}/${uid}/${id}.jpg`;
}

export function firebaseStoreReviewsApi(functions: Functions, db: Firestore, storage: FirebaseStorage): StoreReviewsApi {
  const submit = httpsCallable<SubmitReviewInput, SubmitReviewResult>(functions, 'submitStoreOrderReview');
  return {
    watchMyReviews: (uid, onChange, onError) =>
      onSnapshot(
        query(collection(db, 'storeOrderReviews'), where('uid', '==', uid)),
        (snap) => {
          const map = new Map<string, OrderReview>();
          for (const d of snap.docs) {
            const r = orderReviewFromDoc(d.id, d.data());
            if (r) map.set(r.orderId, r);
          }
          onChange(map);
        },
        onError,
      ),
    watchProductReviews: (productId, onChange, onError) =>
      onSnapshot(
        query(collection(db, 'storeShowcase', productId, 'reviews'), orderBy('createdAt', 'desc'), limit(PRODUCT_REVIEWS_LIMIT)),
        (snap) => onChange(snap.docs.map((d) => publicReviewFromDoc(d.id, d.data())).filter((r): r is PublicReview => r !== null)),
        onError,
      ),
    uploadPhoto: async (uid, file) => {
      const blob = await prepareAvatarJpeg(file, PHOTO_MAX_SIDE);
      const path = reviewUploadPath(uid);
      await new Promise<void>((resolve, reject) => {
        uploadBytesResumable(ref(storage, path), blob, { contentType: 'image/jpeg' }).on('state_changed', null, reject, () => resolve());
      });
      return path;
    },
    submit: async (input) => (await submit(input)).data,
  };
}

/** `null` sem chave de Firebase (specs): a tela some com a seção / mostra o erro ao publicar. */
export const STORE_REVIEWS_API = new InjectionToken<StoreReviewsApi | null>('STORE_REVIEWS_API', {
  providedIn: 'root',
  factory: () => {
    const db = athleteFirestore();
    return environment.firebase.apiKey && db ? firebaseStoreReviewsApi(athleteFunctions(), db, athleteStorage()) : null;
  },
});
