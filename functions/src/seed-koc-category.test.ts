import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {resolveKocConfig} from "./organizer-category-ops";
import {buildKingOfCourtRounds, kocBracketCountForRounds} from "./koc-bracket-builders";
import {groupCapacities} from "./draw-plan";

/* eslint-disable @typescript-eslint/no-var-requires */
const seedLib = require("../scripts/seed-tournament-enrollments-lib.js") as {
  buildCategories: (opts?: Record<string, unknown>) => Array<Record<string, unknown>>;
  refreshCategoryConfig: (
    existing: Array<Record<string, unknown>>,
    seed: Array<Record<string, unknown>>,
  ) => {categories: Array<Record<string, unknown>>; changes: string[]};
  CATEGORY_CONFIG_FIELDS: string[];
  KOC_CATEGORY_ID: string;
  MAX_TEAMS_PER_CATEGORY: number;
};
const {
  buildCategories,
  refreshCategoryConfig,
  CATEGORY_CONFIG_FIELDS,
  KOC_CATEGORY_ID,
  MAX_TEAMS_PER_CATEGORY,
} = seedLib;

/**
 * Fluxo completo do seed até as rodadas, sem I/O.
 *
 * Duas falhas em sequência motivaram isto, e as duas eram silenciosas — a chave
 * saía VÁLIDA, só com a forma de `roundsPerBracket = 1`:
 *
 * 1. O seed não gravava `roundsPerBracket` na categoria KOTC. O campo entrou no
 *    wizard e nos dois mappers do portal e não aqui.
 * 2. Corrigido isso, re-rodar o seed no mesmo `--tournament-name` não adiantava:
 *    as categorias só são gravadas na CRIAÇÃO, e um torneio seed já existente
 *    ficava para sempre com a config antiga.
 *
 * Os testes abaixo cobram o caminho inteiro: o que o seed monta, o que
 * `resolveKocConfig` resolve, o que a geração produz, e o que o refresh
 * conserta num torneio reutilizado.
 */

const kocCategory = (): Record<string, unknown> => {
  const found = buildCategories().find((c) => c.id === KOC_CATEGORY_ID);
  assert.ok(found, "o seed precisa ter a categoria KOTC");
  return found;
};

const teamIds = (n: number): string[] =>
  Array.from({length: n}, (_, i) => `t${String(i + 1).padStart(2, "0")}`);

describe("seed · categoria King of the Court", () => {
  it("grava TODOS os campos que `resolveKocConfig` lê", () => {
    const category = kocCategory();
    for (const key of ["teamsPerCourt", "roundsPerBracket", "qualifiersPerRound", "roundDurationSec"]) {
      assert.notEqual(category[key], undefined, `falta \`${key}\` na categoria do seed`);
    }
  });

  it("a config resolvida bate campo a campo — nada cai no default", () => {
    const category = kocCategory();
    const config = resolveKocConfig(undefined, category);
    assert.equal(config.teamsPerCourt, category.teamsPerCourt);
    assert.equal(config.roundsPerBracket, category.roundsPerBracket);
    assert.equal(config.qualifiersPerRound, category.qualifiersPerRound);
    assert.equal(config.roundDurationSec, category.roundDurationSec);
  });

  it("o recorte por nível/gênero NÃO tira a categoria KOTC do seed", () => {
    // `--levels intermediario_2 --genders male` é o comando real de teste. A
    // KOTC entra depois do corte de propósito; se um dia entrar antes, o seed
    // filtrado deixa de exercitar o formato e ninguém percebe.
    const categories = buildCategories({levels: ["intermediario_2"], genders: ["male"]});
    assert.ok(
      categories.some((c) => c.id === KOC_CATEGORY_ID),
      "seed filtrado perdeu a categoria KOTC",
    );
  });
});

