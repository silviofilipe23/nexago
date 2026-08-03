import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore, QueryDocumentSnapshot} from "firebase-admin/firestore";
import {buildVirtualSlotsForDay, type ArenaPromotionDoc} from "./arena-pricing";

/** Regra de pico em `arenas/{arenaId}/peakRules` — espelha
 *  `frontend/shared/arena-discovery/arena-peak-rule.ts`. */
export interface ArenaPeakRuleDoc {
  id: string;
  active: boolean;
  label: string;
  courtIds: string[];
  weekdays: number[];
  startTime: string;
  endTime: string;
  minDurationMinutes: number;
  releaseHoursBefore: number | null;
}

export interface PeakSlotView {
  startTime: string;
  endTime: string;
  available: boolean;
}

/** Wall-clock em America/Sao_Paulo, comparável por componentes. */
export interface SpNow {
  dateKey: string;
  minutes: number;
}

const DEFAULT_MIN_DURATION = 120;
const SP_TZ = "America/Sao_Paulo";

export function parsePeakRulesFromDocs(docs: QueryDocumentSnapshot[]): ArenaPeakRuleDoc[] {
  return docs.map((d) => parsePeakRule(d.id, d.data() as Record<string, unknown>));
}

function parsePeakRule(id: string, data: Record<string, unknown>): ArenaPeakRuleDoc {
  const courtIds: string[] = [];
  if (Array.isArray(data["courtIds"])) {
    for (const c of data["courtIds"]) {
      if (typeof c === "string" && c.trim()) courtIds.push(c.trim());
    }
  }
  const weekdays: number[] = [];
  if (Array.isArray(data["weekdays"])) {
    for (const w of data["weekdays"]) {
      if (typeof w === "number") weekdays.push(w);
    }
  }
  const minRaw = data["minDurationMinutes"];
  const releaseRaw = data["releaseHoursBefore"];
  return {
    id,
    active: data["active"] === true,
    label: typeof data["label"] === "string" ? data["label"].trim() : "Horário de pico",
    courtIds,
    weekdays,
    startTime: normalizeHm(data["startTime"] as string | undefined),
    endTime: normalizeHm(data["endTime"] as string | undefined),
    minDurationMinutes:
      typeof minRaw === "number" && minRaw >= 60 && minRaw <= 360 ? minRaw : DEFAULT_MIN_DURATION,
    releaseHoursBefore:
      typeof releaseRaw === "number" && releaseRaw > 0 ? releaseRaw : null,
  };
}

export function spNow(nowUtc: Date = new Date()): SpNow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SP_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(nowUtc);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = parseInt(get("hour"), 10) % 24; // en-CA pode emitir "24" à meia-noite
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + parseInt(get("minute"), 10),
  };
}

/** Minutos (wall-clock) de `now` até o início do slot; negativo = já passou. */
function wallMinutesUntil(now: SpNow, dateKey: string, slotStartMinutes: number): number {
  const [ny, nm, nd] = now.dateKey.split("-").map((v) => parseInt(v, 10));
  const [sy, sm, sd] = dateKey.split("-").map((v) => parseInt(v, 10));
  // Datas por componentes, só para aritmética de dias — nunca Date.parse.
  const dayDiff = Math.round(
    (new Date(sy ?? 2020, (sm ?? 1) - 1, sd ?? 1).getTime() -
      new Date(ny ?? 2020, (nm ?? 1) - 1, nd ?? 1).getTime()) / 86400000,
  );
  return dayDiff * 1440 + (slotStartMinutes - now.minutes);
}

export function resolveDayAvailability(params: {
  virtual: {startTime: string; endTime: string}[];
  persisted: {startTime: string; endTime: string; status: string}[];
  dateKey: string;
  now: SpNow;
}): PeakSlotView[] {
  const busy = params.persisted.filter(
    (p) => p.status.trim().toLowerCase() !== "available",
  );
  return params.virtual.map((v) => {
    const start = toMinutes(v.startTime);
    const end = normalizeEnd(start, toMinutes(v.endTime));
    const overlapped = busy.some((p) => {
      const ps = toMinutes(p.startTime);
      const pe = normalizeEnd(ps, toMinutes(p.endTime));
      return ps < end && start < pe;
    });
    const past = wallMinutesUntil(params.now, params.dateKey, start) <= 0;
    return {startTime: v.startTime, endTime: v.endTime, available: !overlapped && !past};
  });
}

