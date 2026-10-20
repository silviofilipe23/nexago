import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {
  CONFIRM_WINDOW_MS,
  bookingEndAt,
  bookingResultOpenError,
  confirmationsOf,
  parseBookingResultInput,
  parseDisputeReason,
  resultFormat,
  resultInputMessage,
  resultParticipants,
  responseBlocker,
  statusOf,
  sweepAction,
} from "./booking-result";
import {
  respondBookingResultCore,
  saveBookingResultCore,
  sweepBookingResultsCore,
} from "./booking-result-write";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

const NOW = new Date("2026-10-19T22:00:00-03:00");
const HOUR = 60 * 60 * 1000;

/** Maria (dona) + Enzo contra Rafael + Bia. */
function payload(over: DocData = {}): DocData {
  return {
    bookingId: "bk1",
    teams: [
      {id: 0, players: [{id: "maria", name: "ignorado"}, {id: "enzo"}]},
      {id: 1, customName: "  Os Brabos  ", players: [{id: "rafael"}, {id: "bia"}]},
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
    amountReais: 120,
    ...booking,
  });
  fake.seedDoc("users/maria", {nickname: "Maria Souza", profilePhotoUrl: "https://x/m.jpg"});
  fake.seedDoc("users/enzo", {fullName: "Enzo Lima", profilePhotoUrl: "http://inseguro"});
  fake.seedDoc("users/rafael", {name: "Rafael T."});
  fake.seedDoc("users/bia", {nickname: "Bia"});
  fake.seedDoc("users/zé", {nickname: "Zé"});
}

async function rejects(p: Promise<unknown>, code: string, message?: RegExp): Promise<void> {
  await assert.rejects(p, (err: unknown) => {
    assert.ok(err instanceof HttpsError, String(err));
    assert.equal(err.code, code);
    if (message) assert.match(err.message, message);
    return true;
  });
}

function stored(fake: FakeFirestore): DocData {
  return fake.store.get("bookingResults/bk1")!;
}

function confirmationStates(fake: FakeFirestore): Record<string, string> {
  const c = stored(fake)["confirmations"] as Record<string, {state: string}>;
  return Object.fromEntries(Object.entries(c).map(([uid, v]) => [uid, v.state]));
}

describe("parseBookingResultInput", () => {
  it("aceita o placar e normaliza o nome do time", () => {
    const {input, fields} = parseBookingResultInput(payload());
    assert.deepEqual(fields, []);
    assert.equal(input.teams[1].customName, "Os Brabos");
    assert.deepEqual(input.teams[1].players, [{id: "rafael"}, {id: "bia"}]);
  });

  it("recusa avulso, time vazio e jogo empatado (0×0 inclusive)", () => {
    const guest = parseBookingResultInput(payload({
      teams: [{id: 0, players: [{id: "maria"}]}, {id: 1, players: [{id: "guest:lia", name: "Lia"}]}],
    }));
    assert.ok(guest.fields.includes("teams.1.players.0.guest"));
    assert.equal(resultInputMessage(guest.fields), "Todos os jogadores precisam ter conta no nexaGO.");

    const empty = parseBookingResultInput(payload({
      teams: [{id: 0, players: [{id: "maria"}]}, {id: 1, players: []}],
    }));
    assert.equal(resultInputMessage(empty.fields), "Monte todos os times antes de salvar.");

    const tie = parseBookingResultInput(payload({
      games: [{teamA: 0, teamB: 1, scoreA: 21, scoreB: 18}, {teamA: 0, teamB: 1, scoreA: 0, scoreB: 0}],
    }));
    assert.equal(resultInputMessage(tie.fields), "O jogo 2 está empatado: ajuste o placar.");
  });

  it("recusa jogo com time de fora, jogador repetido e id inválido", () => {
    assert.ok(parseBookingResultInput(payload({games: [{teamA: 0, teamB: 7, scoreA: 1, scoreB: 0}]}))
      .fields.includes("games.0"));
    assert.ok(parseBookingResultInput(payload({games: [{teamA: 0, teamB: 1, scoreA: 100, scoreB: 0}]}))
      .fields.includes("games.0"));
    const dup = parseBookingResultInput(payload({
      teams: [{id: 0, players: [{id: "maria"}]}, {id: 1, players: [{id: "maria"}]}],
    }));
    assert.ok(dup.fields.includes("teams.1.players.0"));
    assert.ok(parseBookingResultInput(payload({teams: [{id: 0, players: [{id: "maria"}]}]})).fields.includes("teams"));
    assert.ok(parseBookingResultInput(payload({bookingId: "a/b"})).fields.includes("bookingId"));
  });
});

