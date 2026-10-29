/**
 * Cancelamento por chuva — callables do portal da arena e do app do atleta,
 * mais a varredura de hora em hora.
 *
 * Fluxo: a arena ativa o Modo chuva (período + quadras) ou aprova o pedido do
 * atleta → a reserva paga ganha `weatherRelease` (`pending_choice`) → o atleta
 * remarca sem custo, guarda o valor como crédito ou mantém o jogo; quem não
 * escolhe em 24h recebe o crédito. Reserva não paga só é cancelada. O dinheiro
 * nunca sai do caixa da arena.
 *
 * Regras puras: `arena-weather-model.ts`. Créditos: `arena-weather-credits.ts`.
 * Spec: docs/superpowers/specs/2026-10-29-cancelamento-por-chuva-design.md
 */
import {onCall, HttpsError, type CallableRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {FieldValue, getFirestore, Timestamp} from "firebase-admin/firestore";
import type {DocumentData, DocumentReference, DocumentSnapshot, Firestore, Transaction} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {assertArenaAreaAccess} from "./arena-area-access";
import {ensurePeakRuleSatisfied, spNow} from "./arena-peak-rules";
import {calculateBookingTotal} from "./arena-pricing";
import {loadPricingContext} from "./arena-booking-create";
import {ARENA_BOOKING_PRICING} from "./arena-booking-pricing";
import {parseDateKeyFromBooking} from "./slot-vacancy-alerts";
import {
  deliverNotificationToUser,
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
} from "./notification-delivery";
import {fetchArenaWeather, WEATHER_API_KEY} from "./arena-weather-forecast";
import {
  ARENA_WEATHER_CREDITS,
  weatherCreditDoc,
  weatherCreditIdFor,
  type WeatherCreditSource,
} from "./arena-weather-credits";
import {
  WEATHER_CREDIT_REMINDER_MS,
  WEATHER_DECISION_WINDOW_MS,
  addDaysToDateKey,
  bookingPaidReais,
  bookingWindow,
  classifyBookingForRain,
  normalizeWeatherPolicy,
  paymentLabelOf,
  policyCoversCourt,
  remainingFraction,
  rescheduleSettlement,
  spWallTimeToEpochMs,
  summarizeWeather,
  weatherCreditExpiresAtMs,
  weatherHoursInWindow,
  weatherMeetsAutoThreshold,
  weatherRequestWindow,
  type RainClassification,
  type WeatherHour,
  type WeatherPolicy,
} from "./arena-weather-model";
import {roundMoney} from "./mercadopago-arena-helpers";

const ARENA_BOOKINGS = "arenaBookings";
const ARENA_SLOTS = "arenaSlots";
const ARENA_SLOT_LOCKS = "arenaSlotLocks";
export const ARENA_WEATHER_EVENTS = "arenaWeatherEvents";
export const ARENA_WEATHER_REQUESTS = "arenaWeatherRequests";
const PUSH_SECRETS = [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT];
/** Quem consulta a previsão precisa da chave da WeatherAPI (sem ela, cai no Open-Meteo). */
const WEATHER_AND_PUSH_SECRETS = [...PUSH_SECRETS, WEATHER_API_KEY];
/** Rota que existe em todos os apps da loja; o app novo abre a escolha pelo `type` + `bookingId`. */
const ATHLETE_PUSH_URL = "/my-bookings";
const RELEASABLE_STATUSES = new Set(["active", "confirmed"]);

// ── Entrada ──────────────────────────────────────────────────────────────

function requireUid(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return uid;
}

function requireText(v: unknown, field: string): string {
  if (typeof v !== "string" || v.trim() === "") {
    throw new HttpsError("invalid-argument", `Campo obrigatório: ${field}.`);
  }
  return v.trim();
}

function requireDateKey(v: unknown): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
    throw new HttpsError("invalid-argument", "Data inválida.");
  }
  return v.trim();
}

function requirePeriod(startTime: unknown, endTime: unknown): {start: number; end: number} {
  const win = bookingWindow(startTime, endTime);
  if (!win) throw new HttpsError("invalid-argument", "Período inválido.");
  return win;
}

