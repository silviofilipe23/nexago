import {
  Timestamp,
  collection,
  deleteField,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { arenaBookingFromDoc, type ArenaBooking } from './arena-booking.model';

/** Espelha `BookingService` (Flutter) para as ações do painel do gestor sobre `arenaBookings`
 *  (coleção top-level). Sem Cloud Function: escrita direta protegida pelas rules
 *  (`managerUserId == request.auth.uid` na arena da reserva). */

const ARENA_BOOKINGS_LIMIT = 256;
const UNDO_WINDOW_MS = 60_000;
const CHECK_IN_WINDOW_BEFORE_MS = 20 * 60_000;
const CHECK_IN_WINDOW_AFTER_MS = 15 * 60_000;

export class BookingRepositoryError extends Error {}

function bookingsCol(db: Firestore) {
  return collection(db, 'arenaBookings');
}

export function watchBookingsForArena(db: Firestore, arenaId: string, onChange: (bookings: ArenaBooking[]) => void): Unsubscribe {
  return onSnapshot(
    query(bookingsCol(db), where('arenaId', '==', arenaId), limit(ARENA_BOOKINGS_LIMIT)),
    (snap) => onChange(snap.docs.map(arenaBookingFromDoc)),
    () => onChange([]),
  );
}

export function watchBooking(db: Firestore, bookingId: string, onChange: (booking: ArenaBooking | null) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'arenaBookings', bookingId),
    (snap) => onChange(snap.exists() ? arenaBookingFromDoc(snap) : null),
    () => onChange(null),
  );
}

function bookingStartEnd(booking: Pick<ArenaBooking, 'dateKey' | 'startTime' | 'endTime'>): { start: Date; end: Date } | null {
  if (booking.dateKey.length < 10) return null;
  const [y, m, d] = booking.dateKey.split('-').map(Number);
  if (!y || !m || !d) return null;
  const [sh, sm] = booking.startTime.split(':').map(Number);
  const [eh, em] = booking.endTime.split(':').map(Number);
  const start = new Date(y, m - 1, d, sh || 0, sm || 0);
  let end = new Date(y, m - 1, d, eh || 0, em || 0);
  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60_000);
  }
  return { start, end };
}

/** Check-in feito pelo gestor (front desk) — mesma janela de tempo que o self-check-in do
 *  atleta: de 20min antes do início até 15min após o término do horário. */