export function peakViolation(params: {
  rules: ArenaPeakRuleDoc[];
  courtId: string;
  dateKey: string;
  daySlots: PeakSlotView[];
  selectionStartTimes: string[];
  slotDurationMinutes: number;
  now: SpNow;
}): {minDurationMinutes: number} | null {
  const active = params.rules.filter((r) => r.active);
  if (active.length === 0 || params.selectionStartTimes.length === 0) return null;

  const parts = params.dateKey.split("-");
  const date = new Date(
    parseInt(parts[0] ?? "2020", 10),
    parseInt(parts[1] ?? "1", 10) - 1,
    parseInt(parts[2] ?? "1", 10),
  );

  let worst: {minDurationMinutes: number} | null = null;
  for (const startTime of params.selectionStartTimes) {
    const rule = restrictionForSlot({
      rules: active,
      courtId: params.courtId,
      date,
      dateKey: params.dateKey,
      slotStartTime: startTime,
      now: params.now,
    });
    if (!rule) continue;
    const minSlots = Math.max(
      1,
      Math.ceil(rule.minDurationMinutes / Math.max(1, params.slotDurationMinutes)),
    );
    if (params.selectionStartTimes.length >= minSlots) continue;
    if (!chainExistsContaining(params.daySlots, startTime, minSlots)) continue;
    if (worst == null || rule.minDurationMinutes > worst.minDurationMinutes) {
      worst = {minDurationMinutes: rule.minDurationMinutes};
    }
  }
  return worst;
}

function restrictionForSlot(params: {
  rules: ArenaPeakRuleDoc[];
  courtId: string;
  date: Date;
  dateKey: string;
  slotStartTime: string;
  now: SpNow;
}): ArenaPeakRuleDoc | null {
  let best: ArenaPeakRuleDoc | null = null;
  for (const rule of params.rules) {
    if (!ruleMatches(rule, params.courtId, params.date, params.slotStartTime)) continue;
    if (best == null || rule.minDurationMinutes > best.minDurationMinutes) best = rule;
  }
  if (best == null) return null;
  if (best.releaseHoursBefore != null) {
    const until = wallMinutesUntil(params.now, params.dateKey, toMinutes(params.slotStartTime));
    if (until <= best.releaseHoursBefore * 60) return null;
  }
  return best;
}

function ruleMatches(
  rule: ArenaPeakRuleDoc,
  courtId: string,
  date: Date,
  slotStart: string,
): boolean {
  if (rule.courtIds.length > 0 && !rule.courtIds.includes(courtId)) return false;
  const isoWeekday = date.getDay() === 0 ? 7 : date.getDay();
  if (rule.weekdays.length > 0 && !rule.weekdays.includes(isoWeekday)) return false;
  const slotMin = toMinutes(slotStart);
  const startMin = toMinutes(rule.startTime);
  const endMin = toMinutes(rule.endTime);
  if (endMin > startMin) {
    return slotMin >= startMin && slotMin < endMin;
  }
  return slotMin >= startMin || slotMin < endMin;
}

