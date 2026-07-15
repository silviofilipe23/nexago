import { ARENA_WEEKDAYS, type ArenaWeekday } from '../profile/courts-schedule-repository';
import { virtualSlot, type ArenaSlot } from './arena-slot.model';

/** Espelha `VirtualSlotGenerator` (Flutter) — gera os horários possíveis de uma quadra num dia
 *  a partir de `availabilitySchedule`/`slotDurationMinutes` do doc da quadra; sem agenda
 *  configurada, cai em 08:00–22:00 de hora em hora (mesmo fallback do app). Sem preço/promoção
 *  aqui: a Agenda do gestor só precisa saber disponível/ocupado/bloqueado, não cotar reserva. */

const DEFAULT_DURATION_MIN = 60;
const DEFAULT_START_MIN = 8 * 60;
const DEFAULT_END_MIN = 22 * 60;

interface MinRange {
  startMin: number;
  endMin: number;
}

function fmt(minutes: number): string {
  const w = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(w / 60);
  const m = w % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseHm(v: unknown): number | null {
  if (typeof v === 'string') {
    const parts = v.trim().split(':');
    if (parts.length >= 2) {
      const h = Number(parts[0]) || 0;
      const m = Number(parts[1]) || 0;
      return h * 60 + Math.min(59, Math.max(0, m));
    }
  }
  if (typeof v === 'number') return v;
  return null;
}

function rangeFromStartEnd(startMin: number | null, endMin: number | null): MinRange | null {
  if (startMin == null || endMin == null) return null;
  let end = endMin;
  if (end === 0 && startMin > 0) end = 24 * 60;
  return end > startMin ? { startMin, endMin: end } : null;
}

function parseDayEntry(dayEntry: unknown): MinRange[] {
  if (dayEntry == null) return [];
  if (Array.isArray(dayEntry)) {
    const out: MinRange[] = [];
    for (const e of dayEntry) {
      if (e && typeof e === 'object') {
        const rec = e as Record<string, unknown>;
        const start = rec['start'] ?? rec['from'] ?? rec['open'];
        const end = rec['end'] ?? rec['to'] ?? rec['close'];
        const range = rangeFromStartEnd(parseHm(start), parseHm(end));
        if (range) out.push(range);
      }
    }
    return out;
  }
  if (typeof dayEntry === 'object') {
    const rec = dayEntry as Record<string, unknown>;
    const start = rec['start'] ?? rec['from'];
    const end = rec['end'] ?? rec['to'];
    const range = rangeFromStartEnd(parseHm(start), parseHm(end));
    if (range) return [range];
  }
  return [];
}

function isExplicitlyClosed(dayEntry: unknown): boolean {
  if (typeof dayEntry === 'string') return dayEntry.trim().toLowerCase() === 'closed';
  if (typeof dayEntry === 'boolean') return dayEntry === false;
  if (Array.isArray(dayEntry)) return dayEntry.length === 0;
  if (dayEntry && typeof dayEntry === 'object') return (dayEntry as Record<string, unknown>)['closed'] === true;
  return false;
}

/** `date.getDay()` é 0=domingo…6=sábado; convertido pra ISO 1=segunda…7=domingo. */
function isoWeekday(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

function readRanges(courtData: Record<string, unknown> | undefined, date: Date): MinRange[] {
  const sched = courtData?.['availabilitySchedule'];
  const weekday = isoWeekday(date);
  if (sched && typeof sched === 'object' && !Array.isArray(sched)) {
    const key: ArenaWeekday = ARENA_WEEKDAYS[weekday - 1]!;
    const dayEntry = (sched as Record<string, unknown>)[key];
    if (dayEntry !== undefined) {
      if (isExplicitlyClosed(dayEntry)) return [];
      if (Array.isArray(dayEntry) && dayEntry.length === 0) return [];
      return parseDayEntry(dayEntry);
    }
  }
  return [{ startMin: DEFAULT_START_MIN, endMin: DEFAULT_END_MIN }];
}

export function readSlotDurationMinutes(courtData: Record<string, unknown> | undefined): number {
  const v = courtData?.['slotDurationMinutes'];
  const n = typeof v === 'number' ? v : DEFAULT_DURATION_MIN;
  return n < 15 || n > 240 ? DEFAULT_DURATION_MIN : n;
}

export function buildVirtualSlots(arenaId: string, courtId: string, courtData: Record<string, unknown> | undefined, date: Date, dateKey: string): ArenaSlot[] {
  const duration = readSlotDurationMinutes(courtData);
  const ranges = readRanges(courtData, date);

  const slots: ArenaSlot[] = [];
  for (const range of ranges) {
    let cursor = range.startMin;
    while (cursor + duration <= range.endMin) {
      slots.push(virtualSlot(arenaId, courtId, dateKey, fmt(cursor), fmt(cursor + duration)));
      cursor += duration;
    }
  }
  return slots;
}

function timeKey(s: Pick<ArenaSlot, 'startTime' | 'endTime'>): string {
  return `${s.startTime}_${s.endTime}`;
}

function parseHmMinutes(time: string): number | null {
  return parseHm(time);
}

function overlaps(a: Pick<ArenaSlot, 'startTime' | 'endTime'>, b: Pick<ArenaSlot, 'startTime' | 'endTime'>): boolean {
  const aStart = parseHmMinutes(a.startTime);
  let aEnd = parseHmMinutes(a.endTime);
  const bStart = parseHmMinutes(b.startTime);
  let bEnd = parseHmMinutes(b.endTime);
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return false;
  if (aEnd <= aStart) aEnd += 24 * 60;
  if (bEnd <= bStart) bEnd += 24 * 60;
  return aStart < bEnd && bStart < aEnd;
}

/** Mescla: pra cada janela virtual, se existir doc persistido com mesmo horário, mantém o
 *  persistido; senão, se um doc persistido se sobrepõe (reservado/bloqueado), herda o status
 *  dele — espelha `VirtualSlotGenerator.merge`. */
export function mergeSlots(persisted: ArenaSlot[], virtual: ArenaSlot[]): ArenaSlot[] {
  const byTime = new Map<string, ArenaSlot>();
  for (const p of persisted) byTime.set(timeKey(p), p);

  const out: ArenaSlot[] = [];
  const usedKeys = new Set<string>();

  for (const v of virtual) {
    const k = timeKey(v);
    const exact = byTime.get(k);
    if (exact) {
      out.push(exact);
      usedKeys.add(k);
      continue;
    }
    const overlap = persisted.find((p) => overlaps(p, v) && (p.status === 'booked' || p.status === 'blocked'));
    if (overlap) {
      out.push({ ...v, status: overlap.status, bookingId: overlap.bookingId, bookingAthleteId: overlap.bookingAthleteId });
      usedKeys.add(timeKey(overlap));
    } else {
      out.push(v);
    }
  }

  for (const p of persisted) {
    if (!usedKeys.has(timeKey(p))) out.push(p);
  }

  out.sort((a, b) => a.startTime.localeCompare(b.startTime));
  return out;
}
