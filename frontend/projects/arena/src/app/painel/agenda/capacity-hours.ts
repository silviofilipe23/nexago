import { bookingIsActive, bookingShowsCheckInAction, type ArenaBooking } from '../bookings/arena-booking.model';
import { bookingCanChangeCourt } from '../bookings/booking-court-change';
import type { ArenaCourt } from '../courts/court.model';
import type { ArenaSlot } from './arena-slot.model';

/** Agenda → Por horário (`docs/product/reservas-por-capacidade.md`, PR 5; canvas "Reservas por
 *  capacidade" 04–06). Tudo puro: a tela e os testes usam direto. Horas cheias — uma reserva das
 *  19:30 às 20:30 conta nas 19:00 e nas 20:00. */

const DAY_MINUTES = 24 * 60;

function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Intervalo em minutos; fim "00:00" (ou antes do início) = virada da meia-noite. */
function span(start: string, end: string): [number, number] {
  const s = minutesOf(start);
  let e = minutesOf(end);
  if (e <= s) e += DAY_MINUTES;
  return [s, e];
}

function overlapsHour(start: string, end: string, hourStart: number): boolean {
  const [s, e] = span(start, end);
  return s < hourStart + 60 && hourStart < e;
}

export function hourLabel(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  return `${String(h).padStart(2, '0')}:00`;
}

/** Quadras do horário: as da distribuição (na ordem gravada) ou, sem distribuição, todas. */
export function capacityCourts(courts: readonly ArenaCourt[], allocationCourtIds: readonly string[]): ArenaCourt[] {
  if (allocationCourtIds.length === 0) return [...courts];
  const byId = new Map(courts.map((c) => [c.id, c]));
  return allocationCourtIds.map((id) => byId.get(id)).filter((c): c is ArenaCourt => !!c);
}

export type BoardTileState = 'free' | 'booked' | 'blocked' | 'maintenance' | 'closed';

export interface BoardTile {
  court: ArenaCourt;
  state: BoardTileState;
  /** Reserva que ocupa a quadra nessa hora (`booked`). */
  booking: ArenaBooking | null;
}

function holdsCourt(b: ArenaBooking): boolean {
  return bookingIsActive(b) && b.status.toLowerCase().trim() !== 'completed';
}

/** O que cada quadra tem na hora: reserva, bloqueio, livre, manutenção ou fora do horário. */
export function buildBoard(
  hourStart: number,
  courts: readonly ArenaCourt[],
  slots: readonly ArenaSlot[],
  bookings: readonly ArenaBooking[],
): BoardTile[] {
  return courts.map((court) => {
    if (court.status === 'maintenance') return { court, state: 'maintenance', booking: null };
    const booking = bookings.find(
      (b) => b.courtId === court.id && holdsCourt(b) && overlapsHour(b.startTime, b.endTime, hourStart),
    );
    if (booking) return { court, state: 'booked', booking };
    const courtSlots = slots.filter((s) => s.courtId === court.id && overlapsHour(s.startTime, s.endTime, hourStart));
    if (courtSlots.some((s) => s.status === 'blocked')) return { court, state: 'blocked', booking: null };
    if (courtSlots.some((s) => s.status === 'booked')) return { court, state: 'booked', booking: null };
    if (courtSlots.length > 0) return { court, state: 'free', booking: null };
    return { court, state: 'closed', booking: null };
  });
}

export interface CapacityHour {
  /** Minutos desde 00:00 do início da hora. */
  start: number;
  startTime: string;
  endTime: string;
  /** Quadras funcionando na hora, sem bloqueio nem manutenção. */
  capacity: number;
  booked: number;
  free: number;
  /** Reservas com quadra provisória (`unassigned`). */
  unassigned: number;
  occupancyPct: number;
}

export function hourSummary(hourStart: number, tiles: readonly BoardTile[]): CapacityHour {
  const booked = tiles.filter((t) => t.state === 'booked').length;
  const free = tiles.filter((t) => t.state === 'free').length;
  const capacity = booked + free;
  const unassigned = tiles.filter((t) => t.booking?.allocationStatus === 'unassigned').length;
  return {
    start: hourStart,
    startTime: hourLabel(hourStart),
    endTime: hourLabel(hourStart + 60),
    capacity,
    booked,
    free,
    unassigned,
    occupancyPct: capacity === 0 ? 0 : Math.round((booked * 100) / capacity),
  };
}

