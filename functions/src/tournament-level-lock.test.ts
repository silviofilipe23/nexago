import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
  inscriptionAthleteUids,
  inscriptionBecameActive,
  inscriptionNewlyActiveAthleteUids,
} from "./tournament-level-lock";

describe("inscriptionBecameActive", () => {
  it("criada (before ausente, after presente) -> true", () => {
    assert.equal(
      inscriptionBecameActive(undefined, {tournamentId: "t1", participantUids: ["u1"]}),
      true,
    );
  });

  it("update numa inscrição que já existia (ex.: pendente -> pago) -> false", () => {
    assert.equal(
      inscriptionBecameActive(
        {tournamentId: "t1", isPaid: false},
        {tournamentId: "t1", isPaid: true},
      ),
      false,
    );
  });

  it("delete (after ausente) -> false", () => {
    assert.equal(
      inscriptionBecameActive({tournamentId: "t1", participantUids: ["u1"]}, undefined),
      false,
    );
  });

  it("nova inscrição depois de outra cancelada (doc novo -> before sempre ausente) -> true", () => {
    // Cancelamento nesta coleção é hard delete (cancelTournamentRegistration /
    // organizerRemoveFromCategory / respondRegistrationCancellationRequest
    // aprovado): não existe status "cancelled" persistido no doc. Uma NOVA
    // inscrição da mesma dupla recebe um registrationId novo, então do ponto
    // de vista deste trigger ela é sempre "before ausente".
    assert.equal(
      inscriptionBecameActive(undefined, {tournamentId: "t1", participantUids: ["u1", "u2"]}),
      true,
    );
  });

  it("before e after ambos ausentes -> false", () => {
    assert.equal(inscriptionBecameActive(undefined, undefined), false);
  });
});

describe("inscriptionAthleteUids", () => {
  it("solo: player1Id", () => {
    assert.deepEqual(
      inscriptionAthleteUids({player1Id: "u1", participantUids: ["u1"]}),
      ["u1"],
    );
  });

  it("dupla: participantUids com os dois atletas", () => {
    assert.deepEqual(
      inscriptionAthleteUids({teamId: "team1", participantUids: ["u1", "u2"]}).sort(),
      ["u1", "u2"],
    );
  });

  it("equipe (trio+): participantUids com todo o elenco", () => {
    assert.deepEqual(
      inscriptionAthleteUids({
        teamId: "team1",
        participantUids: ["u1", "u2", "u3", "u4"],
      }).sort(),
      ["u1", "u2", "u3", "u4"],
    );
  });

  it("filtra ids vazios/whitespace e remove duplicados", () => {
    assert.deepEqual(
      inscriptionAthleteUids({
        player1Id: " u1 ",
        participantUids: ["u1", "", "   ", "u2"],
      }).sort(),
      ["u1", "u2"],
    );
  });

  it("doc sem nenhum uid -> []", () => {
    assert.deepEqual(inscriptionAthleteUids({tournamentId: "t1"}), []);
  });

  it("data ausente -> []", () => {
    assert.deepEqual(inscriptionAthleteUids(undefined), []);
  });
});

describe("inscriptionNewlyActiveAthleteUids", () => {
  it("inscrição nova (before ausente): todos os uids do after", () => {
    assert.deepEqual(
      inscriptionNewlyActiveAthleteUids(undefined, {
        tournamentId: "t1",
        participantUids: ["u1", "u2"],
      }).sort(),
      ["u1", "u2"],
    );
  });

  it("atleta ENTRA numa reserva solo já existente (attach/aceite de convite): só o uid novo", () => {
    // O doc não é novo (before existe, é a reserva solo), mas
    // assertTeamLevelEligibility valida os dois nesse momento — o atleta que
    // entra precisa travar mesmo sem o doc inteiro ser uma criação.
    const before = {
      tournamentId: "t1",
      player1Id: "u1",
      participantUids: ["u1"],
      partnerPending: true,
    };
    const after = {
      tournamentId: "t1",
      player1Id: "u1",
      participantUids: ["u1", "u2"],
      partnerPending: false,
      teamId: "team1",
    };
    assert.deepEqual(inscriptionNewlyActiveAthleteUids(before, after), ["u2"]);
  });

  it("update que não muda os uids (ex.: confirmação de pagamento) -> []", () => {
    const before = {tournamentId: "t1", participantUids: ["u1", "u2"], isPaid: false};
    const after = {tournamentId: "t1", participantUids: ["u1", "u2"], isPaid: true};
    assert.deepEqual(inscriptionNewlyActiveAthleteUids(before, after), []);
  });

  it("delete (after ausente) -> []", () => {
    assert.deepEqual(
      inscriptionNewlyActiveAthleteUids({tournamentId: "t1", participantUids: ["u1"]}, undefined),
      [],
    );
  });
});
