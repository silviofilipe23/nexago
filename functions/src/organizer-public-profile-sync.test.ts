import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  countOrganizerAthletes,
  recomputeOrganizerStats,
  syncOrganizerIdentity,
  syncOrganizerVerified,
} from "./organizer-public-profile-sync";

const NOW = Date.UTC(2026, 9, 2, 15, 0, 0);
const PROJECT = "proj";
const PROFILE = "organizerPublicProfiles/org-1";

function asDb(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

const organizerUser = {
  roles: ["organizer"],
  displayName: "Resp",
  organizerProfile: {orgName: "Liga A", city: "Goiânia", state: "GO"},
};

describe("syncOrganizerIdentity", () => {
  it("cria o doc do organizador com selo lido de organizers/{uid}", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("organizers/org-1", {document: "x"});
    await syncOrganizerIdentity(asDb(fake), "org-1", null, organizerUser, NOW);
    const doc = fake.store.get(PROFILE);
    assert.equal(doc?.name, "Liga A");
    assert.equal(doc?.verified, true);
    assert.equal(doc?.listed, false);
    assert.equal(doc?.isOrganizer, true);
    assert.equal(doc?.uid, "org-1");
  });

  it("não cria doc para quem nunca foi organizador", async () => {
    const fake = new FakeFirestore();
    await syncOrganizerIdentity(asDb(fake), "u-1", null, {roles: ["athlete"], fullName: "Atleta"}, NOW);
    assert.equal(fake.store.has("organizerPublicProfiles/u-1"), false);
  });

  it("escrita que não muda a identidade não grava nada", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(PROFILE, {uid: "org-1", name: "Antigo"});
    await syncOrganizerIdentity(asDb(fake), "org-1", {...organizerUser, lastActiveAt: 1}, {...organizerUser, lastActiveAt: 2}, NOW);
    assert.equal(fake.store.get(PROFILE)?.name, "Antigo");
  });

  it("perder o papel tira da lista e preserva números", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(PROFILE, {uid: "org-1", name: "Liga A", isOrganizer: true, listed: true, verified: true, stats: {listedEvents: 2}});
    await syncOrganizerIdentity(asDb(fake), "org-1", organizerUser, {...organizerUser, roles: ["athlete"]}, NOW);
    const doc = fake.store.get(PROFILE);
    assert.equal(doc?.isOrganizer, false);
    assert.equal(doc?.listed, false);
    assert.equal(doc?.verified, true);
    assert.deepEqual(doc?.stats, {listedEvents: 2});
  });

  it("listed fica true quando já há eventos listados", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(PROFILE, {uid: "org-1", stats: {listedEvents: 1}});
    await syncOrganizerIdentity(asDb(fake), "org-1", null, organizerUser, NOW);
    assert.equal(fake.store.get(PROFILE)?.listed, true);
  });

  it("doc criado antes pelos números ainda ganha o selo de organizers/{uid}", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("organizers/org-1", {document: "x"});
    await recomputeOrganizerStats(asDb(fake), "org-1", {recountAthletes: false, nowMs: NOW, projectId: PROJECT});
    await syncOrganizerIdentity(asDb(fake), "org-1", null, organizerUser, NOW);
    assert.equal(fake.store.get(PROFILE)?.verified, true);
  });

  it("selo já gravado não é relido de organizers/{uid}", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("organizers/org-1", {document: "x"});
    fake.seedDoc(PROFILE, {uid: "org-1", verified: false});
    await syncOrganizerIdentity(asDb(fake), "org-1", null, organizerUser, NOW);
    assert.equal(fake.store.get(PROFILE)?.verified, false);
  });

  it("usuário apagado apaga o doc público", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(PROFILE, {uid: "org-1"});
    await syncOrganizerIdentity(asDb(fake), "org-1", organizerUser, null, NOW);
    assert.equal(fake.store.has(PROFILE), false);
  });
});

