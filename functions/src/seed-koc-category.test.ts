import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {resolveKocConfig} from "./organizer-category-ops";
import {buildKingOfCourtRounds} from "./koc-bracket-builders";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {buildCategories, KOC_CATEGORY_ID, MAX_TEAMS_PER_CATEGORY} =
  require("../scripts/seed-tournament-enrollments-lib.js") as {
    buildCategories: (opts?: Record<string, unknown>) => Array<Record<string, unknown>>;
    KOC_CATEGORY_ID: string;
    MAX_TEAMS_PER_CATEGORY: number;
  };

/**
 * O seed é o torneio onde a KOTC é conferida antes de valer na areia. Se a
 * categoria dele não gravar um campo que `resolveKocConfig` lê, o seed testa o
 * DEFAULT e não a configuração — em silêncio, porque a chave gerada continua
 * válida, só com outra forma.
 *
 * Foi o que aconteceu com `roundsPerBracket`: o campo entrou no wizard e nos
 * dois mappers do portal, mas não no seed. Quem testava pelo seed via 7 rodadas
 * e não tinha como saber por quê.
 */
describe("categoria King of the Court do seed", () => {
  const kocCategory = (): Record<string, unknown> => {
    const found = buildCategories().find((c) => c.id === KOC_CATEGORY_ID);
    assert.ok(found, "o seed precisa ter a categoria KOTC");
    return found;
  };

  it("grava TODOS os campos que `resolveKocConfig` lê", () => {
    const category = kocCategory();
    for (const key of ["teamsPerCourt", "roundsPerBracket", "qualifiersPerRound", "roundDurationSec"]) {
      assert.notEqual(category[key], undefined, `falta \`${key}\` na categoria do seed`);
    }
  });

  it("a config resolvida bate com o que está gravado — nada cai no default", () => {
    const category = kocCategory();
    const config = resolveKocConfig(undefined, category);
    assert.equal(config.teamsPerCourt, category.teamsPerCourt);
    assert.equal(config.roundsPerBracket, category.roundsPerBracket);
    assert.equal(config.qualifiersPerRound, category.qualifiersPerRound);
    assert.equal(config.roundDurationSec, category.roundDurationSec);
  });

  it("gera a chave com duas rodadas por chave: 8 na classificatória, 11 no total", () => {
    const category = kocCategory();
    const config = resolveKocConfig(undefined, category);
    const teamIds = Array.from({length: MAX_TEAMS_PER_CATEGORY}, (_, i) => `t${i + 1}`);
    const rounds = buildKingOfCourtRounds(teamIds, config);
    assert.equal(rounds.filter((r) => r.phase === 1).length, 8);
    assert.equal(rounds.length, 11);
  });
});
