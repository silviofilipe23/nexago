import { httpsCallable, type Functions } from 'firebase/functions';
import type { ArenaCourt } from '../courts/court.model';
import type { ArenaBooking } from './arena-booking.model';

/** Trocar a quadra de uma reserva (callable `changeArenaBookingCourt`). O servidor confere tudo
 *  de novo (travas, bloqueio, esporte, horário); aqui só decide se o botão aparece e quais
 *  quadras o modal oferece. Ver `docs/product/reservas-por-capacidade.md`, PR 1. */

type CourtChangeBooking = Pick<
  ArenaBooking,
  'status' | 'courtId' | 'sportCode' | 'classSessionId' | 'clubSessionId' | 'scheduleSubscriptionId'
> & Partial<Pick<ArenaBooking, 'allocationStatus'>>;

/** Aula e plano de horário trocam de quadra pela própria tela (a série manda nas travas). O
 *  clubinho troca aqui: muda a quadra de uma sessão (um dia). */
export function bookingCanChangeCourt(booking: CourtChangeBooking): boolean {
  if (booking.classSessionId || booking.scheduleSubscriptionId) return false;
  const s = booking.status.toLowerCase().trim();
  return s === 'active' || s === 'confirmed' || s === 'pending_payment';
}

/** Quadras que podem receber a reserva: ativas, do esporte dela (quadra sem esporte cadastrado
 *  aceita), menos a atual. Mesma regra de `targetCourtBlockReason` no servidor. */
export function courtChangeOptions(booking: CourtChangeBooking, courts: readonly ArenaCourt[]): ArenaCourt[] {
  return courts.filter((c) => {
    if (c.id === booking.courtId) return false;
    if (c.status === 'maintenance') return false;
    if (booking.sportCode && c.types.length > 0 && !c.types.includes(booking.sportCode)) return false;
    return true;
  });
}

export interface CourtChangeOption {
  court: ArenaCourt;
  /** Quadra provisória de uma reserva sem quadra definida — escolher ela só confirma. */
  provisional: boolean;
}

/** Opções do modal: reserva sem quadra definida oferece também a provisória (primeiro); as
 *  outras, como em `courtChangeOptions`. */
export function courtAssignOptions(booking: CourtChangeBooking, courts: readonly ArenaCourt[]): CourtChangeOption[] {
  const others = courtChangeOptions(booking, courts).map((court) => ({ court, provisional: false }));
  // Clubinho fica sempre provisório: confirmar na própria quadra não muda nada.
  if (booking.allocationStatus !== 'unassigned' || booking.clubSessionId) return others;
  const current = courts.find((c) => c.id === booking.courtId);
  return current ? [{ court: current, provisional: true }, ...others] : others;
}

export interface ChangeBookingCourtResult {
  changed: boolean;
  bookingId: string;
  courtId: string;
  courtName: string;
  /** A reserva estava sem quadra definida e agora tem. */
  assigned?: boolean;
}

export class BookingCourtChangeError extends Error {}

/** "sex, 14/11" a partir de `AAAA-MM-DD`. */
export function clubSessionDayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  const wd = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(y, m - 1, d).getDay()];
  return `${wd}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

export async function changeBookingCourt(
  functions: Functions,
  input: { bookingId: string; toCourtId: string; reason: string | null },
): Promise<ChangeBookingCourtResult> {
  const call = httpsCallable<typeof input, ChangeBookingCourtResult>(functions, 'changeArenaBookingCourt');
  try {
    return (await call(input)).data;
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : 'Não foi possível trocar a quadra.';
    throw new BookingCourtChangeError(message);
  }
}
