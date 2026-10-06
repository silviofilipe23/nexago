/* eslint-disable */
/**
 * Esporte dos seeds de teste. Fonte única: o catálogo canônico
 * (`src/sports/catalog`, lido de `../lib`) — só entram esportes `competition`,
 * os mesmos que o wizard de torneio oferece.
 *
 * O código aceito é o do TORNEIO (`beachVolleyball`, `indoorVolleyball`,
 * `footvolley`, `tennis`, `beachTennis`); o código de PERFIL do atleta
 * (`VOLEI_PRAIA`, …) sai do mesmo registro, então os dois nunca divergem.
 */

const {SPORT_CATALOG} = require("../lib/sports/catalog");

const DEFAULT_SEED_SPORT_CODE = "beachVolleyball";

const SEED_SPORTS = SPORT_CATALOG.filter((s) => s.support === "competition");
const SEED_SPORT_CODES = SEED_SPORTS.map((s) => s.code);

/** Entrada do catálogo para o código do torneio, ou `null` se não for aceito. */
function resolveSeedSport(code = DEFAULT_SEED_SPORT_CODE) {
  const key = String(code).trim().toLowerCase();
  return SEED_SPORTS.find((s) => s.code.toLowerCase() === key) ?? null;
}

module.exports = {
  DEFAULT_SEED_SPORT_CODE,
  SEED_SPORT_CODES,
  resolveSeedSport,
};
