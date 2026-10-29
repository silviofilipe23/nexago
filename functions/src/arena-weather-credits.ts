/**
 * Créditos de clima — `arenaWeatherCredits/{wx_<reserva de origem>}`.
 *
 * Um crédito por reserva liberada por chuva (id determinístico: liberar duas
 * vezes não credita em dobro). Vale só naquela arena e não vira dinheiro: o
 * valor já está na carteira da arena desde o pagamento original, então
 * conceder, usar, devolver e expirar nunca movimentam `arenaWallets`.
 */
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import type {DocumentData, Firestore, Transaction} from "firebase-admin/firestore";
import {
  allocateWeatherCredit,
  bookingWindow,
  spWallTimeToEpochMs,
  usableWeatherCredits,
  weatherCreditStatusFor,
  type OpenWeatherCredit,
  type WeatherCreditUse,
} from "./arena-weather-model";
import {roundMoney} from "./mercadopago-arena-helpers";
import {CANCELED_BOOKING_STATUSES, normalizeBookingStatus, parseDateKeyFromBooking} from "./slot-vacancy-alerts";

export const ARENA_WEATHER_CREDITS = "arenaWeatherCredits";

export function weatherCreditIdFor(originBookingId: string): string {
  return `wx_${originBookingId}`;
}

export type WeatherCreditSource = "choice" | "auto" | "mid_game" | "reschedule";

