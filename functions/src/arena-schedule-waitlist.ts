/**
 * Planos de horário — lista de espera. O atleta entra no horário lotado (A2) ou o gestor adiciona;
 * vaga liberada vira oferta (`offer {courtId, courtName, offeredAt, expiresAt}`) para o mais antigo
 * da fila que cabe numa quadra livre. Oferta segura a quadra e a vaga até expirar (varredura a cada
 * 30 min passa para o próximo). Aceitar = assinar com `source: 'waitlist'`.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, FieldValue, Timestamp, type Firestore, type Transaction} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {dayKeyFromEventDate} from "./event-timezone";
import {toMinutes} from "./arena-recurring-booking";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  ARENA_SCHEDULE_WAITLIST,
  addMinutesToTime,
  endMinutes,
  parseSchedulePlan,
  pickCourt,
  str,
  validateChosenSlots,
} from "./arena-schedule-plan-constants";
import {
  busyBlocksOf,
  isScheduleManager,
  liveOffersForPlan,
  loadScheduleSettings,
  notifyScheduleSafe,
  planCourtsOf,
  planRef,
  readArenaOccupancy,
  requireScheduleManager,
  requireUid,
  rethrowSchedule,
} from "./arena-schedule-plans";
import {createSubscriptionCore, resolveHolderAccount, type CreateSubscriptionResult} from "./arena-schedule-subscriptions";

type Data = Record<string, unknown>;
const OPEN_ENTRY = ["waiting", "offered"];

function entryWeekdays(entry: Data): number[] {
  return Array.isArray(entry["weekdays"]) ? (entry["weekdays"] as unknown[]).map(Number) : [];
}

function createdMs(entry: Data): number {
  const raw = entry["createdAt"];
  return raw instanceof Timestamp ? raw.toMillis() : 0;
}

/** Posição na fila do plano (1 = próximo), entre as entradas em espera/oferta mais antigas. */
export function queuePosition(entries: Array<{id: string; data: Data}>, entryId: string): number {
  const open = entries.filter((e) => OPEN_ENTRY.includes(String(e.data["status"])))
    .sort((a, b) => createdMs(a.data) - createdMs(b.data) || a.id.localeCompare(b.id));
  const idx = open.findIndex((e) => e.id === entryId);
  return idx < 0 ? open.length + 1 : idx + 1;
}

// ---------------------------------------------------------------------------
// Entrar / sair
// ---------------------------------------------------------------------------

