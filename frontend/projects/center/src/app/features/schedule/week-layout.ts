import { addDays, startOfWeek, timeToMinutes } from '../../domain/dates';

/** Faixa visível da grade: 06h–22h. */
export const GRID_START_MIN = 6 * 60;
export const GRID_END_MIN = 22 * 60;
export const GRID_HOURS = (GRID_END_MIN - GRID_START_MIN) / 60;

export interface Timed {
  startTime: string;
  durationMin: number;
}

export interface LaidBlock<T> {
  item: T;
  /** Minutos desde o início da grade (já cortado na faixa visível). */
  top: number;
  height: number;
  /** Coluna dentro do grupo de aulas sobrepostas, e quantas colunas o grupo tem. */
  lane: number;
  lanes: number;
}

/** Os 7 dias (segunda → domingo) da semana que contém `day`. */
export function weekDays(day: string): string[] {
  const start = startOfWeek(day);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * Posiciona as aulas de UM dia: topo/altura pelo horário, e aulas que se sobrepõem dividem a
 * largura em colunas (senão uma cobre a outra e some o clique). Fora da faixa 06–22h é cortado.
 */
export function layoutDay<T extends Timed>(items: T[], startMin = GRID_START_MIN, endMin = GRID_END_MIN): LaidBlock<T>[] {
  const sorted = items
    .map((item) => {
      const s = timeToMinutes(item.startTime);
      return { item, s, e: s + item.durationMin };
    })
    .filter((x) => x.e > startMin && x.s < endMin)
    .sort((a, b) => a.s - b.s || b.e - a.e);

  const out: LaidBlock<T>[] = [];
  let group: { block: LaidBlock<T>; e: number }[] = [];
  let groupEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...group.map((g) => g.block.lane + 1));
    group.forEach((g) => (g.block.lanes = lanes));
    group = [];
  };
  for (const x of sorted) {
    if (x.s >= groupEnd && group.length) {
      flush();
    }
    // Primeira coluna livre do grupo atual.
    const busy = new Set(group.filter((g) => g.e > x.s).map((g) => g.block.lane));
    let lane = 0;
    while (busy.has(lane)) {
      lane++;
    }
    const top = Math.max(x.s, startMin) - startMin;
    const block: LaidBlock<T> = { item: x.item, top, height: Math.min(x.e, endMin) - startMin - top, lane, lanes: 1 };
    group.push({ block, e: x.e });
    out.push(block);
    groupEnd = Math.max(groupEnd, x.e);
  }
  if (group.length) {
    flush();
  }
  return out;
}

/** Posição da linha "agora" em minutos desde o início da grade; null fora da faixa. */
export function nowOffset(time: string, startMin = GRID_START_MIN, endMin = GRID_END_MIN): number | null {
  const m = timeToMinutes(time);
  return m < startMin || m > endMin ? null : m - startMin;
}
