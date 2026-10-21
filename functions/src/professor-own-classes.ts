/**
 * Turma própria do professor independente com reserva recorrente de quadra (canvas B10).
 *
 * - `professors/{uid}/ownClasses/{classId}`: nome, arena/quadra, dias (ISO), horário, vagas,
 *   mensalidade por aluno (o PREÇO DELE — cobra pela carteira, #821), alunos da carteira
 *   (`studentIds`) e as séries de horário fixo (`seriesIds`, uma por dia da semana).
 * - A quadra é reservada pela máquina de horário fixo da arena (`arenaRecurringBookings`, uma série
 *   por dia), com o professor como titular e as ocorrências carimbadas `bookedAs: professor` +
 *   `professorClassId` — entram no custo de quadra do mês dele. Pagamento na arena, como mensalista.
 * - Só com vínculo INDEPENDENTE ATIVO e a chave `canBookRecurring` ligada pela arena. O agendador
 *   diário encerra a série (e a turma) se o vínculo ou a chave caírem.
 * - Antes de criar, a prévia mostra o preço da arena e as datas que já estão ocupadas na janela.
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError, type CallableRequest} from "firebase-functions/v2/https";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {isArenaEntitledPro} from "./arena-entitlement";
import {readArenaFallbackPrice, readCourtHourlyBase, resolveSlotPrice} from "./arena-pricing";
import {professorPermissionDenial, requireArenaProfessorPermission, loadArenaProfessorLink} from "./arena-professor-permissions";
import {arenaProfessorLinkId} from "./arena-professor-links";
import {
  ARENA_RECURRING_BOOKINGS,
  RECURRING_HORIZON_DAYS,
  STARTER_MAX_ACTIVE_RECURRING,
  addDaysToDateKey,
  cancelFutureOccurrences,
  hasBlockedSlotOverlap,
  lockRefsForOccurrence,
  materializeSeriesOccurrences,
  occurrenceDatesBetween,
  toMinutes,
  type RecurringSeriesData,
} from "./arena-recurring-booking";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {deliverNotificationToUser} from "./notification-delivery";
import {PROFESSORS, PROFESSOR_STUDENTS, PROFESSOR_PRICE_MAX_REAIS, PROFESSOR_PRICE_MIN_REAIS} from "./professor-wallet-model";

export const PROFESSOR_OWN_CLASSES = "ownClasses";
const MAX_CAPACITY = 30;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function invalid(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

function cleanId(v: unknown, message: string): string {
  const id = str(v);
  if (!id || id.includes("/")) invalid(message);
  return id;
}

export interface OwnClassInput {
  arenaId: string;
  courtId: string;
  name: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  capacity: number;
  monthlyPriceReais: number;
  startDate: string;
}

export function parseOwnClassInput(raw: Record<string, unknown>, todayKey: string): OwnClassInput {
  const arenaId = cleanId(raw["arenaId"], "Arena inválida.");
  const courtId = cleanId(raw["courtId"], "Escolha a quadra.");
  const name = str(raw["name"]);
  if (!name || name.length > 60) invalid("Dê um nome à turma (até 60 caracteres).");
  const weekdays = Array.isArray(raw["weekdays"]) ? [...new Set(raw["weekdays"].map(Number))].sort((a, b) => a - b) : [];
  if (!weekdays.length || weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) invalid("Escolha os dias da turma.");
  const startTime = str(raw["startTime"]);
  const endTime = str(raw["endTime"]);
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) invalid("Horário inválido.");
  const startMin = toMinutes(startTime);
  const endMin = toMinutes(endTime);
  if (endMin <= startMin || endMin - startMin > 240) invalid("Horário da turma inválido (até 4 h).");
  const capacity = Number(raw["capacity"]);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) invalid(`Vagas de 1 a ${MAX_CAPACITY}.`);
  const monthlyPriceReais = Math.round(Number(raw["monthlyPriceReais"]) * 100) / 100;
  if (!Number.isFinite(monthlyPriceReais) || monthlyPriceReais < PROFESSOR_PRICE_MIN_REAIS || monthlyPriceReais > PROFESSOR_PRICE_MAX_REAIS) {
    invalid(`Mensalidade de R$ ${PROFESSOR_PRICE_MIN_REAIS} a R$ ${PROFESSOR_PRICE_MAX_REAIS}.`);
  }
  const startDate = str(raw["startDate"]) || todayKey;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || startDate < todayKey) invalid("Data de início inválida.");
  return {arenaId, courtId, name, weekdays, startTime, endTime, capacity, monthlyPriceReais, startDate};
}

/** Ocorrências por mês em média (4,33 semanas) — para a estimativa do protótipo. */
export function monthlyOccurrences(weekdays: number[]): number {
  return Math.round(weekdays.length * (52 / 12) * 10) / 10;
}

