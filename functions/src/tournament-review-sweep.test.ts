import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import type {DeliverNotificationInput} from "./notification-delivery";
import {DAY_MS, HOUR_MS} from "./tournament-review-constants";
import {runTournamentReviewSweep} from "./tournament-review-sweep";

const PROJECT = "test-project";
const INSCRIPTIONS = `artifacts/${PROJECT}/public/data/inscriptions`;
const TEAMS = `artifacts/${PROJECT}/public/data/teams`;
const NOW = Date.UTC(2026, 9, 5, 13, 0, 0); // 05/10/2026 10:00 em São Paulo
const ts = (ms: number) => Timestamp.fromMillis(ms);
const millis = (value: unknown) => (value as Timestamp).toMillis();

function setup(enabled = true) {
  const fake = new FakeFirestore();
  if (enabled) fake.seedDoc("appConfig/tournamentReviews", {enabled: true});
  const sent: DeliverNotificationInput[] = [];
  const notify = async (input: DeliverNotificationInput) => {
    sent.push(input);
  };
  const run = () => runTournamentReviewSweep(fake as unknown as Firestore, NOW, notify, PROJECT);
  return {fake, sent, run};
}

/** Torneio encerrado ontem: dupla a/b confirmada, dupla org/e confirmada (org é o dono),
 *  dupla c/d na fila de espera. Elegíveis esperados: a, b, e. */
function seedFinishedTournament(fake: FakeFirestore, id = "t1", extra: Record<string, unknown> = {}) {
  fake.seedDoc(`tournaments/${id}`, {
    name: "Copa Areia",
    managerId: "org",
    listingStatus: "completed",
    completedAt: ts(NOW - DAY_MS),
    endAt: ts(NOW - DAY_MS),
    startAt: ts(NOW - 2 * DAY_MS),
    coverUrl: "https://img/capa.jpg",
    ...extra,
  });
  fake.seedDoc(`${TEAMS}/${id}-ab`, {player1Id: "a", player2Id: "b"});
  fake.seedDoc(`${TEAMS}/${id}-org`, {player1Id: "org", player2Id: "e"});
  fake.seedDoc(`${TEAMS}/${id}-cd`, {player1Id: "c", player2Id: "d"});
  fake.seedDoc(`${INSCRIPTIONS}/${id}-i1`, {tournamentId: id, categoryId: "c1", teamId: `${id}-ab`, isPaid: true});
  fake.seedDoc(`${INSCRIPTIONS}/${id}-i2`, {tournamentId: id, categoryId: "c1", teamId: `${id}-org`, isPaid: true});
  fake.seedDoc(`${INSCRIPTIONS}/${id}-i3`, {
    tournamentId: id, categoryId: "c2", teamId: `${id}-cd`, isPaid: true, waitlist: true,
  });
}

function seedOpenSummary(fake: FakeFirestore, id: string, extra: Record<string, unknown>) {
  fake.seedDoc(`tournamentReviewSummaries/${id}`, {
    tournamentId: id,
    organizerId: "org",
    tournamentName: "Copa",
    status: "open",
    eligibleCount: 2,
    count: 0,
    average: null,
    opensAt: ts(NOW - DAY_MS),
    closesAt: ts(NOW + 13 * DAY_MS),
    reminderSentAt: null,
    invitesComplete: true,
    ...extra,
  });
}

const userIds = (sent: DeliverNotificationInput[]) => sent.map((n) => n.userId).sort();

