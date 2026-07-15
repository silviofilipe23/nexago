import { collection, onSnapshot, query, where, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import { arenaRecurringBookingFromDoc, type ArenaRecurringBooking } from './arena-recurring-booking.model';

/** Espelha `RecurringBookingService` (Flutter): leitura direta de `arenaRecurringBookings`
 *  (rules permitem pro gestor da arena), escrita 100% via Cloud Functions — a série exige
 *  transação com locks e materialização de ocorrências que só o Admin SDK pode fazer. */

export class RecurringBookingError extends Error {}

export function watchActiveSeries(db: Firestore, arenaId: string, onChange: (series: ArenaRecurringBooking[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'arenaRecurringBookings'), where('arenaId', '==', arenaId), where('status', '==', 'active')),
    (snap) => {
      const list = snap.docs
        .map(arenaRecurringBookingFromDoc)
        .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
      onChange(list);
    },
    () => onChange([]),
  );
}

export interface CreateRecurringSeriesInput {
  arenaId: string;
  courtId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  amountReais: number;
  athleteId?: string;
  customerName?: string;
  startDate?: string;
  endDate?: string;
}

export interface CreateRecurringSeriesResult {
  seriesId: string;
  createdDates: string[];
  skippedDates: string[];
}

function mapFunctionsError(err: unknown): RecurringBookingError {
  const message = err instanceof Error && err.message ? err.message : 'Não foi possível concluir a operação. Tente novamente.';
  return new RecurringBookingError(message);
}

export async function createRecurringSeries(functions: Functions, input: CreateRecurringSeriesInput): Promise<CreateRecurringSeriesResult> {
  const call = httpsCallable<CreateRecurringSeriesInput, CreateRecurringSeriesResult>(functions, 'createArenaRecurringBooking');
  try {
    const result = await call(input);
    return result.data;
  } catch (err) {
    throw mapFunctionsError(err);
  }
}

export async function cancelRecurringSeries(functions: Functions, seriesId: string, reason?: string): Promise<void> {
  const call = httpsCallable(functions, 'cancelArenaRecurringBooking');
  try {
    await call({ seriesId, ...(reason ? { reason } : {}) });
  } catch (err) {
    throw mapFunctionsError(err);
  }
}
