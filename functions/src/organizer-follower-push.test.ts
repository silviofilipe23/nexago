import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import type {DeliverNotificationInput} from "./notification-delivery";
import {
  handleTournamentOpenedForFollowers,
  organizerFollowerPushContent,
  organizerFollowerPushDecision,
  sendDueOrganizerFollowerPushes,
} from "./organizer-follower-push";

const NOW = Date.UTC(2026, 9, 2, 15, 0, 0);
const HOUR = 3_600_000;
const LOCK = "organizerFollowerPushes/t1";

function asDb(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

const open = {managerId: "org-1", listingStatus: "open", visibility: "publicListing", name: "Copa Verão",
  startAt: Timestamp.fromMillis(Date.UTC(2026, 7, 4, 12)), locationName: "Arena ErreJota"};

function setup() {
  const fake = new FakeFirestore();
  fake.seedDoc("organizerPublicProfiles/org-1", {uid: "org-1", name: "Liga A"});
  fake.seedDoc("organizerPublicProfiles/org-1/followers/a1", {userId: "a1"});
  fake.seedDoc("organizerPublicProfiles/org-1/followers/a2", {userId: "a2"});
  fake.seedDoc("organizerPublicProfiles/org-1/followers/org-1", {userId: "org-1"});
  const sent: DeliverNotificationInput[] = [];
  const notify = async (input: DeliverNotificationInput) => {
    sent.push(input);
  };
  return {fake, sent, notify};
}

describe("organizerFollowerPushDecision", () => {
  it("só na transição para aberto e listado", () => {
    assert.deepEqual(organizerFollowerPushDecision({...open, listingStatus: "draft"}, open, NOW), {action: "send"});
    assert.deepEqual(organizerFollowerPushDecision(null, open, NOW), {action: "send"});
    assert.deepEqual(organizerFollowerPushDecision(open, {...open, name: "x"}, NOW), {action: "none"});
    assert.deepEqual(organizerFollowerPushDecision(null, {...open, visibility: "linkOnly"}, NOW), {action: "none"});
    assert.deepEqual(
      organizerFollowerPushDecision({...open, visibility: "linkOnly"}, open, NOW),
      {action: "send"},
    );
  });

  it("abertura futura agenda", () => {
    const opensAt = Timestamp.fromMillis(NOW + 2 * HOUR);
    assert.deepEqual(
      organizerFollowerPushDecision(null, {...open, registrationOpensAt: opensAt}, NOW),
      {action: "schedule", sendAtMs: NOW + 2 * HOUR},
    );
  });
});

describe("organizerFollowerPushContent", () => {
  it("título com a marca e corpo com nome, dia e local", () => {
    const content = organizerFollowerPushContent("Liga A", "t1", open);
    assert.equal(content.title, "Liga A abriu inscrições");
    assert.equal(content.body, "Copa Verão · 04/08 · Arena ErreJota");
    assert.equal(content.type, "organizer_event_registration_open");
    assert.equal(content.requireInteraction, false);
    assert.deepEqual(content.data, {url: "/torneios/t1", webUrl: "/torneios/t1", tournamentId: "t1", organizerId: "org-1"});
  });

  it("partes vazias somem", () => {
    const content = organizerFollowerPushContent("Liga A", "t1", {managerId: "org-1", name: "Copa"});
    assert.equal(content.body, "Copa");
  });
});

describe("handleTournamentOpenedForFollowers", () => {
  it("envia aos seguidores (menos o organizador) e grava a trava", async () => {
    const {fake, sent, notify} = setup();
    await handleTournamentOpenedForFollowers(asDb(fake), "t1", {...open, listingStatus: "draft"}, open, NOW, notify);
    assert.deepEqual(sent.map((s) => s.userId).sort(), ["a1", "a2"]);
    assert.equal(fake.store.get(LOCK)?.status, "sent");
    assert.equal(fake.store.get(LOCK)?.recipients, 2);
  });

  it("reabrir não reenvia", async () => {
    const {fake, sent, notify} = setup();
    await handleTournamentOpenedForFollowers(asDb(fake), "t1", null, open, NOW, notify);
    await handleTournamentOpenedForFollowers(asDb(fake), "t1", {...open, listingStatus: "closed"}, open, NOW + HOUR, notify);
    assert.equal(sent.length, 2);
  });

  it("abertura futura só agenda", async () => {
    const {fake, sent, notify} = setup();
    const opensAt = Timestamp.fromMillis(NOW + 2 * HOUR);
    await handleTournamentOpenedForFollowers(asDb(fake), "t1", null, {...open, registrationOpensAt: opensAt}, NOW, notify);
    assert.equal(sent.length, 0);
    assert.equal(fake.store.get(LOCK)?.status, "scheduled");
    assert.equal((fake.store.get(LOCK)?.sendAt as Timestamp).toMillis(), NOW + 2 * HOUR);
  });
});

describe("trava por liga e reagendamento", () => {
  it("liga publicada com 3 etapas abertas avisa uma vez só", async () => {
    const {fake, sent, notify} = setup();
    for (const id of ["s1", "s2", "s3"]) {
      await handleTournamentOpenedForFollowers(asDb(fake), id, null, {...open, leagueId: "L1", isLeagueStage: true}, NOW, notify);
    }
    assert.equal(sent.length, 2);
    const lock = fake.store.get("organizerFollowerPushes/league_L1_2026-10-02");
    assert.equal(lock?.status, "sent");
    assert.equal(lock?.tournamentId, "s1");
  });

  it("adiantar a abertura puxa o push agendado para agora", async () => {
    const {fake, sent, notify} = setup();
    const later = {...open, registrationOpensAt: Timestamp.fromMillis(NOW + 48 * HOUR)};
    await handleTournamentOpenedForFollowers(asDb(fake), "t1", null, later, NOW, notify);
    await handleTournamentOpenedForFollowers(asDb(fake), "t1", later, {...open, registrationOpensAt: null}, NOW + HOUR, notify);
    assert.equal(sent.length, 0);
    assert.equal((fake.store.get(LOCK)?.sendAt as Timestamp).toMillis(), NOW + HOUR);
    fake.seedDoc("tournaments/t1", {...open, registrationOpensAt: null});
    await sendDueOrganizerFollowerPushes(asDb(fake), NOW + 2 * HOUR, notify);
    assert.equal(sent.length, 2);
  });

  it("despublicar e republicar com data nova move a trava agendada", async () => {
    const {fake, sent, notify} = setup();
    const monday = {...open, registrationOpensAt: Timestamp.fromMillis(NOW + 96 * HOUR)};
    await handleTournamentOpenedForFollowers(asDb(fake), "t1", null, monday, NOW, notify);
    const tomorrow = {...open, registrationOpensAt: Timestamp.fromMillis(NOW + 24 * HOUR)};
    await handleTournamentOpenedForFollowers(asDb(fake), "t1", {...monday, listingStatus: "draft"}, tomorrow, NOW + HOUR, notify);
    assert.equal(sent.length, 0);
    assert.equal((fake.store.get(LOCK)?.sendAt as Timestamp).toMillis(), NOW + 24 * HOUR);
  });

  it("trava já enviada não é reagendada", async () => {
    const {fake, notify} = setup();
    await handleTournamentOpenedForFollowers(asDb(fake), "t1", null, open, NOW, notify);
    await handleTournamentOpenedForFollowers(asDb(fake), "t1", open, {...open, registrationOpensAt: Timestamp.fromMillis(NOW + HOUR)}, NOW, notify);
    assert.equal(fake.store.get(LOCK)?.status, "sent");
  });
});

describe("sendDueOrganizerFollowerPushes", () => {
  function seedScheduled(fake: FakeFirestore, sendAtMs: number) {
    fake.seedDoc(LOCK, {organizerId: "org-1", status: "scheduled", sendAt: Timestamp.fromMillis(sendAtMs)});
  }

  it("envia as vencidas e ignora as futuras", async () => {
    const {fake, sent, notify} = setup();
    seedScheduled(fake, NOW - 1);
    fake.seedDoc("tournaments/t1", open);
    fake.seedDoc("organizerFollowerPushes/t2", {organizerId: "org-1", status: "scheduled", sendAt: Timestamp.fromMillis(NOW + HOUR)});
    const count = await sendDueOrganizerFollowerPushes(asDb(fake), NOW, notify);
    assert.equal(count, 1);
    assert.equal(sent.length, 2);
    assert.equal(fake.store.get(LOCK)?.status, "sent");
    assert.equal(fake.store.get("organizerFollowerPushes/t2")?.status, "scheduled");
  });

  it("torneio que deixou de estar aberto vira skipped", async () => {
    const {fake, sent, notify} = setup();
    seedScheduled(fake, NOW - 1);
    fake.seedDoc("tournaments/t1", {...open, listingStatus: "cancelled"});
    await sendDueOrganizerFollowerPushes(asDb(fake), NOW, notify);
    assert.equal(sent.length, 0);
    assert.equal(fake.store.get(LOCK)?.status, "skipped");
  });

  it("abertura adiada reagenda", async () => {
    const {fake, sent, notify} = setup();
    seedScheduled(fake, NOW - 1);
    fake.seedDoc("tournaments/t1", {...open, registrationOpensAt: Timestamp.fromMillis(NOW + 3 * HOUR)});
    await sendDueOrganizerFollowerPushes(asDb(fake), NOW, notify);
    assert.equal(sent.length, 0);
    assert.equal(fake.store.get(LOCK)?.status, "scheduled");
    assert.equal((fake.store.get(LOCK)?.sendAt as Timestamp).toMillis(), NOW + 3 * HOUR);
  });

  it("trava de liga envia o torneio guardado nela", async () => {
    const {fake, sent, notify} = setup();
    fake.seedDoc("organizerFollowerPushes/league_L1_2026-10-02", {organizerId: "org-1", tournamentId: "s1", status: "scheduled", sendAt: Timestamp.fromMillis(NOW - 1)});
    fake.seedDoc("tournaments/s1", {...open, leagueId: "L1"});
    await sendDueOrganizerFollowerPushes(asDb(fake), NOW, notify);
    assert.equal(sent.length, 2);
    assert.equal(sent[0]?.data.tournamentId, "s1");
  });

  it("um push que falha não derruba os outros", async () => {
    const {fake} = setup();
    seedScheduled(fake, NOW - 1);
    fake.seedDoc("tournaments/t1", open);
    const delivered: string[] = [];
    const notify = async (input: DeliverNotificationInput) => {
      if (input.userId === "a1") throw new Error("boom");
      delivered.push(input.userId);
    };
    await sendDueOrganizerFollowerPushes(asDb(fake), NOW, notify);
    assert.deepEqual(delivered, ["a2"]);
    assert.equal(fake.store.get(LOCK)?.status, "sent");
  });
});