function chainExistsContaining(
  daySlots: PeakSlotView[],
  targetStart: string,
  minSlots: number,
): boolean {
  const idx = daySlots.findIndex((s) => s.startTime === targetStart);
  if (idx === -1) return false;
  for (let start = Math.max(0, idx - (minSlots - 1)); start <= idx; start++) {
    if (start + minSlots > daySlots.length) break;
    let ok = true;
    for (let i = start; i < start + minSlots; i++) {
      const s = daySlots[i]!;
      if (!s.available) { ok = false; break; }
      if (i > start && daySlots[i - 1]!.endTime !== s.startTime) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

/** Enforcement completo: monta a grade do dia (virtual ∪ persistidos), roda o
 *  predicado e lança `failed-precondition` na violação. No-op sem regra ativa. */
export async function ensurePeakRuleSatisfied(params: {
  db: Firestore;
  arenaId: string;
  courtId: string;
  dateKey: string;
  peakRules: ArenaPeakRuleDoc[];
  courtData: Record<string, unknown> | undefined;
  arenaFallback: number | null;
  selectionStartTimes: string[];
}): Promise<void> {
  const active = params.peakRules.filter((r) => r.active);
  if (active.length === 0) return;

  const parts = params.dateKey.split("-");
  const date = new Date(
    parseInt(parts[0] ?? "2020", 10),
    parseInt(parts[1] ?? "1", 10) - 1,
    parseInt(parts[2] ?? "1", 10),
  );
  const virtual = buildVirtualSlotsForDay({
    arenaId: params.arenaId,
    courtId: params.courtId,
    date,
    courtData: params.courtData,
    arenaFallback: params.arenaFallback,
    promotions: [] as ArenaPromotionDoc[], // preço é irrelevante aqui
  }).map((s) => ({startTime: s.startTime, endTime: s.endTime}));

  // Mesma leitura tolerante do cliente: filtra por arenaId no servidor e
  // resolve dia/quadra em memória (docs antigos variam nos campos de data).
  const snap = await params.db
    .collection("arenaSlots")
    .where("arenaId", "==", params.arenaId)
    .get();
  const wantedCourt = params.courtId.trim().toLowerCase();
  const persisted: {startTime: string; endTime: string; status: string}[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const docCourt = String(data["courtId"] ?? data["court_id"] ?? "").trim().toLowerCase();
    if (docCourt !== wantedCourt) continue;
    if (slotDocDateKey(data) !== params.dateKey) continue;
    persisted.push({
      startTime: String(data["startTime"] ?? ""),
      endTime: String(data["endTime"] ?? ""),
      status: String(data["status"] ?? "available"),
    });
  }

  const now = spNow();
  const daySlots = resolveDayAvailability({virtual, persisted, dateKey: params.dateKey, now});
  const violation = peakViolation({
    rules: active,
    courtId: params.courtId,
    dateKey: params.dateKey,
    daySlots,
    selectionStartTimes: params.selectionStartTimes,
    slotDurationMinutes: readSlotDuration(params.courtData),
    now,
  });
  if (violation) {
    const hours = Math.round(violation.minDurationMinutes / 60);
    throw new HttpsError(
      "failed-precondition",
      `Este horário exige reserva mínima de ${hours}h. Inclua uma hora vizinha para confirmar.`,
    );
  }
}

/** dateKey `YYYY-MM-DD` do doc de arenaSlots, tolerante a campos/formatos legados. */
function slotDocDateKey(data: Record<string, unknown>): string | null {
  for (const key of ["dateKey", "date", "slotDate", "day"]) {
    const v = data[key];
    if (typeof v === "string") {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
      if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    }
    if (v && typeof v === "object" && "toDate" in (v as object)) {
      const d = (v as {toDate: () => Date}).toDate();
      const mm = `${d.getMonth() + 1}`.padStart(2, "0");
      const dd = `${d.getDate()}`.padStart(2, "0");
      return `${d.getFullYear()}-${mm}-${dd}`;
    }
  }
  return null;
}

function readSlotDuration(courtData: Record<string, unknown> | undefined): number {
  const v = courtData?.["slotDurationMinutes"];
  const n = typeof v === "number" ? v : 60;
  return n < 15 || n > 240 ? 60 : n;
}

function normalizeHm(raw?: string): string {
  const t = (raw ?? "00:00").trim();
  return t.length >= 5 ? t.substring(0, 5) : t;
}

function toMinutes(hhmm: string): number {
  const parts = hhmm.trim().split(":");
  const h = parseInt(parts[0] ?? "0", 10);
  const m = parts.length > 1 ? parseInt(parts[1] ?? "0", 10) : 0;
  return (Number.isNaN(h) ? 0 : h) * 60 + (Number.isNaN(m) ? 0 : m);
}

function normalizeEnd(startMin: number, endMin: number): number {
  return endMin === 0 && startMin > 0 ? 24 * 60 : endMin;
}