describe("resultParticipants e formato", () => {
  it("todo mundo com conta está no placar; opponentUids fica para o app do #781", () => {
    const {input} = parseBookingResultInput(payload());
    assert.deepEqual(resultParticipants(input.teams, "maria"), {
      playerUids: ["maria", "enzo", "rafael", "bia"],
      opponentUids: ["rafael", "bia"],
      creatorTeamId: 0,
    });
  });

  it("dois times = duplas; três ou mais = rei da quadra", () => {
    assert.equal(resultFormat(2), "duo_vs_duo");
    assert.equal(resultFormat(4), "king_of_court");
  });

  it("fim antes do início vira o dia seguinte", () => {
    assert.equal(bookingEndAt("2026-10-19", "23:00", "00:30")!.toISOString(), "2026-10-20T03:30:00.000Z");
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

describe("confirmações", () => {
  it("placar do #781 sem o mapa: quem lançou confirmado, status antigo decide o resto", () => {
    const legacy = {createdBy: "maria", playerUids: ["maria", "enzo", "rafael"], status: "pending", version: 2};
    assert.deepEqual(
      Object.fromEntries(Object.entries(confirmationsOf(legacy)).map(([k, v]) => [k, v.state])),
      {maria: "confirmed", enzo: "pending", rafael: "pending"},
    );
    const disputed = confirmationsOf({...legacy, status: "disputed", respondedBy: "rafael"});
    assert.equal(disputed["rafael"].state, "disputed");
    assert.equal(statusOf(confirmationsOf({...legacy, status: "confirmed"})), "confirmed");
  });

  it("motivo: obrigatório, de 3 a 140 letras, espaços normalizados", () => {
    assert.equal(parseDisputeReason("  Placar   errado  "), "Placar errado");
    assert.equal(parseDisputeReason("ok"), null);
    assert.equal(parseDisputeReason("x".repeat(141)), null);
    assert.equal(parseDisputeReason(undefined), null);
  });

  it("responde quem está no placar, menos quem lançou; só pendente, uma vez, na versão vista", () => {
    const doc = {
      createdBy: "maria",
      playerUids: ["maria", "enzo", "rafael"],
      status: "pending",
      version: 2,
      confirmations: {
        maria: {state: "confirmed", version: 2},
        enzo: {state: "confirmed", version: 2},
        rafael: {state: "pending", version: 2},
      },
    };
    assert.equal(responseBlocker(doc, "rafael", 2), null);
    assert.equal(responseBlocker(doc, "maria", 2)?.code, "permission-denied");
    assert.equal(responseBlocker(doc, "bia", 2)?.code, "permission-denied");
    assert.equal(responseBlocker(doc, "rafael", 1)?.code, "aborted");
    assert.match(responseBlocker(doc, "enzo", 2)!.message, /já respondeu/);
    assert.match(responseBlocker({...doc, status: "confirmed"}, "rafael", 2)!.message, /confirmado/);
    assert.match(responseBlocker({...doc, status: "disputed"}, "rafael", 2)!.message, /contestado/);
  });

  it("varredura: prazo vencido confirma; faltando 24h lembra uma vez", () => {
    const at = (ms: number) => Timestamp.fromMillis(NOW.getTime() + ms);
    assert.equal(sweepAction({status: "pending", confirmDeadline: at(-1)}, NOW.getTime()), "auto_confirm");
    assert.equal(sweepAction({status: "pending", confirmDeadline: at(23 * HOUR)}, NOW.getTime()), "remind");
    assert.equal(sweepAction({status: "pending", confirmDeadline: at(23 * HOUR), remindedAt: at(0)},
      NOW.getTime()), null);
    assert.equal(sweepAction({status: "pending", confirmDeadline: at(30 * HOUR)}, NOW.getTime()), null);
    assert.equal(sweepAction({status: "disputed", confirmDeadline: at(-1)}, NOW.getTime()), null);
  });
});

describe("saveBookingResultCore", () => {
  it("grava a pelada pendente, quem lançou confirmado, prazo de 48h, e avisa os outros três", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    const {result, notices} = await saveBookingResultCore(db(fake), "maria", payload(), NOW);
    assert.deepEqual(result, {status: "pending", version: 1, pendingUids: ["enzo", "rafael", "bia"]});

    const doc = stored(fake);
    assert.equal(doc["format"], "duo_vs_duo");
    assert.equal(doc["editedBy"], "maria");
    assert.equal(doc["bookingAmountReais"], 120);
    assert.equal((doc["startsAt"] as Timestamp).toDate().toISOString(), "2026-10-19T23:00:00.000Z");
    assert.equal((doc["confirmDeadline"] as Timestamp).toMillis(), NOW.getTime() + CONFIRM_WINDOW_MS);
    assert.deepEqual(confirmationStates(fake), {maria: "confirmed", enzo: "pending", rafael: "pending", bia: "pending"});
    assert.deepEqual(doc["pendingUids"], ["enzo", "rafael", "bia"]);
    const teams = doc["teams"] as {players: DocData[]}[];
    assert.deepEqual(teams[0].players[0], {id: "maria", name: "Maria Souza", avatarUrl: "https://x/m.jpg", guest: false});
    // Foto fora de https não vai para a arte dos outros.
    assert.equal(teams[0].players[1]["avatarUrl"], null);

    assert.deepEqual(notices.map((n) => n.userId), ["enzo", "rafael", "bia"]);
    assert.equal(notices[0].type, "booking_result_pending");
    assert.equal(notices[0].body, "Maria lançou o placar de Arena CFC · 19/10. Confere?");
  });

  it("só o dono da reserva lança, e só depois de começar", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    await rejects(saveBookingResultCore(db(fake), "rafael", payload(), NOW), "not-found");
    await rejects(saveBookingResultCore(db(fake), "maria", payload(),
      new Date("2026-10-19T19:00:00-03:00")), "failed-precondition", /começar/);
  });

  it("quem lança tem de estar num time; atleta inexistente e avulso são recusados", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    await rejects(saveBookingResultCore(db(fake), "maria", payload({
      teams: [{id: 0, players: [{id: "enzo"}]}, {id: 1, players: [{id: "rafael"}]}],
    }), NOW), "invalid-argument", /times/);
    await rejects(saveBookingResultCore(db(fake), "maria", payload({
      teams: [{id: 0, players: [{id: "maria"}]}, {id: 1, players: [{id: "fantasma"}]}],
    }), NOW), "invalid-argument", /não foi encontrado/);
    await rejects(saveBookingResultCore(db(fake), "maria", payload({
      teams: [{id: 0, players: [{id: "maria"}]}, {id: 1, players: [{id: "guest:lia", name: "Lia"}]}],
    }), NOW), "invalid-argument", /conta/);
  });

  it("editar depois de confirmado sobe a versão e zera as confirmações (menos de quem editou)", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    await saveBookingResultCore(db(fake), "maria", payload(), NOW);
    for (const uid of ["enzo", "rafael", "bia"]) {
      await respondBookingResultCore(db(fake), uid, {bookingId: "bk1", response: "confirm", version: 1}, NOW);
    }
    assert.equal(stored(fake)["status"], "confirmed");

    const later = new Date(NOW.getTime() + 2 * HOUR);
    const again = await saveBookingResultCore(db(fake), "maria", payload(), later);
    assert.equal(again.result.version, 2);
    assert.equal(stored(fake)["status"], "pending");
    assert.deepEqual(confirmationStates(fake), {maria: "confirmed", enzo: "pending", rafael: "pending", bia: "pending"});
    assert.equal((stored(fake)["confirmDeadline"] as Timestamp).toMillis(), later.getTime() + CONFIRM_WINDOW_MS);
    // Saiu do "confirmado": todo mundo é avisado de novo.
    assert.deepEqual(again.notices.map((n) => n.userId), ["enzo", "rafael", "bia"]);
  });

  it("salvar de novo em seguida não repete o push, só para quem entrou agora", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    await saveBookingResultCore(db(fake), "maria", payload(), NOW);
    const again = await saveBookingResultCore(db(fake), "maria", payload({
      teams: [
        {id: 0, players: [{id: "maria"}, {id: "enzo"}]},
        {id: 1, players: [{id: "rafael"}, {id: "zé"}]},
      ],
    }), new Date(NOW.getTime() + 60_000));
    assert.deepEqual(again.notices.map((n) => n.userId), ["zé"]);
  });
});

