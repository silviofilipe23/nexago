/**
 * "Horários mais movimentados" do perfil público da arena (app do atleta).
 *
 * Uma vez por dia soma as reservas das últimas [POPULAR_TIMES_WEEKS] semanas por dia da
 * semana e hora e grava, por arena, um desenho RELATIVO (0–100, 100 = a hora mais cheia
 * da semana) em `arenaPopularTimes/{arenaId}`. Só o relativo sai daqui: nada de contagem
 * por hora, nome ou quadra. Abaixo de [POPULAR_TIMES_MIN_BOOKINGS] reservas no período o
 * desenho não é publicado (`byWeekday: null`) — pouca amostra engana e poderia revelar o
 * horário fixo de alguém.
 *
 * Também grava `athletesCount`: quantos atletas distintos (dono da reserva + convidados que
 * entraram) jogaram na arena no período — só o total, nunca quem. Reserva de balcão sem conta
 * não entra. Sai mesmo abaixo do mínimo do desenho ("Quem joga aqui" do perfil).
 *
 * Leitura pública pelas rules; escrita só por esta função (Admin SDK).
 */
import {onSchedule} from "firebase-functions/v2/scheduler";
import {logger} from "firebase-functions/v2";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {INACTIVE_BOOKING_STATUSES} from "./arena-booking-app-payment";
import {spNow} from "./arena-peak-rules";
import {addDaysToDateKey} from "./arena-weather-model";

export const ARENA_POPULAR_TIMES = "arenaPopularTimes";
const ARENA_BOOKINGS = "arenaBookings";

/** Semanas somadas (janela que termina ontem). */
export const POPULAR_TIMES_WEEKS = 8;

/** Mínimo de reservas no período para publicar o desenho. */
export const POPULAR_TIMES_MIN_BOOKINGS = 20;

const WRITE_BATCH_SIZE = 400;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(\d{1,2}):(\d{2})/;

/** Campos de `arenaBookings` que a soma usa (tolerante a doc legado). */
export interface PopularTimesBooking {
  arenaId?: unknown;
  date?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  status?: unknown;
  athleteId?: unknown;
  participantUids?: unknown;
}

export interface PopularTimesWindow {
  fromDateKey: string;
  toDateKey: string;
  weeks: number;
}

/** 1 (seg) … 7 (dom) → 24 valores de 0 a 100. */
export type PopularTimesByWeekday = Record<string, number[]>;

export interface ArenaPopularTimes {
  arenaId: string;
  weeks: number;
  fromDateKey: string;
  toDateKey: string;
  bookingsCount: number;
  /** Atletas distintos com reserva válida no período (só o total). */
  athletesCount: number;
  byWeekday: PopularTimesByWeekday | null;
}

/** Dia da semana ISO de uma `dateKey` (1 = segunda, 7 = domingo); `null` se inválida. */
export function weekdayOfDateKey(dateKey: string): number | null {
  if (!DATE_KEY_RE.test(dateKey)) return null;
  const [y, m, d] = dateKey.split("-").map((v) => parseInt(v, 10));
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Janela da soma: de [POPULAR_TIMES_WEEKS] semanas atrás até ontem, no dia de São Paulo. */
export function popularTimesWindow(nowMs: number): PopularTimesWindow {
  const today = spNow(new Date(nowMs)).dateKey;
  return {
    fromDateKey: addDaysToDateKey(today, -7 * POPULAR_TIMES_WEEKS),
    toDateKey: addDaysToDateKey(today, -1),
    weeks: POPULAR_TIMES_WEEKS,
  };
}

function minutesOf(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const match = TIME_RE.exec(raw.trim());
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h > 24 || m > 59) return null;
  return h * 60 + m;
}

function isActive(booking: PopularTimesBooking): boolean {
  const status = typeof booking.status === "string" ? booking.status.trim().toLowerCase() : "";
  return !INACTIVE_BOOKING_STATUSES.has(status);
}

/** Horas (0–23) que a reserva ocupa: da hora em que começa até antes do fim. */
function hoursCovered(booking: PopularTimesBooking): number[] | null {
  const start = minutesOf(booking.startTime);
  let end = minutesOf(booking.endTime);
  if (start == null || end == null) return null;
  if (end <= start) end += 24 * 60;
  end = Math.min(end, 24 * 60);
  const hours: number[] = [];
  for (let h = Math.floor(start / 60); h * 60 < end && h < 24; h++) hours.push(h);
  return hours;
}

