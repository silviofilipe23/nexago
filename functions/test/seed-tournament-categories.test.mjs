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

  it("levels/genders escolhem QUAIS categorias, não as primeiras da ordem", () => {
    // O caso que `maxCategories` não alcança: Open é a última do nível, então
    // um torneio só de Open masculino exigiria `maxCategories: 9`.
    assert.deepEqual(
      buildCategories({levels: ["open"], genders: ["male"]}).map((c) => c.id),
      ["open-masc"],
    );
    assert.deepEqual(
      buildCategories({levels: ["open"], genders: ["male"]}).map(
        (c) => c.categoryName,
      ),
      ["Open Masculino"],
    );
  });

  it("cada recorte vale sozinho; o outro eixo continua inteiro", () => {
    assert.deepEqual(
      buildCategories({genders: ["female"]}).map((c) => c.id),
      [
        "iniciante_1-fem",
        "iniciante_2-fem",
        "intermediario_1-fem",
        "intermediario_2-fem",
        "open-fem",
      ],
    );
    assert.deepEqual(
      buildCategories({levels: ["iniciante_2", "open"]}).map((c) => c.id),
      ["iniciante_2-masc", "iniciante_2-fem", "open-masc", "open-fem"],
    );
  });

  it("maxCategories corta DEPOIS do recorte, não antes", () => {
    assert.deepEqual(
      buildCategories({levels: ["open"], maxCategories: 1}).map((c) => c.id),
      ["open-masc"],
    );
  });

  it("recorte não mexe nas capacidades da categoria", () => {
    const [open] = buildCategories({
      levels: ["open"],
      genders: ["male"],
      maxTeamsPerCategory: 10,
    });
    assert.deepEqual(capacities(open), [10, 10, 10]);
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

  it("recorte ausente ou vazio mantém as 10 — nunca zera o torneio", () => {
    for (const empty of [undefined, [], null, "open"]) {
      assert.equal(
        buildCategories({levels: empty, genders: empty}).length,
        TOTAL_CATEGORIES,
        `levels/genders=${JSON.stringify(empty)} deveria manter todas`,
      );
    }
  });
});
