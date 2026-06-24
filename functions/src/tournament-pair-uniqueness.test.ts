import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  buildPairKey,
  findRegistrationConflict,
  pairAlreadyRegistered,
  parseCategoryRegistration,
} from "./tournament-pair-uniqueness";

describe("tournament-pair-uniqueness", () => {
  it("buildPairKey normalizes order", () => {
    assert.equal(buildPairKey("b", "a"), "a:b");
    assert.equal(buildPairKey("a", "b"), "a:b");
    assert.equal(buildPairKey("a", "a"), "");
  });

  it("parseCategoryRegistration handles complete team", () => {
    const parsed = parseCategoryRegistration(
      "reg-1",
      {
        categoryId: "Misto",
        teamId: "t1",
        participantUids: ["uid-a", "uid-b"],
        partnerPending: false,
      },
      {player1Id: "uid-a", player2Id: "uid-b"},
    );
    assert.equal(parsed.isComplete, true);
    assert.equal(parsed.pairKey, "uid-a:uid-b");
  });

  it("parseCategoryRegistration handles solo pending", () => {
    const parsed = parseCategoryRegistration(
      "solo-1",
      {
        categoryId: "Misto",
        player1Id: "uid-a",
        participantUids: ["uid-a"],
        partnerPending: true,
      },
      null,
    );
    assert.equal(parsed.isComplete, false);
    assert.equal(parsed.pairKey, null);
  });

  it("findRegistrationConflict blocks duplicate pair in any order", () => {
    const existing = parseCategoryRegistration(
      "reg-1",
      {
        participantUids: ["uid-b", "uid-a"],
        partnerPending: false,
      },
      {player1Id: "uid-b", player2Id: "uid-a"},
    );
    const conflict = findRegistrationConflict(
      [existing],
      "uid-a",
      "uid-b",
    );
    assert.equal(conflict?.role, "pair");
    assert.match(conflict?.message ?? "", /dupla com vocês dois/);
  });

  it("findRegistrationConflict ignores attach target solo", () => {
    const solo = parseCategoryRegistration(
      "solo-1",
      {
        player1Id: "uid-a",
        participantUids: ["uid-a"],
        partnerPending: true,
      },
      null,
    );
    const conflict = findRegistrationConflict(
      [solo],
      "uid-a",
      "uid-b",
      {ignoreRegistrationId: "solo-1"},
    );
    assert.equal(conflict, null);
  });

  it("findRegistrationConflict blocks inviter with complete registration", () => {
    const existing = parseCategoryRegistration(
      "reg-1",
      {
        participantUids: ["uid-a", "uid-c"],
        partnerPending: false,
      },
      {player1Id: "uid-a", player2Id: "uid-c"},
    );
    const conflict = findRegistrationConflict(
      [existing],
      "uid-a",
      "uid-b",
    );
    assert.equal(conflict?.role, "inviter");
  });

  it("findRegistrationConflict blocks invitee already registered", () => {
    const existing = parseCategoryRegistration(
      "reg-1",
      {
        participantUids: ["uid-c", "uid-b"],
        partnerPending: false,
      },
      {player1Id: "uid-c", player2Id: "uid-b"},
    );
    const conflict = findRegistrationConflict(
      [existing],
      "uid-a",
      "uid-b",
    );
    assert.equal(conflict?.role, "invitee");
  });

  it("findRegistrationConflict blocks invitee with solo pending", () => {
    const solo = parseCategoryRegistration(
      "solo-b",
      {
        player1Id: "uid-b",
        participantUids: ["uid-b"],
        partnerPending: true,
      },
      null,
    );
    const conflict = findRegistrationConflict(
      [solo],
      "uid-a",
      "uid-b",
    );
    assert.equal(conflict?.role, "invitee");
  });

  it("findRegistrationConflict blocks create invite when inviter has solo", () => {
    const solo = parseCategoryRegistration(
      "solo-a",
      {
        player1Id: "uid-a",
        participantUids: ["uid-a"],
        partnerPending: true,
      },
      null,
    );
    const conflict = findRegistrationConflict(
      [solo],
      "uid-a",
      "uid-b",
    );
    assert.equal(conflict?.role, "inviter");
  });

  it("pairAlreadyRegistered detects existing complete pair", () => {
    const existing = parseCategoryRegistration(
      "reg-1",
      {
        participantUids: ["uid-a", "uid-b"],
        partnerPending: false,
      },
      {player1Id: "uid-a", player2Id: "uid-b"},
    );
    assert.equal(pairAlreadyRegistered([existing], "uid-b", "uid-a"), true);
    assert.equal(pairAlreadyRegistered([existing], "uid-a", "uid-c"), false);
  });
});
