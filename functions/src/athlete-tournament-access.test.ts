import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  canAccessOfficialTournaments,
  isOnboardingCompleted,
  isTournamentProfileReady,
  isValidWhatsApp,
  missingTournamentProfileRequirementIds,
  tournamentAccessBlockMessage,
} from "./athlete-tournament-access";

const tournamentReadyProfile = {
  onboardingCompleted: true,
  city: "Goiânia",
  phoneNumber: "(62) 99999-9999",
};

const legacyCompleteProfile = {
  isProfileComplete: true,
};

describe("athlete-tournament-access", () => {
  it("validates whatsapp digits", () => {
    assert.equal(isValidWhatsApp("(62) 99999-9999"), true);
    assert.equal(isValidWhatsApp("+55 62 99999-9999"), true);
    assert.equal(isValidWhatsApp("123"), false);
  });

  it("requires onboarding for tournament access", () => {
    assert.equal(isOnboardingCompleted({onboardingCompleted: true}), true);
    assert.equal(
      isOnboardingCompleted({
        sportOnboarding: {completedAt: "2026-01-01"},
      }),
      true,
    );
    assert.equal(isOnboardingCompleted({}), false);
  });

  it("requires onboarding, whatsapp and city for tournament profile", () => {
    assert.equal(isTournamentProfileReady(tournamentReadyProfile), true);
    assert.equal(
      isTournamentProfileReady({
        ...tournamentReadyProfile,
        phoneNumber: "",
      }),
      false,
    );
    assert.equal(
      isTournamentProfileReady({
        onboardingCompleted: true,
        phoneNumber: "(62) 99999-9999",
      }),
      false,
    );
    assert.equal(
      isTournamentProfileReady({
        onboardingCompleted: true,
        city: "Goiânia GO",
        phoneNumber: "(62) 99999-9999",
      }),
      true,
    );
  });

  it("does not require photo, sport or goals for tournament access", () => {
    assert.equal(
      canAccessOfficialTournaments({
        onboardingCompleted: true,
        city: "Goiânia",
        phoneNumber: "(62) 99999-9999",
      }),
      true,
    );
    assert.equal(canAccessOfficialTournaments(legacyCompleteProfile), true);
    assert.equal(
      canAccessOfficialTournaments({
        ...legacyCompleteProfile,
        onboardingCompleted: false,
      }),
      true,
    );
  });

  it("lists missing tournament requirements", () => {
    assert.deepEqual(
      missingTournamentProfileRequirementIds({
        onboardingCompleted: true,
      }),
      ["whatsapp", "city"],
    );
    assert.deepEqual(
      missingTournamentProfileRequirementIds(tournamentReadyProfile),
      [],
    );
  });

  it("returns block messages", () => {
    assert.equal(tournamentAccessBlockMessage(tournamentReadyProfile), "");
    assert.match(
      tournamentAccessBlockMessage({}),
      /cadastro inicial/i,
    );
    assert.match(
      tournamentAccessBlockMessage({
        onboardingCompleted: true,
      }),
      /WhatsApp.*cidade/i,
    );
    assert.match(
      tournamentAccessBlockMessage({
        onboardingCompleted: true,
        city: "Goiânia",
      }),
      /WhatsApp/i,
    );
  });
});
