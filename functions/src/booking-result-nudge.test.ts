import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {type Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {
  BOOKING_RESULT_SUGGESTIONS,
  clearBookingResultSuggestion,
  promptBookingResultsCore,
  promptNamesLine,
  resultPromptDue,
  saoPauloDateKey,
  suggestBookingResultCore,
} from "./booking-result-nudge";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

/** Reserva das 20:00–21:30 de 19/10 (SP); "agora" é 21:50, 20 min depois do fim. */
const NOW = new Date("2026-10-19T21:50:00-03:00");

function booking(over: DocData = {}): DocData {
  return {
    athleteId: "maria",
    arenaId: "a1",
    arenaName: "Arena CFC",
    sport: "beachVolleyball",
    date: "2026-10-19",
    startTime: "20:00",
    endTime: "21:30",
    status: "confirmed",
    amountReais: 120,
    amountPaidOnlineReais: 120,
    participants: [
      {uid: "enzo", name: "Enzo Lima"},
      {uid: "rafael", name: "Rafael Souza"},
      {uid: "lia", name: "Lia Martins"},
    ],
    participantUids: ["enzo", "rafael", "lia"],
    ...over,
  };
}

function seedUsers(fake: FakeFirestore): void {
  fake.seedDoc("users/maria", {nickname: "Maria Souza"});
  fake.seedDoc("users/enzo", {fullName: "Enzo Lima"});
  fake.seedDoc("users/rafael", {name: "Rafael Souza"});
  fake.seedDoc("users/lia", {nickname: "Lia"});
}

async function rejects(p: Promise<unknown>, code: string, message?: RegExp): Promise<void> {
  await assert.rejects(p, (err: unknown) => {
    assert.ok(err instanceof HttpsError, String(err));
    assert.equal(err.code, code);
    if (message) assert.match(err.message, message);
    return true;
  });
}

describe("Como foi o jogo? (lembrete depois da reserva)", () => {
  it("vale de 15 min a 3 h depois do fim, uma vez só", () => {
    assert.equal(resultPromptDue(booking(), NOW), true);
    assert.equal(resultPromptDue(booking(), new Date("2026-10-19T21:40:00-03:00")), false);
    assert.equal(resultPromptDue(booking(), new Date("2026-10-20T01:00:00-03:00")), false);
    assert.equal(resultPromptDue(booking({resultPromptedAt: "x"}), NOW), false);
  });

  it("não lembra reserva cancelada, sem pagamento, aula ou clubinho", () => {
    assert.equal(resultPromptDue(booking({status: "cancelled"}), NOW), false);
    assert.equal(resultPromptDue(booking({status: "pending_payment"}), NOW), false);
    assert.equal(resultPromptDue(booking({source: "club"}), NOW), false);
    assert.equal(resultPromptDue(booking({classId: "c1"}), NOW), false);
    assert.equal(resultPromptDue(booking({athleteId: ""}), NOW), false);
  });

  it("dia de SP e nomes de quem jogou", () => {
    assert.equal(saoPauloDateKey(new Date("2026-10-20T01:30:00Z")), "2026-10-19");
    assert.equal(promptNamesLine(booking()), "Enzo, Rafael e Lia");
    assert.equal(promptNamesLine(booking({participants: []})), "");
  });

  it("avisa quem reservou e marca a reserva; a segunda rodada não repete", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookings/bk1", booking());
    const first = await promptBookingResultsCore(db(fake), NOW);
    assert.equal(first.prompted, 1);
    assert.equal(first.notices[0].userId, "maria");
    assert.equal(first.notices[0].type, "pelada_score_prompt");
    assert.match(first.notices[0].body, /Enzo, Rafael e Lia confirmam/);
    assert.ok(fake.store.get("arenaBookings/bk1")!["resultPromptedAt"]);

    const second = await promptBookingResultsCore(db(fake), NOW);
    assert.equal(second.prompted, 0);
  });

  it("não lembra com placar já lançado nem sem metade paga pelo app", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookings/bk1", booking());
    fake.seedDoc("bookingResults/bk1", {status: "pending"});
    fake.seedDoc("arenaBookings/bk2", booking({amountPaidOnlineReais: 0}));
    const out = await promptBookingResultsCore(db(fake), NOW);
    assert.equal(out.prompted, 0);
  });
});

describe("placar sugerido pelo convidado", () => {
  function payload(over: DocData = {}): DocData {
    return {
      bookingId: "bk1",
      teams: [
        {id: 0, players: [{id: "maria"}, {id: "enzo"}]},
        {id: 1, players: [{id: "rafael"}, {id: "lia"}]},
      ],
      games: [{teamA: 0, teamB: 1, scoreA: 21, scoreB: 18}],
      ...over,
    };
  }

  it("grava para quem reservou conferir, com nomes dos perfis, e avisa", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookings/bk1", booking());
    seedUsers(fake);
    const {result, notices} = await suggestBookingResultCore(db(fake), "rafael", payload(), NOW);
    assert.equal(result.status, "suggested");
    const doc = fake.store.get(`${BOOKING_RESULT_SUGGESTIONS}/bk1`)!;
    assert.equal(doc["ownerUid"], "maria");
    assert.equal(doc["suggestedBy"], "rafael");
    const teams = doc["teams"] as {players: {name: string}[]}[];
    assert.equal(teams[1].players[1].name, "Lia");
    assert.equal(notices[0].userId, "maria");
    assert.equal(notices[0].type, "pelada_score_suggested");
    assert.equal(notices[0].title, "Rafael marcou o placar");
  });

  it("quem reservou envia direto; quem não está na reserva não sugere", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookings/bk1", booking());
    seedUsers(fake);
    await rejects(suggestBookingResultCore(db(fake), "maria", payload(), NOW), "failed-precondition",
      /envie o placar direto/);
    fake.seedDoc("users/zé", {nickname: "Zé"});
    await rejects(suggestBookingResultCore(db(fake), "zé", payload(), NOW), "permission-denied");
  });

  it("recusa placar já confirmado e jogo que não começou", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookings/bk1", booking());
    seedUsers(fake);
    fake.seedDoc("bookingResults/bk1", {status: "confirmed", playerUids: ["maria", "rafael"]});
    await rejects(suggestBookingResultCore(db(fake), "rafael", payload(), NOW), "failed-precondition",
      /já foi confirmado/);

    const early = new FakeFirestore();
    early.seedDoc("arenaBookings/bk1", booking());
    seedUsers(early);
    await rejects(
      suggestBookingResultCore(db(early), "rafael", payload(), new Date("2026-10-19T19:00:00-03:00")),
      "failed-precondition",
    );
  });

  it("set empatado é recusado como no Salvar placar", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookings/bk1", booking());
    seedUsers(fake);
    await rejects(
      suggestBookingResultCore(db(fake), "rafael",
        payload({games: [{teamA: 0, teamB: 1, scoreA: 10, scoreB: 10}]}), NOW),
      "invalid-argument",
    );
  });

  it("o Salvar placar apaga a sugestão", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(`${BOOKING_RESULT_SUGGESTIONS}/bk1`, {ownerUid: "maria"});
    await clearBookingResultSuggestion(db(fake), "bk1");
    assert.equal(fake.store.has(`${BOOKING_RESULT_SUGGESTIONS}/bk1`), false);
  });
});
