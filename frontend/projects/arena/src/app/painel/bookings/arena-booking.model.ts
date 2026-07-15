import { Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';

/** Espelha `nexago_app/.../arena/domain/arena_manager_booking.dart` — schema de `arenaBookings`
 *  (coleção top-level, uma reserva de quadra por documento). */

export type ArenaBookingViewMode = 'today' | 'tomorrow' | 'upcoming' | 'past';

export const BOOKING_VIEW_MODE_LABEL: Record<ArenaBookingViewMode, string> = {
  today: 'Hoje',
  tomorrow: 'Amanhã',
  upcoming: 'Futuras',
  past: 'Passadas',
};

export type ArenaBookingAttendanceStatus = 'pending' | 'confirmed' | 'checked_in' | 'no_show' | string;

export interface ArenaBooking {
  id: string;
  arenaId: string;
  athleteId: string;
  courtId: string;
  courtName: string;
  /** `YYYY-MM-DD` */
  dateKey: string;
  startTime: string;
  endTime: string;
  status: string;
  attendanceStatus: ArenaBookingAttendanceStatus;
  customerName: string | null;
  isRecurring: boolean;
  recurringBookingId: string | null;
  amountReais: number | null;
  paymentChannel: string | null;
  paymentStatus: string | null;
  confirmedParticipants: number;
  canceledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date | null;
}

function timeStr(v: unknown): string {
  if (typeof v !== 'string') return '--:--';
  const t = v.trim();
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function toDate(v: unknown): Date | null {
  return v instanceof Timestamp ? v.toDate() : null;
}

function dateKeyFromDynamic(v: unknown): string {
  if (typeof v === 'string') return v.length >= 10 ? v.slice(0, 10) : v;
  if (v instanceof Timestamp) return v.toDate().toISOString().slice(0, 10);
  return '';
}

function optionalTrimmed(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export function arenaBookingFromDoc(doc: QueryDocumentSnapshot): ArenaBooking {
  const d = doc.data() as Record<string, unknown>;
  const courtId = optionalTrimmed(d['courtId']) ?? '';
  const courtNameLabel = optionalTrimmed(d['courtName']) ?? optionalTrimmed(d['court']);
  const amount = d['amountReais'] ?? d['priceReais'] ?? d['price'];

  return {
    id: doc.id,
    arenaId: typeof d['arenaId'] === 'string' ? d['arenaId'] : '',
    athleteId: optionalTrimmed(d['athleteId']) ?? optionalTrimmed(d['bookingAthleteId']) ?? '',
    courtId,
    courtName: courtNameLabel && courtNameLabel !== courtId ? courtNameLabel : 'Quadra',
    dateKey: dateKeyFromDynamic(d['date']),
    startTime: timeStr(d['startTime']),
    endTime: timeStr(d['endTime']),
    status: typeof d['status'] === 'string' ? d['status'] : 'active',
    attendanceStatus: (typeof d['attendanceStatus'] === 'string' ? d['attendanceStatus'].trim().toLowerCase() : '') || 'pending',
    customerName: optionalTrimmed(d['customerName']),
    isRecurring: d['isRecurring'] === true || optionalTrimmed(d['recurringBookingId']) != null,
    recurringBookingId: optionalTrimmed(d['recurringBookingId']),
    amountReais: typeof amount === 'number' ? amount : null,
    paymentChannel: optionalTrimmed(d['paymentChannel']),
    paymentStatus: optionalTrimmed(d['paymentStatus']),
    confirmedParticipants: typeof d['confirmedParticipants'] === 'number' ? d['confirmedParticipants'] : 1,
    canceledAt: toDate(d['canceledAt']),
    cancelReason: optionalTrimmed(d['cancelReason']),
    createdAt: toDate(d['createdAt']),
  };
}

export function enrichCourtName(booking: ArenaBooking, namesByCourtId: ReadonlyMap<string, string>): ArenaBooking {
  const resolved = namesByCourtId.get(booking.courtId)?.trim();
  if (!resolved || resolved === booking.courtName) return booking;
  return { ...booking, courtName: resolved };
}

function isCancelStatus(status: string): boolean {
  const s = status.toLowerCase().trim();
  return s === 'canceled' || s === 'cancelled';
}

export function bookingIsActive(booking: Pick<ArenaBooking, 'status'>): boolean {
  return !isCancelStatus(booking.status);
}

export function bookingCanCancel(booking: Pick<ArenaBooking, 'status'>): boolean {
  const s = booking.status.toLowerCase().trim();
  return s !== 'canceled' && s !== 'cancelled' && s !== 'completed';
}

/** Espelha `arenaBookingShowsCheckInAction` (Flutter) — mesmas condições de visibilidade. */
export function bookingShowsCheckInAction(booking: Pick<ArenaBooking, 'status' | 'attendanceStatus'>): boolean {
  if (!bookingCanCancel(booking)) return false;
  return booking.attendanceStatus !== 'checked_in' && booking.attendanceStatus !== 'no_show';
}

export const ATTENDANCE_LABEL: Record<string, string> = {
  checked_in: 'Check-in feito',
  confirmed: 'Confirmado',
  no_show: 'No-show',
  pending: 'Pendente',
};

export function attendanceLabel(status: string): string {
  return ATTENDANCE_LABEL[status] ?? 'Pendente';
}

export function bookingStatusLabel(status: string): string {
  const s = status.toLowerCase().trim();
  if (s === 'cancelled' || s === 'canceled') return 'Cancelada';
  if (s === 'completed') return 'Concluída';
  if (s === 'pending_payment') return 'Aguardando pagamento';
  return 'Ativa';
}

export function displayBookingCode(id: string): string {
  const trimmed = id.trim();
  const tail = trimmed.length <= 5 ? trimmed : trimmed.slice(-5);
  return `#NXG-${tail}`.toUpperCase();
}

export function formatBRL(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const WEEKDAY_FORMAT = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });
const DAY_MONTH_FORMAT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' });

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function parseDateKey(dateKey: string): Date | null {
  if (dateKey.length < 10) return null;
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function sectionTitleForDateKey(dateKey: string, reference = new Date()): string {
  const d = parseDateKey(dateKey);
  if (!d) return dateKey;
  const todayKey = dateKeyOf(reference);
  const tomorrowKey = dateKeyOf(new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + 1));
  const weekdayLong = capitalize(WEEKDAY_FORMAT.format(d));
  const dayMonth = capitalize(DAY_MONTH_FORMAT.format(d));
  if (dateKey === todayKey) return `Hoje · ${weekdayLong}`;
  if (dateKey === tomorrowKey) return `Amanhã · ${weekdayLong}`;
  return `${weekdayLong} · ${dayMonth}`;
}

export function dateKeyOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
