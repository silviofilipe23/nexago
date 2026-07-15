import { Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';

/** Espelha `nexago_app/.../arena/domain/arena_recurring_booking.dart` — schema da série de
 *  horário fixo (mensalista) em `arenaRecurringBookings/{id}`. As ocorrências em si são docs
 *  normais de `arenaBookings` (com `recurringBookingId`), materializadas só pelas Cloud
 *  Functions — esta coleção é 100% somente-leitura no client (`allow create,update,delete: if false`). */

export const RECURRING_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export const RECURRING_WEEKDAY_LABEL: Record<number, string> = {
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
  7: 'Domingo',
};

export type ArenaRecurringStatus = 'active' | 'canceled';

export interface ArenaRecurringBooking {
  id: string;
  arenaId: string;
  arenaName: string;
  courtId: string;
  courtName: string;
  /** ISO: 1 = segunda … 7 = domingo. */
  weekday: number;
  startTime: string;
  endTime: string;
  athleteId: string | null;
  customerName: string | null;
  amountReais: number;
  status: ArenaRecurringStatus;
  startDate: string;
  endDate: string | null;
  skippedDates: string[];
  createdAt: Date | null;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

function optional(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function time(v: unknown): string {
  if (typeof v !== 'string') return '--:--';
  const t = v.trim();
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function arenaRecurringBookingFromDoc(doc: QueryDocumentSnapshot): ArenaRecurringBooking {
  const d = doc.data() as Record<string, unknown>;
  const skipped = Array.isArray(d['skippedDates'])
    ? (d['skippedDates'] as unknown[]).filter((s): s is string => typeof s === 'string' && s.trim().length > 0).sort()
    : [];

  return {
    id: doc.id,
    arenaId: str(d['arenaId']),
    arenaName: str(d['arenaName'], 'Arena'),
    courtId: str(d['courtId']),
    courtName: str(d['courtName'], 'Quadra'),
    weekday: typeof d['weekday'] === 'number' ? d['weekday'] : 0,
    startTime: time(d['startTime']),
    endTime: time(d['endTime']),
    athleteId: optional(d['athleteId']),
    customerName: optional(d['customerName']),
    amountReais: typeof d['amountReais'] === 'number' ? d['amountReais'] : 0,
    status: str(d['status'], 'active') === 'canceled' ? 'canceled' : 'active',
    startDate: str(d['startDate']),
    endDate: optional(d['endDate']),
    skippedDates: skipped,
    createdAt: d['createdAt'] instanceof Timestamp ? (d['createdAt'] as Timestamp).toDate() : null,
  };
}

export function recurringCustomerLabel(series: Pick<ArenaRecurringBooking, 'customerName' | 'athleteId'>): string {
  if (series.customerName) return series.customerName;
  if (series.athleteId) return `Atleta (…${series.athleteId.slice(-6)})`;
  return 'Mensalista';
}
