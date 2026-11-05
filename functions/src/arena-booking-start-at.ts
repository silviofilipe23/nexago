import {eventDateFromDayKeyAndTime} from "./event-timezone";

/**
 * Início da reserva: dia + hora na parede de São Paulo → instante UTC.
 *
 * `new Date(ano, mês, dia, h, m)` usa o fuso do runtime (UTC nas Functions) e
 * deixava o início — e com ele `confirmationDeadline` e o prazo da divisão de
 * pagamento — 3 h adiantado. `parseInt` aceita hora com um dígito ("7:00").
 */
export function arenaBookingStartAt(dateKey: string, startTime: string): Date {
  const [h, m] = startTime.split(":");
  return eventDateFromDayKeyAndTime(
    dateKey,
    parseInt(h ?? "0", 10),
    parseInt(m ?? "0", 10),
  );
}
