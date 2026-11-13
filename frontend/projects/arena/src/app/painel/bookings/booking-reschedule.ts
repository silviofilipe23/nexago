import { httpsCallable, type Functions } from 'firebase/functions';
import type { ArenaSlot } from '../agenda/arena-slot.model';
import type { ArenaCourt } from '../courts/court.model';
import { dateKeyOf, formatBRL, type ArenaBooking } from './arena-booking.model';
import { bookingWindow } from './booking-detail';
import { courtChangeOptions } from './booking-court-change';

/** Remarcar uma reserva avulsa (callable `rescheduleArenaBooking`): outro dia/horário e, se a
 *  reserva tem quadra definida, outra quadra. A duração e o valor ficam. O servidor confere tudo
 *  de novo (travas, bloqueio, horizonte); aqui só decide se o botão aparece e quais horários o
 *  modal oferece. Regras espelhadas de `rescheduleBlockReason` (papel `arena`). */

/** Mesmo teto do servidor (`RESCHEDULE_HORIZON_DAYS`): hoje + 34 dias. */
export const RESCHEDULE_HORIZON_DAYS = 34;

const MOVABLE_STATUSES = new Set(['active', 'confirmed', 'pending_payment']);

type RescheduleBooking = Pick<
  ArenaBooking,
  | 'status'
  | 'attendanceStatus'
  | 'dateKey'
  | 'startTime'
  | 'endTime'
  | 'classSessionId'
  | 'scheduleSubscriptionId'
  | 'isRecurring'
  | 'recurringBookingId'
  | 'clubSessionId'
> &
  Partial<Pick<ArenaBooking, 'scheduleFlexMinutes' | 'weatherPendingChoice'>>;

/** Aula, plano de horário, horário fixo e clubinho mudam de horário pela própria série; a
 *  reserva com minutos do plano (modo livre) cancela e reserva de novo. Até o fim do horário. */
export function bookingCanReschedule(booking: RescheduleBooking, nowMs: number): boolean {
  if (booking.classSessionId || booking.scheduleSubscriptionId) return false;
  if (booking.isRecurring || booking.recurringBookingId) return false;
  if (booking.clubSessionId) return false;
  if ((booking.scheduleFlexMinutes ?? 0) > 0) return false;
  if (!MOVABLE_STATUSES.has(booking.status.toLowerCase().trim())) return false;
  if (booking.weatherPendingChoice) return false;
  if (booking.attendanceStatus === 'checked_in' || booking.attendanceStatus === 'no_show') return false;
  const window = bookingWindow(booking);
  return window != null && nowMs < window.end.getTime();
}

