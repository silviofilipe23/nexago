import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {bookingRosterUids} from "./booking-result";
import {
  MAX_SCORE_KEEPERS,
  SCORE_KEEPER_UNTIL_END_MS,
  linkBookingResultPlayersCore,
} from "./booking-result-keepers";
import {saveBookingResultCore} from "./booking-result-write";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

/** Durante a pelada (20:00–21:30 de 19/10, parede SP). */
const NOW = new Date("2026-10-19T20:30:00-03:00");

function seed(fake: FakeFirestore, booking: DocData = {}): void {
  fake.seedDoc("arenaBookings/bk1", {
    athleteId: "maria",
    arenaId: "a1",
    arenaName: "Arena CFC",
    date: "2026-10-19",
    startTime: "20:00",
    endTime: "21:30",
    status: "confirmed",
    amountReais: 120,
    amountPaidOnlineReais: 120,
    participantUids: ["enzo"],
    participants: [{uid: "enzo", name: "Enzo Lima"}],
    ...booking,
  });
  fake.seedDoc("users/maria", {nickname: "Maria Souza"});
  fake.seedDoc("users/enzo", {fullName: "Enzo Lima"});
  fake.seedDoc("users/zé", {nickname: "Zé", profilePhotoUrl: "https://x/z.jpg"});
  fake.seedDoc("users/lia", {nickname: "Lia"});
  fake.seedDoc("users/fora", {nickname: "Fora"});
}

function booking(fake: FakeFirestore): DocData {
  return fake.store.get("arenaBookings/bk1")!;
}

async function rejects(p: Promise<unknown>, code: string, message?: RegExp): Promise<void> {
  await assert.rejects(p, (err: unknown) => {
    assert.ok(err instanceof HttpsError, String(err));
    assert.equal(err.code, code);
    if (message) assert.match(err.message, message);
    return true;
  });
}

