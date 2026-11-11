import type { ArenaSlot, ArenaSlotStatus } from './arena-slot.model';

/** `start` e os horários seguintes da mesma quadra no mesmo dia, enquanto estiverem no
 *  `status` dele e colados (fim de um = início do outro). Para no primeiro horário de outro
 *  status ou buraco da grade — nunca pula por cima, senão "bloquear até 14h" bloquearia em
 *  volta de uma reserva que o gestor nem viu. */
function consecutiveSlotsWithStatus(pool: readonly ArenaSlot[], start: ArenaSlot, status: ArenaSlotStatus): ArenaSlot[] {
  if (start.status !== status) return [];
  const court = start.courtId.toLowerCase();
  const sameLane = pool
    .filter((s) => s.dateKey === start.dateKey && s.courtId.toLowerCase() === court && s.startTime > start.startTime)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const chain = [start];
  for (const next of sameLane) {
    const last = chain[chain.length - 1];
    if (next.startTime !== last.endTime || next.status !== status) break;
    chain.push(next);
  }
  return chain;
}

/** Horários que dá pra bloquear de uma vez a partir de `start` (livres e seguidos). */
export function consecutiveBlockableSlots(pool: readonly ArenaSlot[], start: ArenaSlot): ArenaSlot[] {
  return consecutiveSlotsWithStatus(pool, start, 'available');
}

/** Horários que dá pra desbloquear de uma vez a partir de `start` (bloqueados e seguidos). */
export function consecutiveUnblockableSlots(pool: readonly ArenaSlot[], start: ArenaSlot): ArenaSlot[] {
  return consecutiveSlotsWithStatus(pool, start, 'blocked');
}
