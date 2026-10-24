import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {arenaStudentChatAllowed, isArenaClassStudent, staffSeesArenaStudents} from "./arena-class-chat-model";
import {openArenaStudentConversationCore} from "./arena-class-messages";
import {sendConversationMessageCore} from "./professor-messages";

const A = "arenas/a1";
const NOW = new Date("2026-10-20T15:00:00Z");
const PRO = {name: "Arena Sol", managerUserId: "owner", planTier: "pro", planStatus: "active"};

function seed() {
  const fake = new FakeFirestore();
  fake.seedDoc(A, PRO);
  fake.seedDoc(`${A}/staff/rec`, {status: "active", role: "recepcao"});
  fake.seedDoc(`${A}/staff/fin`, {status: "active", role: "financeiro"});
  fake.seedDoc(`${A}/staff/old`, {status: "revoked", role: "recepcao"});
  // Lucas: turma ativa. Bia: só mensalidade em aberto (cancelou e deve). Rui: saiu de tudo.
  fake.seedDoc("arenaClasses/t1/classStudents/lucas", {arenaId: "a1", classId: "t1", athleteId: "lucas", status: "active"});
  fake.seedDoc("arenaClassEnrollments/e2", {arenaId: "a1", athleteId: "bia", status: "canceled"});
  fake.seedDoc("arenaClassCharges/c2", {arenaId: "a1", athleteId: "bia", status: "open"});
  fake.seedDoc("arenaClasses/t1/classStudents/rui", {arenaId: "a1", classId: "t1", athleteId: "rui", status: "removed"});
  fake.seedDoc("arenaClassCharges/c3", {arenaId: "a1", athleteId: "rui", status: "paid"});
  // Aluno de OUTRA arena.
  fake.seedDoc("arenaClasses/t9/classStudents/zeca", {arenaId: "a9", classId: "t9", athleteId: "zeca", status: "active"});
  fake.seedDoc("users/lucas", {nickname: "Lucas"});
  fake.seedDoc("users/rec", {fullName: "Carla Recepção"});
  return fake;
}

const db = (f: FakeFirestore) => f as unknown as Firestore;

async function rejects(p: Promise<unknown>, code: string) {
  await assert.rejects(p, (e: {code?: string}) => e.code === code);
}