describe("runTournamentReviewSweep — abrir", () => {
  it("flag desligada: não faz nada", async () => {
    const {fake, sent, run} = setup(false);
    seedFinishedTournament(fake);
    assert.deepEqual(await run(), {opened: 0, reminded: 0, closed: 0});
    assert.equal(fake.store.has("tournamentReviewSummaries/t1"), false);
    assert.equal(sent.length, 0);
  });

  it("abre a janela: resumo, convites só dos confirmados e push de pedido", async () => {
    const {fake, sent, run} = setup();
    seedFinishedTournament(fake);
    assert.equal((await run()).opened, 1);

    const summary = fake.store.get("tournamentReviewSummaries/t1")!;
    assert.equal(summary.status, "open");
    assert.equal(summary.eligibleCount, 3);
    assert.equal(summary.count, 0);
    assert.equal(summary.organizerId, "org");
    assert.equal(summary.tournamentName, "Copa Areia");
    assert.equal(millis(summary.tournamentStartAt), NOW - 2 * DAY_MS);
    assert.equal(millis(summary.opensAt), NOW);
    assert.equal(millis(summary.closesAt), NOW + 14 * DAY_MS);
    assert.equal(summary.invitesComplete, true);

    for (const uid of ["a", "b", "e"]) {
      const invite = fake.store.get(`users/${uid}/tournamentReviewInvites/t1`)!;
      assert.equal(invite.status, "pending");
      assert.equal(invite.tournamentName, "Copa Areia");
      assert.equal(invite.coverUrl, "https://img/capa.jpg");
      assert.equal(invite.organizerId, "org");
      assert.equal(millis(invite.closesAt), NOW + 14 * DAY_MS);
    }
    for (const uid of ["org", "c", "d"]) {
      assert.equal(fake.store.has(`users/${uid}/tournamentReviewInvites/t1`), false);
    }
    assert.deepEqual(userIds(sent), ["a", "b", "e"]);
    assert.ok(sent.every((n) => n.type === "tournament_review_request"));
  });

  it("rodar de novo não duplica convite nem push", async () => {
    const {fake, sent, run} = setup();
    seedFinishedTournament(fake);
    await run();
    await run();
    assert.equal(sent.length, 3);
  });

  it("retoma janela que caiu no meio, sem repetir convite nem push", async () => {
    const {fake, sent, run} = setup();
    seedFinishedTournament(fake);
    seedOpenSummary(fake, "t1", {eligibleCount: 3, opensAt: ts(NOW - DAY_MS), invitesComplete: false});
    fake.seedDoc("users/a/tournamentReviewInvites/t1", {tournamentId: "t1", status: "submitted"});

    await run();

    assert.equal(fake.store.get("users/a/tournamentReviewInvites/t1")!.status, "submitted");
    const invite = fake.store.get("users/b/tournamentReviewInvites/t1")!;
    assert.equal(millis(invite.opensAt), NOW - DAY_MS);
    assert.deepEqual(userIds(sent), ["b", "e"]);
    assert.equal(fake.store.get("tournamentReviewSummaries/t1")!.invitesComplete, true);
  });

  it("abre por endAt + 12h quando ninguém lançou a final; com 11h ainda não", async () => {
    const {fake, run} = setup();
    seedFinishedTournament(fake, "t1", {listingStatus: "closed", completedAt: null, endAt: ts(NOW - 13 * HOUR_MS)});
    seedFinishedTournament(fake, "t2", {listingStatus: "closed", completedAt: null, endAt: ts(NOW - 11 * HOUR_MS)});
    await run();
    assert.equal(fake.store.has("tournamentReviewSummaries/t1"), true);
    assert.equal(fake.store.has("tournamentReviewSummaries/t2"), false);
  });

  it("sem confirmados: resumo nasce fechado e ninguém recebe push, nem depois", async () => {
    const {fake, sent, run} = setup();
    fake.seedDoc("tournaments/t1", {
      name: "Vazio", managerId: "org", listingStatus: "completed", completedAt: ts(NOW - DAY_MS),
    });
    fake.seedDoc(`${INSCRIPTIONS}/x`, {tournamentId: "t1", teamId: "tx", isPaid: true, waitlist: true});
    await run();
    const summary = fake.store.get("tournamentReviewSummaries/t1")!;
    assert.equal(summary.status, "closed");
    assert.equal(summary.eligibleCount, 0);
    assert.equal(sent.length, 0);
  });

  it("torneio cancelado não abre", async () => {
    const {fake, run} = setup();
    seedFinishedTournament(fake, "t1", {listingStatus: "cancelled"});
    await run();
    assert.equal(fake.store.has("tournamentReviewSummaries/t1"), false);
  });

  it("staff gestor ativo que jogou não recebe convite", async () => {
    const {fake, run} = setup();
    seedFinishedTournament(fake);
    fake.seedDoc("tournaments/t1/staff/a", {status: "active", role: "manager"});
    await run();
    assert.equal(fake.store.has("users/a/tournamentReviewInvites/t1"), false);
    assert.equal(fake.store.get("tournamentReviewSummaries/t1")!.eligibleCount, 2);
  });

  it("mais de 400 confirmados: todo mundo recebe convite (batch tem teto)", async () => {
    const {fake, sent, run} = setup();
    fake.seedDoc("tournaments/big", {
      name: "Grande", managerId: "org", listingStatus: "completed", completedAt: ts(NOW - DAY_MS),
    });
    for (let i = 0; i < 401; i += 1) {
      fake.seedDoc(`${TEAMS}/big-${i}`, {memberUids: [`p${i}`]});
      fake.seedDoc(`${INSCRIPTIONS}/big-${i}`, {tournamentId: "big", teamId: `big-${i}`, isPaid: true});
    }
    await run();
    assert.equal(fake.store.get("tournamentReviewSummaries/big")!.eligibleCount, 401);
    assert.equal(fake.store.has("users/p400/tournamentReviewInvites/big"), true);
    assert.equal(sent.length, 401);
  });
});

