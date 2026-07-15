import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { arenaReviewFromDoc, type ArenaReview } from './arena-review.model';

/** Espelha `ReviewReplyService` (Flutter) — resposta do gestor a uma avaliação, escrita direta
 *  no client (transação) protegida pelas rules (`managerUserId` da arena da avaliação). */

const REVIEWS_LIMIT = 100;

export class ReviewRepositoryError extends Error {}

function reviewsCol(db: Firestore) {
  return collection(db, 'arena_reviews');
}

export function watchReviewsForArena(db: Firestore, arenaId: string, onChange: (reviews: ArenaReview[]) => void): Unsubscribe {
  return onSnapshot(
    query(reviewsCol(db), where('arenaId', '==', arenaId), limit(REVIEWS_LIMIT)),
    (snap) => {
      const list = snap.docs.map(arenaReviewFromDoc).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
      onChange(list);
    },
    () => onChange([]),
  );
}

function validateMessage(message: string): void {
  if (!message) throw new ReviewRepositoryError('A resposta não pode ser vazia.');
  if (message.length < 5) throw new ReviewRepositoryError('A resposta deve ter pelo menos 5 caracteres.');
  if (message.length > 300) throw new ReviewRepositoryError('A resposta deve ter no máximo 300 caracteres.');
}

export async function replyToReview(db: Firestore, reviewId: string, arenaId: string, managerUserId: string, message: string): Promise<void> {
  const msg = message.trim();
  validateMessage(msg);

  const reviewRef = doc(db, 'arena_reviews', reviewId);
  await runTransaction(db, async (tx) => {
    const reviewSnap = await tx.get(reviewRef);
    if (!reviewSnap.exists()) throw new ReviewRepositoryError('Avaliação não encontrada.');
    const data = reviewSnap.data() as Record<string, unknown>;
    const reviewArenaId = typeof data['arenaId'] === 'string' ? data['arenaId'].trim() : '';
    if (reviewArenaId !== arenaId) throw new ReviewRepositoryError('Esta avaliação não pertence à sua arena.');
    if (data['reply'] != null && typeof data['reply'] === 'object') {
      throw new ReviewRepositoryError('Esta avaliação já possui resposta.');
    }

    const arenaRef = doc(db, 'arenas', arenaId);
    const arenaSnap = await tx.get(arenaRef);
    const manager = typeof arenaSnap.data()?.['managerUserId'] === 'string' ? (arenaSnap.data()!['managerUserId'] as string).trim() : '';
    if (manager !== managerUserId) throw new ReviewRepositoryError('Apenas o gestor da arena pode responder.');

    tx.update(reviewRef, {
      reply: {
        message: msg,
        createdAt: serverTimestamp(),
        updatedAt: null,
        repliedBy: managerUserId,
      },
    });
  });
}

export async function updateReviewReply(db: Firestore, reviewId: string, arenaId: string, managerUserId: string, message: string): Promise<void> {
  const msg = message.trim();
  validateMessage(msg);

  const reviewRef = doc(db, 'arena_reviews', reviewId);
  await runTransaction(db, async (tx) => {
    const reviewSnap = await tx.get(reviewRef);
    if (!reviewSnap.exists()) throw new ReviewRepositoryError('Avaliação não encontrada.');
    const data = reviewSnap.data() as Record<string, unknown>;
    const reviewArenaId = typeof data['arenaId'] === 'string' ? data['arenaId'].trim() : '';
    if (reviewArenaId !== arenaId) throw new ReviewRepositoryError('Esta avaliação não pertence à sua arena.');
    if (data['reply'] == null || typeof data['reply'] !== 'object') {
      throw new ReviewRepositoryError('Esta avaliação ainda não possui resposta.');
    }

    const arenaRef = doc(db, 'arenas', arenaId);
    const arenaSnap = await tx.get(arenaRef);
    const manager = typeof arenaSnap.data()?.['managerUserId'] === 'string' ? (arenaSnap.data()!['managerUserId'] as string).trim() : '';
    if (manager !== managerUserId) throw new ReviewRepositoryError('Apenas o gestor da arena pode editar resposta.');

    tx.update(reviewRef, {
      'reply.message': msg,
      'reply.updatedAt': serverTimestamp(),
      'reply.repliedBy': managerUserId,
    });
  });
}