function optionalText(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim().substring(0, max) : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function brl(v: number): string {
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

function shortDate(dateKey: string): string {
  const [, m, d] = dateKey.split("-");
  return `${d}/${m}`;
}

// ── Leitura ──────────────────────────────────────────────────────────────

interface ArenaInfo {
  data: DocumentData;
  name: string;
  policy: WeatherPolicy;
}

function arenaInfoFrom(snap: DocumentSnapshot): ArenaInfo {
  if (!snap.exists) throw new HttpsError("not-found", "Arena não encontrada.");
  const data = snap.data() as DocumentData;
  return {data, name: str(data["name"]) || "Arena", policy: normalizeWeatherPolicy(data["weatherPolicy"])};
}

async function loadArena(db: Firestore, arenaId: string): Promise<ArenaInfo> {
  return arenaInfoFrom(await db.collection("arenas").doc(arenaId).get());
}

function athleteNameFrom(data: DocumentData | undefined): string {
  return str(data?.["fullName"]) || str(data?.["name"]) || str(data?.["displayName"]) || "Atleta";
}

async function athleteNames(db: Firestore, uids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(uids.filter((u) => u))];
  if (unique.length === 0) return new Map();
  const snaps = await db.getAll(...unique.map((u) => db.collection("users").doc(u)));
  return new Map(snaps.map((s) => [s.id, athleteNameFrom(s.data())]));
}

function isReleasable(booking: DocumentData | undefined): boolean {
  if (!booking) return false;
  const status = str(booking["status"]).toLowerCase();
  return RELEASABLE_STATUSES.has(status) && !booking["weatherRelease"];
}

// ── Bloqueio de novas reservas ───────────────────────────────────────────

export interface WeatherBlock {
  eventId: string;
  blockId: string;
  arenaId: string;
  date: string;
  courtIds: string[];
  start: number;
  end: number;
}

export function weatherBlockIdFor(eventId: string): string {
  return `wx_${eventId}`;
}

function safeIdPart(s: string): string {
  return s.replace(/\//g, "_");
}

/** Mesmo id de `createArenaBooking` / `computeSlotLockIds`. */
export function hourLockId(arenaId: string, courtId: string, dateKey: string, hour: number): string {
  return `${safeIdPart(arenaId)}_${safeIdPart(courtId)}_${dateKey}_h${hour.toString().padStart(2, "0")}`;
}

/** Horas cheias cujo intervalo [h, h+1) cruza [start, end). */
export function hoursInRange(start: number, end: number): number[] {
  const hours: number[] = [];
  for (let h = Math.floor(start / 60); h * 60 < end && h < 24; h++) hours.push(h);
  return hours;
}

/** Horas que ainda vale bloquear: nada de dia passado nem hora que já acabou. */
function blockableHours(block: WeatherBlock, start: number, end: number, nowMs: number): number[] {
  const now = spNow(new Date(nowMs));
  if (block.date < now.dateKey) return [];
  return hoursInRange(Math.max(start, block.start), Math.min(end, block.end))
    .filter((h) => block.date > now.dateKey || (h + 1) * 60 > now.minutes);
}

function blockFromEvent(snap: DocumentSnapshot | null): WeatherBlock | null {
  if (!snap?.exists) return null;
  const d = snap.data() as DocumentData;
  if (d["status"] !== "active" || d["blockNewBookings"] !== true) return null;
  const win = bookingWindow(d["startTime"], d["endTime"]);
  if (!win) return null;
  return {
    eventId: snap.id,
    blockId: weatherBlockIdFor(snap.id),
    arenaId: str(d["arenaId"]),
    date: str(d["date"]),
    courtIds: Array.isArray(d["courtIds"]) ? (d["courtIds"] as unknown[]).map(String) : [],
    start: win.start,
    end: win.end,
  };
}

function blockedSlotData(block: WeatherBlock, courtId: string, hour: number): DocumentData {
  return {
    arenaId: block.arenaId,
    courtId,
    date: block.date,
    dateKey: block.date,
    startTime: `${hour.toString().padStart(2, "0")}:00`,
    endTime: hour >= 23 ? "24:00" : `${(hour + 1).toString().padStart(2, "0")}:00`,
    status: "blocked",
    bookingId: block.blockId,
    bookingAthleteId: null,
    blockReason: "weather",
    weatherEventId: block.eventId,
    createdAt: FieldValue.serverTimestamp(),
  };
}

function blockedSlotRef(db: Firestore, block: WeatherBlock, courtId: string, hour: number) {
  return db.collection(ARENA_SLOTS).doc(`${block.blockId}_${safeIdPart(courtId)}_h${hour.toString().padStart(2, "0")}`);
}

/** Tranca as horas livres do período nas quadras do evento. */
async function placeWeatherBlocks(db: Firestore, block: WeatherBlock, nowMs: number): Promise<number> {
  const hours = blockableHours(block, block.start, block.end, nowMs);
  let placed = 0;
  for (const courtId of block.courtIds) {
    placed += await db.runTransaction(async (tx) => {
      const refs = hours.map((h) => db.collection(ARENA_SLOT_LOCKS).doc(hourLockId(block.arenaId, courtId, block.date, h)));
      const snaps = refs.length > 0 ? await tx.getAll(...refs) : [];
      let n = 0;
      snaps.forEach((snap, i) => {
        if (snap.exists) return;
        const hour = hours[i] as number;
        tx.set(snap.ref, {
          arenaId: block.arenaId,
          courtId,
          date: block.date,
          startTime: `${hour.toString().padStart(2, "0")}:00`,
          endTime: hour >= 23 ? "24:00" : `${(hour + 1).toString().padStart(2, "0")}:00`,
          bookingId: block.blockId,
          bookingAthleteId: null,
          weatherEventId: block.eventId,
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(blockedSlotRef(db, block, courtId, hour), blockedSlotData(block, courtId, hour));
        n++;
      });
      return n;
    });
  }
  return placed;
}

/**
 * Dentro da transação que cancela uma reserva por chuva: com o bloqueio do
 * evento ainda ativo, os locks dela passam para o bloqueio em vez de serem
 * soltos (o gatilho de liberação só apaga lock cujo dono é a reserva).
 */
async function prepareBlockTransfer(
  tx: Transaction,
  db: Firestore,
  bookingId: string,
  booking: DocumentData,
  block: WeatherBlock | null,
  nowMs: number,
): Promise<() => void> {
  const courtId = str(booking["courtId"]);
  const dateKey = parseDateKeyFromBooking(booking["date"]) ?? "";
  const win = bookingWindow(booking["startTime"], booking["endTime"]);
  if (!block || !win || str(booking["arenaId"]) !== block.arenaId || dateKey !== block.date ||
    !block.courtIds.includes(courtId)) {
    return () => undefined;
  }
  const hours = blockableHours(block, win.start, win.end, nowMs);
  const refs = hours.map((h) => db.collection(ARENA_SLOT_LOCKS).doc(hourLockId(block.arenaId, courtId, dateKey, h)));
  const snaps = refs.length > 0 ? await tx.getAll(...refs) : [];
  const owned = snaps
    .map((snap, i) => ({snap, hour: hours[i] as number}))
    .filter(({snap}) => snap.exists && snap.data()?.["bookingId"] === bookingId);
  return () => {
    for (const {snap, hour} of owned) {
      tx.update(snap.ref, {bookingId: block.blockId, bookingAthleteId: null, weatherEventId: block.eventId});
      tx.set(blockedSlotRef(db, block, courtId, hour), blockedSlotData(block, courtId, hour));
    }
  };
}

async function releaseWeatherBlocks(db: Firestore, block: WeatherBlock): Promise<number> {
  let released = 0;
  const hours = hoursInRange(block.start, block.end);
  for (const courtId of block.courtIds) {
    for (const h of hours) {
      const ref = db.collection(ARENA_SLOT_LOCKS).doc(hourLockId(block.arenaId, courtId, block.date, h));
      const snap = await ref.get();
      if (snap.exists && snap.data()?.["bookingId"] === block.blockId) {
        await ref.delete();
        released++;
      }
    }
  }
  const slots = await db.collection(ARENA_SLOTS).where("bookingId", "==", block.blockId).get();
  await Promise.all(slots.docs.map((d) => d.ref.delete()));
  return released;
}

// ── Liberação de uma reserva ─────────────────────────────────────────────

interface ReleaseContext {
  source: "rain_mode" | "request" | "auto";
  eventId: string | null;
  policy: WeatherPolicy;
  forecast: WeatherHour[] | null;
  message: string | null;
  nowMs: number;
}

function releaseMap(
  booking: DocumentData,
  ctx: ReleaseContext,
  cls: Pick<RainClassification, "fraction" | "creditableReais">,
  status: string,
  extra: DocumentData = {},
): DocumentData {
  const dateKey = parseDateKeyFromBooking(booking["date"]) ?? "";
  const win = bookingWindow(booking["startTime"], booking["endTime"]);
  const forecast = ctx.forecast && win ? weatherHoursInWindow(ctx.forecast, win.start - 60, win.end) : [];
  return {
    source: ctx.source,
    eventId: ctx.eventId,
    releasedAt: Timestamp.fromMillis(ctx.nowMs),
    decisionDeadline: Timestamp.fromMillis(ctx.nowMs + WEATHER_DECISION_WINDOW_MS),
    creditableReais: cls.creditableReais,
    fraction: cls.fraction,
    canReschedule: ctx.policy.allowReschedule && cls.fraction >= 1,
    rescheduleUntil: dateKey ? addDaysToDateKey(dateKey, ctx.policy.rescheduleDays) : null,
    status,
    forecast,
    arenaMessage: ctx.message,
    ...extra,
  };
}

const CANCEL_FOR_WEATHER = {
  status: "canceled",
  attendanceStatus: "canceled",
  canceledAt: FieldValue.serverTimestamp(),
  cancelReason: "weather",
  canceledByRole: "weather",
};

/** Libera para o atleta escolher (`pending_choice`). `null` se a reserva mudou no caminho. */
async function releaseForChoice(
  db: Firestore,
  bookingId: string,
  ctx: ReleaseContext,
  cls: Pick<RainClassification, "fraction" | "creditableReais">,
): Promise<DocumentData | null> {
  const ref = db.collection(ARENA_BOOKINGS).doc(bookingId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const booking = snap.data();
    if (!isReleasable(booking)) return null;
    tx.update(ref, {weatherRelease: releaseMap(booking as DocumentData, ctx, cls, "pending_choice")});
    return booking as DocumentData;
  });
}

/** Chuva no meio do jogo: crédito proporcional na hora, a reserva segue de pé. */
async function creditMidGame(
  db: Firestore,
  bookingId: string,
  ctx: ReleaseContext,
  cls: Pick<RainClassification, "fraction" | "creditableReais">,
): Promise<{booking: DocumentData; creditReais: number; expiresAtMs: number | null} | null> {
  const ref = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const creditRef = db.collection(ARENA_WEATHER_CREDITS).doc(weatherCreditIdFor(bookingId));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const booking = snap.data();
    if (!isReleasable(booking)) return null;
    const [creditSnap, userSnap] = await tx.getAll(creditRef, db.collection("users").doc(str(booking?.["athleteId"])));
    const expiresAtMs = weatherCreditExpiresAtMs(ctx.policy, ctx.nowMs);
    if (!creditSnap?.exists) {
      tx.set(creditRef, weatherCreditDoc({
        originBookingId: bookingId,
        booking: booking as DocumentData,
        athleteName: athleteNameFrom(userSnap?.data()),
        amountReais: cls.creditableReais,
        balanceReais: cls.creditableReais,
        source: "mid_game",
        expiresAtMs,
        nowMs: ctx.nowMs,
      }));
    }
    tx.update(ref, {
      weatherRelease: releaseMap(booking as DocumentData, ctx, cls, "credited", {
        resolvedAt: Timestamp.fromMillis(ctx.nowMs),
        creditId: creditRef.id,
        autoCredited: true,
      }),
    });
    return {booking: booking as DocumentData, creditReais: cls.creditableReais, expiresAtMs};
  });
}

/** Reserva sem nada pago: só cancela (e o horário entra no bloqueio, se houver). */
async function cancelUnpaid(
  db: Firestore,
  bookingId: string,
  ctx: ReleaseContext,
  block: WeatherBlock | null,
): Promise<DocumentData | null> {
  const ref = db.collection(ARENA_BOOKINGS).doc(bookingId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const booking = snap.data();
    if (!isReleasable(booking) || bookingPaidReais(booking as DocumentData) > 0) return null;
    const transfer = await prepareBlockTransfer(tx, db, bookingId, booking as DocumentData, block, ctx.nowMs);
    tx.update(ref, {
      ...CANCEL_FOR_WEATHER,
      weatherRelease: releaseMap(booking as DocumentData, ctx, {fraction: 1, creditableReais: 0}, "canceled_unpaid", {
        resolvedAt: Timestamp.fromMillis(ctx.nowMs),
      }),
    });
    transfer();
    return booking as DocumentData;
  });
}

