import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  INDIVIDUAL_NO_PARTNER_MESSAGE,
  assertCategoryAcceptsPartner,
  individualRegistrationFields,
  individualTeamData,
} from "./tournament-individual-registration";

describe("inscrição individual (fase 4a)", () => {
  it("equipe de 1: memberUids com o atleta, player2Id vazio, teamSize 1", () => {
    const team = individualTeamData({uid: "a1", tournamentId: "T1", categoryId: "C1"});
    assert.deepEqual(team.memberUids, ["a1"]);
    assert.equal(team.player1Id, "a1");
    assert.equal(team.player2Id, "");
    assert.equal(team.captainUid, "a1");
    assert.equal(team.teamSize, 1);
    assert.equal(team.tournamentId, "T1");
    assert.equal(team.categoryId, "C1");
  });

  it("inscrição já completa: teamId, teamSize 1, sem parceiro pendente", () => {
    assert.deepEqual(individualRegistrationFields("team-1"), {
      teamId: "team-1",
      teamSize: 1,
      partnerPending: false,
    });
  });

  it("convite de parceiro é recusado só em categoria individual", () => {
    assert.throws(
      () => assertCategoryAcceptsPartner({teamSize: 1}),
      (e: {code?: string; message?: string}) =>
        e.code === "failed-precondition" && e.message === INDIVIDUAL_NO_PARTNER_MESSAGE,
    );
    assert.doesNotThrow(() => assertCategoryAcceptsPartner({}));
    assert.doesNotThrow(() => assertCategoryAcceptsPartner({disputeType: "individual"}));
    assert.doesNotThrow(() => assertCategoryAcceptsPartner({teamSize: 3}));
  });
});
