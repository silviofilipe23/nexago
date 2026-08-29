import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  buildTournamentRegistrationExternalReference,
  canChargeTournamentFull,
  computeTeamGenderLabel,
  computeTournamentShareAmountReais,
  isFreeRegistrationFullyConfirmed,
  isDirectWithOrganizerPaymentMode,
  normalizeAthleteGenderBucket,
  parseTournamentRegistrationExternalReference,
  registrationAthleteUids,
  resolveDirectReservationMarks,
  resolveTournamentChargeReais,
  resolveTournamentRegistrationCredit,
  sharePaidUidsFromRegistration,
} from "./tournament-registration-pix-helpers";

describe("tournament-registration-pix-helpers", () => {
  it("builds and parses external reference", () => {
    const ref = buildTournamentRegistrationExternalReference("reg1", "uidA");
    assert.equal(ref, "tournamentRegistration:reg1:uidA");
    assert.deepEqual(parseTournamentRegistrationExternalReference(ref), {
      registrationId: "reg1",
      payerUid: "uidA",
    });
  });

  it("returns null for invalid reference", () => {
    assert.equal(parseTournamentRegistrationExternalReference("arenaBooking:x"), null);
    assert.equal(parseTournamentRegistrationExternalReference("tournamentRegistration:"), null);
    assert.equal(
      parseTournamentRegistrationExternalReference("tournamentRegistration:onlyId"),
      null,
    );
  });

  it("computes share amount", () => {
    assert.equal(computeTournamentShareAmountReais(160), 80);
    assert.equal(computeTournamentShareAmountReais(0), 0);
    assert.equal(computeTournamentShareAmountReais(99), 49.5);
  });

  it("reads sharePaidUids from registration data", () => {
    assert.deepEqual(sharePaidUidsFromRegistration({}), []);
    assert.deepEqual(
      sharePaidUidsFromRegistration({sharePaidUids: ["a", "", 1, "b"]}),
      ["a", "b"],
    );
  });

  it("detects directWithOrganizer payment mode", () => {
    assert.equal(isDirectWithOrganizerPaymentMode("directWithOrganizer"), true);
    assert.equal(isDirectWithOrganizerPaymentMode(" appPixCard "), false);
    assert.equal(isDirectWithOrganizerPaymentMode(null), false);
  });

  it("normalizes athlete gender buckets", () => {
    assert.equal(normalizeAthleteGenderBucket("Masculino"), "M");
    assert.equal(normalizeAthleteGenderBucket("Feminino"), "F");
    assert.equal(normalizeAthleteGenderBucket(""), null);
  });

  it("computes team gender label", () => {
    assert.equal(computeTeamGenderLabel("M", "M"), "Masculino");
    assert.equal(computeTeamGenderLabel("F", "F"), "Feminino");
    assert.equal(computeTeamGenderLabel("M", "F"), "Misto");
    assert.equal(computeTeamGenderLabel("M", null), null);
  });

  it("detects free registration fully confirmed", () => {
    assert.equal(
      isFreeRegistrationFullyConfirmed(["a", "b"], ["a"]),
      false,
    );
    assert.equal(
      isFreeRegistrationFullyConfirmed(["a", "b"], ["a", "b"]),
      true,
    );
    assert.equal(isFreeRegistrationFullyConfirmed(["a"], ["a"]), false);
  });

  it("resolves charge amount by type (share vs full)", () => {
    assert.equal(resolveTournamentChargeReais(100, "share"), 50);
    assert.equal(resolveTournamentChargeReais(100, "full"), 100);
    assert.equal(resolveTournamentChargeReais(0, "full"), 0);
    assert.equal(resolveTournamentChargeReais(-10, "share"), 0);
  });

  it("blocks full charge when there is a partial payment", () => {
    assert.equal(
      canChargeTournamentFull({paidAmount: 0, sharePaidUids: []}),
      true,
    );
    assert.equal(
      canChargeTournamentFull({paidAmount: 50, sharePaidUids: ["a"]}),
      false,
    );
    assert.equal(
      canChargeTournamentFull({paidAmount: 0, sharePaidUids: ["a"]}),
      false,
    );
  });

  it("credits full payment and confirms the pair", () => {
    const full = resolveTournamentRegistrationCredit({
      entryFee: 100,
      amountType: "full",
      currentPaidAmount: 0,
    });
    assert.equal(full.credit, 100);
    assert.equal(full.newPaidAmount, 100);
    assert.equal(full.isPaid, true);
  });

  it("credits a single share and confirms only when both paid", () => {
    const first = resolveTournamentRegistrationCredit({
      entryFee: 100,
      amountType: "share",
      currentPaidAmount: 0,
    });
    assert.equal(first.credit, 50);
    assert.equal(first.isPaid, false);

    const second = resolveTournamentRegistrationCredit({
      entryFee: 100,
      amountType: "share",
      currentPaidAmount: 50,
    });
    assert.equal(second.newPaidAmount, 100);
    assert.equal(second.isPaid, true);
  });

  it("direct share reservation marks only the caller and stays open while roster is incomplete", () => {
    const marks = resolveDirectReservationMarks({
      amountType: "share",
      callerUid: "solo",
      teamUids: ["solo"],
      sharePaidUids: [],
      expectedSize: 2,
    });
    assert.deepEqual(marks.uidsToMark, ["solo"]);
    assert.equal(marks.registrationClosed, false);
  });

  it("direct share reservation closes when the second athlete of the pair declares", () => {
    const marks = resolveDirectReservationMarks({
      amountType: "share",
      callerUid: "b",
      teamUids: ["a", "b"],
      sharePaidUids: ["a"],
      expectedSize: 2,
    });
    assert.deepEqual(marks.uidsToMark, ["b"]);
    assert.equal(marks.registrationClosed, true);
  });

  it("direct full reservation closes a solo registration (spot guaranteed, partner joins free)", () => {
    const marks = resolveDirectReservationMarks({
      amountType: "full",
      callerUid: "solo",
      teamUids: ["solo"],
      sharePaidUids: [],
      expectedSize: 2,
    });
    assert.deepEqual(marks.uidsToMark, ["solo"]);
    assert.equal(marks.registrationClosed, true);
  });

  it("direct full reservation marks the whole roster of a closed pair", () => {
    const marks = resolveDirectReservationMarks({
      amountType: "full",
      callerUid: "a",
      teamUids: ["a", "b"],
      sharePaidUids: [],
      expectedSize: 2,
    });
    assert.deepEqual([...marks.uidsToMark].sort(), ["a", "b"]);
    assert.equal(marks.registrationClosed, true);
  });

  it("resolves athlete uids from the registration when there is no team yet", () => {
    const uids = registrationAthleteUids(
      {player1Id: "solo-uid", participantUids: ["solo-uid"]},
      null,
    );
    assert.deepEqual(uids, ["solo-uid"]);
  });

  it("resolves athlete uids from the team when a team exists, ignoring stale participantUids", () => {
    const uids = registrationAthleteUids(
      {player1Id: "old-uid", participantUids: ["old-uid"]},
      {player1Id: "p1", player2Id: "p2"},
    );
    assert.deepEqual(uids, ["p1", "p2"]);
  });

  it("resolves only player1 when the team has no player2 yet", () => {
    const uids = registrationAthleteUids(
      {player1Id: "old-uid"},
      {player1Id: "p1", player2Id: ""},
    );
    assert.deepEqual(uids, ["p1"]);
  });
});
