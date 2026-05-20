import { arenaSlotVirtual, type ArenaSlot } from './arena-slot';
import { timeToMinutes } from './arena-slot';
import { virtualSlotPricing } from './court-pricing';
import type { ArenaPromotion } from './arena-promotion';
import type { SlotsQuery } from './slots-query';

const DEFAULT_DURATION_MIN = 60;
const DEFAULT_START_MIN = 8 * 60;
const DEFAULT_END_MIN = 22 * 60;

const WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

interface MinRange {
  startMin: number;
  endMin: number;
}

export function readSlotDurationMinutes(
  courtData: Record<string, unknown> | null | undefined,
): number {
  const v = courtData?.['slotDurationMinutes'];
  const n = typeof v === 'number' ? v : DEFAULT_DURATION_MIN;
  if (n < 15 || n > 240) {
    return DEFAULT_DURATION_MIN;
  }
  return n;
}

export function mergeSlots(persisted: ArenaSlot[], virtual: ArenaSlot[]): ArenaSlot[] {
  const byTime = new Map<string, ArenaSlot>();
  for (const p of persisted) {
    byTime.set(timeKey(p), p);
  }
  const out: ArenaSlot[] = [];
  const usedKeys = new Set<string>();

  for (const v of virtual) {
    const k = timeKey(v);
    const p = byTime.get(k);
    if (p) {
      out.push(p);
      usedKeys.add(k);
      continue;
    }
    const overlap = persisted.find(
      (x) => overlaps(x, v) && x.rawStatus.toLowerCase() !== 'available',
    );
    if (overlap) {
      out.push({ ...v, rawStatus: overlap.rawStatus });
      usedKeys.add(timeKey(overlap));
    } else {
      out.push(v);
    }
  }

  for (const p of persisted) {
    if (!usedKeys.has(timeKey(p))) {
      out.push(p);
    }
  }

  out.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.courtId.localeCompare(b.courtId));
  return out;
}

export function buildVirtualSlots(params: {
  query: SlotsQuery;
  courtData: Record<string, unknown> | null | undefined;
  date: Date;
  promotions: ArenaPromotion[];
}): ArenaSlot[] {
  const duration = readSlotDurationMinutes(params.courtData);
  const ranges = readRanges(params.courtData, isoWeekday(params.date));
  const day = new Date(params.date.getFullYear(), params.date.getMonth(), params.date.getDate());
  const slots: ArenaSlot[] = [];

  for (const range of ranges) {
    let cursor = range.startMin;
    while (cursor + duration <= range.endMin) {
      const start = fmt(cursor);
      const end = fmt(cursor + duration);
      const pricing = virtualSlotPricing({
        courtId: params.query.courtId,
        date: day,
        startTime: start,
        slotDurationMinutes: duration,
        courtData: params.courtData,
        arenaFallbackPerHourReais: params.query.arenaFallbackPricePerHourReais,
        promotions: params.promotions,
      });
      slots.push(
        arenaSlotVirtual({
          arenaId: params.query.arenaId,
          courtId: params.query.courtId,
          date: day,
          startTime: start,
          endTime: end,
          priceReais: pricing?.finalSlotPriceReais ?? null,
          basePriceReais: pricing?.baseSlotPriceReais ?? null,
          appliedPromotionId: pricing?.appliedPromotionId ?? null,
        }),
      );
      cursor += duration;
    }
  }
  return slots;
}

function isoWeekday(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

function readRanges(
  courtData: Record<string, unknown> | null | undefined,
  weekday: number,
): MinRange[] {
  const sched = courtData?.['availabilitySchedule'];
  if (sched && typeof sched === 'object' && !Array.isArray(sched)) {
    const map = sched as Record<string, unknown>;
    const key = WEEKDAY_KEYS[weekday - 1];
    const dayEntry = map[key] ?? map[String(weekday)];
    if (dayEntry != null) {
      if (isExplicitlyClosed(dayEntry)) {
        return [];
      }
      if (Array.isArray(dayEntry) && dayEntry.length === 0) {
        return [];
      }
      const parsed = parseDayEntry(dayEntry);
      if (parsed.length > 0) {
        return parsed;
      }
      return [];
    }
  }
  if (Array.isArray(sched)) {
    for (const item of sched) {
      if (item && typeof item === 'object') {
        const row = item as Record<string, unknown>;
        const wd = row['weekday'];
        const match =
          wd === weekday || wd === WEEKDAY_KEYS[weekday - 1] || wd === String(weekday);
        if (match) {
          const parsed = parseDayEntry(row['ranges'] ?? row['slots'] ?? item);
          if (parsed.length > 0) {
            return parsed;
          }
        }
      }
    }
  }
  return [{ startMin: DEFAULT_START_MIN, endMin: DEFAULT_END_MIN }];
}

function isExplicitlyClosed(dayEntry: unknown): boolean {
  if (typeof dayEntry === 'string' && dayEntry.trim().toLowerCase() === 'closed') {
    return true;
  }
  if (dayEntry === false) {
    return true;
  }
  if (dayEntry && typeof dayEntry === 'object' && (dayEntry as Record<string, unknown>)['closed'] === true) {
    return true;
  }
  return false;
}

function parseDayEntry(dayEntry: unknown): MinRange[] {
  if (dayEntry == null) {
    return [];
  }
  if (Array.isArray(dayEntry)) {
    const out: MinRange[] = [];
    for (const e of dayEntry) {
      if (e && typeof e === 'object') {
        const row = e as Record<string, unknown>;
        const range = rangeFromStartEnd(
          parseHm(row['start'] ?? row['from'] ?? row['open']),
          parseHm(row['end'] ?? row['to'] ?? row['close']),
        );
        if (range) {
          out.push(range);
        }
      }
    }
    return out;
  }
  if (typeof dayEntry === 'object') {
    const row = dayEntry as Record<string, unknown>;
    const range = rangeFromStartEnd(
      parseHm(row['start'] ?? row['from']),
      parseHm(row['end'] ?? row['to']),
    );
    return range ? [range] : [];
  }
  return [];
}

function rangeFromStartEnd(startMin: number | null, endMin: number | null): MinRange | null {
  if (startMin == null || endMin == null) {
    return null;
  }
  let end = endMin;
  if (end === 0 && startMin > 0) {
    end = 24 * 60;
  }
  if (end > startMin) {
    return { startMin, endMin: end };
  }
  return null;
}

function parseHm(v: unknown): number | null {
  if (typeof v === 'string') {
    const p = v.trim().split(':');
    if (p.length >= 2) {
      const h = Number.parseInt(p[0] ?? '', 10);
      const m = Number.parseInt(p[1] ?? '', 10);
      if (Number.isFinite(h) && Number.isFinite(m)) {
        return h * 60 + Math.min(59, Math.max(0, m));
      }
    }
  }
  if (typeof v === 'number') {
    return v;
  }
  return null;
}

function fmt(minutes: number): string {
  const w = minutes % (24 * 60);
  const h = Math.floor(w / 60);
  const m = w % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeKey(s: ArenaSlot): string {
  return `${s.startTime}_${s.endTime}`;
}

function overlaps(a: ArenaSlot, b: ArenaSlot): boolean {
  const aStart = timeToMinutes(a.startTime);
  const aEnd = timeToMinutes(a.endTime);
  const bStart = timeToMinutes(b.startTime);
  const bEnd = timeToMinutes(b.endTime);
  const normAEnd = aEnd <= aStart ? aEnd + 24 * 60 : aEnd;
  const normBEnd = bEnd <= bStart ? bEnd + 24 * 60 : bEnd;
  return aStart < normBEnd && bStart < normAEnd;
}
