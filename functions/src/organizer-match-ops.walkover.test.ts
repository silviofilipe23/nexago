import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {FieldValue} from "firebase-admin/firestore";
import {walkoverFields} from "./organizer-match-ops";

/**
 * W.O. declarado numa partida que JÁ estava ao vivo: o resíduo do placar (sets
 * parciais, game, saque, atendimento) não pode ficar no doc. As telas e a
 * classificação do grupo preferem `sets` a `resultA/B = "W.O."` — a dupla que
 * vencia o 1º set e levou W.O. apareceria com saldo de set a favor.
 */
describe("walkoverFields", () => {
  const match = {teamAId: "tA", teamBId: "tB"};

  it("grava vencedor, W.O. e check-in do ausente", () => {
    const patch = walkoverFields({match, winnerTeamId: "tB", uid: "org-1"});
    assert.equal(patch.winnerId, "tB");
    assert.equal(patch.status, "Completed");
    assert.equal(patch.resultA, "0");
    assert.equal(patch.resultB, "W.O.");
    assert.equal(patch.queueStatus, "completed");
    const checkIn = patch.checkIn as Record<string, {status: string}>;
    assert.equal(checkIn.teamA.status, "wo");
    assert.equal(checkIn.teamB.status, "present");
  });

  it("apaga o resíduo do ao vivo (placar parcial, game, saque, atendimento)", () => {
    const patch = walkoverFields({match, winnerTeamId: "tA", uid: "org-1"});
    for (const key of [
      "sets",
      "liveScore",
      "currentGame",
      "currentSetIndex",
      "servingTeamId",
      "servingPlayerSlot",
      "servingPlayerSlots",
      "medicalTimeout",
    ]) {
      assert.ok(patch[key] instanceof FieldValue, `${key} precisa ser apagado`);
    }
  });
});
