import assert from "node:assert/strict";
import {test} from "node:test";

import {
  achievementEventId,
  computeProfileRewardContext,
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
    goals: ["compete"],
  });

  assert.equal(ctx.stepDone.photo, true);
  assert.equal(ctx.stepDone.sport_level, true);
  assert.equal(ctx.stepDone.city, true);
  assert.equal(ctx.stepDone.whatsapp, true);
  assert.equal(ctx.stepDone.goals, true);
  assert.equal(ctx.allStepsComplete, true);
});

test("cidade legada com separador · conta como UF presente", () => {
  const ctx = computeProfileRewardContext({
    city: "Florianópolis · SC",
    sport: "Beach tennis",
  });

  assert.equal(ctx.stepDone.city, true);
  assert.equal(ctx.stepDone.sport_level, true);
});
