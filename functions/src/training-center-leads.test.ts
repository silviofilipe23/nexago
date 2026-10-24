import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {bookCenterTrialCore, decideCenterTrialCore, loadCenterTrialBookingsCore} from "./class-trial-booking";
import type {NotifyDeps, PushInput} from "./training-center-notify";
import {
  bookPublicTrialCore,
  cancelLeadTrialCore,
  cancelPublicTrialCore,
  evaluateTrialCore,
  loadPublicTrialPageCore,
  nextInRotation,
  scheduleLeadTrialCore,
} from "./training-center-leads";
import {parseLeadSettings, phoneDigits} from "./training-center-leads-model";

const C = "trainingCenters/ct1";
/** Quarta 21/10/2026, 12:00 em São Paulo. */
const NOW = new Date("2026-10-21T15:00:00Z");
/** Quinta 22/10/2026, 20:00 em São Paulo (depois da aula das 18:00). */
const AFTER_CLASS = new Date("2026-10-22T23:00:00Z");
type Doc = Record<string, unknown>;

function seed(settings: Doc | null = {publicPage: true}): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.seedDoc(C, {status: "active", name: "CT Maré Alta", address: "Av. Lúcio Costa, 3150",
    showcase: {trial: {enabled: true, priceReais: 0, note: "Raquete o CT empresta"}}});
  if (settings) fake.seedDoc(`${C}/settings/leads`, settings);
  fake.seedDoc(`${C}/programs/bt`, {name: "Beach Tennis"});
  fake.seedDoc(`${C}/programs/fv`, {name: "Futevôlei"});
  fake.seedDoc(`${C}/classes/k1`, {status: "active", name: "BT Iniciante A", programId: "bt", level: "Iniciante",
    weekdays: [4], startTime: "18:00", durationMin: 60, capacity: 3, rosterStudentIds: ["a"], coachUid: "uCoach",
    coachName: "Thiago", locationName: "Quadra 1"});
  fake.seedDoc(`${C}/classes/k2`, {status: "active", name: "BT Intermediário B", programId: "bt", level: "Intermediário",
    weekdays: [4], startTime: "19:00", durationMin: 60, capacity: 6, rosterStudentIds: [], coachUid: "uCoach", coachName: "Thiago"});
  fake.seedDoc(`${C}/sessions/k1_2026-10-22`, {classId: "k1", programId: "bt", date: "2026-10-22", startTime: "18:00",
    status: "scheduled", coachUid: "uCoach", locationAddress: "Av. Lúcio Costa, 3150 · Quadra 1"});
  fake.seedDoc(`${C}/sessions/k1_2026-10-29`, {classId: "k1", programId: "bt", date: "2026-10-29", startTime: "18:00",
    status: "scheduled", coachUid: "uCoach"});
  fake.seedDoc(`${C}/centerMembers/uDono`, {uid: "uDono", status: "active", role: "center_owner", displayName: "Dona"});
  fake.seedDoc(`${C}/centerMembers/uRecep`, {uid: "uRecep", status: "active", role: "receptionist", displayName: "Camila"});
  fake.seedDoc(`${C}/centerMembers/uRecep2`, {uid: "uRecep2", status: "active", role: "receptionist", displayName: "Bruno"});
  fake.seedDoc(`${C}/centerMembers/uCoach`, {uid: "uCoach", status: "active", role: "coach", displayName: "Thiago Mendes"});
  fake.seedDoc(`${C}/centerMembers/uOutroProf`, {uid: "uOutroProf", status: "active", role: "coach"});
  fake.seedDoc(`${C}/leads/l1`, {name: "Thaís Monteiro", phone: "(21) 98812-3307", phoneDigits: "21988123307",
    stage: "contacted", trialsCount: 0, history: [], interest: {programId: "bt", experience: "plays", goal: "Jogar torneios"}});
  return {fake, db: fake as unknown as Firestore};
}

function pushes(now = NOW): {deps: NotifyDeps; sent: PushInput[]} {
  const sent: PushInput[] = [];
  return {sent, deps: {now: () => now, notify: async (p) => {
    sent.push(p);
  }}};
}

const get = (fake: FakeFirestore, path: string) => fake.store.get(path) as Doc;

async function rejectsWith(p: Promise<unknown>, code: string, msg?: RegExp): Promise<void> {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof HttpsError);
    assert.equal(e.code, code);
    if (msg) assert.match(e.message, msg);
    return true;
  });
}

