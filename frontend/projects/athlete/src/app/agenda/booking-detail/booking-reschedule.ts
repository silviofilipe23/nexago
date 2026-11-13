import { arenaSlotIsAvailable, sameCalendarDay, slotsQueryDateKey, timeToMinutes, type ArenaSlot } from '@nexago/arena-discovery';
import type { ArenaBookingDoc } from '../../data/arena-bookings-repository';

/**
 * "Remarcar reserva" do atleta — regras puras que espelham `rescheduleBlockReason` e
 * `newSlotProblem` (functions/src/arena-booking-reschedule.ts). O servidor confere tudo de novo;
 * aqui é só para mostrar o botão certo e os horários que fazem sentido.
 */

/** O mesmo prazo do cancelamento grátis. */
export const ATHLETE_RESCHEDULE_HOURS_BEFORE = 6;
/** Quantas vezes o atleta remarca a mesma reserva pelo app. */
export const MAX_ATHLETE_RESCHEDULES = 1;

const MOVABLE_STATUSES = new Set(['active', 'confirmed', 'pending_payment']);
const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

export type RescheduleEligibility =
  | { allowed: true }
  /** `hint`: texto curto no lugar do botão (prazo ou limite); `null` = não mostra nada. */
  | { allowed: false; hint: string | null };

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Início da reserva no fuso local; `null` se a data ou a hora são ilegíveis. */
export function bookingStartDate(dateKey: string, startTime: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec(startTime.trim());
  if (!d || !t) return null;
  return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
}

/** Duração em minutos (fim 00:00 = meia-noite); `null` se ilegível. */
export function bookingDurationMinutes(startTime: string, endTime: string): number | null {
  if (!/^\d{1,2}:\d{2}$/.test(startTime.trim()) || !/^\d{1,2}:\d{2}$/.test(endTime.trim())) return null;
  const start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime);
  if (end === 0 && start > 0) end = 24 * 60;
  return end > start ? end - start : null;
}

function contactArena(arenaName: string): string {
  const name = arenaName.trim();
  return name && name !== 'Arena' ? `fale com a ${name}` : 'fale com a arena';
}

/** O atleta `uid` pode remarcar esta reserva agora? */
export function rescheduleEligibility(booking: ArenaBookingDoc, uid: string | null, now: Date): RescheduleEligibility {
  const blocked = { allowed: false, hint: null } as const;
  if (!uid || booking.ownerAthleteId !== uid) return blocked;
  if (booking.seriesKind || booking.recurringBookingId) return blocked;
  if (!MOVABLE_STATUSES.has(booking.status.trim().toLowerCase())) return blocked;
  if (booking.weatherPendingChoice) return blocked;
  if (booking.attendanceStatus === 'checked_in' || booking.attendanceStatus === 'no_show') return blocked;
  const start = bookingStartDate(booking.dateKey, booking.startTime);
  if (!start || bookingDurationMinutes(booking.startTime, booking.endTime) == null) return blocked;
  if (now.getTime() >= start.getTime()) return blocked;
  if (now.getTime() >= start.getTime() - ATHLETE_RESCHEDULE_HOURS_BEFORE * 3_600_000) {
    return {
      allowed: false,
      hint: `Remarcação pelo app até ${ATHLETE_RESCHEDULE_HOURS_BEFORE}h antes do horário. Para mudar agora, ${contactArena(booking.arenaName)}.`,
    };
  }
  if ((booking.athleteRescheduleCount ?? 0) >= MAX_ATHLETE_RESCHEDULES) {
    return { allowed: false, hint: `Esta reserva já foi remarcada. Para mudar de novo, ${contactArena(booking.arenaName)}.` };
  }
  return { allowed: true };
}

export interface RescheduleTimeOption {
  startTime: string;
  endTime: string;
  /** Preço de tabela do horário novo; `null` quando a grade não traz preço. */
  priceReais: number | null;
  /** Custa mais que a reserva: o atleta não troca por ele pelo app. */
  pricier: boolean;
}

