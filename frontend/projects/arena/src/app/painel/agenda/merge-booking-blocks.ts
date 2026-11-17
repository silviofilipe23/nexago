/** Bloco da grade (dia ou semana) no mínimo necessário pra fundir horários vizinhos. */
export interface MergeableAgendaBlock {
  courtId: string;
  start: number;
  dur: number;
  status: string;
  /** Só na grade semanal — na do dia todos os blocos são do mesmo dia. */
  dateKey?: string;
}

/** Reserva de mais de uma hora vira um bloco contínuo na grade: horários colados (fim de um =
 *  início do outro) com a mesma chave — o `bookingId` — na mesma quadra e dia são fundidos num
 *  só. O bloco resultante mantém os campos do primeiro horário (id, cliente, selo), então o
 *  clique continua abrindo a mesma reserva. Blocos sem chave (livre, bloqueado, manutenção)
 *  passam intactos. Não muta a entrada. */
export function mergeConsecutiveBookingBlocks<T extends MergeableAgendaBlock>(
  blocks: readonly T[],
  keyOf: (block: T) => string | null | undefined,
): T[] {
  const result: T[] = [];
  const groups = new Map<string, T[]>();

  for (const block of blocks) {
    const key = keyOf(block);
    if (!key) {
      result.push(block);
      continue;
    }
    const groupKey = [block.dateKey ?? '', block.courtId, block.status, key].join('|');
    const group = groups.get(groupKey);
    if (group) group.push(block);
    else groups.set(groupKey, [block]);
  }

  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.start - b.start);
    let current = sorted[0];
    for (const next of sorted.slice(1)) {
      if (current.start + current.dur === next.start) {
        current = { ...current, dur: next.start + next.dur - current.start };
      } else {
        result.push(current);
        current = next;
      }
    }
    result.push(current);
  }

  return result;
}
