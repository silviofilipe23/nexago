import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {SCORING_VECTORS} from "./vectors.generated";
import {
  effectiveScoringProfile,
  legacyScoringProfile,
  matchWinnerSide,
  normalizeQuickSet,
  quickSetKind,
  scoringRulesLabel,
  setTargetLabel,
  scoringProfileFromRaw,
  scoringProfileOfMatch,
  setWinnerSide,
  validateScoreSets,
} from "./scoring";

describe("sports/scoring · vetores compartilhados com app e portais", () => {
  for (const [i, c] of SCORING_VECTORS.cases.entries()) {
    it(`caso ${i} (${c.profile})`, () => {
      const profile = scoringProfileFromRaw(SCORING_VECTORS.profiles[c.profile]);
      assert.ok(profile, `perfil ${c.profile} não parseou`);
      assert.deepEqual(c.sets.map((_, idx) => setWinnerSide(c.sets, idx, profile)), c.setWinners);
      assert.equal(matchWinnerSide(c.sets, profile), c.matchWinner);
      assert.deepEqual(validateScoreSets(c.sets, profile).map((x) => x.message), c.issues);
    });
  }
});

describe("sports/scoring · perfil da partida", () => {
  it("sem carimbo usa a regra histórica com o bestOf do doc", () => {
    assert.deepEqual(scoringProfileOfMatch({bestOf: 1}), legacyScoringProfile(1));
    assert.deepEqual(scoringProfileOfMatch({}), legacyScoringProfile(3));
  });

  it("carimbo malformado cai no histórico em vez de lançar", () => {
    for (const bad of [
      {kind: "sets_points", bestOf: 2, setTarget: 21, decidingSetTarget: 15, winBy: 2, pointCap: null},
      {kind: "sets_points", bestOf: 3, setTarget: 21},
      {kind: "single_score", bestOf: 1},
      "x",
      null,
    ]) {
      assert.deepEqual(scoringProfileOfMatch({scoringProfile: bad, bestOf: 3}), legacyScoringProfile(3));
    }
  });

  it("histórico: decisivo 15 só em MD3", () => {
    assert.equal(legacyScoringProfile(3).decidingSetTarget, 15);
    assert.equal(legacyScoringProfile(5).decidingSetTarget, 21);
    assert.equal(legacyScoringProfile(1).decidingSetTarget, 21);
  });
});

describe("sports/scoring · rótulos e lançamento rápido (vetores)", () => {
  for (const v of SCORING_VECTORS.labelVectors) {
    it(`rótulos ${v.profile}`, () => {
      const p = scoringProfileFromRaw(SCORING_VECTORS.profiles[v.profile])!;
      assert.equal(scoringRulesLabel(p), v.rulesLabel);
      assert.deepEqual(v.setLabels.map((_, i) => setTargetLabel(p, i)), v.setLabels);
    });
  }
  for (const [i, v] of SCORING_VECTORS.quickVectors.entries()) {
    it(`linha de set ${i} (${v.profile})`, () => {
      const p = scoringProfileFromRaw(SCORING_VECTORS.profiles[v.profile])!;
      assert.equal(quickSetKind(p, v.index, v.set), v.kind);
      assert.deepEqual(normalizeQuickSet(p, v.index, v.set), v.normalized);
    });
  }
  it("perfil efetivo: carimbo com o bestOf da tela; sem carimbo, histórico", () => {
    const bt = SCORING_VECTORS.profiles["bt3"];
    const p = effectiveScoringProfile(bt, 1);
    assert.equal(p.kind, "sets_games");
    assert.equal(p.bestOf, 1);
    assert.deepEqual(effectiveScoringProfile(undefined, 1), legacyScoringProfile(1));
    assert.deepEqual(effectiveScoringProfile({kind: "x"}, "abc"), legacyScoringProfile(3));
  });
});
