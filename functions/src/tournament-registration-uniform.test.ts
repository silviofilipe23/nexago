import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {resolveUniformSlot} from "./tournament-registration-uniform";

/** Reserva solo criada por `registerSoloTournament`: sem `teamId`, sem equipe. */
function soloRegistration(ownerUid: string) {
  return {
    tournamentId: "t1",
    categoryId: "c1",
    player1Id: ownerUid,
    participantUids: [ownerUid],
    partnerPending: true,
  };
}

/** Dupla fechada: a inscrição aponta pra equipe e a equipe tem os dois slots. */
function duoRegistration(uids: [string, string]) {
  return {
    tournamentId: "t1",
    categoryId: "c1",
    teamId: "team1",
    player1Id: uids[0],
    participantUids: [...uids],
    partnerPending: false,
  };
}

function duoTeam(uids: [string, string]) {
  return {player1Id: uids[0], player2Id: uids[1]};
}

describe("resolveUniformSlot", () => {
  describe("reserva solo (sem doc em `teams`)", () => {
    it("autoriza o dono da reserva no slot player1", () => {
      assert.equal(
        resolveUniformSlot(soloRegistration("ana"), null, "ana"),
        "player1",
      );
    });

    it("nega quem não é da inscrição", () => {
      assert.equal(
        resolveUniformSlot(soloRegistration("ana"), null, "bruno"),
        null,
      );
    });

    it("autoriza por participantUids quando player1Id não foi gravado", () => {
      const registration = {participantUids: ["ana", "bruno"]};
      assert.equal(resolveUniformSlot(registration, null, "ana"), "player1");
      assert.equal(resolveUniformSlot(registration, null, "bruno"), "player2");
    });

    it("ignora espaços em volta dos uids", () => {
      const registration = {player1Id: " ana ", participantUids: [" ana "]};
      assert.equal(resolveUniformSlot(registration, null, "ana"), "player1");
    });
  });

  describe("dupla formada (equipe com os slots legados)", () => {
    it("devolve player1 e player2 conforme o doc da equipe", () => {
      const registration = duoRegistration(["ana", "bruno"]);
      const team = duoTeam(["ana", "bruno"]);
      assert.equal(resolveUniformSlot(registration, team, "ana"), "player1");
      assert.equal(resolveUniformSlot(registration, team, "bruno"), "player2");
    });

    it("a equipe vence a inscrição na hora de escolher o slot", () => {
      // Inscrição diz que "ana" é player1, mas na equipe ela é player2.
      const registration = {teamId: "team1", player1Id: "ana", participantUids: ["ana", "bruno"]};
      const team = duoTeam(["bruno", "ana"]);
      assert.equal(resolveUniformSlot(registration, team, "ana"), "player2");
    });

    it("nega quem não está na equipe", () => {
      const registration = duoRegistration(["ana", "bruno"]);
      assert.equal(
        resolveUniformSlot(registration, duoTeam(["ana", "bruno"]), "carla"),
        null,
      );
    });
  });

  describe("equipe nomeada (trio+)", () => {
    const registration = {
      teamId: "team1",
      teamSize: 3,
      captainUid: "ana",
      participantUids: ["ana", "bruno", "carla"],
    };
    const team = {memberUids: ["ana", "bruno", "carla"]};

    it("grava por uid pra qualquer membro do elenco", () => {
      assert.equal(resolveUniformSlot(registration, team, "ana"), "byUid");
      assert.equal(resolveUniformSlot(registration, team, "carla"), "byUid");
    });

    it("nega quem não é do elenco", () => {
      assert.equal(resolveUniformSlot(registration, team, "diego"), null);
    });

    it("segue por uid enquanto a equipe ainda não tem doc", () => {
      const {teamId: _teamId, ...withoutTeam} = registration;
      assert.equal(resolveUniformSlot(withoutTeam, null, "bruno"), "byUid");
    });
  });

  it("nega inscrição ausente ou uid vazio", () => {
    assert.equal(resolveUniformSlot(null, null, "ana"), null);
    assert.equal(resolveUniformSlot(soloRegistration("ana"), null, "  "), null);
  });
});
