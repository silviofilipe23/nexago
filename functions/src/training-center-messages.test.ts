import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {centerChatAllowed, staffSeesStudent} from "./training-center-chat-model";
import {listCenterContactsCore, openTrainingCenterConversationCore} from "./training-center-messages";
import {sendConversationMessageCore} from "./professor-messages";

const C = "trainingCenters/c1";

function seed() {
  const fake = new FakeFirestore();
  fake.seedDoc(C, {name: "CT Maré Alta"});
  fake.seedDoc(`${C}/centerMembers/owner`, {uid: "owner", role: "center_owner", status: "active", displayName: "Renata"});
  fake.seedDoc(`${C}/centerMembers/tm`, {uid: "tm", role: "coach", status: "active", extraPerms: [], displayName: "Thiago"});
  fake.seedDoc(`${C}/centerMembers/old`, {uid: "old", role: "receptionist", status: "revoked"});
  fake.seedDoc(`${C}/students/s1`, {name: "Lucas Prado", uid: "lucas", status: "active", coachUids: ["tm"]});
  fake.seedDoc(`${C}/students/s2`, {name: "Elisa", uid: "elisa", status: "active", coachUids: []});
  fake.seedDoc(`${C}/students/minor`, {name: "Lara", uid: "lara", status: "active", isMinor: true, coachUids: ["tm"]});
  fake.seedDoc(`${C}/students/noacc`, {name: "Caio", uid: "", status: "active", coachUids: ["tm"]});
  fake.seedDoc(`${C}/centerMembers/recep`, {uid: "recep", role: "receptionist", status: "active", displayName: "Camila"});
  fake.seedDoc(`${C}/centerMembers/rui`, {uid: "rui", role: "coach", status: "active", extraPerms: [], displayName: "Rui"});
  fake.seedDoc("users/lucas", {nickname: "Lucas"});
  return fake;
}

const db = (f: FakeFirestore) => f as unknown as Firestore;

async function rejects(p: Promise<unknown>, code: string) {
  await assert.rejects(p, (e: {code?: string}) => e.code === code);
}