describe("seed · fluxo completo até as rodadas", () => {
  it("2 rodadas por chave geram 8 na classificatória e 11 no total", () => {
    const config = resolveKocConfig(undefined, kocCategory());
    assert.equal(config.roundsPerBracket, 2, "o seed precisa pedir 2 rodadas por chave");

    const rounds = buildKingOfCourtRounds(teamIds(MAX_TEAMS_PER_CATEGORY), config);
    assert.equal(rounds.filter((r) => r.phase === 1).length, 8);
    assert.equal(rounds.length, 11);

    // As rodadas da MESMA chave saem em sequência, e a 2ª herda os NÃO
    // classificados da 1ª — é o que distingue "2 rodadas por chave" de
    // "8 chaves", e é o mesmo grupo seguindo na mesma quadra.
    const phaseOne = rounds.filter((r) => r.phase === 1);
    for (let bracket = 0; bracket < 4; bracket++) {
      const first = phaseOne[bracket * 2]!;
      const second = phaseOne[bracket * 2 + 1]!;
      assert.equal(second.poolId, first.poolId, "as duas rodadas são da mesma chave");
      assert.equal(second.matchNumber, first.matchNumber + 1, "e saem consecutivas");
      assert.equal(first.size, 4);
      assert.equal(second.size, 3, "a vencedora sai: a chave de 4 vira 3");
      const sources = new Set((second.qualifiers ?? []).map((q) => q.fromMatchNumber));
      assert.deepEqual([...sources], [first.matchNumber]);
    }
  });

  it("pelo sorteio ao vivo o resultado é o mesmo", () => {
    const config = resolveKocConfig(undefined, kocCategory());
    const ids = teamIds(MAX_TEAMS_PER_CATEGORY);
    const brackets = kocBracketCountForRounds(
      ids.length,
      config.teamsPerCourt,
      config.roundsPerBracket ?? 1,
    );
    let cursor = 0;
    const rosters = groupCapacities(ids.length, Math.ceil(ids.length / brackets)).map((g) =>
      ids.slice(cursor, (cursor += g.capacity)),
    );
    const rounds = buildKingOfCourtRounds(ids, config, {phaseOneRosters: rosters});
    assert.equal(rounds.filter((r) => r.phase === 1).length, 8);
    assert.equal(rounds.length, 11);
  });

  it("com 1 rodada por chave a forma volta a ser 7 — é a diferença observável", () => {
    const config = {...resolveKocConfig(undefined, kocCategory()), roundsPerBracket: 1};
    const rounds = buildKingOfCourtRounds(teamIds(MAX_TEAMS_PER_CATEGORY), config);
    assert.equal(rounds.length, 7);
  });
});

describe("seed · torneio reutilizado recebe a config nova", () => {
  /** Categoria como ficou num torneio seed criado ANTES do campo existir. */
  const legacyCategories = (): Array<Record<string, unknown>> => {
    const categories = buildCategories().map((c) => ({...c}));
    const koc = categories.find((c) => c.id === KOC_CATEGORY_ID)!;
    delete koc.roundsPerBracket;
    return categories;
  };

  it("acusa e corrige o campo que faltava", () => {
    const {categories, changes} = refreshCategoryConfig(legacyCategories(), buildCategories());
    assert.ok(
      changes.some((c) => c.includes("roundsPerBracket")),
      `o refresh precisa acusar roundsPerBracket; acusou: ${JSON.stringify(changes)}`,
    );
    const koc = categories.find((c) => c.id === KOC_CATEGORY_ID)!;
    assert.equal(koc.roundsPerBracket, 2);
  });

  it("depois do refresh a chave sai com a forma nova", () => {
    const {categories} = refreshCategoryConfig(legacyCategories(), buildCategories());
    const koc = categories.find((c) => c.id === KOC_CATEGORY_ID)!;
    const rounds = buildKingOfCourtRounds(
      teamIds(MAX_TEAMS_PER_CATEGORY),
      resolveKocConfig(undefined, koc),
    );
    assert.equal(rounds.length, 11);
  });

  it("torneio já em dia não acusa mudança nenhuma", () => {
    const {changes} = refreshCategoryConfig(buildCategories(), buildCategories());
    assert.deepEqual(changes, []);
  });

  it("NÃO mexe em vagas nem em inscrições — só na config da chave", () => {
    for (const field of ["maxTeams", "spotsTotal", "spotsLeft", "prizes", "registrationClosed"]) {
      assert.ok(
        !CATEGORY_CONFIG_FIELDS.includes(field),
        `\`${field}\` não pode ser sobrescrito num torneio com inscrições`,
      );
    }
    const existing = buildCategories().map((c) => ({...c, spotsLeft: 3, maxTeams: 8}));
    const {categories} = refreshCategoryConfig(existing, buildCategories());
    for (const category of categories) {
      assert.equal(category.spotsLeft, 3);
      assert.equal(category.maxTeams, 8);
    }
  });

  it("categoria que só existe no torneio antigo é preservada", () => {
    const extra = {id: "categoria-manual", categoryName: "Criada no painel", teamsPerGroup: 3};
    const {categories} = refreshCategoryConfig(
      [...buildCategories(), extra],
      buildCategories(),
    );
    assert.deepEqual(categories.find((c) => c.id === "categoria-manual"), extra);
  });
});