// ── Avisos ───────────────────────────────────────────────────────────────

async function notify(userId: string, title: string, body: string, type: string, data: Record<string, string>) {
  if (!userId) return;
  try {
    await deliverNotificationToUser({
      userId,
      title,
      body,
      type,
      data: {type, url: ATHLETE_PUSH_URL, ...data},
      requireInteraction: false,
    });
  } catch (e) {
    logger.warn(`weather: aviso ${type} falhou para ${userId}`, e);
  }
}

function bookingPushData(bookingId: string, booking: DocumentData): Record<string, string> {
  return {bookingId, arenaId: str(booking["arenaId"])};
}

function notifyReleased(bookingId: string, booking: DocumentData, arenaName: string, message: string | null) {
  return notify(
    str(booking["athleteId"]),
    `Chuva na ${arenaName}`,
    message ??
      `Seu horário das ${str(booking["startTime"])} pode ser remarcado sem custo ou virar crédito. Toque para escolher.`,
    "arena_weather_release",
    bookingPushData(bookingId, booking),
  );
}

function notifyCredit(bookingId: string, booking: DocumentData, arenaName: string, creditReais: number,
  expiresAtMs: number | null, reason: "mid_game" | "auto") {
  const until = expiresAtMs == null ? "" : ` até ${shortDate(new Date(expiresAtMs - 3 * 3600_000).toISOString().substring(0, 10))}`;
  const body = reason === "mid_game" ?
    `A chuva interrompeu seu jogo na ${arenaName}. O valor proporcional virou crédito para a próxima reserva${until}.` :
    `Você não escolheu em 24h, então guardamos o valor como crédito na ${arenaName}${until}.`;
  return notify(str(booking["athleteId"]), `Crédito de chuva: ${brl(creditReais)}`, body,
    "arena_weather_credit", bookingPushData(bookingId, booking));
}

function notifyCanceledUnpaid(bookingId: string, booking: DocumentData, arenaName: string) {
  const dateKey = parseDateKeyFromBooking(booking["date"]) ?? "";
  return notify(
    str(booking["athleteId"]),
    "Reserva cancelada por chuva",
    `${arenaName} · ${str(booking["courtName"]) || "Quadra"} · ${shortDate(dateKey)} às ${str(booking["startTime"])}. ` +
      "Nada foi cobrado.",
    "arena_weather_canceled",
    bookingPushData(bookingId, booking),
  );
}

// ── Política e previsão ──────────────────────────────────────────────────

export const saveArenaWeatherPolicy = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as {arenaId?: unknown; policy?: unknown};
  const arenaId = requireText(data.arenaId, "arenaId");
  const db = getFirestore();
  await assertArenaAreaAccess(db, arenaId, uid, "agenda", "write");
  const policy = normalizeWeatherPolicy(data.policy);
  await db.collection("arenas").doc(arenaId).update({
    weatherPolicy: {...policy, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid},
  });
  return {policy};
});

export const getArenaWeatherForecast = onCall({
  region: CLIENT_FACING_REGIONS,
  secrets: [WEATHER_API_KEY],
}, async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as {arenaId?: unknown; date?: unknown};
  const arenaId = requireText(data.arenaId, "arenaId");
  const date = requireDateKey(data.date);
  const db = getFirestore();
  await assertArenaAreaAccess(db, arenaId, uid, "agenda", "read");
  const arena = await loadArena(db, arenaId);
  const weather = await fetchArenaWeather(arena.data, date);
  return {
    forecast: weather ? {hours: weather.hours, source: weather.source, fetchedAt: new Date().toISOString()} : null,
  };
});