function timestampMs(v: unknown): number | null {
  return v instanceof Timestamp ? v.toMillis() : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function openCreditFromDoc(id: string, data: DocumentData): OpenWeatherCredit {
  const balance = Number(data["balanceReais"]);
  return {
    id,
    balanceReais: Number.isFinite(balance) ? balance : 0,
    expiresAtMs: timestampMs(data["expiresAt"]),
  };
}

function athleteCreditsQuery(db: Firestore, athleteId: string, arenaId: string) {
  return db.collection(ARENA_WEATHER_CREDITS)
    .where("athleteId", "==", athleteId)
    .where("arenaId", "==", arenaId)
    .where("status", "==", "open");
}

/** Saldo utilizável do atleta na arena (cotação). */
export async function weatherCreditSummary(
  db: Firestore,
  athleteId: string,
  arenaId: string,
  nowMs: number,
): Promise<{availableReais: number; nextExpiresAtMs: number | null; credits: OpenWeatherCredit[]}> {
  const snap = await athleteCreditsQuery(db, athleteId, arenaId).get();
  const credits = usableWeatherCredits(snap.docs.map((d) => openCreditFromDoc(d.id, d.data())), nowMs);
  const cents = credits.reduce((s, c) => s + Math.round(c.balanceReais * 100), 0);
  return {
    availableReais: cents / 100,
    nextExpiresAtMs: credits.find((c) => c.expiresAtMs != null)?.expiresAtMs ?? null,
    credits,
  };
}

/**
 * Lê (dentro da transação) os créditos do atleta e reserva até `amountReais`.
 * Devolve o quanto cobre e a escrita a fazer depois das leituras — o Firestore
 * exige todas as leituras antes de qualquer escrita.
 */
export async function reserveWeatherCreditInTransaction(params: {
  tx: Transaction;
  db: Firestore;
  athleteId: string;
  arenaId: string;
  amountReais: number;
  bookingId: string;
  nowMs: number;
}): Promise<{appliedReais: number; uses: WeatherCreditUse[]; commit: () => void}> {
  const {tx, db, athleteId, arenaId, amountReais, bookingId, nowMs} = params;
  const snap = await tx.get(athleteCreditsQuery(db, athleteId, arenaId));
  const byId = new Map(snap.docs.map((d) => [d.id, openCreditFromDoc(d.id, d.data())]));
  const {appliedReais, uses} = allocateWeatherCredit([...byId.values()], amountReais, nowMs);
  const commit = () => {
    for (const use of uses) {
      const credit = byId.get(use.creditId);
      if (!credit) continue;
      const balance = roundMoney(credit.balanceReais - use.amountReais);
      tx.update(db.collection(ARENA_WEATHER_CREDITS).doc(use.creditId), {
        balanceReais: balance,
        status: weatherCreditStatusFor(balance, credit.expiresAtMs, nowMs),
        uses: FieldValue.arrayUnion({
          bookingId,
          amountReais: use.amountReais,
          at: Timestamp.fromMillis(nowMs),
          kind: "booking",
        }),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  };
  return {appliedReais, uses, commit};
}

/** Dados do crédito novo a partir da reserva de origem. */
export function weatherCreditDoc(params: {
  originBookingId: string;
  booking: DocumentData;
  athleteName: string;
  amountReais: number;
  balanceReais: number;
  source: WeatherCreditSource;
  expiresAtMs: number | null;
  nowMs: number;
  uses?: {bookingId: string; amountReais: number; kind: "booking" | "reschedule"}[];
}): DocumentData {
  const {booking, nowMs} = params;
  return {
    arenaId: str(booking["arenaId"]),
    arenaName: str(booking["arenaName"]) || "Arena",
    athleteId: str(booking["athleteId"]),
    athleteName: params.athleteName,
    originBookingId: params.originBookingId,
    originCourtName: str(booking["courtName"]) || "Quadra",
    originCourtId: str(booking["courtId"]),
    originDate: parseDateKeyFromBooking(booking["date"]) ?? "",
    originStartTime: str(booking["startTime"]),
    amountReais: roundMoney(params.amountReais),
    balanceReais: roundMoney(params.balanceReais),
    status: weatherCreditStatusFor(params.balanceReais, params.expiresAtMs, nowMs),
    source: params.source,
    expiresAt: params.expiresAtMs == null ? null : Timestamp.fromMillis(params.expiresAtMs),
    uses: (params.uses ?? []).map((u) => ({...u, at: Timestamp.fromMillis(nowMs)})),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/**
 * Reserva paga (em parte) com crédito e cancelada: devolve o crédito às
 * origens quando o jogo ainda não tinha começado ou o Pix nem foi pago.
 * Cancelamento por chuva não devolve — o crédito novo já soma essa parte.
 * Idempotente por `weatherCreditRestoredAt`.
 */
export async function restoreWeatherCreditOnCancel(
  db: Firestore,
  bookingId: string,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  nowMs: number,
): Promise<number> {
  if (!after) return 0;
  if (!CANCELED_BOOKING_STATUSES.has(normalizeBookingStatus(after["status"]))) return 0;
  if (CANCELED_BOOKING_STATUSES.has(normalizeBookingStatus(before?.["status"]))) return 0;
  const uses = Array.isArray(after["weatherCreditUses"]) ? after["weatherCreditUses"] as unknown[] : [];
  if (uses.length === 0 || after["weatherCreditRestoredAt"] != null) return 0;
  if (str(after["cancelReason"]) === "weather") return 0;

  const wasPendingPayment = normalizeBookingStatus(before?.["status"]) === "pending_payment";
  const dateKey = parseDateKeyFromBooking(after["date"]);
  const win = bookingWindow(after["startTime"], after["endTime"]);
  const startMs = dateKey && win ? spWallTimeToEpochMs(dateKey, win.start) : null;
  if (!wasPendingPayment && (startMs == null || nowMs >= startMs)) return 0;

  const bookingRef = db.collection("arenaBookings").doc(bookingId);
  return db.runTransaction(async (tx) => {
    const fresh = await tx.get(bookingRef);
    if (fresh.data()?.["weatherCreditRestoredAt"] != null) return 0;
    const parsed = uses
      .map((u) => u as {creditId?: unknown; amountReais?: unknown})
      .filter((u) => typeof u.creditId === "string" && Number(u.amountReais) > 0);
    const refs = parsed.map((u) => db.collection(ARENA_WEATHER_CREDITS).doc(u.creditId as string));
    const snaps = refs.length > 0 ? await tx.getAll(...refs) : [];
    let restored = 0;
    snaps.forEach((snap, i) => {
      if (!snap.exists) return;
      const amount = roundMoney(Number(parsed[i]?.amountReais));
      const data = snap.data() as DocumentData;
      const expiresAtMs = timestampMs(data["expiresAt"]);
      const expired = expiresAtMs != null && expiresAtMs <= nowMs;
      if (expired) {
        tx.update(snap.ref, {
          expiredReais: roundMoney(Number(data["expiredReais"] ?? 0) + amount),
          restoredAfterExpiryAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        const balance = roundMoney(Number(data["balanceReais"] ?? 0) + amount);
        tx.update(snap.ref, {
          balanceReais: balance,
          status: weatherCreditStatusFor(balance, expiresAtMs, nowMs),
          restores: FieldValue.arrayUnion({bookingId, amountReais: amount, at: Timestamp.fromMillis(nowMs)}),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      restored = roundMoney(restored + amount);
    });
    tx.update(bookingRef, {weatherCreditRestoredAt: FieldValue.serverTimestamp()});
    return restored;
  });
}