describe("syncOrganizerVerified", () => {
  it("atualiza só doc existente", async () => {
    const fake = new FakeFirestore();
    await syncOrganizerVerified(asDb(fake), "org-1", true);
    assert.equal(fake.store.has(PROFILE), false);
    fake.seedDoc(PROFILE, {uid: "org-1", verified: false});
    await syncOrganizerVerified(asDb(fake), "org-1", true);
    assert.equal(fake.store.get(PROFILE)?.verified, true);
  });
});

function seedTournament(fake: FakeFirestore, id: string, data: Record<string, unknown>) {
  fake.seedDoc(`tournaments/${id}`, {managerId: "org-1", visibility: "publicListing", ...data});
}

function seedInscription(fake: FakeFirestore, id: string, data: Record<string, unknown>) {
  fake.seedDoc(`artifacts/${PROJECT}/public/data/inscriptions/${id}`, data);
}

describe("countOrganizerAthletes", () => {
  it("conta atletas distintos de inscrições confirmadas, sem o organizador", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(`artifacts/${PROJECT}/public/data/teams/team-1`, {player1Id: "a1", player2Id: "a2"});
    fake.seedDoc(`artifacts/${PROJECT}/public/data/teams/team-2`, {player1Id: "a2", player2Id: "org-1"});
    fake.seedDoc(`artifacts/${PROJECT}/public/data/teams/team-3`, {player1Id: "a9", player2Id: "a8"});
    seedInscription(fake, "i1", {tournamentId: "t1", teamId: "team-1", isPaid: true});
    seedInscription(fake, "i2", {tournamentId: "t2", teamId: "team-2", isPaid: true});
    seedInscription(fake, "i3", {tournamentId: "t2", teamId: "team-3", isPaid: true, waitlist: true});
    seedInscription(fake, "i4", {tournamentId: "t3", teamId: "team-3", isPaid: true});
    const count = await countOrganizerAthletes(asDb(fake), "org-1", ["t1", "t2"], PROJECT);
    assert.equal(count, 2); // a1, a2 — a9/a8 estavam na fila; t3 não foi pedido
  });
});

describe("recomputeOrganizerStats", () => {
  it("grava stats e listed; sem recontagem preserva atletas", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(PROFILE, {uid: "org-1", isOrganizer: true, stats: {athletes: 7}});
    seedTournament(fake, "t1", {listingStatus: "open", sport: "padel", startAt: Timestamp.fromMillis(NOW)});
    seedTournament(fake, "t-other", {managerId: "org-2", listingStatus: "open"});
    const stats = await recomputeOrganizerStats(asDb(fake), "org-1", {recountAthletes: false, nowMs: NOW, projectId: PROJECT});
    assert.equal(stats.listedEvents, 1);
    assert.equal(stats.athletes, 7);
    const doc = fake.store.get(PROFILE);
    assert.equal(doc?.listed, true);
    assert.equal((doc?.stats as {openEvents: number}).openEvents, 1);
  });

  it("com recontagem conta atletas dos eventos realizados", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(PROFILE, {uid: "org-1", isOrganizer: true});
    seedTournament(fake, "t1", {listingStatus: "completed"});
    fake.seedDoc(`artifacts/${PROJECT}/public/data/teams/team-1`, {player1Id: "a1", player2Id: "a2"});
    seedInscription(fake, "i1", {tournamentId: "t1", teamId: "team-1", isPaid: true});
    const stats = await recomputeOrganizerStats(asDb(fake), "org-1", {recountAthletes: true, nowMs: NOW, projectId: PROJECT});
    assert.equal(stats.athletes, 2);
    assert.equal(stats.eventsCompleted, 1);
  });

  it("doc ausente: cria com listed false (identidade ainda não sincronizada)", async () => {
    const fake = new FakeFirestore();
    seedTournament(fake, "t1", {listingStatus: "open"});
    await recomputeOrganizerStats(asDb(fake), "org-1", {recountAthletes: false, nowMs: NOW, projectId: PROJECT});
    assert.equal(fake.store.get(PROFILE)?.listed, false);
  });
});
