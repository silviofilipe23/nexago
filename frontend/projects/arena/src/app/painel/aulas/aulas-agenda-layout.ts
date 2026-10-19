import { minutesOf } from './class.model';

export interface DayBlockInput {
  id: string;
  startTime: string;
  endTime: string;
}

export interface DayBlockLayout {
  id: string;
  startMin: number;
  endMin: number;
  /** Faixa (0…lanes-1) dentro do grupo de aulas que se sobrepõem. */
  lane: number;
  lanes: number;
}

/**
 * Aulas que se cruzam no mesmo dia ficam lado a lado (protótipo: Vôlei 18:00–19:30 e
 * particular 19:00–20:00). Cada grupo conectado de sobreposições divide a largura pelo
 * número de faixas que ele precisa.
 */
export function layoutDayBlocks(blocks: readonly DayBlockInput[]): DayBlockLayout[] {
  const items = blocks
    .map((b) => {
      const startMin = minutesOf(b.startTime);
      let endMin = minutesOf(b.endTime);
      if (endMin <= startMin) endMin = 24 * 60;
      return { id: b.id, startMin, endMin, lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const out: DayBlockLayout[] = [];
  let group: typeof items = [];
  let groupEnd = -1;
  let laneEnds: number[] = [];

  const flush = () => {
    for (const g of group) g.lanes = laneEnds.length;
    out.push(...group);
    group = [];
    laneEnds = [];
    groupEnd = -1;
  };

  for (const item of items) {
    if (group.length > 0 && item.startMin >= groupEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.endMin);
    } else {
      laneEnds[lane] = item.endMin;
    }
    item.lane = lane;
    group.push(item);
    groupEnd = Math.max(groupEnd, item.endMin);
  }
  if (group.length > 0) flush();
  return out;
}

/** Janela de horas da grade: 07–21 por padrão, esticada para caber todas as aulas. */
export function agendaHourRange(blocks: readonly DayBlockInput[], defaults: [number, number] = [7, 21]): [number, number] {
  let [from, to] = defaults;
  for (const b of blocks) {
    from = Math.min(from, Math.floor(minutesOf(b.startTime) / 60));
    let end = minutesOf(b.endTime);
    if (end <= minutesOf(b.startTime)) end = 24 * 60;
    to = Math.max(to, Math.ceil(end / 60));
  }
  return [Math.max(0, from), Math.min(24, to)];
}
