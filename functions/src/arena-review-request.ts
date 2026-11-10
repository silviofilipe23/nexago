/**
 * Avaliar a arena · push "Como foi o jogo?" depois do horário.
 *
 * O app só pedia a avaliação numa tela que saiu da navegação (08/06/2026) e não havia aviso
 * nenhum: a avaliação depois do horário não chegava ao atleta. Esta agendada avisa o DONO da
 * reserva 5 minutos depois do fim (o mesmo atraso do app e do portal), uma vez por reserva, e
 * só se ele ainda não avaliou.
 *
 * - `url` = `/my-bookings`: existe nos builds da loja (que só leem `url`); o app novo reconhece o
 *   tipo e abre a tela de avaliar pelo `bookingId`.
 * - `webUrl` = detalhe da reserva no portal do atleta, que tem o botão "Avaliar experiência".
 * - Janela curta (até 6 h depois do fim): a primeira rodada depois do deploy não cobra jogos
 *   antigos, e uma reserva que o lote não alcançou não vira push no dia seguinte.
 */
import * as logger from "firebase-functions/logger";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";

import {arenaBookingStartAt} from "./arena-booking-start-at";
import {dayKeyFromEventDate} from "./event-timezone";
import {
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
  deliverNotificationToUser,
} from "./notification-delivery";

export const ARENA_REVIEW_REQUEST_TYPE = "arena_review_request";
export const ARENA_REVIEW_REQUESTS = "arenaReviewRequests";
export const REVIEW_REQUEST_DELAY_MS = 5 * 60_000;
export const REVIEW_REQUEST_MAX_AGE_MS = 6 * 60 * 60_000;
export const ARENA_REVIEW_XP = 10;

const DAY_MS = 86_400_000;
const TIME_RE = /^\d{1,2}:\d{2}/;

/** Reserva que terminou de fato: cancelada, recusada, expirada ou só bloqueio nunca pede nota. */
const NOT_PLAYED_STATUSES = new Set([
  "canceled",
  "cancelled",
  "expired",
  "rejected",
  "declined",
  "blocked",
  "maintenance",
  "pending",
  "pending_payment",
]);

type Data = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** `date` gravado como `YYYY-MM-DD` (ou ISO); null quando não dá para datar. */
export function bookingDateKey(booking: Data): string {
  const raw = str(booking["date"]);
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : "";
}

/** Fim real da reserva em SP, somando um dia quando cruza a meia-noite (22:00 → 01:00). */
export function bookingEndsAt(booking: Data): Date | null {
  const dateKey = bookingDateKey(booking);
  const start = str(booking["startTime"]);
  const end = str(booking["endTime"]);
  if (!dateKey || !TIME_RE.test(start) || !TIME_RE.test(end)) return null;
  const startAt = arenaBookingStartAt(dateKey, start);
  const endAt = arenaBookingStartAt(dateKey, end);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return null;
  return endAt.getTime() > startAt.getTime() ? endAt : new Date(endAt.getTime() + DAY_MS);
}

/** Dono da reserva: quem avalia (o `submitArenaReview` do app recusa outro uid). */
export function bookingOwnerUid(booking: Data): string {
  return str(booking["athleteId"]) || str(booking["bookingAthleteId"]);
}

/** Hora de pedir a avaliação: jogada, com dono e arena, entre 5 min e 6 h depois do fim. */
export function reviewRequestDue(booking: Data, now: Date): boolean {
  const status = str(booking["status"]).toLowerCase();
  if (NOT_PLAYED_STATUSES.has(status)) return false;
  if (!bookingOwnerUid(booking) || !str(booking["arenaId"])) return false;
  const endsAt = bookingEndsAt(booking);
  if (!endsAt) return false;
  const since = now.getTime() - endsAt.getTime();
  return since >= REVIEW_REQUEST_DELAY_MS && since <= REVIEW_REQUEST_MAX_AGE_MS;
}

export interface ArenaReviewRequest {
  bookingId: string;
  uid: string;
  arenaId: string;
  arenaName: string;
  startTime: string;
}

export function reviewRequestCopy(r: ArenaReviewRequest): {title: string; body: string} {
  const arena = r.arenaName || "na arena";
  return {
    title: r.arenaName ? `Como foi o jogo na ${arena}?` : "Como foi o jogo?",
    body: `Avalie sua reserva das ${r.startTime} em 20 segundos e ganhe +${ARENA_REVIEW_XP} XP.`,
  };
}

/** Uma rodada: devolve quantos avisos saíram. `send` é injetado para o teste. */
export async function sendArenaReviewRequestsCore(
  db: Firestore,
  now: Date,
  send: (r: ArenaReviewRequest) => Promise<void>,
): Promise<{sent: number; skipped: number}> {
  const today = dayKeyFromEventDate(now);
  const yesterday = dayKeyFromEventDate(new Date(now.getTime() - DAY_MS));
  const snap = await db.collection("arenaBookings").where("date", "in", [yesterday, today]).get();

  let sent = 0;
  let skipped = 0;
  for (const doc of snap.docs) {
    const booking = (doc.data() ?? {}) as Data;
    if (!reviewRequestDue(booking, now)) continue;

    const reviewed = await db.collection("arena_reviews").where("bookingId", "==", doc.id).limit(1).get();
    if (!reviewed.empty) {
      skipped++;
      continue;
    }

    const request: ArenaReviewRequest = {
      bookingId: doc.id,
      uid: bookingOwnerUid(booking),
      arenaId: str(booking["arenaId"]),
      arenaName: str(booking["arenaName"]),
      startTime: str(booking["startTime"]).slice(0, 5),
    };

    // Trava por reserva: `create` falha se outra rodada já avisou.
    const lock = db.collection(ARENA_REVIEW_REQUESTS).doc(doc.id);
    try {
      await lock.create({
        bookingId: doc.id,
        athleteId: request.uid,
        arenaId: request.arenaId,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch {
      skipped++;
      continue;
    }

    try {
      await send(request);
      sent++;
    } catch (err) {
      logger.warn("arena-review-request: push falhou", {bookingId: doc.id, err});
      await lock.delete().catch(() => undefined);
    }
  }
  return {sent, skipped};
}

async function pushArenaReviewRequest(r: ArenaReviewRequest): Promise<void> {
  const {title, body} = reviewRequestCopy(r);
  await deliverNotificationToUser({
    userId: r.uid,
    title,
    body,
    type: ARENA_REVIEW_REQUEST_TYPE,
    data: {
      bookingId: r.bookingId,
      arenaId: r.arenaId,
      url: "/my-bookings",
      webUrl: `/agenda/reserva/${encodeURIComponent(r.bookingId)}`,
    },
    requireInteraction: false,
  });
}

export const sendArenaReviewRequests = onSchedule({
  schedule: "every 5 minutes",
  timeZone: "America/Sao_Paulo",
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async () => {
  const result = await sendArenaReviewRequestsCore(getFirestore(), new Date(), pushArenaReviewRequest);
  logger.info("arena-review-request: ciclo concluído", result);
});
