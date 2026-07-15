import { collection, getDocs, query, where, type Firestore } from 'firebase/firestore';

/** Reservas do próprio atleta em `arenaBookings` (coleção top-level) — espelha
 *  `BookingService.watchMyBookings`: 2 queries de campo único (`athleteId`/`bookingAthleteId`,
 *  nomes legados que convivem no schema), mescladas por id, evitando índice composto. */

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
}

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export interface MyBooking {
  id: string;
  arenaId: string;
  arenaName: string;
  courtName: string;
  /** `YYYY-MM-DD` */
  dateKey: string;
  startTime: string;
  endTime: string;
  status: string;
  attendanceConfirmed: boolean;
  amountReais: number | null;
  createdAt: Date | null;
}

function dateKeyFromDynamic(v: unknown): string {
  if (typeof v === 'string') return v.length >= 10 ? v.slice(0, 10) : v;
  const d = toDate(v);
  return d ? d.toISOString().slice(0, 10) : '';
}

function timeStr(v: unknown): string {
  if (typeof v !== 'string') return '--:--';
  const t = v.trim();
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function bookingFromDoc(id: string, data: Record<string, unknown>): MyBooking {
  return {
    id,
    arenaId: optionalStr(data['arenaId']) ?? '',
    arenaName: optionalStr(data['arenaName']) ?? optionalStr(data['arena']) ?? 'Arena',
    courtName: optionalStr(data['courtName']) ?? optionalStr(data['court']) ?? 'Quadra',
    dateKey: dateKeyFromDynamic(data['date']),
    startTime: timeStr(data['startTime']),
    endTime: timeStr(data['endTime']),
    status: optionalStr(data['status']) ?? 'active',
    attendanceConfirmed: data['attendanceConfirmed'] === true,
    amountReais: typeof data['amountReais'] === 'number' ? data['amountReais'] : typeof data['priceReais'] === 'number' ? (data['priceReais'] as number) : null,
    createdAt: toDate(data['createdAt']),
  };
}

export function bookingIsActive(booking: Pick<MyBooking, 'status'>): boolean {
  const s = booking.status.toLowerCase().trim();
  return s !== 'canceled' && s !== 'cancelled';
}

export function bookingNeedsPayment(booking: Pick<MyBooking, 'status'>): boolean {
  const s = booking.status.toLowerCase().trim();
  return s === 'pending_payment' || s === 'pending';
}

export async function fetchMyBookings(db: Firestore, uid: string): Promise<MyBooking[]> {
  const col = collection(db, 'arenaBookings');
  const [byAthleteId, byBookingAthleteId] = await Promise.all([
    getDocs(query(col, where('athleteId', '==', uid))),
    getDocs(query(col, where('bookingAthleteId', '==', uid))),
  ]);
  const byId = new Map<string, MyBooking>();
  for (const d of [...byAthleteId.docs, ...byBookingAthleteId.docs]) {
    byId.set(d.id, bookingFromDoc(d.id, d.data() as Record<string, unknown>));
  }
  return [...byId.values()];
}