describe("captação · modelo", () => {
  it("telefone sem DDI e config com padrões", () => {
    assert.equal(phoneDigits("+55 (21) 98812-3307"), "21988123307");
    assert.equal(phoneDigits("21 98812 3307"), "21988123307");
    const d = parseLeadSettings(undefined);
    assert.deepEqual([d.maxTrialsPerPerson, d.maxTrialsPerSession, d.onlyWithSpots, d.publicPage], [1, 2, true, false]);
    assert.equal(parseLeadSettings({maxTrialsPerSession: 0}).maxTrialsPerSession, 2, "fora da faixa volta ao padrão");
    assert.equal(nextInRotation(["b", "a"], "a"), "b");
    assert.equal(nextInRotation(["b", "a"], "b"), "a");
    assert.equal(nextInRotation(["a"], ""), "a");
    assert.equal(nextInRotation([], "a"), null);
  });
});

describe("captação · recepção agenda a experimental (C2)", () => {
  it("cria o pedido confirmado, espelha na aula, move o interessado e avisa o professor", async () => {
    const {fake, db} = seed();
    const {deps, sent} = pushes();
    const r = await scheduleLeadTrialCore(db, deps, "uRecep", {centerId: "ct1", leadId: "l1", sessionId: "k1_2026-10-22"});
    assert.equal(r.bookingId, "k1_2026-10-22_l_l1");
    const b = get(fake, `${C}/trialBookings/${r.bookingId}`);
    assert.deepEqual([b["status"], b["source"], b["leadId"], b["name"], b["decidedByName"]],
      ["confirmed", "staff", "l1", "Thaís Monteiro", "Camila"]);
    const mirror = (get(fake, `${C}/sessions/k1_2026-10-22`)["trials"] as Record<string, Doc>)["l_l1"]!;
    assert.deepEqual([mirror["status"], mirror["experience"], mirror["goal"]], ["confirmed", "Já joga", "Jogar torneios"]);
    const lead = get(fake, `${C}/leads/l1`);
    assert.equal(lead["stage"], "scheduled");
    assert.equal(lead["trialsCount"], 1);
    assert.equal((lead["trial"] as Doc)["bookingId"], r.bookingId);
    assert.equal((lead["history"] as Doc[]).length, 1);
    assert.deepEqual(sent.map((p) => p.userId), ["uCoach"]);
    // A lista de Experimentais do portal já mostra, com o vínculo.
    const list = await loadCenterTrialBookingsCore(db, "uRecep", "ct1", "2026-10-21");
    assert.deepEqual(list.bookings.map((x) => [x.id, x.leadId, x.source]), [[r.bookingId, "l1", "staff"]]);
  });

  it("limites: uma ativa por interessado, por pessoa, por aula e só com vaga", async () => {
    const {fake, db} = seed({maxTrialsPerPerson: 2, maxTrialsPerSession: 1});
    const {deps} = pushes();
    await scheduleLeadTrialCore(db, deps, "uRecep", {centerId: "ct1", leadId: "l1", sessionId: "k1_2026-10-22"});
    await rejectsWith(scheduleLeadTrialCore(db, deps, "uRecep", {centerId: "ct1", leadId: "l1", sessionId: "k1_2026-10-29"}),
      "already-exists", /Desmarque/);
    fake.seedDoc(`${C}/leads/l2`, {name: "Caio", phone: "21999990000", trialsCount: 0, history: []});
    await rejectsWith(scheduleLeadTrialCore(db, deps, "uRecep", {centerId: "ct1", leadId: "l2", sessionId: "k1_2026-10-22"}),
      "failed-precondition", /máximo de experimentais/);
    fake.seedDoc(`${C}/leads/l3`, {name: "Bia", phone: "21999990001", trialsCount: 2, history: []});
    await rejectsWith(scheduleLeadTrialCore(db, deps, "uRecep", {centerId: "ct1", leadId: "l3", sessionId: "k1_2026-10-29"}),
      "failed-precondition", /Limite de 2/);
    // Turma cheia na data (3 vagas: 1 fixo + 2 reposições).
    fake.seedDoc(`${C}/sessions/k1_2026-10-29`, {classId: "k1", date: "2026-10-29", startTime: "18:00", status: "scheduled",
      makeupStudentIds: ["x", "y"]});
    await rejectsWith(scheduleLeadTrialCore(db, deps, "uRecep", {centerId: "ct1", leadId: "l2", sessionId: "k1_2026-10-29"}),
      "failed-precondition", /sem vaga/);
    await rejectsWith(scheduleLeadTrialCore(db, deps, "uCoach", {centerId: "ct1", leadId: "l2", sessionId: "k1_2026-10-29"}),
      "permission-denied");
  });

  it("desmarcar devolve para Em contato e libera o limite", async () => {
    const {fake, db} = seed();
    const {deps} = pushes();
    const {bookingId} = await scheduleLeadTrialCore(db, deps, "uRecep", {centerId: "ct1", leadId: "l1", sessionId: "k1_2026-10-22"});
    await cancelLeadTrialCore(db, "uDono", {centerId: "ct1", bookingId}, NOW);
    assert.equal(get(fake, `${C}/trialBookings/${bookingId}`)["status"], "canceled");
    const lead = get(fake, `${C}/leads/l1`);
    assert.deepEqual([lead["stage"], lead["trialsCount"], (lead["trial"] as Doc)["status"]], ["contacted", 0, "canceled"]);
    // De novo na mesma aula (mesmo id de pedido) funciona.
    await scheduleLeadTrialCore(db, deps, "uRecep", {centerId: "ct1", leadId: "l1", sessionId: "k1_2026-10-22"});
    assert.equal(get(fake, `${C}/trialBookings/${bookingId}`)["status"], "confirmed");
  });
});