describe("chat das Aulas da arena", () => {
  it("régua da gestão: dono, recepção (agenda) e financeiro veem; revogado e plano vencido, não", () => {
    const t = NOW.getTime();
    assert.equal(staffSeesArenaStudents(PRO, "owner", undefined, t), true);
    assert.equal(staffSeesArenaStudents(PRO, "rec", {status: "active", role: "recepcao"}, t), true);
    assert.equal(staffSeesArenaStudents(PRO, "fin", {status: "active", role: "financeiro"}, t), true);
    assert.equal(staffSeesArenaStudents(PRO, "old", {status: "revoked", role: "recepcao"}, t), false);
    assert.equal(staffSeesArenaStudents({...PRO, planStatus: "none"}, "rec", {status: "active", role: "recepcao"}, t), false);
    assert.equal(staffSeesArenaStudents(PRO, "x", undefined, t), false);
  });

  it("aluno da arena: turma ativa ou mensalidade em aberto; não ex-aluno nem de outra arena", async () => {
    const fake = seed();
    assert.equal(await isArenaClassStudent(db(fake), "a1", "lucas"), true);
    assert.equal(await isArenaClassStudent(db(fake), "a1", "bia"), true);
    assert.equal(await isArenaClassStudent(db(fake), "a1", "rui"), false);
    assert.equal(await isArenaClassStudent(db(fake), "a1", "zeca"), false);
  });

  it("recepção abre a conversa com o aluno (gestão ↔ conta do aluno)", async () => {
    const fake = seed();
    const r = await openArenaStudentConversationCore(db(fake), "rec", {arenaId: "a1", athleteId: "lucas"}, NOW);
    assert.equal(r.conversationId, "s_a1_rec_lucas");
    const c = fake.store.get("conversations/s_a1_rec_lucas")!;
    assert.equal(c["kind"], "arena_student");
    assert.equal(c["professorUid"], "rec");
    assert.equal(c["athleteUid"], "lucas");
    assert.equal(c["arenaId"], "a1");
    assert.equal(c["title"], "Arena Sol");
    assert.deepEqual(c["memberIds"], ["rec", "lucas"]);
    assert.deepEqual(c["memberNames"], {rec: "Carla Recepção", lucas: "Lucas"});
  });

  it("recusa: sem conta, ex-aluno, outra arena, acesso revogado, ids com barra", async () => {
    const fake = seed();
    await rejects(openArenaStudentConversationCore(db(fake), "rec", {arenaId: "a1", athleteId: ""}, NOW), "failed-precondition");
    await rejects(openArenaStudentConversationCore(db(fake), "rec", {arenaId: "a1", athleteId: "rui"}, NOW), "failed-precondition");
    await rejects(openArenaStudentConversationCore(db(fake), "rec", {arenaId: "a1", athleteId: "zeca"}, NOW), "failed-precondition");
    await rejects(openArenaStudentConversationCore(db(fake), "old", {arenaId: "a1", athleteId: "lucas"}, NOW), "permission-denied");
    await rejects(openArenaStudentConversationCore(db(fake), "rec", {arenaId: "a1/x", athleteId: "lucas"}, NOW), "invalid-argument");
    await rejects(openArenaStudentConversationCore(db(fake), "rec", {arenaId: "nope", athleteId: "lucas"}, NOW), "not-found");
    // O financeiro também cobra quem só deve.
    const r = await openArenaStudentConversationCore(db(fake), "fin", {arenaId: "a1", athleteId: "bia"}, NOW);
    assert.equal(r.conversationId, "s_a1_fin_bia");
  });

  it("envio: a cobrança chega ao aluno; a resposta abre nas Aulas da arena para a gestão", async () => {
    const fake = seed();
    const {conversationId} = await openArenaStudentConversationCore(db(fake), "rec", {arenaId: "a1", athleteId: "lucas"}, NOW);
    const pushes: Array<{userId: string; title: string; data: Record<string, string>}> = [];
    const deps = {now: () => NOW, notify: async (i: {userId: string; title: string; data: Record<string, string>}) => {
      pushes.push(i);
    }};
    await sendConversationMessageCore(db(fake), "rec", conversationId, "Mensalidade de outubro: https://pay/x", deps);
    await sendConversationMessageCore(db(fake), "lucas", conversationId, "Pago!", {...deps, now: () => new Date(NOW.getTime() + 5000)});
    assert.deepEqual(pushes.map((p) => [p.userId, p.title, p.data["url"], p.data["webUrl"]]), [
      ["lucas", "Arena Sol · Carla Recepção", `/mensagens/${conversationId}`, undefined],
      ["rec", "Arena Sol · Lucas", `/arena/classes/messages/${conversationId}`, `/painel/aulas/mensagens/${conversationId}`],
    ]);
  });

  it("revalidação do envio: aluno que saiu ou pessoa sem acesso fecha a conversa", async () => {
    const fake = seed();
    assert.equal(await arenaStudentChatAllowed(db(fake), "a1", "rec", "lucas", NOW.getTime()), true);
    assert.equal(await arenaStudentChatAllowed(db(fake), "a1", "lucas", "lucas", NOW.getTime()), false);
    const {conversationId} = await openArenaStudentConversationCore(db(fake), "rec", {arenaId: "a1", athleteId: "lucas"}, NOW);
    fake.seedDoc("arenaClasses/t1/classStudents/lucas", {arenaId: "a1", classId: "t1", athleteId: "lucas", status: "removed"});
    await rejects(sendConversationMessageCore(db(fake), "rec", conversationId, "Oi", {now: () => NOW, notify: async () => {}}), "failed-precondition");
    const c = fake.store.get(`conversations/${conversationId}`)!;
    assert.equal(c["closed"], true);
    assert.deepEqual(c["memberIds"], ["rec"]);
  });
});
