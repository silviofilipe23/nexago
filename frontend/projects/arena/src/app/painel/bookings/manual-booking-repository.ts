import { httpsCallable, type Functions } from 'firebase/functions';
import type { ManualBookingPayload } from './manual-booking-form';

/** Reserva de balcão: escrita 100% via Cloud Functions — a criação exige transação
 *  com `arenaSlotLocks`, que o client não consegue garantir sozinho. Mesmo desenho
 *  de `recurring-bookings-repository.ts`. */

export class ManualBookingError extends Error {}

export interface ManualBookingQuoteInput {
  arenaId: string;
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface ManualBookingQuote {
  amountReais: number;
}

function mapFunctionsError(err: unknown): ManualBookingError {
  const message = err instanceof Error && err.message ?
    err.message :
    'Não foi possível concluir a operação. Tente novamente.';
  return new ManualBookingError(message);
}

export async function quoteManualBooking(functions: Functions, input: ManualBookingQuoteInput): Promise<ManualBookingQuote> {
  const call = httpsCallable<ManualBookingQuoteInput, ManualBookingQuote>(functions, 'quoteArenaManualBooking');
  try {
    const result = await call(input);
    return result.data;
  } catch (err) {
    throw mapFunctionsError(err);
  }
}

export async function createManualBooking(functions: Functions, payload: ManualBookingPayload): Promise<{ bookingId: string }> {
  const call = httpsCallable<ManualBookingPayload, { bookingId: string }>(functions, 'createArenaManualBooking');
  try {
    const result = await call(payload);
    return result.data;
  } catch (err) {
    throw mapFunctionsError(err);
  }
}