describe("linkBookingResultPlayersCore (liberar quem foi adicionado na tela)", () => {
  it("a dona adiciona o Zé: ele entra na lista, com nome e foto, e é avisado", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    const {result, notices} = await linkBookingResultPlayersCore(
      db(fake), "maria", {bookingId: "bk1", playerIds: ["zé"]}, NOW,
    );
    assert.deepEqual(result, {linked: ["zé"]});
    assert.deepEqual(booking(fake)["scoreKeeperUids"], ["zé"]);
    assert.deepEqual(booking(fake)["scoreKeepers"], [
      {uid: "zé", name: "Zé", avatarUrl: "https://x/z.jpg", addedBy: "maria"},
    ]);
    assert.ok(bookingRosterUids(booking(fake)).includes("zé"));
    assert.deepEqual(notices.map((n) => n.userId), ["zé"]);
    assert.equal(notices[0].type, "pelada_score_keeper");
    assert.equal(notices[0].title, "Maria te colocou na pelada");
    assert.match(notices[0].body, /Arena CFC · 19\/10/);
  });

  it("depois de liberado, o Zé lança do celular dele sem a dona ter enviado nada", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    await linkBookingResultPlayersCore(db(fake), "maria", {bookingId: "bk1", playerIds: ["zé"]}, NOW);
    const {result} = await saveBookingResultCore(db(fake), "zé", {
      bookingId: "bk1",
      teams: [
        {id: 0, players: [{id: "maria"}, {id: "enzo"}]},
        {id: 1, players: [{id: "zé"}, {id: "lia"}]},
      ],
      games: [{teamA: 0, teamB: 1, scoreA: 18, scoreB: 21}],
    }, NOW);
    assert.equal(result.status, "pending");
    assert.equal(fake.store.get("bookingResults/bk1")!["createdBy"], "zé");
  });

  it("quem já foi liberado também libera outro (o celular dele pode ser o que sobrou)", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    await linkBookingResultPlayersCore(db(fake), "maria", {bookingId: "bk1", playerIds: ["zé"]}, NOW);
    await linkBookingResultPlayersCore(db(fake), "zé", {bookingId: "bk1", playerIds: ["lia"]}, NOW);
    await linkBookingResultPlayersCore(db(fake), "enzo", {bookingId: "bk1", playerIds: ["fora"]}, NOW);
    assert.deepEqual(booking(fake)["scoreKeeperUids"], ["zé", "lia", "fora"]);
    assert.equal((booking(fake)["scoreKeepers"] as DocData[])[1]["addedBy"], "zé");
  });

  it("quem já está na lista não é gravado de novo nem avisado", async () => {
    const fake = new FakeFirestore();
    seed(fake, {scoreKeeperUids: ["zé"], scoreKeepers: [{uid: "zé", name: "Zé", addedBy: "maria"}]});
    const {result, notices} = await linkBookingResultPlayersCore(
      db(fake), "maria", {bookingId: "bk1", playerIds: ["maria", "enzo", "zé", "lia", "lia"]}, NOW,
    );
    assert.deepEqual(result, {linked: ["lia"]});
    assert.deepEqual(booking(fake)["scoreKeeperUids"], ["zé", "lia"]);
    assert.deepEqual(notices.map((n) => n.userId), ["lia"]);
  });

  it("só quem está na lista de jogadores libera alguém", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    await rejects(
      linkBookingResultPlayersCore(db(fake), "fora", {bookingId: "bk1", playerIds: ["lia"]}, NOW),
      "permission-denied", /lista de jogadores/,
    );
    assert.equal(booking(fake)["scoreKeeperUids"], undefined);
  });

  it("reserva não garantida, sem liberação ou passado o prazo não libera", async () => {
    const end = new Date("2026-10-19T21:30:00-03:00").getTime();
    for (const [over, now, message] of [
      [{status: "cancelled"}, NOW, /reserva garantida/],
      [{status: "pending_payment"}, NOW, /reserva garantida/],
      [{amountPaidOnlineReais: 0}, NOW, /metade da reserva/],
      [{}, new Date(end + SCORE_KEEPER_UNTIL_END_MS + 60_000), /prazo/],
    ] as const) {
      const fake = new FakeFirestore();
      seed(fake, over);
      await rejects(
        linkBookingResultPlayersCore(db(fake), "maria", {bookingId: "bk1", playerIds: ["zé"]}, now),
        "failed-precondition", message,
      );
    }
  });

  it("antes de começar (\"Quem vai jogar?\") já libera", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    const before = new Date("2026-10-19T18:00:00-03:00");
    const {result} = await linkBookingResultPlayersCore(
      db(fake), "maria", {bookingId: "bk1", playerIds: ["zé"]}, before,
    );
    assert.deepEqual(result, {linked: ["zé"]});
  });

  it("só atleta com conta: id inválido, avulso ou inexistente é recusado; lista vazia também", async () => {
    for (const playerIds of [[], ["guest:1"], ["a/b"], ["ninguem"], "zé"]) {
      const fake = new FakeFirestore();
      seed(fake);
      await rejects(
        linkBookingResultPlayersCore(db(fake), "maria", {bookingId: "bk1", playerIds}, NOW),
        "invalid-argument",
      );
    }
    const fake = new FakeFirestore();
    await rejects(
      linkBookingResultPlayersCore(db(fake), "maria", {bookingId: "nada", playerIds: ["zé"]}, NOW),
      "not-found",
    );
  });

  it("limite de liberados por reserva", async () => {
    const fake = new FakeFirestore();
    const full = Array.from({length: MAX_SCORE_KEEPERS}, (_, i) => `u${i}`);
    seed(fake, {scoreKeeperUids: full, scoreKeepers: full.map((uid) => ({uid, name: uid}))});
    await rejects(
      linkBookingResultPlayersCore(db(fake), "maria", {bookingId: "bk1", playerIds: ["zé"]}, NOW),
      "resource-exhausted",
    );
  });
});