describe("respondBookingResultCore", () => {
  it("confirmado só quando todos confirmam; ninguém é avisado", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    await saveBookingResultCore(db(fake), "maria", payload(), NOW);
    const first = await respondBookingResultCore(db(fake), "rafael",
      {bookingId: "bk1", response: "confirm", version: 1}, NOW);
    assert.deepEqual(first, {result: {status: "pending"}, notices: []});
    assert.deepEqual(stored(fake)["pendingUids"], ["enzo", "bia"]);

    await respondBookingResultCore(db(fake), "enzo", {bookingId: "bk1", response: "confirm", version: 1}, NOW);
    const last = await respondBookingResultCore(db(fake), "bia",
      {bookingId: "bk1", response: "confirm", version: 1}, NOW);
    assert.deepEqual(last.result, {status: "confirmed"});
    assert.deepEqual(last.notices, []);
    assert.deepEqual(stored(fake)["pendingUids"], []);
  });

  it("contestar exige motivo, trava o placar e avisa quem lançou com o motivo", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    await saveBookingResultCore(db(fake), "maria", payload(), NOW);
    await rejects(respondBookingResultCore(db(fake), "rafael",
      {bookingId: "bk1", response: "dispute", version: 1}, NOW), "invalid-argument", /errado/);

    const {result, notices} = await respondBookingResultCore(db(fake), "rafael",
      {bookingId: "bk1", response: "dispute", version: 1, reason: "Dupla errada"}, NOW);
    assert.deepEqual(result, {status: "disputed"});
    assert.equal(stored(fake)["disputeReason"], "Dupla errada");
    assert.deepEqual(notices.map((n) => [n.userId, n.type, n.body]),
      [["maria", "booking_result_disputed", "Rafael contestou o placar: Dupla errada"]]);
    await rejects(respondBookingResultCore(db(fake), "bia",
      {bookingId: "bk1", response: "confirm", version: 1}, NOW), "failed-precondition", /contestado/);

    // Corrigido: versão nova, pendente de novo, contestação apagada e todos avisados.
    const again = await saveBookingResultCore(db(fake), "maria", payload(), new Date(NOW.getTime() + 60_000));
    assert.equal(again.result.version, 2);
    assert.equal(stored(fake)["disputeReason"], null);
    assert.deepEqual(again.notices.map((n) => n.userId), ["enzo", "rafael", "bia"]);
  });

  it("companheiro também confirma; quem lançou não; fora do placar não acha; versão velha é 409", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    await saveBookingResultCore(db(fake), "maria", payload(), NOW);
    const teammate = await respondBookingResultCore(db(fake), "enzo",
      {bookingId: "bk1", response: "confirm", version: 1}, NOW);
    assert.deepEqual(teammate.result, {status: "pending"});
    await rejects(respondBookingResultCore(db(fake), "maria", {bookingId: "bk1", response: "confirm", version: 1}),
      "permission-denied");
    await rejects(respondBookingResultCore(db(fake), "zé", {bookingId: "bk1", response: "confirm", version: 1}),
      "not-found");
    await rejects(respondBookingResultCore(db(fake), "rafael", {bookingId: "bk1", response: "confirm", version: 0}),
      "aborted", /alterado/);
    await rejects(respondBookingResultCore(db(fake), "rafael", {bookingId: "bk1", response: "talvez", version: 1}),
      "invalid-argument");
  });
});

