import {Timestamp, type QueryDocumentSnapshot} from "firebase-admin/firestore";

export interface ArenaPromotionDoc {
  id: string;
  active: boolean;
  label: string;
  courtIds: string[];
  weekdays: number[];
  startTime: string;
  endTime: string;
  discountPercent?: number;
  fixedPricePerHourReais?: number;
  validFrom?: Timestamp;
  validUntil?: Timestamp;
}

export interface VirtualSlotPricing {
  startTime: string;
  endTime: string;
  baseSlotPriceReais: number;
  finalSlotPriceReais: number;
  appliedPromotionId?: string;
}

export interface BookingTotalResult {
  amountReais: number;
  lineItems: VirtualSlotPricing[];
  appliedPromotionIds: string[];
}

const WEEKDAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DEFAULT_DURATION = 60;
const DEFAULT_START = 8 * 60;
const DEFAULT_END = 22 * 60;

export function readArenaFallbackPrice(data: Record<string, unknown> | undefined): number | null {
  if (!data) return null;
  const v =
    (data["pricePerHourReais"] as number | undefined) ??
    (data["basePriceReais"] as number | undefined);
  if (typeof v !== "number" || v <= 0) return null;
  return v;
}

export function readCourtHourlyBase(data: Record<string, unknown> | undefined): number | null {
  if (!data) return null;
  const perHour = data["basePricePerHourReais"] as number | undefined;
  if (typeof perHour === "number" && perHour > 0) return perHour;
  const legacy = data["basePriceReais"] as number | undefined;
  if (typeof legacy === "number" && legacy > 0) return legacy;
  return null;
}

export function resolveSlotPrice(hourlyBase: number, durationMinutes: number): number {
  if (hourlyBase <= 0 || durationMinutes <= 0) return 0;
  const raw = hourlyBase * (durationMinutes / 60);
  return Math.round(raw * 100) / 100;
}