// ── Modo chuva ───────────────────────────────────────────────────────────

/** Pedido pendente de uma reserva que o Modo chuva acabou de liberar: atendido. */
async function settlePendingRequest(db: Firestore, bookingId: string, decidedBy: string): Promise<void> {
  const ref = db.collection(ARENA_WEATHER_REQUESTS).doc(bookingId);
  const snap = await ref.get();
  if (snap.data()?.["status"] !== "pending") return;
  await ref.update({status: "approved", autoApproved: false, decidedAt: FieldValue.serverTimestamp(), decidedBy,
    viaRainMode: true});
}

interface AffectedBooking {
  id: string;
  data: DocumentData;
  cls: RainClassification;
}

async function affectedBookings(
  db: Firestore,
  arenaId: string,
  date: string,
  period: {start: number; end: number},
  courtIds: string[],
  policy: WeatherPolicy,
): Promise<AffectedBooking[]> {
  const snap = await db.collection(ARENA_BOOKINGS)
    .where("arenaId", "==", arenaId)
    .where("date", "==", date)
    .get();
  const courts = new Set(courtIds);
  const out: AffectedBooking[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!courts.has(str(data["courtId"]))) continue;
    const cls = classifyBookingForRain(doc.id, data, period, policy);
    if (cls) out.push({id: doc.id, data, cls});
  }
  return out.sort((a, b) =>
    str(a.data["startTime"]).localeCompare(str(b.data["startTime"])) ||
    str(a.data["courtName"]).localeCompare(str(b.data["courtName"])));
}

function parseRainModeInput(raw: unknown) {
  const data = (raw ?? {}) as Record<string, unknown>;
  const arenaId = requireText(data["arenaId"], "arenaId");
  const date = requireDateKey(data["date"]);
  const period = requirePeriod(data["startTime"], data["endTime"]);
  const courtIds = Array.isArray(data["courtIds"]) ?
    [...new Set((data["courtIds"] as unknown[]).filter((c): c is string => typeof c === "string" && c.trim() !== ""))] :
    [];
  if (courtIds.length === 0) throw new HttpsError("invalid-argument", "Escolha ao menos uma quadra.");
  return {arenaId, date, period, courtIds, data};
}

export const previewArenaRainMode = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request);
  const {arenaId, date, period, courtIds} = parseRainModeInput(request.data);
  const db = getFirestore();
  await assertArenaAreaAccess(db, arenaId, uid, "agenda", "read");
  const arena = await loadArena(db, arenaId);
  const affected = await affectedBookings(db, arenaId, date, period, courtIds, arena.policy);
  const names = await athleteNames(db, affected.map((b) => str(b.data["athleteId"])));
  const totals = {release: 0, partial: 0, cancel: 0, manual: 0, creditableReais: 0};
  const bookings = affected.map(({id, data, cls}) => {
    totals[cls.treatment]++;
    totals.creditableReais = roundMoney(totals.creditableReais + cls.creditableReais);
    const athleteId = str(data["athleteId"]) || null;
    return {
      bookingId: id,
      athleteId,
      athleteName: (athleteId ? names.get(athleteId) : null) ?? (str(data["customerName"]) || null),
      courtId: str(data["courtId"]),
      courtName: str(data["courtName"]) || "Quadra",
      startTime: str(data["startTime"]),
      endTime: str(data["endTime"]),
      paidReais: cls.paidReais,
      paymentLabel: paymentLabelOf(data),
      treatment: cls.treatment,
      manualReason: cls.manualReason,
      creditableReais: cls.creditableReais,
      fraction: cls.fraction,
    };
  });
  return {bookings, totals};
});

export const activateArenaRainMode = onCall({
  region: CLIENT_FACING_REGIONS,
  secrets: WEATHER_AND_PUSH_SECRETS,
  timeoutSeconds: 120,
}, async (request) => {
  const uid = requireUid(request);
  const {arenaId, date, period, courtIds, data} = parseRainModeInput(request.data);
  const db = getFirestore();
  await assertArenaAreaAccess(db, arenaId, uid, "agenda", "write");
  const arena = await loadArena(db, arenaId);
  if (!arena.policy.enabled) {
    throw new HttpsError("failed-precondition", "Ligue a política de clima antes de ativar o Modo chuva.");
  }
  const nowMs = Date.now();
  if (date < spNow(new Date(nowMs)).dateKey) {
    throw new HttpsError("invalid-argument", "Não dá para ativar o Modo chuva num dia que já passou.");
  }
  const blockNewBookings = data["blockNewBookings"] === true;
  const message = optionalText(data["message"], 280);
  const weather = await fetchArenaWeather(arena.data, date);
  const forecast = weather?.hours ?? null;

  const eventRef = db.collection(ARENA_WEATHER_EVENTS).doc();
  const startTime = data["startTime"] as string;
  const endTime = data["endTime"] as string;
  await eventRef.set({
    arenaId,
    arenaName: arena.name,
    date,
    startTime,
    endTime,
    courtIds,
    blockNewBookings,
    message,
    status: "active",
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    counts: {release: 0, partial: 0, cancel: 0, manual: 0},
    bookingIds: [],
    forecast,
    forecastSource: weather?.source ?? null,
  });
  const block: WeatherBlock | null = blockNewBookings ?
    {eventId: eventRef.id, blockId: weatherBlockIdFor(eventRef.id), arenaId, date, courtIds,
      start: period.start, end: period.end} :
    null;
  if (block) await placeWeatherBlocks(db, block, nowMs);

  const ctx: ReleaseContext = {source: "rain_mode", eventId: eventRef.id, policy: arena.policy, forecast, message,
    nowMs};
  const counts = {release: 0, partial: 0, cancel: 0, manual: 0};
  const bookingIds: string[] = [];
  const notifications: Promise<void>[] = [];
  for (const {id, cls} of await affectedBookings(db, arenaId, date, period, courtIds, arena.policy)) {
    try {
      if (cls.treatment === "manual") {
        counts.manual++;
        continue;
      }
      if (cls.treatment === "release") {
        const booking = await releaseForChoice(db, id, ctx, cls);
        if (!booking) continue;
        await settlePendingRequest(db, id, uid);
        notifications.push(notifyReleased(id, booking, arena.name, message));
      } else if (cls.treatment === "partial") {
        const done = await creditMidGame(db, id, ctx, cls);
        if (!done) continue;
        notifications.push(notifyCredit(id, done.booking, arena.name, done.creditReais, done.expiresAtMs, "mid_game"));
      } else {
        const booking = await cancelUnpaid(db, id, ctx, block);
        if (!booking) continue;
        notifications.push(notifyCanceledUnpaid(id, booking, arena.name));
      }
      counts[cls.treatment]++;
      bookingIds.push(id);
    } catch (e) {
      logger.error(`activateArenaRainMode: reserva ${id} falhou`, e);
    }
  }
  await eventRef.update({counts, bookingIds});
  await Promise.allSettled(notifications);
  logger.info(`Modo chuva ${eventRef.id} na arena ${arenaId}`, {date, counts});
  return {
    eventId: eventRef.id,
    released: counts.release,
    partial: counts.partial,
    canceled: counts.cancel,
    manual: counts.manual,
    notified: notifications.length,
  };
});

