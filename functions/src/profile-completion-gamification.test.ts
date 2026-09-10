import assert from "node:assert/strict";
import {test} from "node:test";

import {
  achievementEventId,
  computeProfileRewardContext,
  profileGamificationFieldsChanged,
  profileStepEventId,
} from "./profile-completion-gamification";

test("profileStepEventId usa ids estáveis", () => {
  assert.equal(profileStepEventId("photo"), "profile_step_photo");
  assert.equal(
    achievementEventId("PROFILE_COMPLETE"),
    "achievement_PROFILE_COMPLETE",
  );
});

test("detecta passos concluídos a partir do documento do usuário", () => {
  const ctx = computeProfileRewardContext({
    avatarUrl: "https://cdn.example/avatar.jpg",
    sport: "Vôlei de praia",
    city: "Florianópolis",
    state: "SC",
    phoneNumber: "(48) 99999-8888",
    phoneVerified: true,
    goals: ["compete"],
  });

  assert.equal(ctx.stepDone.photo, true);
  assert.equal(ctx.stepDone.sport_level, true);
  assert.equal(ctx.stepDone.city, true);
  assert.equal(ctx.stepDone.whatsapp, true);
  assert.equal(ctx.stepDone.goals, true);
  assert.equal(ctx.allStepsComplete, true);
});

test("telefone com formato válido mas não verificado não conta o passo whatsapp", () => {
  const ctx = computeProfileRewardContext({
    avatarUrl: "https://cdn.example/avatar.jpg",
    sport: "Vôlei de praia",
    city: "Florianópolis",
    state: "SC",
    phoneNumber: "(48) 99999-8888",
    goals: ["compete"],
  });

  assert.equal(ctx.stepDone.whatsapp, false);
  assert.equal(ctx.allStepsComplete, false);
});

test("cidade legada com separador · conta como UF presente", () => {
  const ctx = computeProfileRewardContext({
    city: "Florianópolis · SC",
    sport: "Beach tennis",
  });

  assert.equal(ctx.stepDone.city, true);
  assert.equal(ctx.stepDone.sport_level, true);
});

test("profileGamificationFieldsChanged ignora só updatedAt", () => {
  const before = {city: "Goiânia", updatedAt: "t1"};
  const after = {city: "Goiânia", updatedAt: "t2"};
  assert.equal(profileGamificationFieldsChanged(before, after), false);

  const afterCity = {city: "Anápolis", updatedAt: "t2"};
  assert.equal(profileGamificationFieldsChanged(before, afterCity), true);
});

test("foto gravada pelo app (profilePhotoUrl) conta o passo photo", () => {
  // O app e o portal só gravam `profilePhotoUrl` (AthleteProfile.toMap);
  // `avatarUrl` é campo legado que nenhuma superfície escreve.
  const ctx = computeProfileRewardContext({
    profilePhotoUrl: "https://cdn.example/foto.jpg",
    sport: "Beach tennis",
    city: "Goiânia",
    state: "GO",
    phoneNumber: "(62) 99999-8888",
    phoneVerified: true,
    goals: ["compete"],
  });

  assert.equal(ctx.stepDone.photo, true);
  assert.equal(ctx.allStepsComplete, true);
  assert.equal(ctx.onboardingCompleted, true);
});

test("foto herdada do provedor social (photoURL) conta o passo photo", () => {
  const ctx = computeProfileRewardContext({
    photoURL: "https://lh3.googleusercontent.com/a/foto",
  });

  assert.equal(ctx.stepDone.photo, true);
});

test("sem nenhuma variante de foto o passo photo fica pendente", () => {
  const ctx = computeProfileRewardContext({
    profilePhotoUrl: "   ",
    avatarUrl: "",
    sport: "Beach tennis",
  });

  assert.equal(ctx.stepDone.photo, false);
  assert.equal(ctx.allStepsComplete, false);
});

test("gatilho observa as três variantes de foto", () => {
  for (const field of ["profilePhotoUrl", "avatarUrl", "photoURL"]) {
    assert.equal(
      profileGamificationFieldsChanged({}, {[field]: "https://cdn.example/f.jpg"}),
      true,
      `campo ${field} deveria disparar a sincronização`,
    );
  }
});
