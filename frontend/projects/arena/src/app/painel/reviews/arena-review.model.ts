import { Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';

/** Espelha `nexago_app/.../athlete/domain/arena_review.dart` — schema de `arena_reviews`
 *  (coleção top-level, uma avaliação por reserva concluída). */

export interface ArenaReviewReply {
  message: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  repliedBy: string | null;
}

export interface ArenaReview {
  id: string;
  arenaId: string;
  userId: string;
  bookingId: string;
  rating: number;
  comment: string | null;
  createdAt: Date | null;
  likesCount: number;
  reported: boolean;
  reply: ArenaReviewReply | null;
}

function toDate(v: unknown): Date | null {
  return v instanceof Timestamp ? v.toDate() : null;
}

function replyFromMap(v: unknown): ArenaReviewReply | null {
  if (v == null || typeof v !== 'object') return null;
  const data = v as Record<string, unknown>;
  const message = typeof data['message'] === 'string' ? data['message'] : '';
  if (!message) return null;
  return {
    message,
    createdAt: toDate(data['createdAt']),
    updatedAt: toDate(data['updatedAt']),
    repliedBy: typeof data['repliedBy'] === 'string' ? data['repliedBy'] : null,
  };
}

export function arenaReviewFromDoc(doc: QueryDocumentSnapshot): ArenaReview {
  const d = doc.data() as Record<string, unknown>;
  const comment = typeof d['comment'] === 'string' ? d['comment'].trim() : '';
  return {
    id: doc.id,
    arenaId: typeof d['arenaId'] === 'string' ? d['arenaId'] : '',
    userId: typeof d['userId'] === 'string' ? d['userId'] : '',
    bookingId: typeof d['bookingId'] === 'string' ? d['bookingId'] : '',
    rating: typeof d['rating'] === 'number' ? d['rating'] : 0,
    comment: comment || null,
    createdAt: toDate(d['createdAt']),
    likesCount: typeof d['likesCount'] === 'number' ? d['likesCount'] : 0,
    reported: d['reported'] === true,
    reply: replyFromMap(d['reply']),
  };
}

export interface ArenaReviewReputationMetrics {
  totalReviews: number;
  averageRating: number;
  repliedReviews: number;
  repliedPercent: number;
  negativePendingCount: number;
}

/** Espelha `arenaReviewReputationMetricsProvider` (Flutter) — tudo derivado client-side da
 *  lista de reviews, sem depender do agregado `arena_reputation` (que é só leitura server-side). */
export function computeReviewMetrics(reviews: readonly ArenaReview[]): ArenaReviewReputationMetrics {
  const total = reviews.length;
  if (total === 0) {
    return { totalReviews: 0, averageRating: 0, repliedReviews: 0, repliedPercent: 0, negativePendingCount: 0 };
  }
  let replied = 0;
  let negativePending = 0;
  let ratingSum = 0;
  for (const r of reviews) {
    ratingSum += r.rating;
    const hasReply = r.reply != null;
    if (hasReply) replied++;
    if (r.rating <= 2 && !hasReply) negativePending++;
  }
  return {
    totalReviews: total,
    averageRating: ratingSum / total,
    repliedReviews: replied,
    repliedPercent: (replied / total) * 100,
    negativePendingCount: negativePending,
  };
}

export function formatRating(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatRelativeDate(date: Date | null): string {
  if (!date) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}