function minutesOf(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function hm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Duração em minutos (fim "00:00" = meia-noite); `null` se ilegível. */
export function bookingDurationMinutes(booking: Pick<ArenaBooking, 'startTime' | 'endTime'>): number | null {
  const s = minutesOf(booking.startTime);
  let e = minutesOf(booking.endTime);
  if (s == null || e == null) return null;
  if (e === 0 && s > 0) e = 24 * 60;
  return e > s ? e - s : null;
}

/** Dias que o seletor aceita: hoje até hoje + 34 (`AAAA-MM-DD`). */
export function rescheduleDateBounds(now: Date): { min: string; max: string } {
  const max = new Date(now.getFullYear(), now.getMonth(), now.getDate() + RESCHEDULE_HORIZON_DAYS);
  return { min: dateKeyOf(now), max: dateKeyOf(max) };
}

/** Quadras que o modal oferece: a atual primeiro, depois as ativas do mesmo esporte. */
export function rescheduleCourtOptions(
  booking: Parameters<typeof courtChangeOptions>[0],
  courts: readonly ArenaCourt[],
): ArenaCourt[] {
  const current = courts.find((c) => c.id === booking.courtId);
  const others = courtChangeOptions(booking, courts);
  return current ? [current, ...others] : others;
}

export interface RescheduleStartOption {
  startTime: string;
  endTime: string;
}

/**
 * Inícios livres numa quadra num dia: cada slot é candidato a início, e todos os slots que
 * cobrem [início, início + duração) precisam estar livres e encadeados (o fim de um é o início
 * do próximo). Livre = `available` ou ocupado pela própria reserva. `slots` já vem com o overlay
 * das reservas (`applyBookingsOverlay`). Tira o horário que a reserva já ocupa e o que já passou.
 */
export function rescheduleStartOptions(params: {
  slots: readonly ArenaSlot[];
  courtId: string;
  dateKey: string;
  durationMinutes: number;
  booking: Pick<ArenaBooking, 'id' | 'courtId' | 'dateKey' | 'startTime'>;
  now: Date;
}): RescheduleStartOption[] {
  const { courtId, dateKey, durationMinutes, booking, now } = params;
  if (durationMinutes <= 0) return [];
  const court = courtId.trim().toLowerCase();
  const free = new Map<number, number>();
  for (const s of params.slots) {
    if (s.dateKey !== dateKey || s.courtId.trim().toLowerCase() !== court) continue;
    const isFree = s.status === 'available' || (s.status === 'booked' && s.bookingId === booking.id);
    if (!isFree) continue;
    const start = minutesOf(s.startTime);
    let end = minutesOf(s.endTime);
    if (start == null || end == null) continue;
    if (end === 0 && start > 0) end = 24 * 60;
    if (end <= start) continue;
    // Dois slots no mesmo início (persistido + virtual): vale o que vai mais longe.
    free.set(start, Math.max(free.get(start) ?? 0, end));
  }

  const [y, m, d] = dateKey.split('-').map(Number);
  const dayMs = y && m && d ? new Date(y, m - 1, d).getTime() : NaN;
  const sameSpot = dateKey === booking.dateKey && court === booking.courtId.trim().toLowerCase();
  const current = minutesOf(booking.startTime);

  const out: RescheduleStartOption[] = [];
  for (const start of [...free.keys()].sort((a, b) => a - b)) {
    const end = start + durationMinutes;
    if (end > 24 * 60) continue;
    if (sameSpot && start === current) continue;
    if (!(dayMs + start * 60_000 > now.getTime())) continue;
    let cursor = start;
    while (cursor < end) {
      const next = free.get(cursor);
      if (next == null) break;
      cursor = next;
    }
    if (cursor < end) continue;
    out.push({ startTime: hm(start), endTime: end === 24 * 60 ? '00:00' : hm(end) });
  }
  return out;
}

/** Junta os inícios livres de várias quadras (reserva sem quadra definida: o servidor escolhe). */
export function mergeStartOptions(lists: readonly (readonly RescheduleStartOption[])[]): RescheduleStartOption[] {
  const byStart = new Map<string, RescheduleStartOption>();
  for (const list of lists) for (const o of list) if (!byStart.has(o.startTime)) byStart.set(o.startTime, o);
  return [...byStart.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export interface RescheduleBookingInput {
  bookingId: string;
  date: string;
  startTime: string;
  courtId?: string;
  reason?: string;
}

export interface RescheduleBookingResult {
  bookingId: string;
  date: string;
  startTime: string;
  endTime: string;
  courtId: string;
  courtName: string;
  courtChanged: boolean;
  /** Diferença de tabela (novo − antigo). O valor da reserva não muda. */
  tablePriceDiffReais: number;
}

export class BookingRescheduleError extends Error {}

/** "qui, 06/08" a partir de `AAAA-MM-DD`. */
function shortDayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  const wd = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(y, m - 1, d).getDay()];
  return `${wd}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/** Aviso depois de remarcar: com diferença de tabela, lembra que o valor não mudou. */
export function rescheduleSuccessMessage(result: RescheduleBookingResult): string {
  const diff = result.tablePriceDiffReais;
  if (diff > 0) {
    return `Remarcada. Pela tabela, o novo horário custa ${formatBRL(diff)} a mais — o valor da reserva não mudou; acerte a diferença no balcão.`;
  }
  if (diff < 0) {
    return `Remarcada. Pela tabela, o novo horário custa ${formatBRL(-diff)} a menos — o valor da reserva não mudou; acerte a diferença no balcão.`;
  }
  const court = result.courtChanged ? `, na ${result.courtName}` : '';
  return `Reserva remarcada para ${shortDayLabel(result.date)} às ${result.startTime}${court}.`;
}

export async function rescheduleBooking(functions: Functions, input: RescheduleBookingInput): Promise<RescheduleBookingResult> {
  const call = httpsCallable<RescheduleBookingInput & { as: 'arena' }, RescheduleBookingResult>(functions, 'rescheduleArenaBooking');
  try {
    return (await call({ ...input, as: 'arena' })).data;
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : 'Não foi possível remarcar a reserva.';
    throw new BookingRescheduleError(message);
  }
}
