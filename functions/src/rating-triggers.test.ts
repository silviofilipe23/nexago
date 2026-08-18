import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {shouldAuditSelfCorrectionDowngrade} from "./rating-triggers";
import type {AthleteRatingState} from "./rating-ladder";

const NOW = new Date("2026-08-17T12:00:00Z");

/** Atleta intermediario_1 consolidado (mesmo fixture de rating-ladder.test.ts). */
function state(overrides: Partial<AthleteRatingState> = {}): AthleteRatingState {
  return {
    athleteId: "a1",
    sportCode: "VOLEI_PRAIA",
    rating: 1600,
    rd: 90,
    volatility: 0.06,
    ratedMatches: 12,
    wins: 7,
    losses: 5,
    lastMatchAt: NOW,
    levelCode: "intermediario_1",
    levelRank: 2,
    zone: "stable",
    ladderState: "stable",
    observationStartedAt: null,
    observationMatches: 0,
    notifiedAt: null,
    protectedUntil: null,
    seededFromLevel: "intermediario_1",
    ...overrides,
  };
}

// F4 (review pós-calibração de nível): `onUserWrittenTrackLevelChanges` (rating-triggers.ts)
// reage a QUALQUER rebaixamento em `sportOnboarding.levelsBySport`, venha do próprio atleta
// (self-correction, dentro da janela) ou de um rebaixamento manual do admin via
// `setAthleteLevel` sem `athleteRatings` prévio pra pré-escrever (o "suporte remedy"
// documentado no topo de athlete-level-admin.ts). Sem doc de rating, o guard anti-eco de cima
// (`current.levelCode === newLevel.code`) nunca dispara, e sem esta guarda o trigger gravava
// uma `self_correction` espúria — atribuída ao ATLETA — ao lado da `admin_manual` correta.
describe("shouldAuditSelfCorrectionDowngrade", () => {
  it("sem doc de athleteRatings (current == null): não audita — ambíguo entre self-correction genuíno e admin sem rating pra pré-escrever", () => {
    assert.equal(shouldAuditSelfCorrectionDowngrade(null), false);
  });

  it("com doc de athleteRatings (mesmo com ratedMatches 0): audita — self-correction dentro da janela, sem ambiguidade", () => {
    assert.equal(shouldAuditSelfCorrectionDowngrade(state({ratedMatches: 0})), true);
  });

  it("com histórico de partidas rateadas: audita normalmente", () => {
    assert.equal(shouldAuditSelfCorrectionDowngrade(state({ratedMatches: 12})), true);
  });
});
