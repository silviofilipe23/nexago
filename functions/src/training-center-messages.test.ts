import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {centerChatAllowed, staffSeesStudent} from "./training-center-chat-model";
import {openCenterConversationCore} from "./training-center-messages";

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
    const r = await openCenterConversationCore(db(fake), "tm", {centerId: "c1", studentId: "s1"});
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
    await rejects(openCenterConversationCore(db(fake), "tm", {centerId: "c1", studentId: "s2"}), "permission-denied");
    await rejects(openCenterConversationCore(db(fake), "tm", {centerId: "c1", studentId: "minor"}), "failed-precondition");
    await rejects(openCenterConversationCore(db(fake), "tm", {centerId: "c1", studentId: "noacc"}), "failed-precondition");
    await rejects(openCenterConversationCore(db(fake), "old", {centerId: "c1", studentId: "s1"}), "permission-denied");
    await rejects(openCenterConversationCore(db(fake), "tm", {centerId: "c1/x", studentId: "s1"}), "invalid-argument");
    // A gestão fala com qualquer aluno maior com conta.
    const r = await openCenterConversationCore(db(fake), "owner", {centerId: "c1", studentId: "s2"});
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
});
