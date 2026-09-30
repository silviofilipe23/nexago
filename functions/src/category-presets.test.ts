import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  presetFromRange,
  categoryPreset,
  CATEGORY_PRESETS,
} from "./category-presets";

describe("category-presets", () => {
  it("deriva cada preset pela faixa exata", () => {
    assert.strictEqual(presetFromRange(0, 1)?.key, "iniciante");
    assert.strictEqual(presetFromRange(2, 3)?.key, "intermediario");
    assert.strictEqual(presetFromRange(4, 5)?.key, "avancado");
    assert.strictEqual(presetFromRange(4, 6)?.key, "open");
    assert.strictEqual(presetFromRange(6, 6)?.key, "elite");
    assert.strictEqual(presetFromRange(0, 6)?.key, "livre");
  });
  it("piso ausente é categoria legada — nunca deriva preset", () => {
    assert.strictEqual(presetFromRange(null, 6), null);
    assert.strictEqual(presetFromRange(null, 0), null);
  });
  it("faixa fora da tabela sem piso 0 não deriva preset", () => {
    assert.strictEqual(presetFromRange(2, 6), null);
    assert.strictEqual(presetFromRange(1, 3), null);
  });
  it("categoryPreset lê labels do doc da categoria", () => {
    assert.strictEqual(
      categoryPreset({level: "Open", minLevel: "Avançado 1"})?.key,
      "open",
    );
    assert.strictEqual(categoryPreset({level: "Open"}), null); // legado sem piso
    assert.strictEqual(categoryPreset({level: "Open", minLevel: "Iniciante 1"})?.key, "livre");
    assert.strictEqual(categoryPreset(null), null);
  });
  it("pesos da tabela batem com a D4 da spec", () => {
    const byKey = Object.fromEntries(CATEGORY_PRESETS.map((p) => [p.key, p.weight]));
    assert.deepStrictEqual(byKey, {
      iniciante: 0.125, intermediario: 0.25, avancado: 0.5,
      open: 1, elite: 1.2, livre: 0.125,
    });
  });
});

describe("faixa \"até X\" (spec 2026-09-30)", () => {
  it("piso 0 fora da tabela vira preset medido com teto na família de X", () => {
    const casos: Array<[number, string, number]> = [
      [0, "Até Iniciante 1", 0.125],
      [2, "Até Intermediário 1", 0.25],
      [3, "Até Intermediário 2", 0.25],
      [4, "Até Avançado 1", 0.5],
      [5, "Até Avançado 2", 0.5],
    ];
    for (const [maxRank, label, maxWeight] of casos) {
      const preset = presetFromRange(0, maxRank);
      assert.equal(preset?.key, "ate", `0–${maxRank}`);
      assert.equal(preset?.label, label);
      assert.equal(preset?.minRank, 0);
      assert.equal(preset?.maxRank, maxRank);
      assert.equal(preset?.weight, 0.125);
      assert.equal(preset?.measured, true);
      assert.equal(preset?.maxWeight, maxWeight);
    }
  });

  it("0–1 e 0–6 continuam Iniciante e Livre (a tabela exata vence)", () => {
    assert.equal(presetFromRange(0, 1)?.key, "iniciante");
    assert.equal(presetFromRange(0, 1)?.measured, false);
    const livre = presetFromRange(0, 6);
    assert.equal(livre?.key, "livre");
    assert.equal(livre?.measured, true);
    assert.equal(livre?.maxWeight, 1);
  });

  it("presets fechados não são medidos", () => {
    for (const key of ["iniciante", "intermediario", "avancado", "open", "elite"]) {
      assert.equal(CATEGORY_PRESETS.find((p) => p.key === key)?.measured, false, key);
    }
  });

  it("categoryPreset lê a faixa até X dos labels do doc", () => {
    const preset = categoryPreset({level: "Intermediário 2", minLevel: "Iniciante 1"});
    assert.equal(preset?.key, "ate");
    assert.equal(preset?.maxWeight, 0.25);
  });
});
