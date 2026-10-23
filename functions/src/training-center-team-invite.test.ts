import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {inviteCenterMemberCore, isNexagoAthlete, type TeamInviteDeps} from "./training-center-team-invite";

const C = "trainingCenters/c1";
const db = (f: FakeFirestore) => f as unknown as Firestore;
const emails: Record<string, string> = {ana: "Ana@X.com", bia: "bia@x.com"};
const deps: TeamInviteDeps = {emailOf: async (uid) => emails[uid]?.toLowerCase() ?? null};

function seed() {
  const fake = new FakeFirestore();
  fake.seedDoc(C, {name: "CT Areia Alta", status: "active"});
  fake.seedDoc(`${C}/centerMembers/owner`, {uid: "owner", role: "center_owner", status: "active", displayName: "Dono"});
  fake.seedDoc(`${C}/centerMembers/adm`, {uid: "adm", role: "center_admin", status: "active", displayName: "Adm"});
  fake.seedDoc(`${C}/centerMembers/coach`, {uid: "coach", role: "coach", status: "active"});
  fake.seedDoc("public_profiles/ana", {fullName: "Ana Souza", nickname: "Aninha", hasAthleteRole: true});
  fake.seedDoc("public_profiles/bia", {fullName: "Bia Lima", roles: ["athlete"]});
  fake.seedDoc("public_profiles/org", {fullName: "Org", roles: ["organizer"]});
  return fake;
}

const invites = (f: FakeFirestore) =>
  [...f.store.entries()].filter(([k]) => k.startsWith(`${C}/centerInvites/`)).map(([, v]) => v as Record<string, unknown>);

describe("convite para a equipe do centro (atleta NexaGO)", () => {
  it("reconhece atleta pela flag ou pelos papéis", () => {
    assert.equal(isNexagoAthlete({hasAthleteRole: true}), true);
    assert.equal(isNexagoAthlete({roles: ["athlete"]}), true);
    assert.equal(isNexagoAthlete({roles: ["organizer"]}), false);
    assert.equal(isNexagoAthlete(undefined), false);
  });

  it("grava o convite com o e-mail da conta, no formato do portal, e a auditoria", async () => {
    const fake = seed();
    const r = await inviteCenterMemberCore(db(fake), deps, "owner", {
      centerId: "c1", uid: "ana", role: "coach", programIds: ["p1", "p1", 3], classIds: ["k1"],
    });
    assert.equal(r.displayName, "Aninha");
    const [inv] = invites(fake);
    assert.equal(inv!["email"], "ana@x.com");
    assert.equal(inv!["invitedUid"], "ana");
    assert.equal(inv!["status"], "pending");
    assert.equal(inv!["centerName"], "CT Areia Alta");
    assert.deepEqual(inv!["programIds"], ["p1"]);
    assert.deepEqual(inv!["classIds"], ["k1"]);
    assert.equal(inv!["invitedByUid"], "owner");
    const audit = [...fake.store.entries()].find(([k]) => k.startsWith(`${C}/auditLogs/`))?.[1] as Record<string, unknown>;
    assert.equal(audit["action"], "member.invited");
    assert.equal(audit["entityId"], r.inviteId);
  });

  it("recepção/admin não levam modalidades nem turmas", async () => {
    const fake = seed();
    await inviteCenterMemberCore(db(fake), deps, "owner", {centerId: "c1", uid: "bia", role: "receptionist", programIds: ["p1"]});
    assert.deepEqual(invites(fake)[0]!["programIds"], []);
  });

  it("recusa quem não é atleta NexaGO, quem já é da equipe e convite repetido", async () => {
    const fake = seed();
    await assert.rejects(inviteCenterMemberCore(db(fake), deps, "owner", {centerId: "c1", uid: "org", role: "coach"}), /cadastro de atleta/);
    await assert.rejects(inviteCenterMemberCore(db(fake), deps, "owner", {centerId: "c1", uid: "nobody", role: "coach"}), /cadastro de atleta/);
    fake.seedDoc("public_profiles/coach", {fullName: "Prof", hasAthleteRole: true});
    await assert.rejects(inviteCenterMemberCore(db(fake), deps, "owner", {centerId: "c1", uid: "coach", role: "coach"}), /já faz parte/);
    await inviteCenterMemberCore(db(fake), deps, "owner", {centerId: "c1", uid: "ana", role: "coach"});
    await assert.rejects(inviteCenterMemberCore(db(fake), deps, "owner", {centerId: "c1", uid: "ana", role: "coach"}), /pendente/);
  });

  it("só owner/admin convida; admin não convida admin", async () => {
    const fake = seed();
    await assert.rejects(inviteCenterMemberCore(db(fake), deps, "coach", {centerId: "c1", uid: "ana", role: "coach"}), /owner ou admin/);
    await assert.rejects(inviteCenterMemberCore(db(fake), deps, "adm", {centerId: "c1", uid: "ana", role: "center_admin"}), /Só o owner/);
    await inviteCenterMemberCore(db(fake), deps, "adm", {centerId: "c1", uid: "ana", role: "coach"});
    await assert.rejects(inviteCenterMemberCore(db(fake), deps, undefined, {centerId: "c1", uid: "ana", role: "coach"}), /Entre de novo/);
  });

  it("conta sem e-mail não recebe convite", async () => {
    const fake = seed();
    fake.seedDoc("public_profiles/sem", {fullName: "Sem Email", hasAthleteRole: true});
    await assert.rejects(inviteCenterMemberCore(db(fake), deps, "owner", {centerId: "c1", uid: "sem", role: "coach"}), /não tem e-mail/);
  });
});
