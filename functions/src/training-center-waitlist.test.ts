import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {handleSeatChange, offerOpenSeats, type WaitlistDeps} from "./training-center-waitlist";
import {buildContract, classSeatInputChanged, priceOn, seatsToOffer, waitlistQueue} from "./training-center-waitlist-model";

const NOW = new Date("2026-10-22T15:00:00Z");
const C = "trainingCenters/c1";
const CLS = `${C}/classes/k1`;
const POL = {waitlistEnabled: true, waitlistAcceptHours: 24, unexcusedAbsenceConsumes: true};

function seed(opts: {center?: Record<string, unknown>; cls?: Record<string, unknown>} = {}) {
  const fake = new FakeFirestore();
  fake.seedDoc(C, {name: "CT Praia", status: "active", timezone: "America/Sao_Paulo", policies: POL, ...opts.center});
  fake.seedDoc(CLS, {name: "BT Iniciante A", status: "active", capacity: 2, seatsTaken: 1, rosterStudentIds: ["s0"], ...opts.cls});
  fake.seedDoc(`${C}/plans/m2`, {name: "Mensal 2x", type: "monthly", priceCents: 32000, status: "active", scheduledPrice: null});
  fake.seedDoc(`${C}/plans/old`, {name: "Velho", type: "monthly", priceCents: 1, status: "archived"});
  fake.seedDoc(`${C}/students/s1`, {name: "Lara", uid: "uLara"});
  fake.seedDoc(`${C}/students/s2`, {name: "Mateus", uid: null, isMinor: true, guardian: {name: "Paula"}});
  fake.seedDoc(`${C}/enrollments/w2`, {classId: "k1", studentId: "s2", status: "waitlisted", planId: "m2", waitlistedAt: Timestamp.fromDate(new Date("2026-10-19T10:00:00Z"))});
  fake.seedDoc(`${C}/enrollments/w1`, {classId: "k1", studentId: "s1", status: "waitlisted", planId: "m2", waitlistedAt: Timestamp.fromDate(new Date("2026-10-18T10:00:00Z"))});
  return fake;
}
const docs = (fake: FakeFirestore, prefix: string) => [...fake.store.entries()].filter(([p]) => p.startsWith(prefix)).map(([, d]) => d);

describe("modelo da fila", () => {
  it("ordena por chegada e só conta quem está na fila desta turma", () => {
    const q = waitlistQueue([
      {id: "b", data: {classId: "k1", status: "waitlisted", studentId: "2", waitlistedAt: Timestamp.fromMillis(2)}},
      {id: "a", data: {classId: "k1", status: "waitlisted", studentId: "1", waitlistedAt: Timestamp.fromMillis(1)}},
      {id: "c", data: {classId: "k1", status: "pending", studentId: "3"}},
      {id: "d", data: {classId: "k9", status: "waitlisted", studentId: "4"}},
    ], "k1");
    assert.deepEqual(q.map((x) => x.id), ["a", "b"]);
  });

  it("sem oferta com centro inativo, fila desligada ou turma cheia", () => {
    const cls = {status: "active", capacity: 2, seatsTaken: 1};
    assert.equal(seatsToOffer({status: "active", policies: POL}, cls), 1);
    assert.equal(seatsToOffer({status: "suspended", policies: POL}, cls), 0);
    assert.equal(seatsToOffer({status: "active", policies: {...POL, waitlistEnabled: false}}, cls), 0);
    assert.equal(seatsToOffer({status: "active", policies: POL}, {...cls, seatsTaken: 2}), 0);
  });

  it("contrato usa o preço agendado só a partir da data", () => {
    const plan = {name: "M", type: "monthly", priceCents: 32000, scheduledPrice: {priceCents: 35000, effectiveFrom: "2026-11-01"}};
    assert.equal(priceOn(plan, "2026-10-31"), 32000);
    assert.equal(buildContract(plan, POL, "2026-11-01")["priceCents"], 35000);
  });

  it("gatilho da turma só reage a vaga/capacidade/situação", () => {
    assert.equal(classSeatInputChanged({seatsTaken: 2, capacity: 2}, {seatsTaken: 1, capacity: 2}), true);
    assert.equal(classSeatInputChanged({seatsTaken: 1, name: "a"}, {seatsTaken: 1, name: "b"}), false);
  });
});

describe("offerOpenSeats", () => {
  it("oferece a vaga ao 1º da fila: pendente, contrato, cobrança, lista da turma e auditoria", async () => {
    const fake = seed();
    const offers = await offerOpenSeats(fake as unknown as Firestore, "c1", "k1", NOW);
    assert.deepEqual(offers.map((o) => o.enrollmentId), ["w1"]);
    const e = fake.store.get(`${C}/enrollments/w1`)!;
    assert.equal(e["status"], "pending");
    assert.equal((e["contract"] as Record<string, unknown>)["priceCents"], 32000);
    assert.equal((e["holdUntil"] as Timestamp).toMillis(), NOW.getTime() + 24 * 3600_000);
    assert.equal(fake.store.get(`${C}/enrollments/w2`)!["status"], "waitlisted");
    const cls = fake.store.get(CLS)!;
    assert.equal(cls["seatsTaken"], 2);
    assert.deepEqual(cls["rosterStudentIds"], ["s0", "s1"]);
    const inv = docs(fake, `${C}/invoices/`);
    assert.equal(inv.length, 1);
    assert.equal(inv[0]!["status"], "pending");
    assert.equal(inv[0]!["reference"], "Mensal 2x · out");
    assert.equal(docs(fake, `${C}/auditLogs/`).length, 1);
  });

  it("sem vaga livre não faz nada (e rodar de novo não oferece de novo)", async () => {
    const fake = seed();
    const db = fake as unknown as Firestore;
    await offerOpenSeats(db, "c1", "k1", NOW);
    assert.deepEqual(await offerOpenSeats(db, "c1", "k1", NOW), []);
    assert.equal(docs(fake, `${C}/invoices/`).length, 1);
  });

  it("duas vagas: oferece aos dois, pagador do menor é o responsável", async () => {
    const fake = seed({cls: {seatsTaken: 0, rosterStudentIds: []}});
    const offers = await offerOpenSeats(fake as unknown as Firestore, "c1", "k1", NOW);
    assert.equal(offers.length, 2);
    const payers = docs(fake, `${C}/invoices/`).map((d) => d["payerName"]).sort();
    assert.deepEqual(payers, ["Lara", "Paula"]);
  });

  it("plano arquivado: pula a pessoa e oferece ao próximo", async () => {
    const fake = seed();
    fake.seedDoc(`${C}/enrollments/w1`, {...fake.store.get(`${C}/enrollments/w1`)!, planId: "old"});
    const offers = await offerOpenSeats(fake as unknown as Firestore, "c1", "k1", NOW);
    assert.deepEqual(offers.map((o) => o.enrollmentId), ["w2"]);
    assert.equal(fake.store.get(`${C}/enrollments/w1`)!["status"], "waitlisted");
  });

  it("avisa por push só quem tem conta", async () => {
    const fake = seed({cls: {seatsTaken: 0, rosterStudentIds: []}});
    const sent: string[] = [];
    const deps: WaitlistDeps = {now: () => NOW, notify: async (i) => void sent.push(i.userId)};
    await handleSeatChange(fake as unknown as Firestore, deps, "c1", "k1");
    assert.deepEqual(sent, ["uLara"]);
  });
});