export function ownClassEstimate(input: Pick<OwnClassInput, "weekdays" | "capacity" | "monthlyPriceReais">, pricePerOccurrence: number) {
  const perMonth = monthlyOccurrences(input.weekdays);
  const courtMonthlyReais = Math.round(perMonth * pricePerOccurrence * 100) / 100;
  const revenueFullReais = Math.round(input.capacity * input.monthlyPriceReais * 100) / 100;
  return {occurrencesPerMonth: perMonth, courtMonthlyReais, revenueFullReais, netEstimateReais: Math.round((revenueFullReais - courtMonthlyReais) * 100) / 100};
}

async function courtAndPrice(db: Firestore, input: OwnClassInput) {
  const arenaRef = db.collection("arenas").doc(input.arenaId);
  const [arenaSnap, courtSnap] = await Promise.all([arenaRef.get(), arenaRef.collection("courts").doc(input.courtId).get()]);
  if (!arenaSnap.exists) throw new HttpsError("not-found", "Arena não encontrada.");
  if (!courtSnap.exists) throw new HttpsError("not-found", "Quadra não encontrada.");
  const court = courtSnap.data() ?? {};
  const hourly = readCourtHourlyBase(court) ?? readArenaFallbackPrice(arenaSnap.data());
  if (!hourly) throw new HttpsError("failed-precondition", "A arena ainda não configurou o preço desta quadra.");
  const pricePerOccurrence = resolveSlotPrice(hourly, toMinutes(input.endTime) - toMinutes(input.startTime));
  return {
    arena: arenaSnap.data() ?? {},
    arenaName: str(arenaSnap.data()?.["name"]) || "Arena",
    courtName: str(court["name"]) || "Quadra",
    hourly,
    pricePerOccurrence,
  };
}

/** Datas da janela (até o horizonte da materialização) que já estão ocupadas ou bloqueadas. */
async function conflictDates(db: Firestore, input: OwnClassInput, todayKey: string): Promise<string[]> {
  const horizon = addDaysToDateKey(todayKey, RECURRING_HORIZON_DAYS);
  const out: string[] = [];
  for (const weekday of input.weekdays) {
    const series = {...input, weekday, endDate: null, skippedDates: []};
    for (const date of occurrenceDatesBetween(series, addDaysToDateKey(input.startDate, -1), horizon)) {
      const locks = lockRefsForOccurrence(db, series, date);
      const taken = (await Promise.all(locks.map((l) => l.ref.get()))).some((s) => s.exists);
      if (taken || (await hasBlockedSlotOverlap(db, series, date))) out.push(date);
    }
  }
  return out.sort();
}

async function requireRecurringPermission(db: Firestore, arenaId: string, uid: string) {
  return requireArenaProfessorPermission(db, arenaId, uid, "canBookRecurring");
}

export async function previewProfessorOwnClassCore(db: Firestore, uid: string, raw: Record<string, unknown>, now: Date) {
  const todayKey = dayKeyFromEventDate(now);
  const input = parseOwnClassInput(raw, todayKey);
  await requireRecurringPermission(db, input.arenaId, uid);
  const priced = await courtAndPrice(db, input);
  return {
    arenaName: priced.arenaName,
    courtName: priced.courtName,
    hourlyReais: priced.hourly,
    pricePerOccurrenceReais: priced.pricePerOccurrence,
    ...ownClassEstimate(input, priced.pricePerOccurrence),
    conflicts: await conflictDates(db, input, todayKey),
  };
}

