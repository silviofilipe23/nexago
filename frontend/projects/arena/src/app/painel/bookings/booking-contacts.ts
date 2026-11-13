import { httpsCallable, type Functions } from 'firebase/functions';
import type { ArenaBooking } from './arena-booking.model';

/** WhatsApp dos jogadores da reserva (callable `getArenaBookingContacts`): o telefone do
 *  atleta é privado, só o servidor lê. Volta `uid → dígitos do wa.me`, só de quem tem número. */
export async function fetchBookingContacts(functions: Functions, bookingId: string): Promise<ReadonlyMap<string, string>> {
  const call = httpsCallable<{ bookingId: string }, { contacts: Array<{ uid: string; whatsapp: string }> }>(
    functions,
    'getArenaBookingContacts',
  );
  const { contacts } = (await call({ bookingId })).data;
  return new Map(contacts.map((c) => [c.uid, c.whatsapp]));
}

/** Uids que a callable olha (dono + convidados + placar): muda quando alguém entra, e aí vale buscar de novo. */
export function bookingContactsKey(
  b: Pick<ArenaBooking, 'id' | 'athleteId' | 'participants' | 'resultPlayers'> | null,
): string | null {
  if (!b?.athleteId) return null;
  return [b.id, b.athleteId, ...(b.participants ?? []).map((p) => p.uid), ...(b.resultPlayers ?? []).map((p) => p.uid)].join('|');
}

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Mensagem curta pro jogador: "Oi, Rafael! Aqui é da Arena Sol, sobre a reserva de quarta, 18/11, 19:00–20:30, na Quadra 7." */
export function bookingWhatsappText(
  b: Pick<ArenaBooking, 'dateKey' | 'startTime' | 'endTime' | 'courtName' | 'allocationStatus'>,
  playerName: string,
  arenaName: string | null,
): string {
  const [y, m, d] = b.dateKey.split('-').map(Number);
  const date = y && m && d ? `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}` : b.dateKey;
  const first = playerName.trim().split(/\s+/)[0] ?? '';
  const hello = first ? `Oi, ${first}!` : 'Oi!';
  const about = arenaName?.trim() ? ` Aqui é da ${arenaName.trim()}, sobre` : ' Sobre';
  const court = b.allocationStatus === 'unassigned' || !b.courtName ? '' : `, na ${b.courtName}`;
  return `${hello}${about} a reserva de ${date}, ${b.startTime}–${b.endTime}${court}.`;
}

export function whatsappLink(digits: string, text: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