describe("categoria de DUELO gerada como King of the Court", () => {
  /**
   * O seletor de formato da tela "Gerar chave" deixa gerar KOTC em qualquer
   * categoria. Numa categoria de duelo o doc não tem `teamsPerCourt` nem
   * `roundsPerBracket`, então `resolveKocConfig` caía inteiro no default — e a
   * chave nascia com 1 rodada por chave sem nada dizer por quê.
   *
   * A tela agora manda a config em `bracketConfig`, que `resolveKocConfig`
   * prefere ao doc. Estes testes travam essa precedência.
   */
  const duelCategory = (): Record<string, unknown> => {
    const found = buildCategories({levels: ["intermediario_2"], genders: ["male"]})
      .find((c) => c.bracketFormat === "groups_knockout");
    assert.ok(found, "o seed precisa ter uma categoria de duelo");
    return found;
  };

  it("sem `bracketConfig` a categoria de duelo cai no default — 1 rodada por chave", () => {
    const category = duelCategory();
    assert.equal(category.roundsPerBracket, undefined);
    assert.equal(resolveKocConfig(undefined, category).roundsPerBracket, 1);
  });

  it("`bracketConfig` da tela vence o doc da categoria", () => {
    const config = resolveKocConfig(
      {teamsPerCourt: 4, roundsPerBracket: 2, qualifiersPerRound: 2, roundDurationSec: 1200},
      duelCategory(),
    );
    assert.equal(config.teamsPerCourt, 4);
    assert.equal(config.roundsPerBracket, 2);
    assert.equal(config.qualifiersPerRound, 2);
    assert.equal(config.roundDurationSec, 1200);
  });

  it("com a config da tela, a chave sai com 8 rodadas na classificatória", () => {
    const config = resolveKocConfig(
      {teamsPerCourt: 4, roundsPerBracket: 2, qualifiersPerRound: 2, roundDurationSec: 900},
      duelCategory(),
    );
    const rounds = buildKingOfCourtRounds(teamIds(16), config);
    assert.equal(rounds.filter((r) => r.phase === 1).length, 8);
    assert.equal(rounds.length, 11);
  });

  it("uma categoria KOTC de verdade continua valendo quando a tela não manda nada", () => {
    // `bracketConfig` parcial não pode apagar o que está no doc.
    const config = resolveKocConfig({roundsPerBracket: 1}, kocCategory());
    assert.equal(config.roundsPerBracket, 1, "o que a tela manda vence");
    assert.equal(config.teamsPerCourt, 4, "o que ela não manda vem do doc");
    assert.equal(config.roundDurationSec, 900);
  });
});