export async function checkInBookingByManager(db: Firestore, bookingId: string): Promise<void> {
  const ref = doc(db, 'arenaBookings', bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new BookingRepositoryError('Reserva não encontrada.');
  const data = snap.data() as Record<string, unknown>;

  const status = (typeof data['status'] === 'string' ? data['status'] : '').toLowerCase().trim();
  if (status === 'canceled' || status === 'cancelled') {
    throw new BookingRepositoryError('Reserva cancelada não permite check-in.');
  }
  const attendance = (typeof data['attendanceStatus'] === 'string' ? data['attendanceStatus'] : '').toLowerCase().trim();
  if (attendance === 'checked_in') throw new BookingRepositoryError('Check-in já realizado.');
  if (attendance === 'no_show') throw new BookingRepositoryError('Esta reserva já foi marcada como no-show.');

  const booking = arenaBookingFromDoc(snap);
  const window = bookingStartEnd(booking);
  if (!window) throw new BookingRepositoryError('Não foi possível validar a janela do check-in.');

  const now = Date.now();
  const windowStart = window.start.getTime() - CHECK_IN_WINDOW_BEFORE_MS;
  const windowEnd = window.end.getTime() + CHECK_IN_WINDOW_AFTER_MS;
  if (now < windowStart || now > windowEnd) {
    throw new BookingRepositoryError('Check-in disponível de 20 min antes até 15 min após o término do horário.');
  }

  await updateDoc(ref, {
    attendanceStatus: 'checked_in',
    checkedInAt: serverTimestamp(),
    locationVerified: false,
  });
}

/** Cancelamento pelo gestor — guarda snapshot de status/attendance pra permitir desfazer em 60s. */
export async function cancelBookingByManager(db: Firestore, bookingId: string, arenaId: string, cancelReason?: string): Promise<void> {
  const ref = doc(db, 'arenaBookings', bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new BookingRepositoryError('Reserva não encontrada.');
  const data = snap.data() as Record<string, unknown>;

  const bookingArena = typeof data['arenaId'] === 'string' ? data['arenaId'].trim() : '';
  if (bookingArena !== arenaId) throw new BookingRepositoryError('Esta reserva não pertence à arena atual.');

  const status = (typeof data['status'] === 'string' ? data['status'] : '').toLowerCase().trim();
  if (status === 'canceled' || status === 'cancelled' || status === 'completed') {
    throw new BookingRepositoryError('Esta reserva não pode ser cancelada.');
  }

  const statusBefore = typeof data['status'] === 'string' && data['status'].trim() ? data['status'].trim() : 'active';
  const attendanceBefore = typeof data['attendanceStatus'] === 'string' && data['attendanceStatus'].trim() ? data['attendanceStatus'].trim() : 'pending';

  const payload: Record<string, unknown> = {
    status: 'canceled',
    attendanceStatus: 'canceled',
    canceledAt: serverTimestamp(),
    canceledByRole: 'arena_manager',
    statusBeforeCancel: statusBefore,
    attendanceStatusBeforeCancel: attendanceBefore,
  };
  const reason = cancelReason?.trim();
  if (reason) payload['cancelReason'] = reason;

  await updateDoc(ref, payload);
}

/** Desfaz um cancelamento feito pelo gestor, dentro da janela de 60s. */
export async function restoreBookingByManager(db: Firestore, bookingId: string, arenaId: string): Promise<void> {
  const ref = doc(db, 'arenaBookings', bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new BookingRepositoryError('Reserva não encontrada.');
  const data = snap.data() as Record<string, unknown>;

  const bookingArena = typeof data['arenaId'] === 'string' ? data['arenaId'].trim() : '';
  if (bookingArena !== arenaId) throw new BookingRepositoryError('Esta reserva não pertence à arena atual.');

  const status = (typeof data['status'] === 'string' ? data['status'] : '').toLowerCase().trim();
  if (status !== 'canceled' && status !== 'cancelled') {
    throw new BookingRepositoryError('Esta reserva não está cancelada.');
  }

  const canceledAt = data['canceledAt'];
  if (!(canceledAt instanceof Timestamp)) {
    throw new BookingRepositoryError('Não é possível desfazer este cancelamento.');
  }
  if (Date.now() - canceledAt.toMillis() > UNDO_WINDOW_MS) {
    throw new BookingRepositoryError('O prazo para desfazer o cancelamento expirou.');
  }

  const statusBefore = typeof data['statusBeforeCancel'] === 'string' && data['statusBeforeCancel'].trim() ? data['statusBeforeCancel'].trim() : 'active';
  const attendanceBefore =
    typeof data['attendanceStatusBeforeCancel'] === 'string' && data['attendanceStatusBeforeCancel'].trim()
      ? data['attendanceStatusBeforeCancel'].trim()
      : 'pending';

  await updateDoc(ref, {
    status: statusBefore,
    attendanceStatus: attendanceBefore,
    canceledAt: deleteField(),
    canceledByRole: deleteField(),
    cancelReason: deleteField(),
    statusBeforeCancel: deleteField(),
    attendanceStatusBeforeCancel: deleteField(),
  });
}

const athleteLabelCache = new Map<string, string>();

function athleteFallbackLabel(uid: string): string {
  return uid.length <= 8 ? `Atleta (${uid})` : `Atleta (…${uid.slice(-6)})`;
}

/** Espelha `ArenaUserLabelService` (Flutter): lê `public_profiles/{uid}` (sem PII), sem
 *  Cloud Function — leitura ampla já permitida pelas rules pra qualquer autenticado. */
export async function resolveAthleteLabel(db: Firestore, athleteId: string): Promise<string> {
  const uid = athleteId.trim();
  if (!uid) return '—';
  const cached = athleteLabelCache.get(uid);
  if (cached) return cached;

  try {
    const snap = await getDoc(doc(db, 'public_profiles', uid));
    const data = snap.data() as Record<string, unknown> | undefined;
    if (data) {
      const nickname = typeof data['nickname'] === 'string' ? data['nickname'].trim() : '';
      const clean = nickname.startsWith('@') ? nickname.slice(1).trim() : nickname;
      if (clean) {
        athleteLabelCache.set(uid, clean);
        return clean;
      }
      const fullName = typeof data['fullName'] === 'string' ? data['fullName'].trim() : '';
      if (fullName) {
        athleteLabelCache.set(uid, fullName);
        return fullName;
      }
      const displayName = typeof data['displayName'] === 'string' ? data['displayName'].trim() : '';
      if (displayName) {
        athleteLabelCache.set(uid, displayName);
        return displayName;
      }
      const name = typeof data['name'] === 'string' ? data['name'].trim() : '';
      if (name) {
        athleteLabelCache.set(uid, name);
        return name;
      }
    }
  } catch {
    // permission-denied ou rede: cai no fallback abaixo.
  }

  const fallback = athleteFallbackLabel(uid);
  athleteLabelCache.set(uid, fallback);
  return fallback;
}
