import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {
  bookingResultOpenError,
  parseBookingResultInput,
  resultInputMessage,
  resultParticipants,
  resultPushLine,
  responseBlocker,
} from "./booking-result";
import {respondBookingResultCore, saveBookingResultCore} from "./booking-result-write";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

const NOW = new Date("2026-10-19T22:00:00-03:00");

/** Maria (dona) + Enzo contra Rafael + Lia; Lia é avulsa. */
function payload(over: DocData = {}): DocData {
  return {
    bookingId: "bk1",
    teams: [
      {id: 0, players: [{id: "maria", name: "ignorado"}, {id: "enzo", name: "x"}]},
      {id: 1, customName: "  Os Brabos  ", players: [{id: "rafael", name: "x"}, {id: "guest:lia", name: "Lia"}]},
    ],
    games: [
      {teamA: 0, teamB: 1, scoreA: 21, scoreB: 18},
      {teamA: 0, teamB: 1, scoreA: 17, scoreB: 21},
      {teamA: 0, teamB: 1, scoreA: 15, scoreB: 12},
    ],
    ...over,
  };
}

function seed(fake: FakeFirestore, booking: DocData = {}): void {
  fake.seedDoc("arenaBookings/bk1", {
    athleteId: "maria",
    arenaId: "a1",
    arenaName: "Arena CFC",
    courtName: "Quadra 1",
    sport: "beachVolleyball",
    date: "2026-10-19",
    startTime: "20:00",
    endTime: "21:30",
    status: "confirmed",
    amountReais: 1,
    ...booking,
  });
  fake.seedDoc("users/maria", {nickname: "Maria Souza", profilePhotoUrl: "https://x/m.jpg"});
  fake.seedDoc("users/enzo", {fullName: "Enzo Lima", profilePhotoUrl: "http://inseguro"});
  fake.seedDoc("users/rafael", {name: "Rafael T."});
  fake.seedDoc("users/bia", {nickname: "Bia"});
}

async function rejects(p: Promise<unknown>, code: string, message?: RegExp): Promise<void> {
  await assert.rejects(p, (err: unknown) => {
    assert.ok(err instanceof HttpsError, String(err));
    assert.equal(err.code, code);
    if (message) assert.match(err.message, message);
    return true;
  });
}

describe("parseBookingResultInput", () => {
  it("aceita o placar e normaliza nome do time e jogadores", () => {
    const {input, fields} = parseBookingResultInput(payload());
    assert.deepEqual(fields, []);
    assert.equal(input.teams[1].customName, "Os Brabos");
    assert.deepEqual(input.teams[1].players, [
      {id: "rafael", name: "", guest: false},
      {id: "guest:lia", name: "Lia", guest: true},
    ]);
  });

  it("time sem jogador vale (\"Adversários\" de quem jogou sozinho na reserva)", () => {
    const {fields} = parseBookingResultInput(payload({
      teams: [{id: 0, players: [{id: "maria"}]}, {id: 1, players: []}],
    }));
    assert.deepEqual(fields, []);
  });

  it("recusa placar zerado, jogo com time de fora, jogador repetido e avulso sem nome", () => {
    assert.ok(parseBookingResultInput(payload({games: [{teamA: 0, teamB: 1, scoreA: 0, scoreB: 0}]}))
      .fields.includes("games.score"));
    assert.ok(parseBookingResultInput(payload({games: [{teamA: 0, teamB: 7, scoreA: 1, scoreB: 0}]}))
      .fields.includes("games.0"));
    assert.ok(parseBookingResultInput(payload({games: [{teamA: 0, teamB: 0, scoreA: 1, scoreB: 0}]}))
      .fields.includes("games.0"));
    assert.ok(parseBookingResultInput(payload({games: [{teamA: 0, teamB: 1, scoreA: 100, scoreB: 0}]}))
      .fields.includes("games.0"));
    const dup = parseBookingResultInput(payload({
      teams: [{id: 0, players: [{id: "maria"}]}, {id: 1, players: [{id: "maria"}]}],
    }));
    assert.ok(dup.fields.includes("teams.1.players.0"));
    assert.ok(parseBookingResultInput(payload({
      teams: [{id: 0, players: [{id: "maria"}]}, {id: 1, players: [{id: "guest:x", name: " "}]}],
    })).fields.includes("teams.1.players.0"));
    assert.ok(parseBookingResultInput(payload({teams: [{id: 0, players: []}]})).fields.includes("teams"));
    assert.ok(parseBookingResultInput(payload({bookingId: "a/b"})).fields.includes("bookingId"));
  });

  it("a mensagem fala do placar zerado antes de tudo", () => {
    assert.equal(resultInputMessage(["games.score", "teams"]), "Lance o placar de pelo menos um set.");
    assert.equal(resultInputMessage(["teams.0.id"]), "Confira os times do placar.");
  });
});

