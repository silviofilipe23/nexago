import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  canAccessOfficialTournaments,
  isOnboardingCompleted,
  isProfileStepsComplete,
  isValidWhatsApp,
  missingProfileStepIds,
  tournamentAccessBlockMessage,
} from "./athlete-tournament-access";

const completeProfile = {
  isProfileComplete: true,
  profilePhotoUrl: "https://example.com/a.jpg",
  sport: "Vôlei de praia",
  level: "Iniciante",
  city: "Goiânia",
  state: "GO",
  phoneNumber: "(62) 99999-9999",
  goals: ["RESERVAR_ARENA"],
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

  it("requires all five profile steps", () => {
    assert.equal(isProfileStepsComplete(completeProfile), true);
    assert.equal(
      isProfileStepsComplete({...completeProfile, profilePhotoUrl: ""}),
      false,
    );
    assert.equal(
      isProfileStepsComplete({...completeProfile, goals: []}),
      false,
    );
    assert.equal(
      isProfileStepsComplete({...completeProfile, city: "", state: ""}),
      false,
    );
  });

  it("combines onboarding and profile steps", () => {
    assert.equal(canAccessOfficialTournaments(completeProfile), true);
    assert.equal(
      canAccessOfficialTournaments({
        ...completeProfile,
        isProfileComplete: false,
        onboardingCompleted: false,
      }),
      false,
    );
    assert.equal(
      canAccessOfficialTournaments({
        onboardingCompleted: true,
        profilePhotoUrl: "https://example.com/a.jpg",
      }),
      false,
    );
  });

  it("lists missing profile steps", () => {
    assert.deepEqual(
      missingProfileStepIds({
        onboardingCompleted: true,
        profilePhotoUrl: "https://example.com/a.jpg",
      }),
      ["sportLevel", "city", "whatsapp", "goals"],
    );
    assert.deepEqual(missingProfileStepIds(completeProfile), []);
  });

  it("returns block messages", () => {
    assert.equal(tournamentAccessBlockMessage(completeProfile), "");
    assert.match(
      tournamentAccessBlockMessage({}),
      /cadastro inicial/i,
    );
    assert.match(
      tournamentAccessBlockMessage({onboardingCompleted: true}),
      /Complete no perfil:/i,
    );
    assert.match(
      tournamentAccessBlockMessage({
        onboardingCompleted: true,
        profilePhotoUrl: "https://example.com/a.jpg",
      }),
      /esporte e nível.*WhatsApp/i,
    );
  });
});
