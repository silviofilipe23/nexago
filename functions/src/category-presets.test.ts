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
  it("faixa fora da tabela não deriva preset", () => {
    assert.strictEqual(presetFromRange(0, 0), null);
    assert.strictEqual(presetFromRange(2, 6), null);
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