describe("captação · professor avalia (C8)", () => {
  it("veio: nível, turma indicada e proposta; recepção recebe o aviso", async () => {
    const {fake, db} = seed({offerDays: 7});
    const {bookingId} = await scheduleLeadTrialCore(db, pushes().deps, "uRecep", {centerId: "ct1", leadId: "l1", sessionId: "k1_2026-10-22"});
    await rejectsWith(evaluateTrialCore(db, pushes().deps, "uCoach", {centerId: "ct1", bookingId, attended: true}),
      "failed-precondition", /abre quando a aula começa/);
    const {deps, sent} = pushes(AFTER_CLASS);
    await rejectsWith(evaluateTrialCore(db, deps, "uOutroProf", {centerId: "ct1", bookingId, attended: true}), "permission-denied");
    await evaluateTrialCore(db, deps, "uCoach", {centerId: "ct1", bookingId, attended: true, level: "intermediate",
      classId: "k2", note: "Boa base de fundo de quadra."});
    const b = get(fake, `${C}/trialBookings/${bookingId}`);
    assert.equal(b["attendance"], "attended");
    assert.deepEqual([(b["coachFeedback"] as Doc)["className"], (b["coachFeedback"] as Doc)["byName"]], ["BT Intermediário B", "Thiago Mendes"]);
    const mirror = (get(fake, `${C}/sessions/k1_2026-10-22`)["trials"] as Record<string, Doc>)["l_l1"]!;
    assert.deepEqual([mirror["attendance"], mirror["evaluated"]], ["attended", true]);
    const lead = get(fake, `${C}/leads/l1`);
    assert.deepEqual([lead["stage"], lead["proposalUntil"], (lead["coachFeedback"] as Doc)["level"]],
      ["attended", "2026-10-29", "intermediate"]);
    assert.deepEqual(sent.map((p) => p.userId).sort(), ["uDono", "uRecep", "uRecep2"]);
  });

  it("não veio: volta para Em contato e não gasta a experimental", async () => {
    const {fake, db} = seed();
    const {bookingId} = await scheduleLeadTrialCore(db, pushes().deps, "uRecep", {centerId: "ct1", leadId: "l1", sessionId: "k1_2026-10-22"});
    const {deps, sent} = pushes(AFTER_CLASS);
    await evaluateTrialCore(db, deps, "uCoach", {centerId: "ct1", bookingId, attended: false});
    const lead = get(fake, `${C}/leads/l1`);
    assert.deepEqual([lead["stage"], lead["trialsCount"], (lead["trial"] as Doc)["attendance"]], ["contacted", 0, "no_show"]);
    assert.equal(sent.length, 0);
  });
});

describe("captação · pedido pelo app vira interessado", () => {
  it("cria o interessado u_{uid}; recusa devolve para Em contato", async () => {
    const {fake, db} = seed(null);
    fake.seedDoc("users/uAtleta", {fullName: "Gustavo Reis", phoneNumber: "+5521977776666"});
    const {deps} = pushes();
    const {bookingId} = await bookCenterTrialCore(db, deps, "uAtleta", "ct1", "k1_2026-10-22", "2026-10-21");
    const lead = get(fake, `${C}/leads/u_uAtleta`);
    assert.deepEqual([lead["stage"], lead["source"], lead["phoneDigits"], lead["trialsCount"]], ["scheduled", "app", "21977776666", 1]);
    assert.equal(get(fake, `${C}/trialBookings/${bookingId}`)["leadId"], "u_uAtleta");
    await decideCenterTrialCore(db, deps, "uRecep", {centerId: "ct1", bookingId, decision: "decline"});
    assert.equal(get(fake, `${C}/leads/u_uAtleta`)["stage"], "contacted");
  });

  it("acha o interessado do balcão pelo telefone e respeita o limite configurado", async () => {
    const {fake, db} = seed({maxTrialsPerPerson: 1});
    fake.seedDoc("users/uThais", {fullName: "Thaís M.", phoneNumber: "21 98812-3307"});
    const {deps} = pushes();
    await bookCenterTrialCore(db, deps, "uThais", "ct1", "k1_2026-10-22", "2026-10-21");
    const lead = get(fake, `${C}/leads/l1`);
    assert.deepEqual([lead["stage"], lead["athleteId"], lead["trialsCount"]], ["scheduled", "uThais", 1]);
    assert.equal(fake.store.has(`${C}/leads/u_uThais`), false);
    fake.seedDoc(`${C}/leads/l1`, {...lead, trial: null});
    fake.seedDoc(`${C}/trialBookings/k1_2026-10-22_uThais`, {...get(fake, `${C}/trialBookings/k1_2026-10-22_uThais`), status: "canceled"});
    fake.seedDoc(`${C}/leads/l1`, {...get(fake, `${C}/leads/l1`), trialsCount: 1});
    await rejectsWith(bookCenterTrialCore(db, deps, "uThais", "ct1", "k1_2026-10-29", "2026-10-21"), "failed-precondition", /já fez/);
  });
});

