import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  athleteAlreadyRegistered,
  isTeamCompleteForBracket,
  resolveInviteRegistrationAction,
  type InviterCategoryRegistration,
} from "./tournament-solo-registration";

function reg(
  over: Partial<InviterCategoryRegistration>,
): InviterCategoryRegistration {
  return {
    registrationId: "r1",
    teamId: "t1",
    isPlayer1: false,
    isMember: false,
    partnerPending: false,
    ...over,
  };
}

describe("tournament-solo-registration", () => {
  it("creates a new registration when athlete has none", () => {
    assert.deepEqual(resolveInviteRegistrationAction([]), {kind: "create"});
  });

  it("attaches to the athlete's solo (partnerPending) registration", () => {
    const action = resolveInviteRegistrationAction([
      reg({
        registrationId: "solo-1",
        teamId: "team-1",
        isPlayer1: true,
        isMember: true,
        partnerPending: true,
      }),
    ]);
    assert.deepEqual(action, {
      kind: "attach",
      registrationId: "solo-1",
      teamId: "team-1",
    });
  });

  it("blocks when athlete already has a complete registration", () => {
    const action = resolveInviteRegistrationAction([
      reg({isMember: true, partnerPending: false}),
    ]);
    assert.deepEqual(action, {kind: "blocked"});
  });

  it("does not attach to a solo where the athlete is only player2", () => {
    const action = resolveInviteRegistrationAction([
      reg({isPlayer1: false, isMember: true, partnerPending: true}),
    ]);
    // membro de uma inscrição solo mas não é o player1: não bloqueia nem anexa.
    assert.deepEqual(action, {kind: "create"});
  });

  it("athleteAlreadyRegistered reflects membership", () => {
    assert.equal(athleteAlreadyRegistered([]), false);
    assert.equal(athleteAlreadyRegistered([reg({isMember: true})]), true);
  });

  it("isTeamCompleteForBracket requires both players", () => {
    assert.equal(
      isTeamCompleteForBracket({player1Id: "a", player2Id: "b"}),
      true,
    );
    assert.equal(isTeamCompleteForBracket({player1Id: "a", player2Id: ""}), false);
    assert.equal(isTeamCompleteForBracket({player1Id: "a"}), false);
  });
});
