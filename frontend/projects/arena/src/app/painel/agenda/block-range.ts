import type { ArenaSlot } from './arena-slot.model';

/** Horários que dá pra bloquear de uma vez a partir de `start`: ele mesmo e os seguintes da
 *  mesma quadra no mesmo dia, enquanto estiverem livres e colados (fim de um = início do
 *  outro). Para no primeiro reservado/bloqueado ou buraco da grade — nunca pula por cima,
 *  senão "bloquear até 14h" bloquearia em volta de uma reserva que o gestor nem viu. */
export function consecutiveBlockableSlots(pool: readonly ArenaSlot[], start: ArenaSlot): ArenaSlot[] {
  if (start.status !== 'available') return [];
  const court = start.courtId.toLowerCase();
  const sameLane = pool
    .filter((s) => s.dateKey === start.dateKey && s.courtId.toLowerCase() === court && s.startTime > start.startTime)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const chain = [start];
  for (const next of sameLane) {
    const last = chain[chain.length - 1];
    if (next.startTime !== last.endTime || next.status !== 'available') break;
    chain.push(next);
  }
  return chain;
}
