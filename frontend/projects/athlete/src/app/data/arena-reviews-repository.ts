import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
  type Firestore,
} from 'firebase/firestore';

import { bookingEndIsUnknown, bookingIsReviewable } from './pending-arena-review';

/** Avaliação de arena por reserva concluída — espelha `ArenaReviewService` (Dart).
 *  Escreve em `arena_reviews`, coleção top-level: um doc por reserva. As rules já permitem
 *  o create do próprio atleta (firestore.rules:1464) e o XP cai por trigger, então nada de
 *  backend muda por causa do portal. */

const ARENA_REVIEWS = 'arena_reviews';
const ARENA_BOOKINGS = 'arenaBookings';

export const REVIEW_NOT_COMPLETED_MESSAGE = 'Avaliação permitida apenas após a reserva concluída.';
export const REVIEW_CANCELED_MESSAGE = 'Avaliação não permitida para reserva cancelada.';
export const REVIEW_ALREADY_SENT_MESSAGE = 'Esta reserva já foi avaliada.';

/** Erro cuja `message` já está pronta pra tela. Qualquer outro erro (rede, rules) vira
 *  mensagem genérica no diálogo — não vaza texto técnico em inglês pro atleta. */
export class ArenaReviewError extends Error {}

export interface SubmitArenaReviewInput {
  arenaId: string;
  bookingId: string;
  userId: string;
  rating: number;
  comment: string | null;
}

function readString(data: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const raw = data[key];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return '';
}

/** Regras de "pode avaliar" contra o doc bruto da reserva, sem I/O — testável isolada, no
 *  mesmo padrão de `bookingFromSnapshot`. Devolve a mensagem de erro ou null. */
export function validateBookingForReview(
  input: { arenaId: string; userId: string },
  bookingData: Record<string, unknown>,
  now: Date,
): string | null {
  const bookingArenaId = readString(bookingData, ['arenaId', 'arena_id', 'idArena']);
  const bookingUserId = readString(bookingData, ['athleteId', 'bookingAthleteId', 'userId', 'user_id']);
  if (bookingArenaId && bookingArenaId !== input.arenaId) return REVIEW_NOT_COMPLETED_MESSAGE;
  if (bookingUserId && bookingUserId !== input.userId) return REVIEW_NOT_COMPLETED_MESSAGE;

  const status = readString(bookingData, ['status']).toLowerCase();
  if (status === 'canceled' || status === 'cancelled') return REVIEW_CANCELED_MESSAGE;

  const fields = {
    status,
    dateKey: readString(bookingData, ['date', 'bookingDate', 'data']).slice(0, 10),
    startTime: readString(bookingData, ['startTime', 'start', 'horaInicio']).slice(0, 5),
    endTime: readString(bookingData, ['endTime', 'end', 'horaFim']).slice(0, 5),
  };

  // Doc sem data utilizável passa: a checagem anterior já decidiu que a reserva acabou, e
  // travar aqui bloquearia avaliação legítima de reserva com doc malformado. Mesma escolha
  // do Dart (`isCompleted = ... || endAt == null`).
  if (!bookingIsReviewable(fields, now) && !bookingEndIsUnknown(fields)) return REVIEW_NOT_COMPLETED_MESSAGE;
  return null;
}

export async function submitArenaReview(
  db: Firestore,
  input: SubmitArenaReviewInput,
  now = new Date(),
): Promise<void> {
  const arenaId = input.arenaId.trim();
  const bookingId = input.bookingId.trim();
  const userId = input.userId.trim();

  if (!arenaId || !bookingId || !userId) throw new ArenaReviewError('Dados inválidos para avaliação.');
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new ArenaReviewError('A nota deve estar entre 1 e 5.');
  }

  const existing = await getDocs(
    query(collection(db, ARENA_REVIEWS), where('bookingId', '==', bookingId), limit(1)),
  );
  if (!existing.empty) throw new ArenaReviewError(REVIEW_ALREADY_SENT_MESSAGE);

  const bookingSnap = await getDoc(doc(db, ARENA_BOOKINGS, bookingId));
  if (!bookingSnap.exists()) throw new ArenaReviewError('Reserva não encontrada para avaliação.');

  const problem = validateBookingForReview(
    { arenaId, userId },
    bookingSnap.data() as Record<string, unknown>,
    now,
  );
  if (problem) throw new ArenaReviewError(problem);

  const comment = input.comment?.trim() ?? '';
  await addDoc(collection(db, ARENA_REVIEWS), {
    arenaId,
    userId,
    bookingId,
    rating: input.rating,
    comment: comment.length > 0 ? comment : null,
    likesCount: 0,
    reported: false,
    createdAt: serverTimestamp(),
  });
}

/** Quais das reservas informadas já foram avaliadas por este atleta. Blocos de 10 por causa
 *  do limite do `in` — mesma query que o app já roda em produção, sem índice novo. */
export async function fetchReviewedBookingIds(
  db: Firestore,
  userId: string,
  bookingIds: readonly string[],
): Promise<Set<string>> {
  const uid = userId.trim();
  const ids = [...new Set(bookingIds.map((id) => id.trim()).filter((id) => id.length > 0))];
  const reviewed = new Set<string>();
  if (!uid || ids.length === 0) return reviewed;

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

  const snapshots = await Promise.all(
    chunks.map((chunk) =>
      getDocs(query(collection(db, ARENA_REVIEWS), where('userId', '==', uid), where('bookingId', 'in', chunk))),
    ),
  );

  for (const snap of snapshots) {
    for (const d of snap.docs) {
      const bid = d.get('bookingId');
      if (typeof bid === 'string' && bid.trim()) reviewed.add(bid.trim());
    }
  }
  return reviewed;
}