export const endArenaRainMode = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as {arenaId?: unknown; eventId?: unknown};
  const arenaId = requireText(data.arenaId, "arenaId");
  const eventId = requireText(data.eventId, "eventId");
  const db = getFirestore();
  await assertArenaAreaAccess(db, arenaId, uid, "agenda", "write");
  const ref = db.collection(ARENA_WEATHER_EVENTS).doc(eventId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.["arenaId"] !== arenaId) {
    throw new HttpsError("not-found", "Modo chuva não encontrado.");
  }
  const block = blockFromEvent(snap);
  const unblocked = block ? await releaseWeatherBlocks(db, block) : 0;
  await ref.update({status: "ended", endedAt: FieldValue.serverTimestamp(), endedBy: uid});
  return {unblocked};
});

// ── Escolha do atleta ────────────────────────────────────────────────────

function pendingReleaseOf(booking: DocumentData | undefined, uid: string | null): DocumentData {
  if (!booking) throw new HttpsError("not-found", "Reserva não encontrada.");
  if (uid != null && str(booking["athleteId"]) !== uid) {
    throw new HttpsError("permission-denied", "Esta reserva não é sua.");
  }
  const release = booking["weatherRelease"] as DocumentData | undefined;
  if (!release || release["status"] !== "pending_choice") {
    throw new HttpsError("failed-precondition", "Esta reserva não está liberada por chuva.");
  }
  return release;
}

async function readEventForBlock(tx: Transaction, db: Firestore, release: DocumentData): Promise<WeatherBlock | null> {
  const eventId = str(release["eventId"]);
  if (!eventId) return null;
  return blockFromEvent(await tx.get(db.collection(ARENA_WEATHER_EVENTS).doc(eventId)));
}

/** Guarda como crédito (escolha do atleta, ou `uid: null` = automático depois de 24h). */
export async function creditWeatherRelease(
  db: Firestore,
  bookingId: string,
  opts: {uid: string | null; nowMs: number},
): Promise<{creditId: string; creditReais: number; expiresAtMs: number | null; booking: DocumentData; arenaName: string}> {
  const ref = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const creditRef = db.collection(ARENA_WEATHER_CREDITS).doc(weatherCreditIdFor(bookingId));
  return db.runTransaction(async (tx) => {
    const booking = (await tx.get(ref)).data();
    const release = pendingReleaseOf(booking, opts.uid);
    const b = booking as DocumentData;
    const arena = arenaInfoFrom(await tx.get(db.collection("arenas").doc(str(b["arenaId"]))));
    const block = await readEventForBlock(tx, db, release);
    const transfer = await prepareBlockTransfer(tx, db, bookingId, b, block, opts.nowMs);
    const [creditSnap, userSnap] = await tx.getAll(creditRef, db.collection("users").doc(str(b["athleteId"])));
    const creditReais = roundMoney(Number(release["creditableReais"]) || 0);
    const expiresAtMs = weatherCreditExpiresAtMs(arena.policy, opts.nowMs);
    const source: WeatherCreditSource = opts.uid == null ? "auto" : "choice";
    if (!creditSnap?.exists) {
      tx.set(creditRef, weatherCreditDoc({
        originBookingId: bookingId,
        booking: b,
        athleteName: athleteNameFrom(userSnap?.data()),
        amountReais: creditReais,
        balanceReais: creditReais,
        source,
        expiresAtMs,
        nowMs: opts.nowMs,
      }));
    }
    tx.update(ref, {
      ...CANCEL_FOR_WEATHER,
      "weatherRelease.status": "credited",
      "weatherRelease.resolvedAt": Timestamp.fromMillis(opts.nowMs),
      "weatherRelease.creditId": creditRef.id,
      "weatherRelease.autoCredited": opts.uid == null,
    });
    transfer();
    return {creditId: creditRef.id, creditReais, expiresAtMs, booking: b, arenaName: arena.name};
  });
}

interface RescheduleInput {
  courtId: string;
  courtName: string | null;
  date: string;
  startTime: string;
  endTime: string;
  selectedSlotStartTimes?: string[];
}

function parseRescheduleInput(raw: unknown): RescheduleInput {
  const d = (raw ?? {}) as Record<string, unknown>;
  const startTime = requireText(d["startTime"], "startTime");
  const endTime = requireText(d["endTime"], "endTime");
  requirePeriod(startTime, endTime);
  return {
    courtId: requireText(d["courtId"], "courtId"),
    courtName: optionalText(d["courtName"], 80),
    date: requireDateKey(d["date"]),
    startTime,
    endTime,
    selectedSlotStartTimes: Array.isArray(d["selectedSlotStartTimes"]) ?
      (d["selectedSlotStartTimes"] as unknown[]).filter((s): s is string => typeof s === "string") :
      undefined,
  };
}

