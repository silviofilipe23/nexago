/**
 * Agenda do professor em outros apps (E8 · Sincronizar calendário): um feed iCalendar (`.ics`)
 * que o Google Agenda, o Apple Calendário e o Outlook assinam por URL. A URL leva um token
 * aleatório do professor (`professorCalendarFeeds/{uid}`, só functions) — trocar o token derruba
 * as assinaturas antigas. Só leitura: o feed nunca muda nada.
 *
 * Entra: aulas de turma que ele dá (`arenaClassSessions.teacherUserId`), aulas da carteira
 * (`professorLessons`, com a situação da reserva) e os bloqueios dele
 * (`users/{uid}/professorBlocks`). Nome do aluno só com `showStudentNames` (padrão: "Aula").
 */
import {randomBytes} from "node:crypto";
import * as logger from "firebase-functions/logger";
import {onCall, onRequest, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {ARENA_CLASS_SESSIONS} from "./arena-class-constants";
import {addDaysToDateKey} from "./arena-recurring-booking";
import {dayKeyFromEventDate, EVENT_TIME_ZONE} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {PROFESSOR_LESSONS} from "./professor-lessons";

export const PROFESSOR_CALENDAR_FEEDS = "professorCalendarFeeds";
export const PROFESSOR_BLOCKS = "professorBlocks";
const FEED_PAST_DAYS = 30;
const FEED_FUTURE_DAYS = 120;
const FEED_REGION = "southamerica-east1";
const VOID_BOOKING = new Set(["canceled", "cancelled", "expired", "rejected"]);

export interface FeedPrefs {
  showStudentNames: boolean;
  /** Arenas que o professor tirou do feed. */
  excludedArenaIds: string[];
}

export interface FeedEvent {
  uid: string;
  /** `YYYY-MM-DD` + `HH:MM` locais (São Paulo); bloqueio usa instantes. */
  date?: string;
  startTime?: string;
  endTime?: string;
  startAt?: Date;
  endAt?: Date;
  summary: string;
  location: string;
  description: string;
  canceled: boolean;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Escapa texto de propriedade iCalendar (RFC 5545 §3.3.11). */
export function icsText(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Dobra linhas em 75 octetos (RFC 5545 §3.1). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, "utf8") > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut), "utf8") > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

const local = (date: string, time: string) => `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function buildProfessorIcs(events: FeedEvent[], now: Date, name = "Aulas nexaGO"): string {
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//nexaGO//Agenda do professor//PT-BR", "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH", `X-WR-CALNAME:${icsText(name)}`, `X-WR-TIMEZONE:${EVENT_TIME_ZONE}`,
  ];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@nexago`, `DTSTAMP:${utc(now)}`);
    if (e.startAt && e.endAt) {
      lines.push(`DTSTART:${utc(e.startAt)}`, `DTEND:${utc(e.endAt)}`);
    } else if (e.date && e.startTime) {
      lines.push(`DTSTART;TZID=${EVENT_TIME_ZONE}:${local(e.date, e.startTime)}`);
      lines.push(`DTEND;TZID=${EVENT_TIME_ZONE}:${local(e.date, e.endTime || e.startTime)}`);
    } else {
      lines.pop();
      lines.pop();
      lines.pop();
      continue;
    }
    lines.push(`SUMMARY:${icsText(e.summary)}`);
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    lines.push(`STATUS:${e.canceled ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

const TYPE_PT: Record<string, string> = {turma: "Turma", particular: "Particular", dupla: "Dupla", experimental: "Experimental"};

/** Lê o que entra no feed (janela −30/+120 dias) e monta os eventos. */
export async function loadProfessorFeedEvents(db: Firestore, uid: string, prefs: FeedPrefs, now: Date): Promise<FeedEvent[]> {
  const todayKey = dayKeyFromEventDate(now);
  const fromKey = addDaysToDateKey(todayKey, -FEED_PAST_DAYS);
  const toKey = addDaysToDateKey(todayKey, FEED_FUTURE_DAYS);
  const excluded = new Set(prefs.excludedArenaIds);
  const [sessions, lessons, blocks] = await Promise.all([
    db.collection(ARENA_CLASS_SESSIONS).where("teacherUserId", "==", uid)
      .where("date", ">=", fromKey).where("date", "<=", toKey).get(),
    db.collection(PROFESSOR_LESSONS).where("professorUid", "==", uid).get(),
    db.collection("users").doc(uid).collection(PROFESSOR_BLOCKS).get(),
  ]);

  const events: FeedEvent[] = [];
  for (const d of sessions.docs) {
    const s = d.data();
    if (excluded.has(str(s["arenaId"]))) continue;
    const type = TYPE_PT[str(s["type"])] ?? "Aula";
    events.push({
      uid: `session-${d.id}`,
      date: str(s["date"]), startTime: str(s["startTime"]), endTime: str(s["endTime"]),
      summary: `${type}: ${str(s["className"]) || "Aula"}`,
      location: [str(s["arenaName"]), str(s["courtName"])].filter(Boolean).join(" · "),
      description: "Aula da arena — chamada e alunos no app nexaGO.",
      canceled: s["status"] === "canceled",
    });
  }

  const lessonDocs = lessons.docs.filter((d) => {
    const l = d.data();
    const date = str(l["date"]);
    return date >= fromKey && date <= toKey && !excluded.has(str(l["arenaId"]));
  });
  const bookings = lessonDocs.length ?
    await db.getAll(...lessonDocs.map((d) => db.collection("arenaBookings").doc(d.id))) :
    [];
  const bookingStatus = new Map(bookings.map((b) => [b.id, str(b.data()?.["status"])]));
  for (const d of lessonDocs) {
    const l = d.data();
    events.push({
      uid: `lesson-${d.id}`,
      date: str(l["date"]), startTime: str(l["startTime"]), endTime: str(l["endTime"]),
      summary: prefs.showStudentNames ? `Aula: ${str(l["studentName"]) || "Aluno"}` : "Aula particular",
      location: [str(l["arenaName"]), str(l["courtName"])].filter(Boolean).join(" · "),
      description: "Aula da sua carteira — reserva feita por você.",
      canceled: VOID_BOOKING.has(bookingStatus.get(d.id) ?? ""),
    });
  }

  for (const d of blocks.docs) {
    const b = d.data();
    const startAt = b["startAt"] instanceof Timestamp ? b["startAt"].toDate() : null;
    const endAt = b["endAt"] instanceof Timestamp ? b["endAt"].toDate() : null;
    if (!startAt || !endAt || dayKeyFromEventDate(endAt) < fromKey) continue;
    events.push({
      uid: `block-${d.id}`, startAt, endAt,
      summary: `Bloqueado · ${str(b["reasonLabel"]) || "Indisponível"}`,
      location: "", description: str(b["note"]), canceled: false,
    });
  }
  return events;
}

function feedUrl(uid: string, token: string): string {
  const projectId = process.env.GCLOUD_PROJECT ?? "";
  return `https://${FEED_REGION}-${projectId}.cloudfunctions.net/professorCalendarFeed?u=${encodeURIComponent(uid)}&t=${token}`;
}

