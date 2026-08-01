import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {isArenaEntitledPro} from "./arena-entitlement";
import {assertArenaAreaAccess} from "./arena-area-access";
import {isValidDateKey, toMinutes} from "./arena-recurring-booking";

const ARENA_BOOKINGS = "arenaBookings";

/** Intervalo máximo aceito num único relatório — evita varredura irrestrita. */
const MAX_RANGE_DAYS = 366;

const CANCELLED_STATUSES = new Set(["cancelled", "canceled"]);

export interface OccupancyReportInput {
  arenaId: string;
  dateFrom: string;
  dateTo: string;
}

export interface ArenaOccupancyCourtBreakdown {
  courtId: string;
  courtName: string;
  hoursReserved: number;
  bookingsCount: number;
}

export interface ArenaOccupancyReport {
  arenaId: string;
  dateFrom: string;
  dateTo: string;
  totalBookings: number;
  totalHoursReserved: number;
  uniqueAthletesCount: number;
  noShowCount: number;
  /** Reservas com presença já resolvida (`checked_in` + `no_show`) — denominador da taxa de no-show. */
  attendanceResolvedCount: number;
  /** 0–100. Sobre [attendanceResolvedCount], não sobre [totalBookings] (reservas futuras/pendentes não contam). */
  noShowRatePercent: number;
  recurringBookingsCount: number;
  standaloneBookingsCount: number;
  /** 0–100, sobre [totalBookings]. */
  recurringSharePercent: number;
  courts: ArenaOccupancyCourtBreakdown[];
}

/** Formato mínimo de um doc `arenaBookings` usado pela agregação (subset tipado, tolerante a campos ausentes/legados). */
export interface OccupancyBookingRecord {
  courtId?: unknown;
  courtName?: unknown;
  athleteId?: unknown;
  date?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  status?: unknown;
  attendanceStatus?: unknown;
  isRecurring?: unknown;
}

function isCancelled(record: OccupancyBookingRecord): boolean {
  const status = typeof record.status === "string" ? record.status.trim().toLowerCase() : "";
  return CANCELLED_STATUSES.has(status);
}