/** Remarca: reserva nova paga com o valor da antiga; diferença na arena, sobra vira crédito. */
export async function rescheduleWeatherRelease(
  db: Firestore,
  bookingId: string,
  uid: string,
  input: RescheduleInput,
  nowMs: number,
) {
  const oldRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const old = (await oldRef.get()).data();
  const release = pendingReleaseOf(old, uid);
  const o = old as DocumentData;
  const arenaId = str(o["arenaId"]);
  const arena = await loadArena(db, arenaId);
  if (release["canReschedule"] !== true || !arena.policy.allowReschedule) {
    throw new HttpsError("failed-precondition", "Esta reserva não pode ser remarcada; guarde o valor como crédito.");
  }
  const today = spNow(new Date(nowMs)).dateKey;
  const until = str(release["rescheduleUntil"]);
  if (input.date < today || (until && input.date > until)) {
    throw new HttpsError("invalid-argument", `Escolha um dia até ${until ? shortDate(until) : "o prazo"}.`);
  }
  const win = requirePeriod(input.startTime, input.endTime);
  const startMs = spWallTimeToEpochMs(input.date, win.start);
  if (startMs <= nowMs) throw new HttpsError("invalid-argument", "Esse horário já passou.");

  const ctx = await loadPricingContext(arenaId, input.courtId);
  const total = calculateBookingTotal({
    arenaId,
    courtId: input.courtId,
    dateKey: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    courtData: ctx.courtData,
    arenaFallback: ctx.arenaFallback,
    promotions: ctx.promotions,
    selectedSlotStartTimes: input.selectedSlotStartTimes,
  });
  if (total.amountReais <= 0) {
    throw new HttpsError("failed-precondition", "A arena ainda não configurou o preço desta quadra.");
  }
  await ensurePeakRuleSatisfied({
    db,
    arenaId,
    courtId: input.courtId,
    dateKey: input.date,
    peakRules: ctx.peakRules,
    courtData: ctx.courtData,
    arenaFallback: ctx.arenaFallback,
    selectionStartTimes: total.lineItems.map((l) => l.startTime),
  });

  const creditable = roundMoney(Number(release["creditableReais"]) || 0);
  const money = rescheduleSettlement(creditable, total.amountReais);
  const hours = hoursInRange(win.start, win.end);
  const lockRefs = hours.map((h) => db.collection(ARENA_SLOT_LOCKS).doc(hourLockId(arenaId, input.courtId, input.date, h)));
  const newRef = db.collection(ARENA_BOOKINGS).doc();
  const creditRef = db.collection(ARENA_WEATHER_CREDITS).doc(weatherCreditIdFor(bookingId));
  const courtName = str(ctx.courtData["name"]) || input.courtName || "Quadra";
  const athleteId = uid;
  const expiresAtMs = weatherCreditExpiresAtMs(arena.policy, nowMs);

  await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(oldRef)).data();
    const freshRelease = pendingReleaseOf(fresh, uid);
    const lockSnaps = await tx.getAll(...lockRefs);
    if (lockSnaps.some((s) => s.exists)) {
      throw new HttpsError("already-exists", "Esse horário acabou de ser reservado. Escolha outro.");
    }
    const block = await readEventForBlock(tx, db, freshRelease);
    const transfer = await prepareBlockTransfer(tx, db, bookingId, fresh as DocumentData, block, nowMs);
    const [creditSnap, userSnap] = await tx.getAll(creditRef, db.collection("users").doc(athleteId));

    tx.set(newRef, {
      athleteId,
      arenaId,
      arenaName: str(o["arenaName"]) || arena.name,
      courtId: input.courtId,
      courtName,
      sport: o["sport"] ?? null,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      amountReais: total.amountReais,
      amountToPayNowReais: 0,
      amountPaidOnlineReais: 0,
      amountDueOnsiteReais: money.dueOnsiteReais,
      paymentChannel: "weather_credit",
      paymentReceiver: null,
      paymentFraction: null,
      paymentStatus: money.dueOnsiteReais > 0 ? "partial" : "paid",
      status: "active",
      attendanceConfirmed: false,
      attendanceStatus: "pending",
      confirmationDeadline: Timestamp.fromMillis(startMs - 2 * 3600_000),
      paymentExpiresAt: null,
      source: "platform",
      appliedPromotionIds: total.appliedPromotionIds,
      couponId: null,
      couponCode: null,
      couponDiscountReais: 0,
      pricingLineItems: total.lineItems.map((l) => ({
        startTime: l.startTime,
        endTime: l.endTime,
        baseSlotPriceReais: l.baseSlotPriceReais,
        finalSlotPriceReais: l.finalSlotPriceReais,
        appliedPromotionId: l.appliedPromotionId ?? null,
      })),
      weatherCreditReais: money.coveredReais,
      weatherCreditUses: [{creditId: creditRef.id, amountReais: money.coveredReais}],
      rescheduledFromBookingId: bookingId,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.collection(ARENA_BOOKING_PRICING).doc(newRef.id), {
      arenaId,
      athleteId,
      amountReais: total.amountReais,
      weatherCreditReais: money.coveredReais,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.collection(ARENA_SLOTS).doc(newRef.id), {
      arenaId,
      courtId: input.courtId,
      date: input.date,
      dateKey: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      status: "booked",
      bookingAthleteId: athleteId,
      bookingId: newRef.id,
      priceReais: total.amountReais,
      createdAt: FieldValue.serverTimestamp(),
    });
    hours.forEach((h, i) => {
      tx.set(lockRefs[i] as DocumentReference, {
        arenaId,
        courtId: input.courtId,
        date: input.date,
        startTime: `${h.toString().padStart(2, "0")}:00`,
        endTime: h >= 23 ? "24:00" : `${(h + 1).toString().padStart(2, "0")}:00`,
        bookingId: newRef.id,
        bookingAthleteId: athleteId,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    if (!creditSnap?.exists) {
      tx.set(creditRef, weatherCreditDoc({
        originBookingId: bookingId,
        booking: fresh as DocumentData,
        athleteName: athleteNameFrom(userSnap?.data()),
        amountReais: creditable,
        balanceReais: money.leftoverReais,
        source: "reschedule",
        expiresAtMs,
        nowMs,
        uses: [{bookingId: newRef.id, amountReais: money.coveredReais, kind: "reschedule"}],
      }));
    }
    tx.update(oldRef, {
      ...CANCEL_FOR_WEATHER,
      "weatherRelease.status": "rescheduled",
      "weatherRelease.resolvedAt": Timestamp.fromMillis(nowMs),
      "weatherRelease.creditId": creditRef.id,
      "weatherRelease.rescheduledToBookingId": newRef.id,
    });
    transfer();
  });

  return {
    newBookingId: newRef.id,
    newAmountReais: total.amountReais,
    coveredByCreditReais: money.coveredReais,
    dueOnsiteReais: money.dueOnsiteReais,
    leftoverCreditReais: money.leftoverReais,
    creditId: creditRef.id,
    expiresAt: money.leftoverReais > 0 && expiresAtMs != null ? new Date(expiresAtMs).toISOString() : null,
  };
}

export const chooseArenaWeatherOption = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as {bookingId?: unknown; choice?: unknown; reschedule?: unknown};
  const bookingId = requireText(data.bookingId, "bookingId");
  const db = getFirestore();
  const nowMs = Date.now();

  if (data.choice === "credit") {
    const done = await creditWeatherRelease(db, bookingId, {uid, nowMs});
    return {
      creditId: done.creditId,
      creditReais: done.creditReais,
      expiresAt: done.expiresAtMs == null ? null : new Date(done.expiresAtMs).toISOString(),
    };
  }
  if (data.choice === "keep") {
    const ref = db.collection(ARENA_BOOKINGS).doc(bookingId);
    await db.runTransaction(async (tx) => {
      pendingReleaseOf((await tx.get(ref)).data(), uid);
      tx.update(ref, {
        "weatherRelease.status": "kept",
        "weatherRelease.resolvedAt": Timestamp.fromMillis(nowMs),
      });
    });
    return {kept: true};
  }
  if (data.choice === "reschedule") {
    return rescheduleWeatherRelease(db, bookingId, uid, parseRescheduleInput(data.reschedule), nowMs);
  }
  throw new HttpsError("invalid-argument", "Escolha inválida.");
});

// ── Pedido do atleta ─────────────────────────────────────────────────────

function requestRef(db: Firestore, bookingId: string) {
  return db.collection(ARENA_WEATHER_REQUESTS).doc(bookingId);
}

/**
 * Aprova o pedido: jogo inteiro na chuva → atleta escolhe; pedido feito com o
 * jogo em andamento → crédito proporcional na hora.
 */
async function approveWeatherRequest(
  db: Firestore,
  bookingId: string,
  opts: {decidedBy: string; auto: boolean; nowMs: number},
): Promise<{treatment: "release" | "partial"; booking: DocumentData; arenaName: string;
  creditReais?: number; expiresAtMs?: number | null}> {
  const reqSnap = await requestRef(db, bookingId).get();
  const req = reqSnap.data();
  if (!req || req["status"] !== "pending") {
    throw new HttpsError("failed-precondition", "Este pedido já foi respondido.");
  }
  const arena = await loadArena(db, str(req["arenaId"]));
  const fraction = Math.min(1, Math.max(0, Number(req["fraction"]) || 1));
  const paid = roundMoney(Number(req["paidReais"]) || 0);
  const cls = {fraction, creditableReais: roundMoney(paid * fraction)};
  const ctx: ReleaseContext = {
    source: opts.auto ? "auto" : "request",
    eventId: null,
    policy: arena.policy,
    forecast: Array.isArray(req["forecast"]) ? req["forecast"] as WeatherHour[] : null,
    message: null,
    nowMs: opts.nowMs,
  };
  let result: {treatment: "release" | "partial"; booking: DocumentData; creditReais?: number;
    expiresAtMs?: number | null} | null;
  if (fraction < 1) {
    const done = await creditMidGame(db, bookingId, ctx, cls);
    result = done ? {treatment: "partial", booking: done.booking, creditReais: done.creditReais,
      expiresAtMs: done.expiresAtMs} : null;
  } else {
    const booking = await releaseForChoice(db, bookingId, ctx, cls);
    result = booking ? {treatment: "release", booking} : null;
  }
  if (!result) {
    // Já liberada (o Modo chuva pegou a reserva antes): o pedido está atendido.
    const current = (await db.collection(ARENA_BOOKINGS).doc(bookingId).get()).data();
    if (current?.["weatherRelease"]) {
      await requestRef(db, bookingId).update({status: "approved", autoApproved: opts.auto,
        decidedAt: FieldValue.serverTimestamp(), decidedBy: opts.decidedBy});
      return {treatment: "release", booking: current, arenaName: arena.name};
    }
    await requestRef(db, bookingId).update({status: "rejected", rejectReason: "Reserva não está mais ativa.",
      decidedAt: FieldValue.serverTimestamp(), decidedBy: opts.decidedBy});
    throw new HttpsError("failed-precondition", "A reserva não está mais ativa.");
  }
  await requestRef(db, bookingId).update({
    status: "approved",
    autoApproved: opts.auto,
    decidedAt: FieldValue.serverTimestamp(),
    decidedBy: opts.decidedBy,
  });
  return {...result, arenaName: arena.name};
}

export const requestArenaWeatherRelease = onCall({
  region: CLIENT_FACING_REGIONS,
  secrets: WEATHER_AND_PUSH_SECRETS,
}, async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as {bookingId?: unknown; note?: unknown};
  const bookingId = requireText(data.bookingId, "bookingId");
  const db = getFirestore();
  const nowMs = Date.now();

  const booking = (await db.collection(ARENA_BOOKINGS).doc(bookingId).get()).data();
  if (!booking) throw new HttpsError("not-found", "Reserva não encontrada.");
  if (str(booking["athleteId"]) !== uid) throw new HttpsError("permission-denied", "Esta reserva não é sua.");
  if (!isReleasable(booking)) {
    throw new HttpsError("failed-precondition", "Esta reserva não pode mais ser liberada por chuva.");
  }
  const arenaId = str(booking["arenaId"]);
  const arena = await loadArena(db, arenaId);
  if (!arena.policy.enabled || arena.policy.trigger === "arena") {
    throw new HttpsError("failed-precondition", "Esta arena não recebe pedidos de cancelamento por chuva.");
  }
  if (!policyCoversCourt(arena.policy, str(booking["courtId"]))) {
    throw new HttpsError("failed-precondition", "Esta quadra não entra no cancelamento por chuva.");
  }
  const dateKey = parseDateKeyFromBooking(booking["date"]) ?? "";
  const win = bookingWindow(booking["startTime"], booking["endTime"]);
  if (!dateKey || !win) throw new HttpsError("failed-precondition", "Reserva sem horário válido.");
  const window = weatherRequestWindow(arena.policy, spWallTimeToEpochMs(dateKey, win.start), nowMs);
  if (!window.open) {
    throw new HttpsError("failed-precondition", window.reason === "too_early" ?
      "O pedido abre 24h antes do jogo." :
      "O prazo para pedir já passou.");
  }
  const cls = classifyBookingForRain(bookingId, booking, {start: win.start, end: win.end}, arena.policy);
  if (cls?.treatment === "manual") {
    throw new HttpsError("failed-precondition", "Este tipo de reserva é tratado direto com a arena.");
  }
  const paid = bookingPaidReais(booking);
  if (paid <= 0) {
    throw new HttpsError("failed-precondition", "Reserva sem pagamento online: cancele direto na reserva, sem custo.");
  }

  const ref = requestRef(db, bookingId);
  const existing = (await ref.get()).data();
  if (existing && existing["status"] !== "withdrawn") {
    if (existing["status"] === "pending") return {status: "pending", weather: existing["weather"] ?? null};
    throw new HttpsError("failed-precondition", "Já existe um pedido para esta reserva.");
  }

  const fetched = await fetchArenaWeather(arena.data, dateKey, {nowMs});
  const hours = fetched?.hours ?? null;
  const inWindow = hours ? weatherHoursInWindow(hours, win.start, win.end) : [];
  const summary = summarizeWeather(inWindow);
  const weather = fetched ? {...summary, source: fetched.source, fetchedAt: Timestamp.fromMillis(nowMs)} : null;
  const fraction = window.afterStart ? remainingFraction(win, spNow(new Date(nowMs)).minutes) : 1;
  const athleteName = (await athleteNames(db, [uid])).get(uid) ?? "Atleta";
  await ref.set({
    arenaId,
    bookingId,
    athleteId: uid,
    athleteName,
    courtId: str(booking["courtId"]),
    courtName: str(booking["courtName"]) || "Quadra",
    date: dateKey,
    startTime: str(booking["startTime"]),
    endTime: str(booking["endTime"]),
    paidReais: paid,
    fraction,
    afterStart: window.afterStart,
    note: optionalText(data.note, 280),
    status: "pending",
    weather,
    forecast: inWindow,
    autoApproved: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  if (arena.policy.trigger === "auto" && weatherMeetsAutoThreshold(summary)) {
    await approveWeatherRequest(db, bookingId, {decidedBy: "auto", auto: true, nowMs});
    return {status: "approved", weather: hours ? summary : null};
  }

  const managerUid = str(arena.data["managerUserId"]);
  if (managerUid) {
    try {
      await deliverNotificationToUser({
        userId: managerUid,
        title: "Pedido de cancelamento por chuva",
        body: `${athleteName} · ${str(booking["courtName"]) || "Quadra"} · ${shortDate(dateKey)} às ${str(booking["startTime"])}`,
        type: "arena_weather_request",
        data: {
          type: "arena_weather_request",
          arenaId,
          bookingId,
          url: `/arena/bookings/detail/${bookingId}`,
          webUrl: "/painel/agenda/chuva/solicitacoes",
        },
        requireInteraction: false,
      });
    } catch (e) {
      logger.warn("weather: aviso do pedido à arena falhou", e);
    }
  }
  return {status: "pending", weather: hours ? summary : null};
});

export const withdrawArenaWeatherRequest = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request);
  const bookingId = requireText((request.data ?? {}).bookingId, "bookingId");
  const db = getFirestore();
  const ref = requestRef(db, bookingId);
  await db.runTransaction(async (tx) => {
    const req = (await tx.get(ref)).data();
    if (!req || str(req["athleteId"]) !== uid) throw new HttpsError("not-found", "Pedido não encontrado.");
    if (req["status"] !== "pending") throw new HttpsError("failed-precondition", "Este pedido já foi respondido.");
    tx.update(ref, {status: "withdrawn", decidedAt: FieldValue.serverTimestamp(), decidedBy: uid});
  });
  return {status: "withdrawn"};
});

