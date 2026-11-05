import { dateKeyOf } from './arena-booking.model';

/** Intervalo de `date` (`yyyy-MM-dd`, inclusivo) da consulta de reservas da arena. Substitui o
 *  `where(arenaId).limit(256)` sem data, que a partir de 256 reservas podia esconder as de hoje. */
export interface BookingsDateRange {
  fromKey: string;
  toKey: string;
}

/** Aba Passadas da tela de Reservas enxerga até aqui. */
export const BOOKINGS_LIST_DAYS_BACK = 30;
/** Futuras: cobre os 35 dias de ocorrências do mensalista com folga. */
export const BOOKINGS_LIST_DAYS_AHEAD = 60;

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Tela de Reservas (Hoje / Amanhã / Futuras / Passadas). */
export function bookingsListRange(today = new Date()): BookingsDateRange {
  return {
    fromKey: dateKeyOf(addDays(today, -BOOKINGS_LIST_DAYS_BACK)),
    toKey: dateKeyOf(addDays(today, BOOKINGS_LIST_DAYS_AHEAD)),
  };
}

/** Início do painel: hoje e os [daysBack] dias anteriores (gráfico de 7 dias, mesmo dia da semana passada). */
export function recentBookingsRange(daysBack: number, today = new Date()): BookingsDateRange {
  return { fromKey: dateKeyOf(addDays(today, -daysBack)), toKey: dateKeyOf(today) };
}