describe("resultParticipants", () => {
  it("adversário com conta confirma; companheiro e avulso não", () => {
    const {input} = parseBookingResultInput(payload());
    assert.deepEqual(resultParticipants(input.teams, "maria"), {
      playerUids: ["maria", "enzo", "rafael"],
      opponentUids: ["rafael"],
      creatorTeamId: 0,
    });
  });

  it("na rotação, todo time que não é o de quem lançou é adversário", () => {
    const {input} = parseBookingResultInput(payload({
      teams: [
        {id: 0, players: [{id: "maria"}]},
        {id: 1, players: [{id: "rafael"}]},
        {id: 2, players: [{id: "bia"}, {id: "guest:zé", name: "Zé"}]},
      ],
      games: [{teamA: 0, teamB: 1, scoreA: 15, scoreB: 10}],
    }));
    assert.deepEqual(resultParticipants(input.teams, "maria").opponentUids, ["rafael", "bia"]);
  });
});

describe("bookingResultOpenError", () => {
  it("abre na reserva garantida depois do início (parede SP)", () => {
    const booking = {status: "confirmed", date: "2026-10-19", startTime: "20:00"};
    assert.equal(bookingResultOpenError(booking, new Date("2026-10-19T20:00:00-03:00")), null);
    assert.match(bookingResultOpenError(booking, new Date("2026-10-19T19:59:00-03:00"))!, /começar/);
  });

  it("não abre em reserva cancelada ou esperando pagamento", () => {
    for (const status of ["canceled", "pending_payment", "PENDING"]) {
      assert.match(bookingResultOpenError({status, date: "2026-10-01", startTime: "08:00"}, NOW)!, /garantida/);
    }
  });
});

describe("resultPushLine", () => {
  it("time de quem lançou primeiro, sets vencidos, nome dado ou automático", () => {
    const teams = [
      {id: 0, customName: null, players: [{name: "Maria Souza"}, {name: "Enzo"}]},
      {id: 1, customName: "Os Brabos", players: [{name: "Rafael"}]},
    ];
    const games = [
      {teamA: 0, teamB: 1, scoreA: 21, scoreB: 18},
      {teamA: 1, teamB: 0, scoreA: 21, scoreB: 17},
    ];
    assert.equal(resultPushLine(teams, games, 1), "Os Brabos 1–1 Maria & Enzo");
    assert.equal(resultPushLine([...teams, {id: 2, customName: null, players: []}], games, 0), null);
  });
});

describe("responseBlocker", () => {
  const doc = {opponentUids: ["rafael"], status: "pending", version: 2};
  it("só o adversário, só pendente, só a versão que ele viu", () => {
    assert.equal(responseBlocker(doc, "rafael", 2), null);
    assert.equal(responseBlocker(doc, "enzo", 2)?.code, "permission-denied");
    assert.match(responseBlocker(doc, "rafael", 1)!.message, /mudou/);
    assert.match(responseBlocker({...doc, status: "confirmed"}, "rafael", 2)!.message, /confirmado/);
    assert.match(responseBlocker({...doc, status: "disputed"}, "rafael", 2)!.message, /contestado/);
  });
});

describe("saveBookingResultCore", () => {
  it("grava o placar com nomes e fotos do perfil e avisa só o adversário com conta", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    const {result, notices} = await saveBookingResultCore(db(fake), "maria", payload(), NOW);
    assert.deepEqual(result, {status: "pending", version: 1, opponentUids: ["rafael"]});

    const doc = fake.store.get("bookingResults/bk1")!;
    assert.equal(doc["arenaName"], "Arena CFC");
    assert.equal(doc["dateKey"], "2026-10-19");
    assert.equal(doc["createdByName"], "Maria Souza");
    assert.deepEqual(doc["playerUids"], ["maria", "enzo", "rafael"]);
    const teams = doc["teams"] as {players: DocData[]}[];
    assert.deepEqual(teams[0].players[0], {id: "maria", name: "Maria Souza", avatarUrl: "https://x/m.jpg", guest: false});
    // Foto fora de https não vai para a arte dos outros.
    assert.equal(teams[0].players[1]["avatarUrl"], null);
    assert.deepEqual(teams[1].players[1], {id: "guest:lia", name: "Lia", avatarUrl: null, guest: true});

    assert.equal(notices.length, 1);
    assert.equal(notices[0].userId, "rafael");
    assert.equal(notices[0].type, "booking_result_pending");
    assert.equal(notices[0].body,
      "Maria lançou o jogo de 19/10 na Arena CFC: Maria & Enzo 2–1 Os Brabos. Confirme ou conteste.");
  });

  it("só o dono da reserva lança, e só depois de começar", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    await rejects(saveBookingResultCore(db(fake), "rafael", payload(), NOW), "not-found");
    await rejects(saveBookingResultCore(db(fake), "maria", payload(),
      new Date("2026-10-19T19:00:00-03:00")), "failed-precondition", /começar/);
    await rejects(saveBookingResultCore(db(fake), "maria", payload({bookingId: "nada"}), NOW), "not-found");
  });

  it("quem lança tem de estar num time; atleta inexistente é recusado", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    await rejects(saveBookingResultCore(db(fake), "maria", payload({
      teams: [{id: 0, players: [{id: "enzo"}]}, {id: 1, players: [{id: "rafael"}]}],
    }), NOW), "invalid-argument", /times/);
    await rejects(saveBookingResultCore(db(fake), "maria", payload({
      teams: [{id: 0, players: [{id: "maria"}]}, {id: 1, players: [{id: "fantasma"}]}],
    }), NOW), "invalid-argument", /não foi encontrado/);
  });

  it("salvar de novo sobe a versão, zera a resposta e não repete o push em seguida", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    await saveBookingResultCore(db(fake), "maria", payload(), NOW);
    const later = new Date(NOW.getTime() + 60_000);
    const again = await saveBookingResultCore(db(fake), "maria", payload({
      teams: [
        {id: 0, players: [{id: "maria"}]},
        {id: 1, players: [{id: "rafael"}, {id: "bia"}]},
      ],
    }), later);
    assert.equal(again.result.version, 2);
    // Rafael já foi avisado há um minuto; Bia entrou agora.
    assert.deepEqual(again.notices.map((n) => n.userId), ["bia"]);

    const muchLater = new Date(NOW.getTime() + 11 * 60_000);
    const third = await saveBookingResultCore(db(fake), "maria", payload(), muchLater);
    assert.deepEqual(third.notices.map((n) => n.userId), ["rafael"]);
  });

  it("placar confirmado não muda mais", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    await saveBookingResultCore(db(fake), "maria", payload(), NOW);
    await respondBookingResultCore(db(fake), "rafael", {bookingId: "bk1", response: "confirm", version: 1});
    await rejects(saveBookingResultCore(db(fake), "maria", payload(), NOW), "failed-precondition", /confirmado/);
  });

  it("sem adversário com conta, salva sem aviso", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    const {result, notices} = await saveBookingResultCore(db(fake), "maria", payload({
      teams: [{id: 0, players: [{id: "maria"}]}, {id: 1, players: [{id: "guest:lia", name: "Lia"}]}],
    }), NOW);
    assert.deepEqual(result.opponentUids, []);
    assert.deepEqual(notices, []);
    assert.equal(fake.store.get("bookingResults/bk1")!["notifiedAt"], null);
  });
});