export interface RescheduleCurrentSlot {
  dateKey: string;
  courtId: string;
  startTime: string;
  endTime: string;
}

function hm(raw: string): string {
  const t = raw.trim();
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function slotEndMinutes(slot: ArenaSlot): number {
  const start = timeToMinutes(slot.startTime);
  const end = timeToMinutes(slot.endTime);
  return end <= start ? end + 24 * 60 : end;
}

/**
 * Inícios do dia `day` em que alguma quadra de `courtIds` tem a duração inteira livre e
 * contígua (os slots da própria reserva contam como livres). Sem passar da meia-noite, sem
 * horário já começado e sem o horário atual da reserva. `fixedPriceReais` substitui o preço dos
 * slots (preço do horário por esporte, na arena que define a quadra).
 */
export function buildRescheduleTimes(params: {
  daySlots: readonly ArenaSlot[];
  day: Date;
  courtIds: readonly string[];
  durationMinutes: number;
  now: Date;
  current: RescheduleCurrentSlot;
  tablePriceReais: number;
  fixedPriceReais?: number | null;
}): RescheduleTimeOption[] {
  const { day, current, durationMinutes } = params;
  if (durationMinutes <= 0) return [];
  const dayKey = slotsQueryDateKey(day);
  const ownStart = timeToMinutes(current.startTime);
  const ownEnd = ownStart + (bookingDurationMinutes(current.startTime, current.endTime) ?? 0);
  const byStart = new Map<string, RescheduleTimeOption>();

  for (const courtId of params.courtIds) {
    const slots = params.daySlots
      .filter((s) => s.courtId === courtId && sameCalendarDay(s.date, day))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    const isOwnCourtDay = dayKey === current.dateKey && courtId === current.courtId;
    const free = (s: ArenaSlot): boolean => {
      if (arenaSlotIsAvailable(s)) return true;
      if (!isOwnCourtDay) return false;
      const start = timeToMinutes(s.startTime);
      return start >= ownStart && slotEndMinutes(s) <= ownEnd;
    };

    for (let i = 0; i < slots.length; i++) {
      const startTime = hm(slots[i]!.startTime);
      if (byStart.has(startTime)) continue;
      if (dayKey === current.dateKey && startTime === hm(current.startTime)) continue;
      const startAt = bookingStartDate(dayKey, startTime);
      if (!startAt || startAt.getTime() <= params.now.getTime()) continue;

      let cursor = timeToMinutes(startTime);
      const target = cursor + durationMinutes;
      let price: number | null = 0;
      let ok = true;
      for (let j = i; j < slots.length && cursor < target; j++) {
        const s = slots[j]!;
        if (timeToMinutes(s.startTime) !== cursor || !free(s)) {
          ok = false;
          break;
        }
        price = price != null && s.priceReais != null ? price + s.priceReais : null;
        cursor = slotEndMinutes(s);
      }
      if (!ok || cursor !== target || target > 24 * 60) continue;

      const priceReais = params.fixedPriceReais ?? (price == null ? null : Math.round(price * 100) / 100);
      byStart.set(startTime, {
        startTime,
        endTime: target === 24 * 60 ? '00:00' : `${pad2(Math.floor(target / 60))}:${pad2(target % 60)}`,
        priceReais,
        pricier: priceReais != null && params.tablePriceReais > 0 && priceReais > params.tablePriceReais + 0.009,
      });
    }
  }

  return [...byStart.values()].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
}

/** "qui, 06/08". */
export function shortDayLabel(dateKey: string): string {
  const d = bookingStartDate(dateKey, '00:00');
  if (!d) return dateKey;
  return `${WEEKDAY_SHORT[d.getDay()]}, ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

/** "Reserva remarcada para qui, 06/08 às 18:00." */
export function rescheduledNotice(dateKey: string, startTime: string): string {
  return `Reserva remarcada para ${shortDayLabel(dateKey)} às ${startTime}.`;
}
