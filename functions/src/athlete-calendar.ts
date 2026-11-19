/**
 * Agenda do atleta em outros apps (Fase 3 da análise da Agenda · assinatura de calendário): um
 * feed iCalendar (`.ics`) que o Google Agenda, o Apple Calendário e o Outlook assinam por URL.
 * Mesmo desenho do feed do professor (`professor-calendar.ts`): a URL leva um token aleatório do
 * atleta (`athleteCalendarFeeds/{uid}`, só functions) e trocar o token derruba as assinaturas
 * antigas. Só leitura: o feed nunca muda nada.
 *
 * Entra o que a Agenda do app mostra de compromisso marcado:
 * - reservas em que é dono (`athleteId`/`bookingAthleteId`) ou convidado (`participantUids`);
 *   cancelada sai como cancelada, esperando o Pix como provisória, expirada/recusada nem entra;
 * - aulas em que é aluno (a mesma montagem de `getMyClassAgenda`); "Não vou" sai cancelada. As
 *   aulas que ele dá ficam no feed do professor;
 * - torneios com inscrição paga e fora da fila de espera, como evento de dia inteiro.
 * Clubinho e Bora Jogar ainda não entram.
 */
import {randomBytes} from "node:crypto";
import * as logger from "firebase-functions/logger";
import {onCall, onRequest, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {loadClassAgenda, type ClassAgendaItem} from "./arena-class-athlete-agenda";
import {addDaysToDateKey} from "./arena-recurring-booking";
import {isPaidActiveInscription} from "./benefits-club-eligibility";
import {dayKeyFromEventDate} from "./event-timezone";
import {artifactsInscriptionsPath, artifactsTournamentsPath} from "./firebase-paths";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {buildCalendarIcs, type FeedEvent} from "./professor-calendar";

export const ATHLETE_CALENDAR_FEEDS = "athleteCalendarFeeds";
const FEED_PAST_DAYS = 30;
const FEED_FUTURE_DAYS = 120;
const FEED_REGION = "southamerica-east1";
/** Por consulta de reservas: o mesmo teto do app (64) com folga. */
const MAX_BOOKINGS_PER_QUERY = 200;
const SKIPPED_BOOKING = new Set(["expired", "rejected"]);
const CANCELED_BOOKING = new Set(["canceled", "cancelled"]);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

type Raw = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

const place = (...parts: string[]): string => parts.filter(Boolean).join(" · ");

/**
 * Dia civil (`YYYY-MM-DD`) de uma data de torneio. Meia-noite UTC é a data do calendário
 * (`2026-11-28T00:00Z` = 28/11), como no app (`tournamentEventDateLocal`); com hora, o dia em
 * São Paulo. Texto `YYYY-MM-DD` vale como está.
 */
export function tournamentDayKey(v: unknown): string | null {
  if (typeof v === "string") return DATE_KEY.test(v.trim()) ? v.trim() : null;
  const d = v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : null;
  if (!d) return null;
  const midnightUtc = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  return midnightUtc ? d.toISOString().slice(0, 10) : dayKeyFromEventDate(d);
}

function bookingEvent(id: string, b: Raw, fromKey: string, toKey: string): FeedEvent | null {
  const status = str(b["status"]).toLowerCase();
  const date = str(b["date"]);
  if (SKIPPED_BOOKING.has(status) || !DATE_KEY.test(date) || date < fromKey || date > toKey) return null;
  const arena = str(b["arenaName"]) || str(b["arena"]) || "Arena";
  return {
    uid: `booking-${id}`,
    date, startTime: str(b["startTime"]), endTime: str(b["endTime"]),
    summary: `Reserva · ${arena}`,
    location: place(arena, str(b["courtName"]) || str(b["court"])),
    description: "Reserva no app nexaGO.",
    canceled: CANCELED_BOOKING.has(status),
    tentative: status === "pending_payment",
  };
}

function classEvent(c: ClassAgendaItem): FeedEvent | null {
  if (c.role !== "student") return null;
  return {
    uid: `class-${c.sessionId}`,
    date: c.date, startTime: c.startTime, endTime: c.endTime,
    summary: `Aula · ${c.className || "Aula"}`,
    location: place(c.arenaName, c.courtName),
    description: c.teacherName ? `Prof. ${c.teacherName}` : "",
    canceled: c.status === "canceled" || c.myRsvp === "not_going",
  };
}

async function loadBookingEvents(db: Firestore, uid: string, fromKey: string, toKey: string): Promise<FeedEvent[]> {
  const bookings = db.collection("arenaBookings");
  const snaps = await Promise.all([
    bookings.where("athleteId", "==", uid).limit(MAX_BOOKINGS_PER_QUERY).get(),
    bookings.where("bookingAthleteId", "==", uid).limit(MAX_BOOKINGS_PER_QUERY).get(),
    bookings.where("participantUids", "array-contains", uid).limit(MAX_BOOKINGS_PER_QUERY).get(),
  ]);
  const byId = new Map<string, FeedEvent>();
  for (const snap of snaps) {
    for (const d of snap.docs) {
      if (byId.has(d.id)) continue;
      const event = bookingEvent(d.id, d.data() as Raw, fromKey, toKey);
      if (event) byId.set(d.id, event);
    }
  }
  return [...byId.values()];
}

async function loadTournamentEvents(db: Firestore, uid: string, fromKey: string, toKey: string): Promise<FeedEvent[]> {
  const inscriptions = await db.collection(artifactsInscriptionsPath())
    .where("participantUids", "array-contains", uid).get();
  const paid = inscriptions.docs
    .map((d) => ({id: d.id, data: d.data() as Raw}))
    .filter((i) => isPaidActiveInscription(i.data) && str(i.data["tournamentId"]));
  if (!paid.length) return [];
  const tournamentIds = [...new Set(paid.map((i) => str(i.data["tournamentId"])))];
  const docs = await db.getAll(...tournamentIds.map((id) => db.collection(artifactsTournamentsPath()).doc(id)));
  const tournaments = new Map(docs.map((d) => [d.id, d.data() as Raw | undefined]));

  const events: FeedEvent[] = [];
  for (const i of paid) {
    const t = tournaments.get(str(i.data["tournamentId"]));
    if (!t) continue;
    const first = tournamentDayKey(t["startAt"] ?? t["startDate"]);
    if (!first) continue;
    const endKey = tournamentDayKey(t["endAt"] ?? t["endDate"]);
    const last = endKey && endKey >= first ? endKey : first;
    if (last < fromKey || first > toKey) continue;
    events.push({
      uid: `tournament-${i.id}`,
      allDay: {fromKey: first, toKey: last},
      summary: `Torneio · ${str(t["name"]) || "Torneio"}`,
      location: str(t["locationName"]) || str(t["location"]) || str(t["venueName"]),
      description: str(i.data["categoryName"]),
      canceled: ["canceled", "cancelled"].includes(str(t["status"]).toLowerCase()),
    });
  }
  return events;
}

export interface AthleteFeedDeps {
  /** Aulas do atleta no intervalo; padrão: a mesma montagem de `getMyClassAgenda`. */
  loadClasses?: (db: Firestore, uid: string, fromKey: string, toKey: string, todayKey: string) => Promise<ClassAgendaItem[]>;
}

/** Lê o que entra no feed (janela −30/+120 dias) e monta os eventos. */
export async function loadAthleteFeedEvents(
  db: Firestore,
  uid: string,
  now: Date,
  deps: AthleteFeedDeps = {},
): Promise<FeedEvent[]> {
  const todayKey = dayKeyFromEventDate(now);
  const fromKey = addDaysToDateKey(todayKey, -FEED_PAST_DAYS);
  const toKey = addDaysToDateKey(todayKey, FEED_FUTURE_DAYS);
  const loadClasses = deps.loadClasses ?? loadClassAgenda;
  const [bookings, classes, tournaments] = await Promise.all([
    loadBookingEvents(db, uid, fromKey, toKey),
    loadClasses(db, uid, fromKey, toKey, todayKey),
    loadTournamentEvents(db, uid, fromKey, toKey),
  ]);
  return [
    ...bookings,
    ...classes.map(classEvent).filter((e): e is FeedEvent => e !== null),
    ...tournaments,
  ];
}

export function buildAthleteIcs(events: FeedEvent[], now: Date): string {
  return buildCalendarIcs(events, now, {name: "Agenda nexaGO", product: "Agenda do atleta"});
}

function feedUrl(uid: string, token: string): string {
  const projectId = process.env.GCLOUD_PROJECT ?? "";
  return `https://${FEED_REGION}-${projectId}.cloudfunctions.net/athleteCalendarFeed?u=${encodeURIComponent(uid)}&t=${token}`;
}

/** Liga o feed e devolve a URL. `rotate: true` gera token novo (desconecta quem assinou a antiga). */
export async function configureAthleteCalendarFeedCore(
  db: Firestore,
  uid: string,
  raw: Record<string, unknown>,
): Promise<{url: string}> {
  const ref = db.collection(ATHLETE_CALENDAR_FEEDS).doc(uid);
  const current = (await ref.get()).data();
  const token = raw["rotate"] === true || !str(current?.["token"]) ?
    randomBytes(24).toString("base64url") :
    str(current?.["token"]);
  await ref.set({
    token, updatedAt: FieldValue.serverTimestamp(),
    ...(current ? {} : {createdAt: FieldValue.serverTimestamp()}),
  }, {merge: true});
  return {url: feedUrl(uid, token)};
}

export const configureAthleteCalendarFeed = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return configureAthleteCalendarFeedCore(getFirestore(), uid, (request.data ?? {}) as Record<string, unknown>);
});

/** O feed em si (GET público com token). Token errado = 404 — não diz se o atleta existe. */
export const athleteCalendarFeed = onRequest({region: CLIENT_FACING_REGIONS}, async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).send("Method Not Allowed");
    return;
  }
  const uid = str(req.query["u"]);
  const token = str(req.query["t"]);
  const db = getFirestore();
  const feed = uid && token && !uid.includes("/") ?
    (await db.collection(ATHLETE_CALENDAR_FEEDS).doc(uid).get()).data() :
    null;
  if (!feed || str(feed["token"]) !== token) {
    res.status(404).send("Not found");
    return;
  }
  try {
    const now = new Date();
    const events = await loadAthleteFeedEvents(db, uid, now);
    res.set("Content-Type", "text/calendar; charset=utf-8");
    res.set("Cache-Control", "private, max-age=300");
    res.status(200).send(buildAthleteIcs(events, now));
  } catch (e) {
    logger.error(`athleteCalendarFeed ${uid}: falhou`, e);
    res.status(500).send("Erro");
  }
});
