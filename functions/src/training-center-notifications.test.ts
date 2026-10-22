import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {handleEnrollmentNotice, handleInviteNotice, handleSessionNotice, type NoticeDeps} from "./training-center-notifications";
import {dayLabel, enrollmentNoticeKind, sessionAudience, sessionNotice, studentPushUid} from "./training-center-notifications-model";

const NOW = new Date("2026-10-22T15:00:00Z"); // 12:00 em São Paulo
const C = "trainingCenters/c1";
const base = {classId: "k1", className: "BT Iniciante A", date: "2026-10-23", startTime: "19:00", status: "scheduled", changed: false,
  coachUid: "coachA", coachName: "Thiago", courtId: "q1", courtName: "Quadra 1", makeupStudentIds: []};

function deps(sent: {userId: string; title: string; type: string}[], emails: Record<string, string> = {}): NoticeDeps {
  return {
    now: () => NOW,
    notify: async (i) => void sent.push({userId: i.userId, title: i.title, type: i.type}),
    uidByEmail: async (e) => emails[e] ?? null,
  };
}

function seed() {
  const fake = new FakeFirestore();
  fake.seedDoc(C, {name: "CT Praia", timezone: "America/Sao_Paulo"});
  fake.seedDoc(`${C}/classes/k1`, {rosterStudentIds: ["s1", "s2", "s3"]});
  fake.seedDoc(`${C}/students/s1`, {uid: "u1", notifyClasses: true});
  fake.seedDoc(`${C}/students/s2`, {uid: "u2", notifyClasses: false});
  fake.seedDoc(`${C}/students/s3`, {uid: null});
  fake.seedDoc(`${C}/students/s4`, {uid: "u4"});
  return fake;
}

describe("modelo dos avisos", () => {
  it("dia por extenso curto", () => {
    assert.equal(dayLabel("2026-10-22"), "qui 22 out");
  });

  it("cancelada, reaberta e alterada só nesta data; aula passada não avisa", () => {
    assert.equal(sessionNotice(base, {...base, status: "cancelled", changeReason: "chuva"}, "2026-10-22")?.kind, "cancelled");
    assert.match(sessionNotice(base, {...base, status: "cancelled", changeReason: "chuva"}, "2026-10-22")!.body, /Motivo: chuva/);
    assert.equal(sessionNotice({...base, status: "cancelled"}, base, "2026-10-22")?.kind, "restored");
    const moved = sessionNotice(base, {...base, changed: true, startTime: "20:00", coachUid: "coachB", coachName: "Ju"}, "2026-10-22");
    assert.equal(moved?.kind, "changed");
    assert.equal(moved?.newCoachUid, "coachB");
    assert.match(moved!.body, /novo horário 20:00 · professor Ju/);
    assert.equal(sessionNotice(base, {...base, status: "cancelled"}, "2026-10-24"), null);
  });

  it("mudança de série (sem `changed`) e chamada não avisam", () => {
    assert.equal(sessionNotice(base, {...base, startTime: "20:00"}, "2026-10-22"), null);
    assert.equal(sessionNotice(base, {...base, status: "done", attendance: {s1: "present"}}, "2026-10-22"), null);
  });

  it("público: turma + encaixados sem repetir; só com conta e avisos ligados", () => {
    assert.deepEqual(sessionAudience({rosterStudentIds: ["a", "b"]}, {makeupStudentIds: ["b", "c"]}), ["a", "b", "c"]);
    assert.equal(studentPushUid({uid: "u", notifyClasses: false}), null);
    assert.equal(studentPushUid({uid: "u"}), "u");
  });

  it("matrícula: oferta manual e confirmação", () => {
    assert.equal(enrollmentNoticeKind({status: "waitlisted"}, {status: "pending", offeredBy: "manual"}), "offered");
    assert.equal(enrollmentNoticeKind({status: "waitlisted"}, {status: "pending", offeredBy: "auto"}), null);
    assert.equal(enrollmentNoticeKind({status: "pending"}, {status: "active"}), "confirmed");
    assert.equal(enrollmentNoticeKind(undefined, {status: "active"}), null);
  });
});

describe("gatilhos", () => {
  it("aula cancelada avisa alunos com conta e avisos ligados, uma vez só", async () => {
    const fake = seed();
    const db = fake as unknown as Firestore;
    const sent: {userId: string; title: string; type: string}[] = [];
    const after = {...base, status: "cancelled", makeupStudentIds: ["s4"]};
    assert.equal(await handleSessionNotice(db, deps(sent), "c1", "k1_2026-10-23", "ev1", base, after), 2);
    assert.deepEqual(sent.map((x) => x.userId).sort(), ["u1", "u4"]);
    // mesmo evento entregue de novo: não repete o push
    assert.equal(await handleSessionNotice(db, deps(sent), "c1", "k1_2026-10-23", "ev1", base, after), 0);
    assert.equal(sent.length, 2);
  });

  it("troca de professor avisa também o professor novo", async () => {
    const fake = seed();
    const sent: {userId: string; title: string; type: string}[] = [];
    await handleSessionNotice(fake as unknown as Firestore, deps(sent), "c1", "x", "ev2", base, {...base, changed: true, coachUid: "coachB", coachName: "Ju"});
    assert.ok(sent.some((x) => x.userId === "coachB" && /Você assumiu/.test(x.title)));
  });

  it("convite: avisa a conta do e-mail se ela existir", async () => {
    const fake = seed();
    const db = fake as unknown as Firestore;
    const sent: {userId: string; title: string; type: string}[] = [];
    const invite = {email: "Paula@x.com", role: "coach", status: "pending", centerName: "CT Praia", invitedByName: "Renata"};
    assert.equal(await handleInviteNotice(db, deps(sent, {"paula@x.com": "uPaula"}), "c1", "i1", "ev3", invite), 1);
    assert.equal(sent[0]!.userId, "uPaula");
    assert.equal(await handleInviteNotice(db, deps(sent, {}), "c1", "i2", "ev4", {...invite, email: "nova@x.com"}), 0);
  });

  it("matrícula: oferta manual e confirmação avisam o aluno com conta", async () => {
    const fake = seed();
    const db = fake as unknown as Firestore;
    const sent: {userId: string; title: string; type: string}[] = [];
    const offered = {studentId: "s1", className: "BT Iniciante A", status: "pending", offeredBy: "manual",
      contract: {priceCents: 32000}, holdUntil: Timestamp.fromMillis(NOW.getTime() + 24 * 3600_000)};
    assert.equal(await handleEnrollmentNotice(db, deps(sent), "c1", "e1", "ev5", {status: "waitlisted"}, offered), 1);
    assert.match(sent[0]!.title, /Abriu vaga/);
    assert.equal(await handleEnrollmentNotice(db, deps(sent), "c1", "e1", "ev6", {status: "pending"}, {...offered, status: "active"}), 1);
    assert.match(sent[1]!.title, /Matrícula confirmada/);
    // aluno sem conta: nada
    assert.equal(await handleEnrollmentNotice(db, deps(sent), "c1", "e3", "ev7", {status: "pending"}, {studentId: "s3", status: "active"}), 0);
  });
});
