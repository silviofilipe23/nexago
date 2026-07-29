import assert from "node:assert/strict";
import {test} from "node:test";

import {
  computeReferralBonusAward,
  referralBonusEventId,
  resolveReferralRegistration,
  shouldAwardReferralFirstGameBonus,
} from "./athlete-referral";

test("referralBonusEventId is stable per referred athlete", () => {
  assert.equal(referralBonusEventId(" athlete-1 "), "referral_bonus_athlete-1");
});

// —— registerReferral: resolveReferralRegistration ——

test("resolveReferralRegistration applies on the 1st call (referredBy ainda não setado)", () => {
  const decision = resolveReferralRegistration({
    callerUid: "new-athlete",
    referralCode: "referrer-uid",
    currentReferredBy: undefined,
    referrerExists: true,
  });
  assert.deepEqual(decision, {apply: true});
});

test("resolveReferralRegistration ignora a 2ª chamada (já setado, nunca sobrescreve)", () => {
  const decision = resolveReferralRegistration({
    callerUid: "new-athlete",
    referralCode: "another-referrer",
    currentReferredBy: "referrer-uid",
    referrerExists: true,
  });
  assert.deepEqual(decision, {apply: false, rejection: "ALREADY_SET"});
});

test("resolveReferralRegistration rejeita auto-indicação", () => {
  const decision = resolveReferralRegistration({
    callerUid: "athlete-1",
    referralCode: "athlete-1",
    currentReferredBy: undefined,
    referrerExists: true,
  });
  assert.deepEqual(decision, {apply: false, rejection: "SELF_REFERRAL"});
});

test("resolveReferralRegistration rejeita código vazio", () => {
  const decision = resolveReferralRegistration({
    callerUid: "athlete-1",
    referralCode: "   ",
    currentReferredBy: undefined,
    referrerExists: true,
  });
  assert.deepEqual(decision, {apply: false, rejection: "MISSING_CODE"});
});

test("resolveReferralRegistration rejeita indicador inexistente", () => {
  const decision = resolveReferralRegistration({
    callerUid: "athlete-1",
    referralCode: "nao-existe",
    currentReferredBy: undefined,
    referrerExists: false,
  });
  assert.deepEqual(decision, {apply: false, rejection: "REFERRER_NOT_FOUND"});
});

// —— Âncora de crédito: 1ª partida concluída ——

test("shouldAwardReferralFirstGameBonus dispara na transição 0 -> 1 de totalGames", () => {
  assert.equal(
    shouldAwardReferralFirstGameBonus({totalGames: 0}, {totalGames: 1}),
    true,
  );
});

test("shouldAwardReferralFirstGameBonus dispara quando o summary nasce direto com totalGames: 1", () => {
  // Doc de summary sem estado anterior (before undefined) equivale a totalGames 0 -> 1.
  assert.equal(shouldAwardReferralFirstGameBonus(undefined, {totalGames: 1}), true);
});

test("shouldAwardReferralFirstGameBonus ignora a 2ª partida em diante", () => {
  assert.equal(
    shouldAwardReferralFirstGameBonus({totalGames: 1}, {totalGames: 2}),
    false,
  );
});

test("shouldAwardReferralFirstGameBonus ignora escritas que não mudam totalGames (ex.: sync de elo)", () => {
  assert.equal(
    shouldAwardReferralFirstGameBonus(
      {totalGames: 1, sandRankTrackIndex: 0},
      {totalGames: 1, sandRankTrackIndex: 1},
    ),
    false,
  );
});

// —— computeReferralBonusAward: idempotência do crédito de XP ——

test("computeReferralBonusAward credita XP pro indicador quando ainda não creditado", () => {
  const result = computeReferralBonusAward({
    alreadyCredited: false,
    currentXp: 100,
    currentReferralsCount: 0,
  });
  assert.deepEqual(result, {
    award: true,
    nextXp: 150,
    nextLevel: 1,
    nextReferralsCount: 1,
  });
});

test("computeReferralBonusAward NÃO credita 2x se o evento já existir", () => {
  const result = computeReferralBonusAward({
    alreadyCredited: true,
    currentXp: 150,
    currentReferralsCount: 1,
  });
  assert.deepEqual(result, {
    award: false,
    nextXp: 150,
    nextLevel: 1,
    nextReferralsCount: 1,
  });
});

test("computeReferralBonusAward trata summary ausente (novo indicador) como zero", () => {
  const result = computeReferralBonusAward({
    alreadyCredited: false,
    currentXp: undefined,
    currentReferralsCount: undefined,
  });
  assert.deepEqual(result, {
    award: true,
    nextXp: 50,
    nextLevel: 0,
    nextReferralsCount: 1,
  });
});