describe("respondBookingResultCore", () => {
  it("adversário confirma: conta no histórico e avisa quem lançou", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    await saveBookingResultCore(db(fake), "maria", payload(), NOW);
    const {result, notices} = await respondBookingResultCore(db(fake), "rafael",
      {bookingId: "bk1", response: "confirm", version: 1});
    assert.deepEqual(result, {status: "confirmed"});
    const doc = fake.store.get("bookingResults/bk1")!;
    assert.equal(doc["status"], "confirmed");
    assert.equal(doc["respondedBy"], "rafael");
    assert.equal(doc["respondedByName"], "Rafael T.");
    assert.deepEqual(notices.map((n) => [n.userId, n.type]), [["maria", "booking_result_confirmed"]]);
  });

  it("contestar devolve para quem lançou corrigir, que pode salvar de novo e avisa de novo", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    await saveBookingResultCore(db(fake), "maria", payload(), NOW);
    const {notices} = await respondBookingResultCore(db(fake), "rafael",
      {bookingId: "bk1", response: "dispute", version: 1});
    assert.equal(notices[0].type, "booking_result_disputed");
    assert.match(notices[0].body, /Rafael contestou/);
    const again = await saveBookingResultCore(db(fake), "maria", payload(), new Date(NOW.getTime() + 60_000));
    assert.equal(again.result.version, 2);
    assert.deepEqual(again.notices.map((n) => n.userId), ["rafael"]);
    assert.equal(fake.store.get("bookingResults/bk1")!["respondedBy"], null);
  });

  it("companheiro de time não confirma; quem está fora do placar não acha; versão velha é recusada", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    await saveBookingResultCore(db(fake), "maria", payload(), NOW);
    await rejects(respondBookingResultCore(db(fake), "enzo", {bookingId: "bk1", response: "confirm", version: 1}),
      "permission-denied");
    await rejects(respondBookingResultCore(db(fake), "bia", {bookingId: "bk1", response: "confirm", version: 1}),
      "not-found");
    await rejects(respondBookingResultCore(db(fake), "rafael", {bookingId: "bk1", response: "confirm", version: 0}),
      "failed-precondition", /mudou/);
    await rejects(respondBookingResultCore(db(fake), "rafael", {bookingId: "bk1", response: "talvez", version: 1}),
      "invalid-argument");
  });

  it("depois da primeira resposta, ninguém mais responde", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    await saveBookingResultCore(db(fake), "maria", payload({
      teams: [{id: 0, players: [{id: "maria"}]}, {id: 1, players: [{id: "rafael"}, {id: "bia"}]}],
    }), NOW);
    await respondBookingResultCore(db(fake), "rafael", {bookingId: "bk1", response: "confirm", version: 1});
    await rejects(respondBookingResultCore(db(fake), "bia", {bookingId: "bk1", response: "dispute", version: 1}),
      "failed-precondition", /confirmado/);
  });

  it("o notifiedAt da última gravação é Timestamp", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    await saveBookingResultCore(db(fake), "maria", payload(), NOW);
    assert.ok(fake.store.get("bookingResults/bk1")!["notifiedAt"] instanceof Timestamp);
  });
});