/** Horas do dia com alguma quadra funcionando (ou reservada), em ordem. */
export function buildCapacityHours(
  courts: readonly ArenaCourt[],
  slots: readonly ArenaSlot[],
  bookings: readonly ArenaBooking[],
): CapacityHour[] {
  const ids = new Set(courts.map((c) => c.id));
  const hours = new Set<number>();
  const add = (start: string, end: string) => {
    const [s, e] = span(start, end);
    for (let h = Math.floor(s / 60) * 60; h < e; h += 60) hours.add(h);
  };
  for (const s of slots) if (ids.has(s.courtId)) add(s.startTime, s.endTime);
  for (const b of bookings) if (ids.has(b.courtId) && holdsCourt(b)) add(b.startTime, b.endTime);
  return [...hours]
    .sort((a, b) => a - b)
    .map((h) => hourSummary(h, buildBoard(h, courts, slots, bookings)))
    .filter((h) => h.capacity > 0 || h.booked > 0);
}

/** Reservas da hora, provisórias primeiro, depois pelo nome da quadra. */
export function hourBookings(tiles: readonly BoardTile[]): ArenaBooking[] {
  const rows = tiles.filter((t) => t.booking).map((t) => ({ booking: t.booking!, court: t.court.name }));
  rows.sort((a, b) => {
    const pa = a.booking.allocationStatus === 'unassigned' ? 0 : 1;
    const pb = b.booking.allocationStatus === 'unassigned' ? 0 : 1;
    return pa - pb || a.court.localeCompare(b.court, 'pt-BR', { numeric: true });
  });
  return rows.map((r) => r.booking);
}

/** Reservas provisórias da hora que "Confirmar todas" fixa na quadra que já seguram. O clubinho
 *  fica de fora: ele é sempre provisório. */
export function provisionalBookings(tiles: readonly BoardTile[]): ArenaBooking[] {
  return hourBookings(tiles).filter((b) => b.allocationStatus === 'unassigned' && !b.clubSessionId);
}

/**
 * Por que soltar a reserva nesta quadra não dá, ou `null` se dá (o servidor confere tudo de novo).
 * Quadra com reserva provisória aceita: as duas trocam de lugar.
 */
export function dropBlockReason(booking: ArenaBooking, tile: BoardTile): string | null {
  if (!bookingCanChangeCourt(booking)) {
    if (booking.classSessionId) return 'Aula muda de quadra pela tela da aula.';
    if (booking.scheduleSubscriptionId) return 'Plano de horário muda de quadra pela tela do plano.';
    return 'Esta reserva não pode mudar de quadra.';
  }
  if (tile.court.id === booking.courtId) return null;
  if (tile.state === 'maintenance') return `${tile.court.name} está em manutenção.`;
  if (tile.state === 'blocked') return `${tile.court.name} está bloqueada nesse horário.`;
  if (tile.state === 'closed') return `${tile.court.name} não funciona nesse horário.`;
  if (booking.sportCode && tile.court.types.length > 0 && !tile.court.types.includes(booking.sportCode)) {
    return `${tile.court.name} não é de ${booking.sportLabel ?? 'esse esporte'}.`;
  }
  if (tile.state === 'booked' && tile.booking?.allocationStatus !== 'unassigned') {
    return `${tile.court.name} já tem reserva com quadra definida.`;
  }
  return null;
}

/** "Faltou" só depois do início, e só sem check-in/falta já marcados. */
export function bookingCanMarkNoShow(booking: ArenaBooking, now: Date): boolean {
  // Aula e clubinho têm presença por aluno/participante, não por reserva.
  if (!holdsCourt(booking) || booking.classSessionId || booking.clubSessionId) return false;
  if (booking.attendanceStatus === 'checked_in' || booking.attendanceStatus === 'no_show') return false;
  const [y, m, d] = booking.dateKey.split('-').map(Number);
  if (!y || !m || !d) return false;
  const start = new Date(y, m - 1, d, 0, minutesOf(booking.startTime));
  return now.getTime() >= start.getTime();
}

/** "Chegou" na janela do check-in da recepção (`checkInBookingByManager`): de 20 min antes do
 *  início até 15 min depois do fim. */
export function bookingCanCheckInNow(booking: ArenaBooking, now: Date): boolean {
  if (!bookingShowsCheckInAction(booking) || booking.classSessionId || booking.clubSessionId) return false;
  const [y, m, d] = booking.dateKey.split('-').map(Number);
  if (!y || !m || !d) return false;
  const [s, e] = span(booking.startTime, booking.endTime);
  const day = new Date(y, m - 1, d).getTime();
  const t = now.getTime();
  return t >= day + (s - 20) * 60_000 && t <= day + (e + 15) * 60_000;
}
