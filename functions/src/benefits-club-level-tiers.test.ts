import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  LEVEL_TIER_RANKS,
  SAND_RANK_CODES,
  levelTierFor,
  parseLevelTiers,
  sandRankCodeOf,
} from "./benefits-club-level-tiers";

const tier = (minRank: string, highlight = "15% OFF") => ({
  minRank,
  benefitHighlight: highlight,
  benefitTitle: `${highlight} para ${minRank}`,
});

describe("parseLevelTiers", () => {
  it("elos da escada e faixa só a partir do segundo", () => {
    assert.deepEqual(SAND_RANK_CODES, ["INICIANTE", "COMPETIDOR", "DESAFIANTE", "ELITE", "MESTRE", "LENDA"]);
    assert.deepEqual(LEVEL_TIER_RANKS, ["COMPETIDOR", "DESAFIANTE", "ELITE", "MESTRE", "LENDA"]);
  });

  it("ordena pela escada, uma faixa por elo, e ignora item malformado", () => {
    const parsed = parseLevelTiers([
      tier("ELITE", "20% OFF"),
      tier("COMPETIDOR", "10% OFF"),
      tier("ELITE", "99% OFF"),
      tier("INICIANTE"),
      {...tier("MESTRE"), benefitTitle: "  "},
      {...tier("LENDA"), benefitHighlight: "x".repeat(25)},
      "lixo",
    ]);
    assert.deepEqual(parsed.map((t) => [t.minRank, t.benefitHighlight]), [
      ["COMPETIDOR", "10% OFF"],
      ["ELITE", "20% OFF"],
    ]);
    assert.deepEqual(parseLevelTiers(undefined), []);
    assert.deepEqual(parseLevelTiers({}), []);
  });
});

describe("sandRankCodeOf", () => {
  it("lê o código do espelho; sem ele o degrau; sem nada o primeiro elo", () => {
    assert.equal(sandRankCodeOf({sandRank: {code: "ELITE", trackIndex: 9}}), "ELITE");
    assert.equal(sandRankCodeOf({sandRank: {trackIndex: 13}}), "MESTRE");
    assert.equal(sandRankCodeOf({sandRank: {code: "OURO"}}), "INICIANTE");
    assert.equal(sandRankCodeOf({}), "INICIANTE");
    assert.equal(sandRankCodeOf(undefined), "INICIANTE");
  });
});

describe("levelTierFor", () => {
  const tiers = parseLevelTiers([tier("COMPETIDOR", "10% OFF"), tier("ELITE", "20% OFF")]);

  it("a faixa mais alta que o elo alcança; abaixo da primeira, o benefício-base", () => {
    assert.equal(levelTierFor(tiers, "INICIANTE"), null);
    assert.equal(levelTierFor(tiers, "COMPETIDOR")?.benefitHighlight, "10% OFF");
    assert.equal(levelTierFor(tiers, "DESAFIANTE")?.benefitHighlight, "10% OFF");
    assert.equal(levelTierFor(tiers, "ELITE")?.benefitHighlight, "20% OFF");
    assert.equal(levelTierFor(tiers, "LENDA")?.benefitHighlight, "20% OFF");
    assert.equal(levelTierFor([], "LENDA"), null);
  });
});
