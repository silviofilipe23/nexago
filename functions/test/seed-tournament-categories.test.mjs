import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const {
  buildCategories,
  TOTAL_CATEGORIES,
  MAX_TEAMS_PER_CATEGORY,
  KOC_CATEGORY_ID,
  KOC_SOURCE_CATEGORY_ID,
} = require("../scripts/seed-tournament-enrollments-lib");

/** `maxTeams` é o teto lido por `buildPairPlans`; os três precisam casar. */
function capacities(category) {
  return [category.maxTeams, category.spotsTotal, category.spotsLeft];
}

/** Só o GRID nível×gênero — é sobre ele que `maxCategories`, `levels` e
 *  `genders` operam. A categoria King of the Court entra por fora e tem os
 *  próprios testes abaixo. */
function grid(options = {}) {
  return buildCategories({...options, kingOfCourt: false});
}

describe("seed de torneio: limites de categoria", () => {
  it("sem opções, mantém o volume padrão (10 categorias × 16 duplas)", () => {
    const categories = grid();
    assert.equal(categories.length, TOTAL_CATEGORIES);
    for (const category of categories) {
      assert.deepEqual(
        capacities(category),
        [MAX_TEAMS_PER_CATEGORY, MAX_TEAMS_PER_CATEGORY, MAX_TEAMS_PER_CATEGORY],
      );
    }
  });

  it("maxCategories corta as N primeiras da ordem nível×gênero", () => {
    const categories = grid({maxCategories: 5});
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
    for (const category of grid({maxTeamsPerCategory: 12})) {
      assert.deepEqual(capacities(category), [12, 12, 12]);
    }
  });

  it("maxCategories acima do total não estoura — devolve todas", () => {
    assert.equal(grid({maxCategories: 99}).length, TOTAL_CATEGORIES);
  });

  it("levels/genders escolhem QUAIS categorias, não as primeiras da ordem", () => {
    // O caso que `maxCategories` não alcança: Open é a última do nível, então
    // um torneio só de Open masculino exigiria `maxCategories: 9`.
    assert.deepEqual(
      grid({levels: ["open"], genders: ["male"]}).map((c) => c.id),
      ["open-masc"],
    );
    assert.deepEqual(
      grid({levels: ["open"], genders: ["male"]}).map(
        (c) => c.categoryName,
      ),
      ["Open Masculino"],
    );
  });

  it("cada recorte vale sozinho; o outro eixo continua inteiro", () => {
    assert.deepEqual(
      grid({genders: ["female"]}).map((c) => c.id),
      [
        "iniciante_1-fem",
        "iniciante_2-fem",
        "intermediario_1-fem",
        "intermediario_2-fem",
        "open-fem",
      ],
    );
    assert.deepEqual(
      grid({levels: ["iniciante_2", "open"]}).map((c) => c.id),
      ["iniciante_2-masc", "iniciante_2-fem", "open-masc", "open-fem"],
    );
  });

  it("maxCategories corta DEPOIS do recorte, não antes", () => {
    assert.deepEqual(
      grid({levels: ["open"], maxCategories: 1}).map((c) => c.id),
      ["open-masc"],
    );
  });

  it("recorte não mexe nas capacidades da categoria", () => {
    const [open] = grid({
      levels: ["open"],
      genders: ["male"],
      maxTeamsPerCategory: 10,
    });
    assert.deepEqual(capacities(open), [10, 10, 10]);
  });

  it("valores inválidos caem no default em vez de zerar o torneio", () => {
    for (const invalid of [0, -1, 2.5, "5", null]) {
      assert.equal(
        grid({maxCategories: invalid}).length,
        TOTAL_CATEGORIES,
        `maxCategories=${invalid} deveria manter todas as categorias`,
      );
      const [maxTeams] = capacities(
        grid({maxTeamsPerCategory: invalid})[0],
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
        grid({levels: empty, genders: empty}).length,
        TOTAL_CATEGORIES,
        `levels/genders=${JSON.stringify(empty)} deveria manter todas`,
      );
    }
  });
});

describe("seed de torneio: categoria King of the Court", () => {
  function koc(options = {}) {
    return buildCategories(options).find((c) => c.id === KOC_CATEGORY_ID) ?? null;
  }

  it("vem por padrão, somada ao grid nível×gênero", () => {
    // O cenário real é torneio com os DOIS formatos: a rodada KOTC divide a
    // coleção `matches` com partidas de duelo, e é isso que a blindagem do
    // formato protege. Seed sem ela testa só metade.
    const categories = buildCategories();
    assert.equal(categories.length, TOTAL_CATEGORIES + 1);
    assert.equal(categories[categories.length - 1].id, KOC_CATEGORY_ID);
  });

  it("grava o formato e a config que o backend lê", () => {
    // Os nomes são os de `resolveKocConfig` em organizer-category-ops.ts.
    const category = koc();
    assert.equal(category.bracketFormat, "king_of_court");
    assert.equal(category.teamsPerCourt, 4);
    assert.equal(category.qualifiersPerRound, 2);
    assert.equal(category.roundDurationSec, 900);
  });

  it("16 duplas em quadras de 4 fecham a chave da 1ª etapa", () => {
    // 4 rodadas → 2 semifinais → final, sem bye.
    const category = koc();
    assert.deepEqual(capacities(category), [
      MAX_TEAMS_PER_CATEGORY,
      MAX_TEAMS_PER_CATEGORY,
      MAX_TEAMS_PER_CATEGORY,
    ]);
    assert.equal(category.maxTeams % category.teamsPerCourt, 0);
  });

  it("sobrevive ao corte de categorias", () => {
    // Entra DEPOIS do corte: um seed enxuto (`--categories 1`) ainda traz o
    // formato novo, que é justamente o que se quer testar.
    assert.deepEqual(
      buildCategories({maxCategories: 1}).map((c) => c.id),
      ["iniciante_1-masc", KOC_CATEGORY_ID],
    );
  });

  it("respeita maxTeamsPerCategory junto com o grid", () => {
    assert.deepEqual(capacities(koc({maxTeamsPerCategory: 8})), [8, 8, 8]);
  });

  it("pode ser desligada sem mexer no grid", () => {
    const categories = buildCategories({kingOfCourt: false});
    assert.equal(categories.length, TOTAL_CATEGORIES);
    assert.equal(categories.some((c) => c.id === KOC_CATEGORY_ID), false);
  });

  it("não colide com o id do pool que a alimenta", () => {
    // Ela tira elenco do pool de Open Masculino, mas é OUTRA categoria: ids
    // iguais fariam o seed inscrever tudo na mesma.
    assert.notEqual(KOC_CATEGORY_ID, KOC_SOURCE_CATEGORY_ID);
    const ids = buildCategories().map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.includes(KOC_SOURCE_CATEGORY_ID));
  });
});