/**
 * Liga/ajusta o feed e devolve a URL. `rotate: true` gera token novo (desconecta quem assinou a
 * URL antiga). Só professor com aula ou carteira tem o que sincronizar, mas o feed vazio é válido.
 */
export async function configureProfessorCalendarFeedCore(
  db: Firestore,
  uid: string,
  raw: Record<string, unknown>,
): Promise<{url: string; showStudentNames: boolean; excludedArenaIds: string[]}> {
  const ref = db.collection(PROFESSOR_CALENDAR_FEEDS).doc(uid);
  const current = (await ref.get()).data();
  const token = raw["rotate"] === true || !str(current?.["token"]) ? randomBytes(24).toString("base64url") : str(current?.["token"]);
  const showStudentNames = typeof raw["showStudentNames"] === "boolean" ?
    raw["showStudentNames"] : current?.["showStudentNames"] === true;
  const excludedRaw = Array.isArray(raw["excludedArenaIds"]) ? raw["excludedArenaIds"] : current?.["excludedArenaIds"];
  const excludedArenaIds = Array.isArray(excludedRaw) ?
    [...new Set(excludedRaw.map(str).filter((id) => id && !id.includes("/")))].slice(0, 50) :
    [];
  await ref.set({
    token, showStudentNames, excludedArenaIds, updatedAt: FieldValue.serverTimestamp(),
    ...(current ? {} : {createdAt: FieldValue.serverTimestamp()}),
  }, {merge: true});
  return {url: feedUrl(uid, token), showStudentNames, excludedArenaIds};
}

export const configureProfessorCalendarFeed = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return configureProfessorCalendarFeedCore(getFirestore(), uid, (request.data ?? {}) as Record<string, unknown>);
});

/** O feed em si (GET público com token). Token errado = 404 — não diz se o professor existe. */
export const professorCalendarFeed = onRequest({region: CLIENT_FACING_REGIONS}, async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).send("Method Not Allowed");
    return;
  }
  const uid = str(req.query["u"]);
  const token = str(req.query["t"]);
  const db = getFirestore();
  const feed = uid && token && !uid.includes("/") ? (await db.collection(PROFESSOR_CALENDAR_FEEDS).doc(uid).get()).data() : null;
  if (!feed || str(feed["token"]) !== token) {
    res.status(404).send("Not found");
    return;
  }
  try {
    const now = new Date();
    const events = await loadProfessorFeedEvents(db, uid, {
      showStudentNames: feed["showStudentNames"] === true,
      excludedArenaIds: Array.isArray(feed["excludedArenaIds"]) ? feed["excludedArenaIds"].map(String) : [],
    }, now);
    res.set("Content-Type", "text/calendar; charset=utf-8");
    res.set("Cache-Control", "private, max-age=300");
    res.status(200).send(buildProfessorIcs(events, now));
  } catch (e) {
    logger.error(`professorCalendarFeed ${uid}: falhou`, e);
    res.status(500).send("Erro");
  }
});