describe("chat do Centro de treinamento", () => {
  it("régua: gestão/recepção veem todos, professor só os dele", () => {
    const student = {coachUids: ["tm"]};
    assert.equal(staffSeesStudent({role: "center_admin", status: "active"}, "x", student), true);
    assert.equal(staffSeesStudent({role: "receptionist", status: "active"}, "x", student), true);
    assert.equal(staffSeesStudent({role: "coach", status: "active"}, "tm", student), true);
    assert.equal(staffSeesStudent({role: "coach", status: "active"}, "rui", student), false);
    assert.equal(staffSeesStudent({role: "coach", status: "active", extraPerms: ["view_finance"]}, "rui", student), true);
    assert.equal(staffSeesStudent({role: "center_owner", status: "revoked"}, "x", student), false);
  });

  it("professor abre a conversa com aluno dele (equipe ↔ conta do aluno)", async () => {
    const fake = seed();
    const r = await openTrainingCenterConversationCore(db(fake), "tm", {centerId: "c1", studentId: "s1"});
    assert.equal(r.conversationId, "t_c1_tm_lucas");
    const c = fake.store.get("conversations/t_c1_tm_lucas")!;
    assert.equal(c["kind"], "center");
    assert.equal(c["professorUid"], "tm");
    assert.equal(c["athleteUid"], "lucas");
    assert.equal(c["studentId"], "s1");
    assert.equal(c["title"], "CT Maré Alta");
    assert.deepEqual(c["memberIds"], ["tm", "lucas"]);
    assert.deepEqual(c["memberNames"], {tm: "Thiago", lucas: "Lucas Prado"});
  });

  it("recusa: aluno de outro professor, menor, sem conta, vínculo revogado", async () => {
    const fake = seed();
    await rejects(openTrainingCenterConversationCore(db(fake), "tm", {centerId: "c1", studentId: "s2"}), "permission-denied");
    await rejects(openTrainingCenterConversationCore(db(fake), "tm", {centerId: "c1", studentId: "minor"}), "failed-precondition");
    await rejects(openTrainingCenterConversationCore(db(fake), "tm", {centerId: "c1", studentId: "noacc"}), "failed-precondition");
    await rejects(openTrainingCenterConversationCore(db(fake), "old", {centerId: "c1", studentId: "s1"}), "permission-denied");
    await rejects(openTrainingCenterConversationCore(db(fake), "tm", {centerId: "c1/x", studentId: "s1"}), "invalid-argument");
    // A gestão fala com qualquer aluno maior com conta.
    const r = await openTrainingCenterConversationCore(db(fake), "owner", {centerId: "c1", studentId: "s2"});
    assert.equal(r.conversationId, "t_c1_owner_elisa");
  });

  it("revalidação do envio: some do professor ou troca de conta fecha", async () => {
    const fake = seed();
    assert.equal(await centerChatAllowed(db(fake), "c1", "tm", "s1", "lucas"), true);
    assert.equal(await centerChatAllowed(db(fake), "c1", "tm", "s1", "outra-conta"), false);
    fake.seedDoc(`${C}/students/s1`, {name: "Lucas Prado", uid: "lucas", status: "active", coachUids: []});
    assert.equal(await centerChatAllowed(db(fake), "c1", "tm", "s1", "lucas"), false);
    assert.equal(await centerChatAllowed(db(fake), "c1", "owner", "s1", "lucas"), true);
    fake.seedDoc(`${C}/students/s1`, {name: "Lucas Prado", uid: "lucas", status: "inactive"});
    assert.equal(await centerChatAllowed(db(fake), "c1", "owner", "s1", "lucas"), false);
  });

  it("aluno: contatos = professores das turmas dele + canal com o centro", async () => {
    const fake = seed();
    const r = await listCenterContactsCore(db(fake), "lucas", {centerId: "c1"});
    assert.equal(r.centerName, "CT Maré Alta");
    assert.equal(r.desk, true);
    assert.deepEqual(r.professors.map((p) => p.uid), ["tm"]);
    assert.equal(r.professors[0].name, "Thiago");
    // Menor e quem não é aluno ficam de fora.
    await rejects(listCenterContactsCore(db(fake), "lara", {centerId: "c1"}), "permission-denied");
    await rejects(listCenterContactsCore(db(fake), "estranho", {centerId: "c1"}), "permission-denied");
  });

  it("aluno inicia com o professor dele (a mesma conversa da equipe); outro professor não", async () => {
    const fake = seed();
    const r = await openTrainingCenterConversationCore(db(fake), "lucas", {centerId: "c1", staffUid: "tm"});
    assert.equal(r.conversationId, "t_c1_tm_lucas");
    assert.deepEqual(fake.store.get("conversations/t_c1_tm_lucas")!["memberIds"], ["tm", "lucas"]);
    await rejects(openTrainingCenterConversationCore(db(fake), "lucas", {centerId: "c1", staffUid: "rui"}), "permission-denied");
    await rejects(openTrainingCenterConversationCore(db(fake), "lucas", {centerId: "c1", staffUid: "lucas"}), "invalid-argument");
  });

  it("canal com o centro: aluno + recepção e gestão; o professor não entra", async () => {
    const fake = seed();
    const r = await openTrainingCenterConversationCore(db(fake), "lucas", {centerId: "c1", desk: true});
    assert.equal(r.conversationId, "cd_c1_lucas");
    const c = fake.store.get("conversations/cd_c1_lucas")!;
    assert.equal(c["kind"], "center_desk");
    assert.equal(c["professorUid"], "");
    assert.deepEqual([...(c["memberIds"] as string[])].sort(), ["lucas", "owner", "recep"]);
    assert.equal((c["memberNames"] as Record<string, string>)["recep"], "Camila");
  });

  it("canal com o centro: o envio refaz a equipe e avisa quem atende", async () => {
    const fake = seed();
    await openTrainingCenterConversationCore(db(fake), "lucas", {centerId: "c1", desk: true});
    fake.seedDoc(`${C}/centerMembers/recep`, {uid: "recep", role: "receptionist", status: "revoked"});
    const pushes: Array<{userId: string; data: Record<string, string>}> = [];
    await sendConversationMessageCore(db(fake), "lucas", "cd_c1_lucas", "Oi, posso trocar de turma?", {
      now: () => new Date("2026-10-23T15:00:00Z"),
      notify: async (i) => {
        pushes.push({userId: i.userId, data: i.data});
      },
    });
    const c = fake.store.get("conversations/cd_c1_lucas")!;
    assert.deepEqual(c["memberIds"], ["lucas", "owner"]);
    assert.deepEqual(pushes.map((p) => p.userId), ["owner"]);
    assert.equal(pushes[0].data["url"], "/athlete/professor/centros/c1/mensagens/cd_c1_lucas");
    // A recepção revogada não fala mais ali.
    await rejects(sendConversationMessageCore(db(fake), "recep", "cd_c1_lucas", "oi"), "not-found");
  });
});

