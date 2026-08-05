import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  buildPairKey,
  parseCategoryRegistration,
  registrationConflictMessage,
} from "./tournament-pair-uniqueness";

// Bloqueio e fusão de convite são decididos em resolvePartnerRegistrationPlan
// (ver tournament-solo-registration.test.ts). Aqui fica só a leitura do doc.

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
    assert.equal(parsed.ownerUid, "uid-a");
    assert.equal(parsed.teamId, "t1");
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
    assert.equal(parsed.ownerUid, "uid-a");
    assert.equal(parsed.teamId, "");
  });

  it("parseCategoryRegistration expõe dono, pagamento e fila da reserva", () => {
    const parsed = parseCategoryRegistration(
      "solo-1",
      {
        player1Id: "uid-a",
        participantUids: ["uid-a"],
        partnerPending: true,
        isPaid: true,
        waitlist: true,
        createdAt: 1234,
      },
      null,
    );
    assert.equal(parsed.ownerUid, "uid-a");
    assert.equal(parsed.isPaid, true);
    assert.equal(parsed.waitlist, true);
    assert.equal(parsed.createdAtMs, 1234);
  });

  it("parseCategoryRegistration lê createdAt de Timestamp e Date", () => {
    const fromTimestamp = parseCategoryRegistration(
      "r1",
      {createdAt: {toMillis: () => 999}},
      null,
    );
    assert.equal(fromTimestamp.createdAtMs, 999);

    const fromDate = parseCategoryRegistration(
      "r2",
      {createdAt: new Date(1500)},
      null,
    );
    assert.equal(fromDate.createdAtMs, 1500);

    const missing = parseCategoryRegistration("r3", {}, null);
    assert.equal(missing.createdAtMs, null);
  });

  it("parseCategoryRegistration sem dono identificável deixa ownerUid vazio", () => {
    const parsed = parseCategoryRegistration(
      "legacy-1",
      {teamId: "t9", partnerPending: true, participantUids: ["uid-b"]},
      null,
    );
    assert.equal(parsed.ownerUid, "");
    assert.equal(parsed.isComplete, false);
  });

  it("registrationConflictMessage cobre todos os motivos", () => {
    assert.match(registrationConflictMessage("inviter"), /já possui inscrição/);
    assert.match(registrationConflictMessage("invitee"), /já está inscrito/);
    assert.match(registrationConflictMessage("pair"), /dupla com vocês dois/);
    assert.match(registrationConflictMessage("bothPaid"), /Fale com o organizador/);
  });
});
