import { timeToMinutes } from '@nexago/arena-discovery';
import type { ArenaBookingDoc } from '../data/arena-bookings-repository';

/**
 * Query params para voltar ao pagamento de uma reserva pendente ("Concluir pagamento").
 * Reserva sem quadra definida (arena "a arena define a quadra") volta pela grade por horário —
 * mandar a quadra provisória reabriria o pagamento com quadra escolhida, que o servidor recusa.
 */
export function bookingResumePaymentParams(
  b: Pick<ArenaBookingDoc, 'allocationStatus' | 'sport' | 'courtId' | 'dateKey' | 'startTime' | 'endTime' | 'slotCount'>,
): Record<string, string | number | null> {
  if (b.allocationStatus === 'unassigned') {
    let minutes = timeToMinutes(b.endTime) - timeToMinutes(b.startTime);
    if (minutes <= 0) minutes += 24 * 60;
    return { allocation: 'capacity', sport: b.sport, date: b.dateKey, time: b.startTime, minutes };
  }
  return { courtId: b.courtId, date: b.dateKey, time: b.startTime, duration: b.slotCount };
}