export async function addWaitlistCore(
  db: Firestore,
  uid: string,
  input: Data,
  nowMs: number,
): Promise<{entryId: string; position: number}> {
  const arenaId = str(input["arenaId"]);
  const planId = str(input["planId"]);
  if (!arenaId || !planId) throw new HttpsError("invalid-argument", "Plano inválido.");
  const pRef = planRef(db, arenaId, planId);
  const planSnap = await pRef.get();
  if (!planSnap.exists) throw new HttpsError("not-found", "Plano não encontrado.");
  const plan = parseSchedulePlan(planSnap.data() as Data);
  if (plan.status !== "active") throw new HttpsError("failed-precondition", "Este plano não está disponível.");
  const {weekdays, startTime, endTime} = validateChosenSlots(plan, input["weekdays"], input["startTime"]);
  const playersCount = input["playersCount"] == null ? 1 : Number(input["playersCount"]);
  if (!Number.isInteger(playersCount) || playersCount < 1 || playersCount > 6) {
    throw new HttpsError("invalid-argument", "Número de jogadores: de 1 a 6.");
  }
  const note = str(input["note"]).slice(0, 300) || null;

  // Gestor adiciona alguém pelo nome; sem nome, quem chama entra como ele mesmo.
  const managerAdding = !!str(input["name"]) && await isScheduleManager(db, arenaId, uid);
  let person: {athleteId: string | null; name: string; phone: string | null; photoUrl: string | null};
  if (managerAdding) {
    person = {athleteId: null, name: str(input["name"]).slice(0, 80), phone: str(input["phone"]).slice(0, 30) || null, photoUrl: null};
  } else {
    person = await resolveHolderAccount(db, uid);
    const mine = await db.collection(ARENA_SCHEDULE_WAITLIST).where("athleteId", "==", uid).get();
    if (mine.docs.some((d) => d.data()["planId"] === planId && OPEN_ENTRY.includes(String(d.data()["status"])))) {
      throw new HttpsError("already-exists", "Você já está na fila deste plano.");
    }
  }

  const entryRef = db.collection(ARENA_SCHEDULE_WAITLIST).doc();
  await db.runTransaction(async (tx: Transaction) => {
    const fresh = await tx.get(pRef);
    tx.set(entryRef, {
      arenaId, planId, planName: plan.name, weekdays, startTime, endTime,
      athleteId: person.athleteId, name: person.name, phone: person.phone, photoUrl: person.photoUrl,
      playersCount, note, status: "waiting", offer: null, addedByUid: uid,
      // Timestamp explícito (não serverTimestamp): ordena a fila e a posição na mesma hora.
      createdAt: Timestamp.fromMillis(nowMs), updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(pRef, {waitingCount: Number(fresh.data()?.["waitingCount"] ?? 0) + 1}, {merge: true});
  });
  const queue = await db.collection(ARENA_SCHEDULE_WAITLIST).where("planId", "==", planId).get();
  return {entryId: entryRef.id, position: queuePosition(queue.docs.map((d) => ({id: d.id, data: d.data() as Data})), entryRef.id)};
}

async function closeEntry(db: Firestore, entryRef: FirebaseFirestore.DocumentReference, status: "removed" | "expired"): Promise<Data | null> {
  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(entryRef);
    const entry = (snap.data() ?? {}) as Data;
    if (!snap.exists || !OPEN_ENTRY.includes(String(entry["status"]))) return null;
    const pRef = planRef(db, str(entry["arenaId"]), str(entry["planId"]));
    const planSnap = await tx.get(pRef);
    tx.set(entryRef, {status, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    if (planSnap.exists) {
      tx.set(pRef, {waitingCount: Math.max(0, Number(planSnap.data()?.["waitingCount"] ?? 0) - 1)}, {merge: true});
    }
    return entry;
  });
}

export async function removeWaitlistCore(db: Firestore, uid: string, entryId: string, nowMs: number): Promise<Record<string, never>> {
  if (!entryId) throw new HttpsError("invalid-argument", "Entrada inválida.");
  const ref = db.collection(ARENA_SCHEDULE_WAITLIST).doc(entryId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Entrada não encontrada.");
  const data = snap.data() as Data;
  if (str(data["athleteId"]) !== uid) await requireScheduleManager(db, str(data["arenaId"]), uid);
  const closed = await closeEntry(db, ref, "removed");
  // Quem desistiu de uma oferta libera a vaga para o próximo.
  if (closed?.["status"] === "offered") await offerNextForPlan(db, str(closed["arenaId"]), str(closed["planId"]), nowMs);
  return {};
}

// ---------------------------------------------------------------------------
// Oferta
// ---------------------------------------------------------------------------

/**
 * Oferece a quadra livre (todos os dias da entrada, naquele horário) à entrada. `checkSeat` exige
 * vaga no plano (ocupadas + ofertas vivas < capacidade) — o gestor oferecendo na mão não exige.
 * Retorna null se não coube.
 */
export async function offerEntryCore(
  db: Firestore,
  entryId: string,
  nowMs: number,
  opts: {checkSeat: boolean},
): Promise<{courtName: string; expiresAt: string} | null> {
  const ref = db.collection(ARENA_SCHEDULE_WAITLIST).doc(entryId);
  const first = await ref.get();
  if (!first.exists) throw new HttpsError("not-found", "Entrada não encontrada.");
  const arenaId = str(first.data()?.["arenaId"]);
  const planId = str(first.data()?.["planId"]);
  const settings = await loadScheduleSettings(db, arenaId);
  const pRef = planRef(db, arenaId, planId);
  const expiresAt = Timestamp.fromMillis(nowMs + settings.waitlistOfferHours * 3_600_000);

  const offer = await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    const planSnap = await tx.get(pRef);
    const arenaSnap = await tx.get(db.collection("arenas").doc(arenaId));
    const occ = await readArenaOccupancy(db, arenaId, (q) => tx.get(q));
    const entry = (snap.data() ?? {}) as Data;
    if (entry["status"] !== "waiting") throw new HttpsError("failed-precondition", "Esta entrada não está mais na fila.");
    if (!planSnap.exists) throw new HttpsError("not-found", "Plano não encontrado.");
    const plan = parseSchedulePlan(planSnap.data() as Data);
    if (opts.checkSeat && plan.occupiedCount + liveOffersForPlan(occ, planId, nowMs) >= plan.capacity) return null;
    const startTime = str(entry["startTime"]);
    const startMin = toMinutes(startTime);
    const picked = pickCourt({
      ...planCourtsOf(arenaSnap.data(), plan, occ.courts), weekdays: entryWeekdays(entry), startMin,
      endMin: endMinutes(str(entry["endTime"]) || addMinutesToTime(startTime, plan.durationMinutes)),
      busy: busyBlocksOf(occ, {fromDate: dayKeyFromEventDate(new Date(nowMs)), nowMs}),
    });
    if (!picked) return null;
    tx.set(ref, {
      status: "offered",
      offer: {courtId: picked.courtId, courtName: picked.courtName, offeredAt: Timestamp.fromMillis(nowMs), expiresAt},
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return {courtName: picked.courtName, athleteId: str(entry["athleteId"]), planName: plan.name};
  });
  if (!offer) return null;
  await notifyScheduleSafe(offer.athleteId, {
    title: "Abriu vaga no seu horário! 🎾",
    body: `${offer.planName} · ${offer.courtName}. A vaga fica reservada para você por ${settings.waitlistOfferHours}h.`,
    type: "schedule_plan_waitlist_offer",
    data: {entryId, arenaId},
  });
  return {courtName: offer.courtName, expiresAt: expiresAt.toDate().toISOString()};
}

/** Oferta automática: o mais antigo da fila do plano que cabe numa quadra livre. */
export async function offerNextForPlan(db: Firestore, arenaId: string, planId: string, nowMs: number): Promise<string | null> {
  if (!arenaId || !planId) return null;
  const settings = await loadScheduleSettings(db, arenaId);
  if (!settings.waitlistAutoOffer) return null;
  const waiting = await db.collection(ARENA_SCHEDULE_WAITLIST)
    .where("planId", "==", planId)
    .where("status", "==", "waiting")
    .orderBy("createdAt")
    .get();
  for (const doc of waiting.docs) {
    // Entrada só com nome (o gestor adicionou) não tem quem aceite pelo app: o gestor converte ela
    // em assinatura (`createArenaScheduleSubscription` com `waitlistEntryId`). Não segura vaga aqui.
    if (!str(doc.data()["athleteId"])) continue;
    const offered = await offerEntryCore(db, doc.id, nowMs, {checkSeat: true});
    if (offered) return doc.id;
  }
  return null;
}

export async function offerWaitlistManualCore(
  db: Firestore,
  uid: string,
  entryId: string,
  nowMs: number,
): Promise<{courtName: string; expiresAt: string}> {
  if (!entryId) throw new HttpsError("invalid-argument", "Entrada inválida.");
  const snap = await db.collection(ARENA_SCHEDULE_WAITLIST).doc(entryId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Entrada não encontrada.");
  await requireScheduleManager(db, str(snap.data()?.["arenaId"]), uid);
  const offered = await offerEntryCore(db, entryId, nowMs, {checkSeat: false});
  if (!offered) throw new HttpsError("resource-exhausted", "Nenhuma quadra do plano está livre nesses dias e horário.");
  return offered;
}

/** Varredura: oferta vencida → `expired` + próximo da fila. */
export async function expireWaitlistOffersCore(db: Firestore, nowMs: number): Promise<{expired: number; reoffered: number}> {
  const snap = await db.collection(ARENA_SCHEDULE_WAITLIST)
    .where("status", "==", "offered")
    .where("offer.expiresAt", "<=", Timestamp.fromMillis(nowMs))
    .get();
  let expired = 0;
  let reoffered = 0;
  for (const doc of snap.docs) {
    const closed = await closeEntry(db, doc.ref, "expired");
    if (!closed) continue;
    expired += 1;
    await notifyScheduleSafe(str(closed["athleteId"]), {
      title: "A oferta de vaga expirou",
      body: `A vaga no plano ${str(closed["planName"])} passou para o próximo da fila.`,
      type: "schedule_plan_waitlist_expired",
      data: {entryId: doc.id, arenaId: str(closed["arenaId"])},
    });
    if (await offerNextForPlan(db, str(closed["arenaId"]), str(closed["planId"]), nowMs)) reoffered += 1;
  }
  return {expired, reoffered};
}

export async function acceptWaitlistOfferCore(
  db: Firestore,
  uid: string,
  input: Data,
  todayKey: string,
  nowMs: number,
): Promise<Pick<CreateSubscriptionResult,
  "subscriptionId" | "courtName" | "skippedDates" | "firstCharge" | "status" | "paymentDeadline">> {
  const entryId = str(input["entryId"]);
  if (!entryId) throw new HttpsError("invalid-argument", "Oferta inválida.");
  const snap = await db.collection(ARENA_SCHEDULE_WAITLIST).doc(entryId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Oferta não encontrada.");
  const entry = snap.data() as Data;
  if (str(entry["athleteId"]) !== uid) throw new HttpsError("permission-denied", "Esta oferta não é sua.");
  const offer = (entry["offer"] ?? {}) as Data;
  const expiresMs = offer["expiresAt"] instanceof Timestamp ? offer["expiresAt"].toMillis() : 0;
  if (entry["status"] !== "offered" || expiresMs <= nowMs) throw new HttpsError("failed-precondition", "Esta oferta expirou.");
  const holder = await resolveHolderAccount(db, uid);
  const result = await createSubscriptionCore(db, {
    arenaId: str(entry["arenaId"]), planId: str(entry["planId"]), holder,
    memberAthleteIds: Array.isArray(input["memberAthleteIds"]) ? (input["memberAthleteIds"] as unknown[]).map(str).filter(Boolean) : [],
    weekdays: entry["weekdays"], startTime: entry["startTime"],
    preferredCourtId: str(offer["courtId"]) || null, strictCourt: false,
    cycle: input["cycle"], paymentMethod: input["paymentMethod"], startDate: todayKey,
    source: "waitlist", createdByUid: uid, audience: "athlete", waitlistEntryId: entryId,
  }, todayKey, nowMs);
  return {
    subscriptionId: result.subscriptionId, courtName: result.courtName, skippedDates: result.skippedDates,
    firstCharge: result.firstCharge, status: result.status, paymentDeadline: result.paymentDeadline,
  };
}

// ---------------------------------------------------------------------------
// Callables e agendador
// ---------------------------------------------------------------------------

export const addArenaScheduleWaitlist = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  try {
    return await addWaitlistCore(getFirestore(), uid, (request.data ?? {}) as Data, Date.now());
  } catch (e) {
    return rethrowSchedule("addArenaScheduleWaitlist", e);
  }
});

export const removeArenaScheduleWaitlist = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Data;
  try {
    return await removeWaitlistCore(getFirestore(), uid, str(input["entryId"]), Date.now());
  } catch (e) {
    return rethrowSchedule("removeArenaScheduleWaitlist", e);
  }
});

export const offerArenaScheduleWaitlist = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Data;
  try {
    return await offerWaitlistManualCore(getFirestore(), uid, str(input["entryId"]), Date.now());
  } catch (e) {
    return rethrowSchedule("offerArenaScheduleWaitlist", e);
  }
});

export const acceptArenaScheduleWaitlistOffer = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 120}, async (request) => {
  const uid = requireUid(request.auth);
  try {
    const result = await acceptWaitlistOfferCore(
      getFirestore(), uid, (request.data ?? {}) as Data, dayKeyFromEventDate(new Date()), Date.now(),
    );
    // `firstCharge`: o app leva o atleta direto ao pagamento da 1ª mensalidade.
    return {
      subscriptionId: result.subscriptionId, courtName: result.courtName, firstCharge: result.firstCharge,
      status: result.status, paymentDeadline: result.paymentDeadline,
    };
  } catch (e) {
    return rethrowSchedule("acceptArenaScheduleWaitlistOffer", e);
  }
});

export const expireArenaScheduleWaitlistOffers = onSchedule({
  schedule: "every 30 minutes",
  timeZone: "America/Sao_Paulo",
}, async () => {
  const result = await expireWaitlistOffersCore(getFirestore(), Date.now());
  logger.info("expireArenaScheduleWaitlistOffers", result);
});