describe("runTournamentReviewSweep — lembrar e fechar", () => {
  it("lembra no 3º dia só quem não avaliou, uma vez", async () => {
    const {fake, sent, run} = setup();
    seedOpenSummary(fake, "t1", {opensAt: ts(NOW - 3 * DAY_MS), closesAt: ts(NOW + 11 * DAY_MS)});
    fake.seedDoc("users/a/tournamentReviewInvites/t1", {tournamentId: "t1", status: "pending"});
    fake.seedDoc("users/b/tournamentReviewInvites/t1", {tournamentId: "t1", status: "submitted"});

    assert.equal((await run()).reminded, 1);
    assert.deepEqual(userIds(sent), ["a"]);
    assert.equal(sent[0].type, "tournament_review_reminder");
    assert.equal(sent[0].body, "A avaliação fecha em 16/10.");
    assert.equal(millis(fake.store.get("tournamentReviewSummaries/t1")!.reminderSentAt), NOW);

    await run();
    assert.equal(sent.length, 1);
  });

  it("fecha no 14º dia: expira pendentes e avisa quem gerencia", async () => {
    const {fake, sent, run} = setup();
    fake.seedDoc("tournaments/t1", {name: "Copa", managerId: "org"});
    fake.seedDoc("tournaments/t1/staff/s1", {status: "active", role: "manager"});
    seedOpenSummary(fake, "t1", {
      opensAt: ts(NOW - 14 * DAY_MS),
      closesAt: ts(NOW),
      reminderSentAt: ts(NOW - 11 * DAY_MS),
      count: 4,
      average: 4.5,
    });
    fake.seedDoc("users/a/tournamentReviewInvites/t1", {tournamentId: "t1", status: "pending"});
    fake.seedDoc("users/b/tournamentReviewInvites/t1", {tournamentId: "t1", status: "submitted"});

    assert.equal((await run()).closed, 1);

    const summary = fake.store.get("tournamentReviewSummaries/t1")!;
    assert.equal(summary.status, "closed");
    assert.equal(millis(summary.closedAt), NOW);
    assert.equal(fake.store.get("users/a/tournamentReviewInvites/t1")!.status, "expired");
    assert.equal(fake.store.get("users/b/tournamentReviewInvites/t1")!.status, "submitted");
    assert.deepEqual(userIds(sent), ["org", "s1"]);
    assert.ok(sent.every((n) => n.type === "tournament_review_closed"));
    assert.equal(sent[0].body, "4,5 ★ com 4 avaliações.");
  });
});
