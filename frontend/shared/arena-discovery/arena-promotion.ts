import type { DocumentData, DocumentSnapshot, Timestamp } from 'firebase/firestore';

export interface ArenaPromotion {
  id: string;
  active: boolean;
  label: string;
  courtIds: string[];
  weekdays: number[];
  startTime: string;
  endTime: string;
  discountPercent: number | null;
  fixedPricePerHourReais: number | null;
  validFrom: Date | null;
  validUntil: Date | null;
}

export function arenaPromotionFromFirestore(
  doc: DocumentSnapshot<DocumentData>,
): ArenaPromotion {
  const data = doc.data() ?? {};
  const courtIds: string[] = [];
  if (Array.isArray(data['courtIds'])) {
    for (const e of data['courtIds']) {
      if (typeof e === 'string' && e.trim()) {
        courtIds.push(e.trim());
      }
    }
  }
  const weekdays: number[] = [];
  if (Array.isArray(data['weekdays'])) {
    for (const e of data['weekdays']) {
      if (typeof e === 'number') {
        weekdays.push(e);
      }
    }
  }
  return {
    id: doc.id,
    active: data['active'] === true,
    label: typeof data['label'] === 'string' ? data['label'] : '',
    courtIds,
    weekdays,
    startTime: normalizeHm(String(data['startTime'] ?? '00:00')),
    endTime: normalizeHm(String(data['endTime'] ?? '23:59')),
    discountPercent: typeof data['discountPercent'] === 'number' ? data['discountPercent'] : null,
    fixedPricePerHourReais:
      typeof data['fixedPricePerHourReais'] === 'number' ? data['fixedPricePerHourReais'] : null,
    validFrom: parseTimestamp(data['validFrom']),
    validUntil: parseTimestamp(data['validUntil']),
  };
}

export function promotionMatches(
  promo: ArenaPromotion,
  courtId: string,
  date: Date,
  slotStartTime: string,
): boolean {
  if (!promo.active) {
    return false;
  }
  const day = dateOnly(date);
  if (promo.validFrom && day < dateOnly(promo.validFrom)) {
    return false;
  }
  if (promo.validUntil && day > dateOnly(promo.validUntil)) {
    return false;
  }
  if (promo.courtIds.length > 0 && !promo.courtIds.includes(courtId)) {
    return false;
  }
  if (promo.weekdays.length > 0 && !promo.weekdays.includes(isoWeekday(date))) {
    return false;
  }
  const slotMin = toMinutes(slotStartTime);
  const startMin = toMinutes(promo.startTime);
  const endMin = toMinutes(promo.endTime);
  if (slotMin == null || startMin == null || endMin == null) {
    return false;
  }
  if (endMin > startMin) {
    return slotMin >= startMin && slotMin < endMin;
  }
  return slotMin >= startMin || slotMin < endMin;
}

export function promotionApplyToSlot(
  promo: ArenaPromotion,
  baseSlotPriceReais: number,
  slotDurationMinutes: number,
): number | null {
  if (promo.fixedPricePerHourReais != null && promo.fixedPricePerHourReais > 0) {
    return Math.round(promo.fixedPricePerHourReais * (slotDurationMinutes / 60) * 100) / 100;
  }
  if (promo.discountPercent != null && promo.discountPercent > 0) {
    const factor = 1 - Math.min(100, Math.max(0, promo.discountPercent)) / 100;
    return Math.round(baseSlotPriceReais * factor * 100) / 100;
  }
  return null;
}

function isoWeekday(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

function normalizeHm(raw: string): string {
  const t = raw.trim();
  return t.length >= 5 ? t.substring(0, 5) : t;
}

function toMinutes(hm: string): number | null {
  const parts = hm.split(':');
  if (parts.length < 2) {
    return null;
  }
  const h = Number.parseInt(parts[0] ?? '', 10);
  const m = Number.parseInt(parts[1] ?? '', 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return null;
  }
  return h * 60 + Math.min(59, Math.max(0, m));
}

function parseTimestamp(v: unknown): Date | null {
  if (v && typeof v === 'object' && 'toDate' in v) {
    return (v as Timestamp).toDate();
  }
  return v instanceof Date ? v : null;
}

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