export const decideArenaWeatherRequest = onCall({
  region: CLIENT_FACING_REGIONS,
  secrets: PUSH_SECRETS,
}, async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as {arenaId?: unknown; bookingId?: unknown; approve?: unknown; reason?: unknown};
  const arenaId = requireText(data.arenaId, "arenaId");
  const bookingId = requireText(data.bookingId, "bookingId");
  const db = getFirestore();
  await assertArenaAreaAccess(db, arenaId, uid, "agenda", "write");
  const req = (await requestRef(db, bookingId).get()).data();
  if (!req || str(req["arenaId"]) !== arenaId) throw new HttpsError("not-found", "Pedido não encontrado.");
  const athleteId = str(req["athleteId"]);
  const nowMs = Date.now();

  if (data.approve === true) {
    const done = await approveWeatherRequest(db, bookingId, {decidedBy: uid, auto: false, nowMs});
    if (done.treatment === "partial") {
      await notifyCredit(bookingId, done.booking, done.arenaName, done.creditReais ?? 0, done.expiresAtMs ?? null,
        "mid_game");
    } else {
      await notify(athleteId, "Pedido aprovado: chuva", `A ${done.arenaName} liberou seu horário. ` +
        "Remarque ou guarde o valor como crédito, sem custo.", "arena_weather_request_decided",
      {bookingId, arenaId, approved: "true"});
    }
    return {status: "approved"};
  }

  const reason = optionalText(data.reason, 280);
  await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(requestRef(db, bookingId))).data();
    if (!fresh || fresh["status"] !== "pending") {
      throw new HttpsError("failed-precondition", "Este pedido já foi respondido.");
    }
    tx.update(requestRef(db, bookingId), {
      status: "rejected",
      rejectReason: reason,
      decidedAt: FieldValue.serverTimestamp(),
      decidedBy: uid,
    });
  });
  await notify(athleteId, "Pedido de cancelamento por chuva recusado",
    reason ?? "A arena manteve sua reserva.", "arena_weather_request_decided",
    {bookingId, arenaId, approved: "false"});
  return {status: "rejected"};
});