/** Quem jogou na reserva: o dono e os convidados que entraram (uids com conta). */
function playersOf(booking: PopularTimesBooking): string[] {
  const raw = [booking.athleteId, ...(Array.isArray(booking.participantUids) ? booking.participantUids : [])];
  return raw
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v !== "");
}

function emptyWeek(): number[][] {
  return Array.from({length: 7}, () => new Array<number>(24).fill(0));
}

/** Desenho de uma arena a partir das reservas da janela (já filtradas pela data). */
export function buildArenaPopularTimes(
  arenaId: string,
  bookings: PopularTimesBooking[],
  window: PopularTimesWindow,
): ArenaPopularTimes {
  const counts = emptyWeek();
  const athletes = new Set<string>();
  let bookingsCount = 0;
  for (const booking of bookings) {
    if (!isActive(booking)) continue;
    const weekday = typeof booking.date === "string" ? weekdayOfDateKey(booking.date.trim()) : null;
    const hours = hoursCovered(booking);
    if (weekday == null || hours == null || hours.length === 0) continue;
    bookingsCount++;
    for (const h of hours) counts[weekday - 1][h]++;
    for (const uid of playersOf(booking)) athletes.add(uid);
  }

  const base = {
    arenaId,
    weeks: window.weeks,
    fromDateKey: window.fromDateKey,
    toDateKey: window.toDateKey,
    athletesCount: athletes.size,
  };
  if (bookingsCount < POPULAR_TIMES_MIN_BOOKINGS) {
    return {...base, bookingsCount, byWeekday: null};
  }
  const max = Math.max(...counts.flat());
  const byWeekday: PopularTimesByWeekday = {};
  counts.forEach((hours, i) => {
    byWeekday[String(i + 1)] = hours.map((c) => (max > 0 ? Math.round((c * 100) / max) : 0));
  });
  return {...base, bookingsCount, byWeekday};
}

/**
 * Recalcula todas as arenas com reserva na janela e zera as que tinham resumo e ficaram sem
 * reserva. Devolve quantos documentos gravou.
 */
export async function refreshArenaPopularTimesCore(db: Firestore, nowMs: number): Promise<number> {
  const window = popularTimesWindow(nowMs);
  const snap = await db.collection(ARENA_BOOKINGS)
    .where("date", ">=", window.fromDateKey)
    .where("date", "<=", window.toDateKey)
    .get();

  const byArena = new Map<string, PopularTimesBooking[]>();
  for (const doc of snap.docs) {
    const data = doc.data() as PopularTimesBooking;
    const arenaId = typeof data.arenaId === "string" ? data.arenaId.trim() : "";
    if (!arenaId) continue;
    const list = byArena.get(arenaId) ?? [];
    list.push(data);
    byArena.set(arenaId, list);
  }

  const summaries = [...byArena.entries()].map(([arenaId, bookings]) =>
    buildArenaPopularTimes(arenaId, bookings, window));
  const existing = await db.collection(ARENA_POPULAR_TIMES).get();
  for (const doc of existing.docs) {
    if (!byArena.has(doc.id)) summaries.push(buildArenaPopularTimes(doc.id, [], window));
  }

  for (let i = 0; i < summaries.length; i += WRITE_BATCH_SIZE) {
    const batch = db.batch();
    for (const summary of summaries.slice(i, i + WRITE_BATCH_SIZE)) {
      batch.set(db.collection(ARENA_POPULAR_TIMES).doc(summary.arenaId), {
        ...summary,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
  return summaries.length;
}

/** Todo dia de madrugada, depois do fechamento do dia anterior. */
export const refreshArenaPopularTimes = onSchedule(
  {schedule: "every day 04:20", timeZone: "America/Sao_Paulo"},
  async () => {
    const written = await refreshArenaPopularTimesCore(getFirestore(), Date.now());
    logger.info(`refreshArenaPopularTimes: ${written} arena(s) atualizada(s)`);
  },
);
