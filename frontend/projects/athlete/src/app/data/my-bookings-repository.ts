import { collection, getDocs, onSnapshot, query, where, type Firestore, type Unsubscribe } from 'firebase/firestore';

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
  /** Dono (`athleteId`, ou `bookingAthleteId` nas antigas). Diferente de quem vê = convidado. */
  ownerAthleteId: string | null;
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
    ownerAthleteId: optionalStr(data['athleteId']) ?? optionalStr(data['bookingAthleteId']),
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

/** Campos legados que identificam o dono da reserva — consultados em queries separadas
 *  (equality single-field) e mesclados por id, evitando índice composto. */
const OWNER_FIELDS = ['athleteId', 'bookingAthleteId'] as const;

/** Null quando data ou hora não são utilizáveis — quem chama decide o fallback. */
function localDateTime(dateKey: string, time: string): Date | null {
  if (dateKey.length < 10 || !/^\d{2}:\d{2}$/.test(time)) return null;
  const parsed = new Date(`${dateKey}T${time}:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function bookingStartsAt(booking: Pick<MyBooking, 'dateKey' | 'startTime'>): Date | null {
  return localDateTime(booking.dateKey, booking.startTime) ?? localDateTime(booking.dateKey, '00:00');
}

/** Fim da reserva; cai no início quando `endTime` não é utilizável. */
export function bookingEndsAt(booking: Pick<MyBooking, 'dateKey' | 'startTime' | 'endTime'>): Date | null {
  return localDateTime(booking.dateKey, booking.endTime) ?? bookingStartsAt(booking);
}

/** Reserva que ainda não terminou (a que está em curso agora continua contando). */
export function bookingIsUpcoming(
  booking: Pick<MyBooking, 'dateKey' | 'startTime' | 'endTime'>,
  now = new Date(),
): boolean {
  const endsAt = bookingEndsAt(booking);
  return endsAt != null && endsAt.getTime() >= now.getTime();
}

export async function fetchMyBookings(db: Firestore, uid: string): Promise<MyBooking[]> {
  const col = collection(db, 'arenaBookings');
  const snapshots = await Promise.all(
    OWNER_FIELDS.map((field) => getDocs(query(col, where(field, '==', uid)))),
  );
  const byId = new Map<string, MyBooking>();
  for (const d of snapshots.flatMap((snap) => snap.docs)) {
    byId.set(d.id, bookingFromDoc(d.id, d.data() as Record<string, unknown>));
  }
  return [...byId.values()];
}

/** Reservas de OUTROS atletas em que `uid` entrou por convite (`participantUids`, gravado só
 *  pelas callables de `arena-booking-invite.ts`). Fica fora de {@link fetchMyBookings} de
 *  propósito, como no app: histórico, gasto e avaliação contam só as reservas do próprio atleta —
 *  quem junta as duas listas é a Agenda. `array-contains` simples dispensa índice composto. */
export async function fetchMyGuestBookings(db: Firestore, uid: string): Promise<MyBooking[]> {
  const snap = await getDocs(query(collection(db, 'arenaBookings'), where('participantUids', 'array-contains', uid)));
  return snap.docs.map((d) => bookingFromDoc(d.id, d.data() as Record<string, unknown>));
}

/** Próprias + como convidado, sem repetir (a própria ganha se aparecer nas duas). */
export function mergeOwnAndGuestBookings(own: readonly MyBooking[], asGuest: readonly MyBooking[]): MyBooking[] {
  const ids = new Set(own.map((b) => b.id));
  return [...own, ...asGuest.filter((b) => !ids.has(b.id))];
}

/** O atleta está nesta reserva como convidado de outro (não é o dono). */
export function bookingViewerIsGuest(booking: Pick<MyBooking, 'ownerAthleteId'>, viewerUid: string | null): boolean {
  return viewerUid != null && booking.ownerAthleteId != null && booking.ownerAthleteId !== viewerUid;
}

/** Versão realtime de {@link fetchMyBookings}: um listener por campo de dono, mesclados
 *  por id a cada emissão. */
export function watchMyBookings(
  db: Firestore,
  uid: string,
  onChange: (bookings: MyBooking[]) => void,
  onError?: () => void,
): Unsubscribe {
  const col = collection(db, 'arenaBookings');
  const buckets = OWNER_FIELDS.map(() => new Map<string, MyBooking>());

  const emit = () => {
    const byId = new Map<string, MyBooking>();
    for (const bucket of buckets) {
      for (const [id, booking] of bucket) byId.set(id, booking);
    }
    onChange([...byId.values()]);
  };

  const stops = OWNER_FIELDS.map((field, index) =>
    onSnapshot(
      query(col, where(field, '==', uid)),
      (snap) => {
        buckets[index] = new Map(
          snap.docs.map((d) => [d.id, bookingFromDoc(d.id, d.data() as Record<string, unknown>)]),
        );
        emit();
      },
      () => onError?.(),
    ),
  );

  return () => {
    for (const stop of stops) stop();
  };
}
