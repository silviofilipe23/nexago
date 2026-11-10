import {
  Timestamp,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
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
import type { BookingsDateRange } from './bookings-window';

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

/** Até 256 reservas da arena **sem filtro de data** — a partir daí as de hoje podem sumir. Fica para
 *  quem precisa do histórico (Ranking de clientes); agenda e listas por dia usam
 *  {@link watchBookingsForArenaInRange}. */
export function watchBookingsForArena(db: Firestore, arenaId: string, onChange: (bookings: ArenaBooking[]) => void): Unsubscribe {
  return onSnapshot(
    query(bookingsCol(db), where('arenaId', '==', arenaId), limit(ARENA_BOOKINGS_LIMIT)),
    (snap) => onChange(snap.docs.map(arenaBookingFromDoc)),
    () => onChange([]),
  );
}

/** Reservas da arena com `date` entre `range.fromKey` e `range.toKey` (inclusivo). Índice
 *  `arenaBookings (arenaId ASC, date ASC)`. Todas as origens gravam `date` como `yyyy-MM-dd`. */
export function watchBookingsForArenaInRange(
  db: Firestore,
  arenaId: string,
  range: BookingsDateRange,
  onChange: (bookings: ArenaBooking[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      bookingsCol(db),
      where('arenaId', '==', arenaId),
      where('date', '>=', range.fromKey),
      where('date', '<=', range.toKey),
    ),
    (snap) => onChange(snap.docs.map(arenaBookingFromDoc)),
    () => onChange([]),
  );
}

/** Atletas distintos que já reservaram nesta arena — base da busca de mensalista
 *  (`ar-athlete-search-field`), mesma fonte usada pelo Ranking de clientes
 *  (`ranked-clients-repository.ts`), só que sem os agregados de jogos/gasto. */
export async function fetchArenaAthleteIdsOnce(db: Firestore, arenaId: string): Promise<string[]> {
  const snap = await getDocs(query(bookingsCol(db), where('arenaId', '==', arenaId), limit(ARENA_BOOKINGS_LIMIT)));
  const ids = new Set<string>();
  for (const docSnap of snap.docs) {
    const athleteId = arenaBookingFromDoc(docSnap).athleteId.trim();
    if (athleteId) ids.add(athleteId);
  }
  return [...ids];
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

/** "Faltou" pela recepção: marca `no_show` depois do início do horário. O mesmo veredito que o
 *  servidor dá sozinho depois do horário (`sendArenaBookingReminders`); a rule da equipe permite. */
export async function markNoShowByManager(db: Firestore, bookingId: string): Promise<void> {
  const ref = doc(db, 'arenaBookings', bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new BookingRepositoryError('Reserva não encontrada.');
  const booking = arenaBookingFromDoc(snap);
  const status = booking.status.toLowerCase().trim();
  if (status === 'canceled' || status === 'cancelled') {
    throw new BookingRepositoryError('Reserva cancelada não recebe falta.');
  }
  if (booking.attendanceStatus === 'checked_in') throw new BookingRepositoryError('Esta reserva já tem check-in.');
  if (booking.attendanceStatus === 'no_show') return;
  const window = bookingStartEnd(booking);
  if (!window) throw new BookingRepositoryError('Esta reserva não tem horário válido.');
  if (Date.now() < window.start.getTime()) {
    throw new BookingRepositoryError('A falta só pode ser marcada depois do início do horário.');
  }
  await updateDoc(ref, { attendanceStatus: 'no_show' });
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

export interface AthleteProfileSummary {
  name: string;
  photoUrl: string | null;
}

const athleteProfileCache = new Map<string, AthleteProfileSummary>();

function athleteFallbackLabel(uid: string): string {
  return uid.length <= 8 ? `Atleta (${uid})` : `Atleta (…${uid.slice(-6)})`;
}

function str(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  return typeof value === 'string' ? value.trim() : '';
}

/** Espelha `ArenaUserLabelService` (Flutter): lê `public_profiles/{uid}` (sem PII), sem
 *  Cloud Function — leitura ampla já permitida pelas rules pra qualquer autenticado.
 *  Nome e foto saem da mesma leitura (e do mesmo cache). */
export async function resolveAthleteProfile(db: Firestore, athleteId: string): Promise<AthleteProfileSummary> {
  const uid = athleteId.trim();
  if (!uid) return { name: '—', photoUrl: null };
  const cached = athleteProfileCache.get(uid);
  if (cached) return cached;

  let name = '';
  let photoUrl: string | null = null;
  try {
    const snap = await getDoc(doc(db, 'public_profiles', uid));
    const data = snap.data() as Record<string, unknown> | undefined;
    if (data) {
      const nickname = str(data, 'nickname');
      const clean = nickname.startsWith('@') ? nickname.slice(1).trim() : nickname;
      name = clean || str(data, 'fullName') || str(data, 'displayName') || str(data, 'name');
      // Mesma ordem do Clubinho: `profilePhotoUrl` é o campo atual, os outros são legado.
      photoUrl = str(data, 'profilePhotoUrl') || str(data, 'avatarUrl') || str(data, 'photoURL') || null;
    }
  } catch {
    // permission-denied ou rede: cai no fallback abaixo.
  }

  const profile: AthleteProfileSummary = { name: name || athleteFallbackLabel(uid), photoUrl };
  athleteProfileCache.set(uid, profile);
  return profile;
}

export async function resolveAthleteLabel(db: Firestore, athleteId: string): Promise<string> {
  return (await resolveAthleteProfile(db, athleteId)).name;
}
