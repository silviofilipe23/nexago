import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  buildTournamentRegistrationExternalReference,
  computeTeamGenderLabel,
  computeTournamentShareAmountReais,
  isFreeRegistrationFullyConfirmed,
  normalizeAthleteGenderBucket,
  parseTournamentRegistrationExternalReference,
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
});