describe("sweepBookingResultsCore", () => {
  it("lembra quem falta 24h antes e confirma sozinho no prazo, sem push", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    await saveBookingResultCore(db(fake), "maria", payload(), NOW);
    await respondBookingResultCore(db(fake), "rafael", {bookingId: "bk1", response: "confirm", version: 1}, NOW);

    const quiet = await sweepBookingResultsCore(db(fake), new Date(NOW.getTime() + 20 * HOUR));
    assert.deepEqual([quiet.autoConfirmed, quiet.reminded, quiet.notices.length], [0, 0, 0]);

    const remind = await sweepBookingResultsCore(db(fake), new Date(NOW.getTime() + 25 * HOUR));
    assert.equal(remind.reminded, 1);
    assert.deepEqual(remind.notices.map((n) => [n.userId, n.type]),
      [["enzo", "booking_result_reminder"], ["bia", "booking_result_reminder"]]);
    assert.equal(remind.notices[0].body, "Falta confirmar o placar de 19/10 na Arena CFC.");
    const twice = await sweepBookingResultsCore(db(fake), new Date(NOW.getTime() + 26 * HOUR));
    assert.equal(twice.reminded, 0);

    const done = await sweepBookingResultsCore(db(fake), new Date(NOW.getTime() + 48 * HOUR));
    assert.deepEqual([done.autoConfirmed, done.notices.length], [1, 0]);
    assert.equal(stored(fake)["status"], "confirmed");
    const c = stored(fake)["confirmations"] as Record<string, {state: string; auto: boolean}>;
    assert.deepEqual([c["enzo"].state, c["enzo"].auto, c["rafael"].auto], ["confirmed", true, false]);
  });

  it("contestado não confirma sozinho", async () => {
    const fake = new FakeFirestore();
    seed(fake);
    await saveBookingResultCore(db(fake), "maria", payload(), NOW);
    await respondBookingResultCore(db(fake), "rafael",
      {bookingId: "bk1", response: "dispute", version: 1, reason: "Não joguei"}, NOW);
    const done = await sweepBookingResultsCore(db(fake), new Date(NOW.getTime() + 49 * HOUR));
    assert.equal(done.autoConfirmed, 0);
    assert.equal(stored(fake)["status"], "disputed");
  });
});
