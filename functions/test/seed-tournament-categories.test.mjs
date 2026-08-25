import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const {
  buildCategories,
  TOTAL_CATEGORIES,
  MAX_TEAMS_PER_CATEGORY,
} = require("../scripts/seed-tournament-enrollments-lib");

/** `maxTeams` é o teto lido por `buildPairPlans`; os três precisam casar. */
function capacities(category) {
  return [category.maxTeams, category.spotsTotal, category.spotsLeft];
}

describe("seed de torneio: limites de categoria", () => {
  it("sem opções, mantém o volume padrão (10 categorias × 16 duplas)", () => {
    const categories = buildCategories();
    assert.equal(categories.length, TOTAL_CATEGORIES);
    for (const category of categories) {
      assert.deepEqual(
        capacities(category),
        [MAX_TEAMS_PER_CATEGORY, MAX_TEAMS_PER_CATEGORY, MAX_TEAMS_PER_CATEGORY],
      );
    }
  });

  it("maxCategories corta as N primeiras da ordem nível×gênero", () => {
    const categories = buildCategories({maxCategories: 5});
    assert.deepEqual(
      categories.map((c) => c.id),
      [
        "iniciante_1-masc",
        "iniciante_1-fem",
        "iniciante_2-masc",
        "iniciante_2-fem",
        "intermediario_1-masc",
      ],
    );
  });

  it("maxTeamsPerCategory vale para as três capacidades da categoria", () => {
    for (const category of buildCategories({maxTeamsPerCategory: 12})) {
      assert.deepEqual(capacities(category), [12, 12, 12]);
    }
  });

  it("maxCategories acima do total não estoura — devolve todas", () => {
    assert.equal(buildCategories({maxCategories: 99}).length, TOTAL_CATEGORIES);
  });

  it("valores inválidos caem no default em vez de zerar o torneio", () => {
    for (const invalid of [0, -1, 2.5, "5", null]) {
      assert.equal(
        buildCategories({maxCategories: invalid}).length,
        TOTAL_CATEGORIES,
        `maxCategories=${invalid} deveria manter todas as categorias`,
      );
      const [maxTeams] = capacities(
        buildCategories({maxTeamsPerCategory: invalid})[0],
      );
      assert.equal(
        maxTeams,
        MAX_TEAMS_PER_CATEGORY,
        `maxTeamsPerCategory=${invalid} deveria manter o default`,
      );
    }
  });
});