describe("captação · página pública (C9/C10)", () => {
  it("lista horários com vaga e respeita a página desligada", async () => {
    const {db} = seed();
    const page = await loadPublicTrialPageCore(db, "ct1", NOW);
    assert.equal(page.center.name, "CT Maré Alta");
    assert.deepEqual(page.programs, [{id: "bt", name: "Beach Tennis"}]);
    assert.deepEqual(page.slots.map((s) => [s.sessionId, s.programName, s.spotsLeft, s.address]), [
      ["k1_2026-10-22", "Beach Tennis", 2, "Av. Lúcio Costa, 3150 · Quadra 1"],
      ["k1_2026-10-29", "Beach Tennis", 2, "Av. Lúcio Costa, 3150"],
    ]);
    const off = seed({publicPage: false});
    await rejectsWith(loadPublicTrialPageCore(off.db, "ct1", NOW), "not-found");
  });

  it("agenda sem conta, cria o interessado e desmarca só com o token", async () => {
    const {fake, db} = seed({publicPage: true, assignMode: "rotation"});
    const {deps, sent} = pushes();
    await rejectsWith(bookPublicTrialCore(db, deps, {centerId: "ct1", sessionId: "k1_2026-10-22", name: "Mariana", phone: "123"}),
      "invalid-argument", /WhatsApp/);
    const r = await bookPublicTrialCore(db, deps, {centerId: "ct1", sessionId: "k1_2026-10-22", name: "Mariana Couto",
      phone: "(21) 99604-1182", experience: "never", programId: "bt"}, "tok123");
    assert.deepEqual([r.className, r.teacherName, r.date, r.startTime, r.token], ["BT Iniciante A", "Thiago", "2026-10-22", "18:00", "tok123"]);
    const leadId = String(get(fake, `${C}/trialBookings/${r.bookingId}`)["leadId"]);
    const lead = get(fake, `${C}/leads/${leadId}`);
    assert.deepEqual([lead["source"], lead["stage"], lead["phoneDigits"], (lead["interest"] as Doc)["programName"], lead["ownerUid"]],
      ["page", "scheduled", "21996041182", "Beach Tennis", "uRecep"]);
    assert.equal(lead["ownerName"], "Camila");
    assert.deepEqual(sent.map((p) => p.userId).sort(), ["uCoach", "uRecep"]);
    // Mesmo telefone: não marca outra enquanto a primeira não acontece.
    await rejectsWith(bookPublicTrialCore(db, deps, {centerId: "ct1", sessionId: "k1_2026-10-29", name: "Mari", phone: "21996041182"}),
      "already-exists");
    await rejectsWith(cancelPublicTrialCore(db, deps, {centerId: "ct1", bookingId: r.bookingId, token: "errado"}), "permission-denied");
    await cancelPublicTrialCore(db, deps, {centerId: "ct1", bookingId: r.bookingId, token: "tok123"});
    assert.equal(get(fake, `${C}/trialBookings/${r.bookingId}`)["status"], "canceled");
    assert.equal(get(fake, `${C}/leads/${leadId}`)["stage"], "contacted");
    // Próximo do rodízio vai para a outra recepção.
    await bookPublicTrialCore(db, deps, {centerId: "ct1", sessionId: "k1_2026-10-29", name: "Rodrigo Paes", phone: "21955554444"});
    const rodrigo = [...fake.store.entries()].find(([k, v]) => k.startsWith(`${C}/leads/`) && (v as Doc)["name"] === "Rodrigo Paes")!;
    assert.equal((rodrigo[1] as Doc)["ownerUid"], "uRecep2");
  });
});