export async function createProfessorOwnClassCore(db: Firestore, uid: string, raw: Record<string, unknown>, now: Date) {
  const todayKey = dayKeyFromEventDate(now);
  const input = parseOwnClassInput(raw, todayKey);
  await requireRecurringPermission(db, input.arenaId, uid);
  const priced = await courtAndPrice(db, input);
  if (!isArenaEntitledPro(priced.arena, now.getTime())) {
    const active = await db.collection(ARENA_RECURRING_BOOKINGS).where("arenaId", "==", input.arenaId)
      .where("status", "in", ["active", "paused"]).count().get();
    if (active.data().count + input.weekdays.length > STARTER_MAX_ACTIVE_RECURRING) {
      throw new HttpsError("resource-exhausted", "O plano da arena não comporta mais horários fixos agora. Fale com a gestão.");
    }
  }
  const professor = (await db.collection("users").doc(uid).get()).data();
  const professorName = str(professor?.["fullName"]) || str(professor?.["nickname"]) || "Professor";
  const classRef = db.collection(PROFESSORS).doc(uid).collection(PROFESSOR_OWN_CLASSES).doc();
  const linkId = arenaProfessorLinkId(input.arenaId, uid);
  const horizonKey = addDaysToDateKey(todayKey, RECURRING_HORIZON_DAYS);
  const seriesIds: Record<string, string> = {};
  const created: string[] = [];
  const skipped: string[] = [];
  // A turma nasce antes das séries: se algo falhar no meio, o professor ainda a encerra (e libera a quadra).
  await classRef.set({
    professorUid: uid,
    name: input.name,
    arenaId: input.arenaId,
    arenaName: priced.arenaName,
    courtId: input.courtId,
    courtName: priced.courtName,
    weekdays: input.weekdays,
    startTime: input.startTime,
    endTime: input.endTime,
    capacity: input.capacity,
    monthlyPriceReais: input.monthlyPriceReais,
    pricePerOccurrenceReais: priced.pricePerOccurrence,
    startDate: input.startDate,
    seriesIds: {},
    studentIds: [],
    status: "active",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  for (const weekday of input.weekdays) {
    const seriesRef = db.collection(ARENA_RECURRING_BOOKINGS).doc();
    const series: RecurringSeriesData = {
      arenaId: input.arenaId,
      arenaName: priced.arenaName,
      courtId: input.courtId,
      courtName: priced.courtName,
      weekday,
      startTime: input.startTime,
      endTime: input.endTime,
      athleteId: uid,
      customerName: `${professorName} · ${input.name}`,
      amountReais: priced.pricePerOccurrence,
      status: "active",
      startDate: input.startDate,
      endDate: null,
      skippedDates: [],
      professorStamp: {professorUid: uid, professorLinkId: linkId, professorClassId: classRef.id},
    };
    const {professorStamp: _stamp, ...seriesDoc} = series;
    await seriesRef.set({
      ...seriesDoc,
      paymentType: "monthly",
      bookedAs: "professor",
      professorLinkId: linkId,
      professorClassId: classRef.id,
      pausedAt: null,
      materializedUntil: addDaysToDateKey(todayKey, -1),
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
      canceledAt: null,
      cancelReason: null,
    });
    await classRef.update({[`seriesIds.${weekday}`]: seriesRef.id});
    const result = await materializeSeriesOccurrences(db, seriesRef.id, series, addDaysToDateKey(todayKey, -1), horizonKey);
    await seriesRef.set({
      materializedUntil: horizonKey,
      skippedDates: result.skippedDates.length ? FieldValue.arrayUnion(...result.skippedDates) : [],
    }, {merge: true});
    seriesIds[String(weekday)] = seriesRef.id;
    created.push(...result.createdDates);
    skipped.push(...result.skippedDates);
  }
  await notifyManagerSafe(str(priced.arena["managerUserId"]), {
    title: "Horário fixo de professor",
    body: `${professorName} reservou ${priced.courtName} para a turma ${input.name} (${input.startTime}–${input.endTime}).`,
    data: {arenaId: input.arenaId, professorClassId: classRef.id},
  });
  return {classId: classRef.id, createdDates: created.sort(), skippedDates: skipped.sort()};
}

async function notifyManagerSafe(userId: string, input: {title: string; body: string; data: Record<string, string>}) {
  if (!userId) return;
  try {
    await deliverNotificationToUser({userId, ...input, type: "professor_own_class_recurring", requireInteraction: false});
  } catch (e) {
    logger.warn("professorOwnClass: aviso à arena falhou", e);
  }
}

/** Encerra a turma: cancela as séries e libera as datas futuras na grade da arena. */
export async function endProfessorOwnClass(db: Firestore, professorUid: string, classId: string, reason: string): Promise<void> {
  const ref = db.collection(PROFESSORS).doc(professorUid).collection(PROFESSOR_OWN_CLASSES).doc(classId);
  const data = (await ref.get()).data();
  if (!data) throw new HttpsError("not-found", "Turma não encontrada.");
  if (data["status"] === "ended") return;
  // Encerra antes de cancelar as séries: o gatilho da série vê a turma encerrada e não avisa.
  await ref.update({status: "ended", endedReason: reason, endedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
  for (const seriesId of Object.values((data["seriesIds"] ?? {}) as Record<string, string>)) {
    const seriesRef = db.collection(ARENA_RECURRING_BOOKINGS).doc(seriesId);
    if ((await seriesRef.get()).data()?.["status"] !== "canceled") {
      await seriesRef.set({status: "canceled", canceledAt: FieldValue.serverTimestamp(), cancelReason: reason}, {merge: true});
    }
    await cancelFutureOccurrences(db, seriesId, `professor_own_class_${reason}`);
  }
}

export async function endProfessorOwnClassCore(db: Firestore, uid: string, raw: Record<string, unknown>): Promise<void> {
  await endProfessorOwnClass(db, uid, cleanId(raw["classId"], "Turma inválida."), "professor_ended");
}

/** Alunos da turma: só alunos ATIVOS da carteira, até o número de vagas. */
export async function setProfessorOwnClassStudentsCore(db: Firestore, uid: string, raw: Record<string, unknown>): Promise<{studentIds: string[]}> {
  const classId = cleanId(raw["classId"], "Turma inválida.");
  const ids = Array.isArray(raw["athleteIds"]) ? [...new Set(raw["athleteIds"].map(str).filter((a) => a && !a.includes("/")))] : [];
  const ref = db.collection(PROFESSORS).doc(uid).collection(PROFESSOR_OWN_CLASSES).doc(classId);
  const cls = (await ref.get()).data();
  if (!cls) throw new HttpsError("not-found", "Turma não encontrada.");
  if (cls["status"] !== "active") throw new HttpsError("failed-precondition", "Esta turma foi encerrada.");
  if (ids.length > Number(cls["capacity"] ?? 0)) invalid("Mais alunos do que vagas.");
  const wallet = await Promise.all(ids.map((a) => db.collection(PROFESSORS).doc(uid).collection(PROFESSOR_STUDENTS).doc(a).get()));
  if (wallet.some((s) => s.data()?.["status"] !== "active")) {
    throw new HttpsError("failed-precondition", "Só alunos ativos da sua carteira entram na turma própria.");
  }
  await ref.update({studentIds: ids, updatedAt: FieldValue.serverTimestamp()});
  return {studentIds: ids};
}

/**
 * Agendador: a série de turma própria ainda vale? (vínculo independente ativo + chave). Se não,
 * encerra a turma inteira e avisa o professor. Devolve `false` quando encerrou.
 */
export async function professorSeriesStillAllowed(db: Firestore, series: RecurringSeriesData): Promise<boolean> {
  const stamp = series.professorStamp;
  if (!stamp) return true;
  const link = await loadArenaProfessorLink(db, series.arenaId, stamp.professorUid);
  if (professorPermissionDenial(link, "canBookRecurring") == null) return true;
  await endProfessorOwnClass(db, stamp.professorUid, stamp.professorClassId, "link_or_permission").catch(async (e) => {
    logger.warn("professorOwnClass: turma não encontrada ao encerrar; cancela só a série", e);
  });
  try {
    await deliverNotificationToUser({
      userId: stamp.professorUid,
      title: "Turma própria encerrada",
      body: `O horário fixo na ${series.arenaName} foi liberado: o vínculo ou a permissão de horário fixo não estão mais ativos.`,
      type: "professor_own_class_ended",
      data: {professorClassId: stamp.professorClassId, url: "/professor/mais/turmas"},
      requireInteraction: false,
    });
  } catch (e) {
    logger.warn("professorOwnClass: aviso ao professor falhou", e);
  }
  return false;
}

// ---------------------------------------------------------------------------

function requireUid(r: CallableRequest): string {
  const uid = r.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return uid;
}

const dataOf = (r: CallableRequest) => (r.data ?? {}) as Record<string, unknown>;
const OPTS = {region: CLIENT_FACING_REGIONS, timeoutSeconds: 120};

export const previewProfessorOwnClass = onCall(OPTS, async (r) =>
  previewProfessorOwnClassCore(getFirestore(), requireUid(r), dataOf(r), new Date()));

export const createProfessorOwnClass = onCall(OPTS, async (r) =>
  createProfessorOwnClassCore(getFirestore(), requireUid(r), dataOf(r), new Date()));

export const endProfessorOwnClassCallable = onCall(OPTS, async (r) => {
  await endProfessorOwnClassCore(getFirestore(), requireUid(r), dataOf(r));
  return {ok: true};
});

export const setProfessorOwnClassStudents = onCall({region: CLIENT_FACING_REGIONS}, async (r) =>
  setProfessorOwnClassStudentsCore(getFirestore(), requireUid(r), dataOf(r)));

// ---------------------------------------------------------------------------
// A arena mexeu na série (cancelar, pausar, retomar pela lista de Horários fixos, ou quadra
// removida): a turma própria acompanha. `seriesStatus.{dia}` espelha a série; todas canceladas =
// turma encerrada. O professor é avisado — a não ser que a mudança tenha vindo dele mesmo (turma já
// encerrada pelo professor ou pelo agendador).

const WEEKDAY_SHORT: Record<number, string> = {1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sáb", 7: "dom"};

export async function syncOwnClassWithSeriesCore(
  db: Firestore,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  notify: (input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}) => Promise<void>,
): Promise<"skip" | "updated" | "ended"> {
  if (!before || !after || after["bookedAs"] !== "professor") return "skip";
  const classId = str(after["professorClassId"]);
  const professorUid = str(after["athleteId"]);
  const status = str(after["status"]);
  if (!classId || !professorUid || str(before["status"]) === status) return "skip";
  // Cancelamento do próprio fluxo da turma (professor encerrou / agendador): não é da arena.
  if (["professor_ended", "link_or_permission"].includes(str(after["cancelReason"]))) return "skip";
  const ref = db.collection(PROFESSORS).doc(professorUid).collection(PROFESSOR_OWN_CLASSES).doc(classId);
  const cls = (await ref.get()).data();
  if (!cls || cls["status"] === "ended") return "skip";
  const weekday = Number(after["weekday"]);
  const seriesIds = (cls["seriesIds"] ?? {}) as Record<string, string>;
  const statuses = {...((cls["seriesStatus"] ?? {}) as Record<string, string>), [String(weekday)]: status};
  const allCanceled = Object.keys(seriesIds).length > 0 && Object.keys(seriesIds).every((d) => (statuses[d] ?? "active") === "canceled");
  await ref.update({
    seriesStatus: statuses,
    updatedAt: FieldValue.serverTimestamp(),
    ...(allCanceled ? {status: "ended", endedReason: "arena_canceled", endedAt: FieldValue.serverTimestamp()} : {}),
  });
  const day = WEEKDAY_SHORT[weekday] ?? "um dia";
  const name = str(cls["name"]) || "sua turma";
  const arena = str(cls["arenaName"]) || "A arena";
  const body = allCanceled ?
    `${arena} cancelou o horário fixo e a turma ${name} foi encerrada.` :
    status === "canceled" ? `${arena} cancelou o horário fixo de ${day} da turma ${name}.` :
      status === "paused" ? `${arena} pausou o horário fixo de ${day} da turma ${name}.` :
        `${arena} retomou o horário fixo de ${day} da turma ${name}.`;
  try {
    await notify({
      userId: professorUid,
      title: allCanceled ? "Turma própria encerrada" : "Horário fixo da turma mudou",
      body, type: "professor_own_class_ended",
      data: {professorClassId: classId, url: `/professor/mais/turmas/propria/${classId}`},
    });
  } catch (e) {
    logger.warn(`ownClass ${classId}: aviso ao professor falhou`, e);
  }
  return allCanceled ? "ended" : "updated";
}

export const onProfessorRecurringSeriesChanged = onDocumentUpdated(`${ARENA_RECURRING_BOOKINGS}/{seriesId}`, async (event) => {
  await syncOwnClassWithSeriesCore(
    getFirestore(), event.data?.before.data(), event.data?.after.data(),
    async (input) => {
      await deliverNotificationToUser({...input, requireInteraction: false});
    },
  );
});
