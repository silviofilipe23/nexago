import { bookingIsActive, type ArenaBooking } from '../bookings/arena-booking.model';
import type { ArenaSlot } from './arena-slot.model';

/** Espelha `ArenaScheduleGrouping` (Flutter, parte relevante pro painel web). */

function timeToMinutes(value: string): number | null {
  const parts = value.trim().split(':');
  if (parts.length === 0) return null;
  const hh = Number(parts[0]) || 0;
  const mm = parts.length > 1 ? Number(parts[1]) || 0 : 0;
  return hh * 60 + mm;
}

function slotOverlapsBooking(slot: Pick<ArenaSlot, 'startTime' | 'endTime'>, bookingStart: string, bookingEnd: string): boolean {
  const ss = timeToMinutes(slot.startTime);
  let se = timeToMinutes(slot.endTime);
  const bs = timeToMinutes(bookingStart);
  let be = timeToMinutes(bookingEnd);
  if (ss == null || se == null || bs == null || be == null) return false;
  if (se <= ss) se += 24 * 60;
  if (be <= bs) be += 24 * 60;
  return ss < be && bs < se;
}

/** Garante que reservas em `arenaBookings` apareçam na grade mesmo se o doc em `arenaSlots`
 *  não tiver sido criado/atualizado em sincronia (webhook, corrida de escrita etc.). Só
 *  reservas ATIVAS entram no overlay — uma cancelada não pode prender o horário como ocupado
 *  (o Flutter não filtra isso na função equivalente, mas deixar passar seria mostrar um
 *  horário cancelado como indisponível, o que não serve a ninguém). */
export function applyBookingsOverlay(slots: readonly ArenaSlot[], bookings: readonly ArenaBooking[], dateKey: string): ArenaSlot[] {
  if (!dateKey || bookings.length === 0) return [...slots];
  const dayBookings = bookings.filter((b) => b.dateKey === dateKey && bookingIsActive(b));
  if (dayBookings.length === 0) return [...slots];

  return slots.map((slot) => {
    if (slot.status === 'booked' || slot.status === 'blocked') return slot;
    for (const b of dayBookings) {
      const bookingCourt = b.courtId.trim();
      if (bookingCourt && bookingCourt.toLowerCase() !== slot.courtId.trim().toLowerCase()) continue;
      if (!slotOverlapsBooking(slot, b.startTime, b.endTime)) continue;
      return { ...slot, status: 'booked' as const, bookingId: b.id, bookingAthleteId: b.athleteId || null };
    }
    return slot;
  });
}

export type ArenaScheduleStatusFilter = 'all' | 'available' | 'booked' | 'blocked';

export function applyScheduleFilters(slots: readonly ArenaSlot[], statusFilter: ArenaScheduleStatusFilter, courtId: string | null): ArenaSlot[] {
  return slots.filter((s) => {
    if (courtId && s.courtId !== courtId) return false;
    if (statusFilter === 'all') return true;
    return s.status === statusFilter;
  });
}

export interface ArenaScheduleDayStats {
  total: number;
  available: number;
  booked: number;
  blocked: number;
}

export function scheduleDayStats(slots: readonly ArenaSlot[]): ArenaScheduleDayStats {
  let available = 0;
  let booked = 0;
  let blocked = 0;
  for (const s of slots) {
    if (s.status === 'booked') booked++;
    else if (s.status === 'blocked') blocked++;
    else available++;
  }
  return { total: slots.length, available, booked, blocked };
}