// ── Varredura ────────────────────────────────────────────────────────────

/**
 * 1) quem não escolheu em 24h recebe o crédito; 2) crédito vencido expira
 * (vira receita da arena — o dinheiro já está lá); 3) aviso 7 dias antes.
 */
export async function runWeatherSweep(db: Firestore, nowMs: number): Promise<{
  autoCredited: number;
  expired: number;
  reminded: number;
}> {
  let autoCredited = 0;
  const pending = await db.collection(ARENA_BOOKINGS)
    .where("weatherRelease.status", "==", "pending_choice")
    .where("weatherRelease.decisionDeadline", "<=", Timestamp.fromMillis(nowMs))
    .limit(200)
    .get();
  for (const doc of pending.docs) {
    try {
      const done = await creditWeatherRelease(db, doc.id, {uid: null, nowMs});
      autoCredited++;
      await notifyCredit(doc.id, done.booking, done.arenaName, done.creditReais, done.expiresAtMs, "auto");
    } catch (e) {
      logger.warn(`weather sweep: crédito automático de ${doc.id} falhou`, e);
    }
  }

  const expiredSnap = await db.collection(ARENA_WEATHER_CREDITS)
    .where("status", "==", "open")
    .where("expiresAt", "<=", Timestamp.fromMillis(nowMs))
    .limit(300)
    .get();
  for (const doc of expiredSnap.docs) {
    await doc.ref.update({
      status: "expired",
      expiredReais: roundMoney(Number(doc.data()["balanceReais"]) || 0),
      balanceReais: 0,
      expiredAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  let reminded = 0;
  const soon = await db.collection(ARENA_WEATHER_CREDITS)
    .where("status", "==", "open")
    .where("expiresAt", "<=", Timestamp.fromMillis(nowMs + WEATHER_CREDIT_REMINDER_MS))
    .limit(300)
    .get();
  for (const doc of soon.docs) {
    const c = doc.data();
    if (c["reminderSentAt"] != null) continue;
    const expiresAt = c["expiresAt"] instanceof Timestamp ? c["expiresAt"].toMillis() : null;
    if (expiresAt == null || expiresAt <= nowMs) continue;
    const day = new Date(expiresAt - 3 * 3600_000).toISOString().substring(0, 10);
    await notify(str(c["athleteId"]), "Seu crédito de chuva vence em breve",
      `${brl(Number(c["balanceReais"]) || 0)} na ${str(c["arenaName"]) || "arena"} até ${shortDate(day)}.`,
      "arena_weather_credit_expiring", {arenaId: str(c["arenaId"]), creditId: doc.id, url: "/my-bookings"});
    await doc.ref.update({reminderSentAt: FieldValue.serverTimestamp()});
    reminded++;
  }

  return {autoCredited, expired: expiredSnap.size, reminded};
}

export const sweepArenaWeatherCredits = onSchedule({
  schedule: "every 60 minutes",
  timeZone: "America/Sao_Paulo",
  secrets: PUSH_SECRETS,
}, async () => {
  const result = await runWeatherSweep(getFirestore(), Date.now());
  logger.info("sweepArenaWeatherCredits", result);
});