/** Duração em horas (fracionária) — espelha o parsing de `arena-booking-create.ts`/`arena-recurring-booking.ts`. */
function durationHours(startTimeRaw: unknown, endTimeRaw: unknown): number {
  const startTime = typeof startTimeRaw === "string" ? startTimeRaw : "";
  const endTime = typeof endTimeRaw === "string" ? endTimeRaw : "";
  if (!startTime || !endTime) return 0;
  const startMin = toMinutes(startTime);
  let endMin = toMinutes(endTime);
  if (endMin === 0 && startMin > 0) endMin = 24 * 60; // "24:00" chega como "00:00" — fecha o dia.
  if (endMin <= startMin) return 0;
  return (endMin - startMin) / 60;
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Agrega docs de `arenaBookings` (já filtrados por arena) no relatório de
 * ocupação. Função pura — recebe os bookings já carregados (Firestore ou
 * fixture de teste) e o intervalo `[dateFrom, dateTo]` (ambos inclusive,
 * formato `YYYY-MM-DD`); filtra o intervalo de novo aqui como segunda
 * camada de segurança (a consulta ao Firestore já filtra por range).
 *
 * Decisões de agregação (documentadas para revisão):
 * - Reservas com `status` cancelado/cancelada não contam — nunca ocuparam a
 *   quadra de fato. Mesmo critério do painel existente
 *   (`arena_dashboard_service.dart` → `_bookingStatusIsCanceled`).
 * - Taxa de no-show é calculada sobre reservas com presença já resolvida
 *   (`attendanceStatus` `checked_in` ou `no_show`) — reservas futuras/ainda
 *   `pending` não têm desfecho e diluiriam a taxa se entrassem no
 *   denominador.
 * - Recorrente = `isRecurring === true`. Só as ocorrências materializadas
 *   por `materializeSeriesOccurrences` (`arena-recurring-booking.ts`) setam
 *   esse campo; qualquer outra reserva é avulsa.
 */
export function aggregateArenaOccupancyReport(
  bookings: OccupancyBookingRecord[],
  arenaId: string,
  dateFrom: string,
  dateTo: string,
): ArenaOccupancyReport {
  const courts = new Map<string, {courtName: string; hours: number; count: number}>();
  const athleteIds = new Set<string>();
  let totalHours = 0;
  let totalBookings = 0;
  let noShowCount = 0;
  let checkedInCount = 0;
  let recurringCount = 0;
  let standaloneCount = 0;

  for (const b of bookings) {
    if (isCancelled(b)) continue;
    const date = typeof b.date === "string" ? b.date : "";
    if (!date || date < dateFrom || date > dateTo) continue;

    totalBookings += 1;

    const courtId = typeof b.courtId === "string" && b.courtId ? b.courtId : "sem-quadra";
    const courtName = typeof b.courtName === "string" && b.courtName ? b.courtName : "Quadra";
    const hours = durationHours(b.startTime, b.endTime);
    totalHours += hours;

    const court = courts.get(courtId) ?? {courtName, hours: 0, count: 0};
    court.hours += hours;
    court.count += 1;
    courts.set(courtId, court);

    const athleteId = typeof b.athleteId === "string" ? b.athleteId.trim() : "";
    if (athleteId) athleteIds.add(athleteId);

    const attendanceStatus = typeof b.attendanceStatus === "string" ?
      b.attendanceStatus.trim().toLowerCase() :
      "pending";
    if (attendanceStatus === "no_show") {
      noShowCount += 1;
    } else if (attendanceStatus === "checked_in") {
      checkedInCount += 1;
    }

    if (b.isRecurring === true) {
      recurringCount += 1;
    } else {
      standaloneCount += 1;
    }
  }

  const attendanceResolvedCount = noShowCount + checkedInCount;
  const noShowRatePercent = attendanceResolvedCount === 0 ?
    0 :
    roundPercent((noShowCount / attendanceResolvedCount) * 100);
  const recurringSharePercent = totalBookings === 0 ?
    0 :
    roundPercent((recurringCount / totalBookings) * 100);

  const courtsBreakdown: ArenaOccupancyCourtBreakdown[] = [...courts.entries()]
    .map(([courtId, v]) => ({
      courtId,
      courtName: v.courtName,
      hoursReserved: roundHours(v.hours),
      bookingsCount: v.count,
    }))
    .sort((a, b) => b.hoursReserved - a.hoursReserved);

  return {
    arenaId,
    dateFrom,
    dateTo,
    totalBookings,
    totalHoursReserved: roundHours(totalHours),
    uniqueAthletesCount: athleteIds.size,
    noShowCount,
    attendanceResolvedCount,
    noShowRatePercent,
    recurringBookingsCount: recurringCount,
    standaloneBookingsCount: standaloneCount,
    recurringSharePercent,
    courts: courtsBreakdown,
  };
}

// Relatório de ocupação é área "financeiro" (leitura) — dono da arena ou
// membro de equipe ativo com cargo que lê "financeiro" (gestor/financeiro),
// arena com plano pago. Sem bypass de admin/superAdmin: nunca existiu aqui.
async function requireArenaManagerForReport(
  db: Firestore,
  arenaId: string,
  uid: string,
): Promise<Record<string, unknown>> {
  const arenaSnap = await db.collection("arenas").doc(arenaId).get();
  if (!arenaSnap.exists) {
    throw new HttpsError("not-found", "Arena não encontrada.");
  }
  await assertArenaAreaAccess(db, arenaId, uid, "financeiro", "read");
  return arenaSnap.data() as Record<string, unknown>;
}

function parseInput(raw: unknown): OccupancyReportInput {
  const data = (raw ?? {}) as Record<string, unknown>;
  const arenaId = typeof data.arenaId === "string" ? data.arenaId.trim() : "";
  const dateFrom = typeof data.dateFrom === "string" ? data.dateFrom.trim() : "";
  const dateTo = typeof data.dateTo === "string" ? data.dateTo.trim() : "";

  if (!arenaId) {
    throw new HttpsError("invalid-argument", "arenaId é obrigatório.");
  }
  if (!isValidDateKey(dateFrom) || !isValidDateKey(dateTo)) {
    throw new HttpsError(
      "invalid-argument",
      "dateFrom/dateTo devem estar no formato YYYY-MM-DD.",
    );
  }
  if (dateFrom > dateTo) {
    throw new HttpsError("invalid-argument", "dateFrom não pode ser depois de dateTo.");
  }

  const fromMs = Date.parse(`${dateFrom}T00:00:00Z`);
  const toMs = Date.parse(`${dateTo}T00:00:00Z`);
  const rangeDays = (toMs - fromMs) / (24 * 60 * 60 * 1000);
  if (rangeDays > MAX_RANGE_DAYS) {
    throw new HttpsError(
      "invalid-argument",
      `Intervalo máximo de ${MAX_RANGE_DAYS} dias por relatório.`,
    );
  }

  return {arenaId, dateFrom, dateTo};
}

/**
 * Lógica testável do callable (recebe `db`/`uid` injetados). Gate de plano:
 * relatório de ocupação é analytics avançado, mesma categoria de
 * `ArenaCapability.metricasCompletas` no app (Pro/Elite — "Dashboard
 * completo, insights e seguidores"), então segue a mesma titularidade
 * (`isArenaEntitledPro`) já usada para gatear outras vantagens Pro no
 * servidor (ex. isenção de taxa em `mercadopago-arena-helpers.ts`, limite de
 * horários fixos em `arena-recurring-booking.ts`).
 */
export async function getArenaOccupancyReportCore(
  db: Firestore,
  uid: string,
  rawInput: unknown,
  nowMs: number,
): Promise<ArenaOccupancyReport> {
  const input = parseInput(rawInput);
  const arenaData = await requireArenaManagerForReport(db, input.arenaId, uid);

  if (!isArenaEntitledPro(arenaData, nowMs)) {
    throw new HttpsError(
      "failed-precondition",
      "Relatórios de ocupação estão disponíveis nos planos Pro e Elite. " +
      "Faça upgrade do plano da arena para acessar.",
    );
  }

  const snap = await db
    .collection(ARENA_BOOKINGS)
    .where("arenaId", "==", input.arenaId)
    .where("date", ">=", input.dateFrom)
    .where("date", "<=", input.dateTo)
    .get();

  const bookings = snap.docs.map((doc) => doc.data() as OccupancyBookingRecord);
  return aggregateArenaOccupancyReport(bookings, input.arenaId, input.dateFrom, input.dateTo);
}

export const getArenaOccupancyReport = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  return getArenaOccupancyReportCore(
    getFirestore(),
    request.auth.uid,
    request.data,
    Date.now(),
  );
});