function toMinutes(hm: string): number | null {
  const parts = hm.trim().split(":");
  if (parts.length < 2) return null;
  const h = parseInt(parts[0] ?? "0", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function fmt(minutes: number): string {
  const w = minutes % (24 * 60);
  const h = Math.floor(w / 60);
  const m = w % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function parsePromotion(id: string, data: Record<string, unknown>): ArenaPromotionDoc {
  const courtIds: string[] = [];
  const rawCourts = data["courtIds"];
  if (Array.isArray(rawCourts)) {
    for (const c of rawCourts) {
      if (typeof c === "string" && c.trim()) courtIds.push(c.trim());
    }
  }
  const weekdays: number[] = [];
  const rawWd = data["weekdays"];
  if (Array.isArray(rawWd)) {
    for (const w of rawWd) {
      if (typeof w === "number") weekdays.push(w);
    }
  }
  return {
    id,
    active: data["active"] === true,
    label: typeof data["label"] === "string" ? data["label"].trim() : "Promoção",
    courtIds,
    weekdays,
    startTime: normalizeHm(data["startTime"] as string | undefined),
    endTime: normalizeHm(data["endTime"] as string | undefined),
    discountPercent: data["discountPercent"] as number | undefined,
    fixedPricePerHourReais: data["fixedPricePerHourReais"] as number | undefined,
    validFrom: data["validFrom"] as Timestamp | undefined,
    validUntil: data["validUntil"] as Timestamp | undefined,
  };
}

function normalizeHm(raw?: string): string {
  const t = (raw ?? "00:00").trim();
  return t.length >= 5 ? t.substring(0, 5) : t;
}

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function promoMatches(
  promo: ArenaPromotionDoc,
  courtId: string,
  date: Date,
  slotStart: string,
): boolean {
  if (!promo.active) return false;
  const day = dateOnly(date);
  if (promo.validFrom) {
    const vf = dateOnly(promo.validFrom.toDate());
    if (day < vf) return false;
  }
  if (promo.validUntil) {
    const vu = dateOnly(promo.validUntil.toDate());
    if (day > vu) return false;
  }
  if (promo.courtIds.length > 0 && !promo.courtIds.includes(courtId)) return false;
  const isoWeekday = date.getDay() === 0 ? 7 : date.getDay();
  if (promo.weekdays.length > 0 && !promo.weekdays.includes(isoWeekday)) return false;

  const slotMin = toMinutes(slotStart);
  const startMin = toMinutes(promo.startTime);
  const endMin = toMinutes(promo.endTime);
  if (slotMin == null || startMin == null || endMin == null) return false;
  if (endMin > startMin) {
    return slotMin >= startMin && slotMin < endMin;
  }
  return slotMin >= startMin || slotMin < endMin;
}

function applyPromoToSlot(
  promo: ArenaPromotionDoc,
  baseSlot: number,
  hourlyBase: number,
  durationMinutes: number,
): number | null {
  if (promo.fixedPricePerHourReais != null && promo.fixedPricePerHourReais > 0) {
    return resolveSlotPrice(promo.fixedPricePerHourReais, durationMinutes);
  }
  if (promo.discountPercent != null && promo.discountPercent > 0) {
    const pct = Math.min(100, Math.max(0, promo.discountPercent));
    return Math.round(baseSlot * (1 - pct / 100) * 100) / 100;
  }
  return null;
}

export function applyPromotionsToSlot(params: {
  arenaId: string;
  courtId: string;
  date: Date;
  startTime: string;
  durationMinutes: number;
  hourlyBase: number;
  promotions: ArenaPromotionDoc[];
}): VirtualSlotPricing {
  const base = resolveSlotPrice(params.hourlyBase, params.durationMinutes);
  let bestFinal = base;
  let bestId: string | undefined;

  for (const promo of params.promotions) {
    if (!promoMatches(promo, params.courtId, params.date, params.startTime)) continue;
    const discounted = applyPromoToSlot(
      promo,
      base,
      params.hourlyBase,
      params.durationMinutes,
    );
    if (discounted == null) continue;
    if (discounted < bestFinal) {
      bestFinal = discounted;
      bestId = promo.id;
    }
  }

  return {
    startTime: params.startTime,
    endTime: fmt(toMinutes(params.startTime)! + params.durationMinutes),
    baseSlotPriceReais: base,
    finalSlotPriceReais: bestFinal,
    appliedPromotionId: bestId,
  };
}

interface MinRange {
  startMin: number;
  endMin: number;
}

function readDuration(courtData: Record<string, unknown> | undefined): number {
  const v = courtData?.["slotDurationMinutes"];
  const n = typeof v === "number" ? v : DEFAULT_DURATION;
  if (n < 15 || n > 240) return DEFAULT_DURATION;
  return n;
}

function readRanges(courtData: Record<string, unknown> | undefined, weekday: number): MinRange[] {
  const sched = courtData?.["availabilitySchedule"];
  if (sched && typeof sched === "object" && !Array.isArray(sched)) {
    const map = sched as Record<string, unknown>;
    const key = WEEKDAY_KEYS[weekday - 1];
    const dayEntry = map[key] ?? map[`${weekday}`];
    if (dayEntry != null) {
      if (isClosed(dayEntry)) return [];
      const parsed = parseDayEntry(dayEntry);
      if (parsed.length > 0) return parsed;
      return [];
    }
  }
  return [{startMin: DEFAULT_START, endMin: DEFAULT_END}];
}

function isClosed(dayEntry: unknown): boolean {
  if (typeof dayEntry === "string" && dayEntry.trim().toLowerCase() === "closed") return true;
  if (dayEntry === false) return true;
  if (dayEntry && typeof dayEntry === "object" && (dayEntry as Record<string, unknown>)["closed"] === true) {
    return true;
  }
  return false;
}

function parseDayEntry(dayEntry: unknown): MinRange[] {
  const out: MinRange[] = [];
  if (Array.isArray(dayEntry)) {
    for (const e of dayEntry) {
      if (e && typeof e === "object") {
        const m = e as Record<string, unknown>;
        const r = rangeFromStartEnd(m["start"] ?? m["from"], m["end"] ?? m["to"] ?? m["close"]);
        if (r) out.push(r);
      }
    }
    return out;
  }
  if (dayEntry && typeof dayEntry === "object") {
    const m = dayEntry as Record<string, unknown>;
    const r = rangeFromStartEnd(m["start"] ?? m["from"], m["end"] ?? m["to"]);
    if (r) out.push(r);
  }
  return out;
}

function rangeFromStartEnd(start: unknown, end: unknown): MinRange | null {
  const a = typeof start === "string" ? toMinutes(start) : null;
  let b = typeof end === "string" ? toMinutes(end) : null;
  if (a == null || b == null) return null;
  if (b === 0 && a > 0) b = 24 * 60;
  if (b > a) return {startMin: a, endMin: b};
  return null;
}

export function buildVirtualSlotsForDay(params: {
  arenaId: string;
  courtId: string;
  date: Date;
  courtData: Record<string, unknown> | undefined;
  arenaFallback: number | null;
  promotions: ArenaPromotionDoc[];
}): VirtualSlotPricing[] {
  const duration = readDuration(params.courtData);
  const isoWeekday = params.date.getDay() === 0 ? 7 : params.date.getDay();
  const ranges = readRanges(params.courtData, isoWeekday);
  const hourly =
    readCourtHourlyBase(params.courtData) ?? params.arenaFallback ?? null;
  if (hourly == null || hourly <= 0) return [];

  const slots: VirtualSlotPricing[] = [];
  for (const range of ranges) {
    let cursor = range.startMin;
    while (cursor + duration <= range.endMin) {
      const start = fmt(cursor);
      slots.push(
        applyPromotionsToSlot({
          arenaId: params.arenaId,
          courtId: params.courtId,
          date: params.date,
          startTime: start,
          durationMinutes: duration,
          hourlyBase: hourly,
          promotions: params.promotions,
        }),
      );
      cursor += duration;
    }
  }
  return slots;
}

function slotInSelection(
  slotStart: string,
  slotEnd: string,
  selStart: string,
  selEnd: string,
): boolean {
  const ss = toMinutes(slotStart);
  const se = toMinutes(slotEnd);
  let rs = toMinutes(selStart);
  let re = toMinutes(selEnd);
  if (ss == null || se == null || rs == null || re == null) return false;
  if (re === 0 && rs > 0) re = 24 * 60;
  return ss >= rs && se <= re;
}

export function calculateBookingTotal(params: {
  arenaId: string;
  courtId: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  courtData: Record<string, unknown> | undefined;
  arenaFallback: number | null;
  promotions: ArenaPromotionDoc[];
  /** Horários exatos escolhidos na grade (ex.: `["18:00","19:00"]`) — evita cobrar slot a mais por intervalo. */
  selectedSlotStartTimes?: string[];
}): BookingTotalResult {
  const parts = params.dateKey.split("-");
  const date = new Date(
    parseInt(parts[0] ?? "2020", 10),
    parseInt(parts[1] ?? "1", 10) - 1,
    parseInt(parts[2] ?? "1", 10),
  );

  const allSlots = buildVirtualSlotsForDay({
    arenaId: params.arenaId,
    courtId: params.courtId,
    date,
    courtData: params.courtData,
    arenaFallback: params.arenaFallback,
    promotions: params.promotions,
  });

  let selected: VirtualSlotPricing[];
  const wanted = (params.selectedSlotStartTimes ?? [])
    .map((t) => normalizeHm(t))
    .filter((t) => t.length >= 4);
  if (wanted.length > 0) {
    const wantedSet = new Set(wanted);
    selected = allSlots.filter((s) => wantedSet.has(normalizeHm(s.startTime)));
    if (selected.length !== wanted.length) {
      selected = allSlots.filter((s) =>
        slotInSelection(s.startTime, s.endTime, params.startTime, params.endTime),
      );
    }
  } else {
    selected = allSlots.filter((s) =>
      slotInSelection(s.startTime, s.endTime, params.startTime, params.endTime),
    );
  }

  if (selected.length === 0) {
    return {amountReais: 0, lineItems: [], appliedPromotionIds: []};
  }

  let amount = 0;
  const promoIds = new Set<string>();
  for (const s of selected) {
    amount += s.finalSlotPriceReais;
    if (s.appliedPromotionId) promoIds.add(s.appliedPromotionId);
  }
  amount = Math.round(amount * 100) / 100;

  return {
    amountReais: amount,
    lineItems: selected,
    appliedPromotionIds: [...promoIds],
  };
}

export function parsePromotionsFromDocs(
  docs: QueryDocumentSnapshot[],
): ArenaPromotionDoc[] {
  return docs.map((d) => parsePromotion(d.id, d.data() as Record<string, unknown>));
}
