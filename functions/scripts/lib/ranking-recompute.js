/* eslint-disable */
/**
 * Matemática do recálculo retroativo do ranking geral — camada PURA, sem
 * `firebase-admin` e sem I/O, para que `functions/test/ranking-recompute.test.mjs`
 * possa travar a regra. O script `scripts/recompute-ranking-weights.js` é só a
 * casca de leitura/escrita em cima daqui.
 *
 * Contexto: até a fase 3 toda categoria pagava a tabela cheia (peso 1). O motor
 * novo (`functions/src/tournament-ranking.ts`) passou a multiplicar a base pelo
 * peso do preset da categoria, pela grade do torneio (`rankingWeight`) e pelo
 * modulador de tamanho de chave — mas só para premiações NOVAS. O histórico
 * ficou pagando tabela cheia (ver D9 da spec
 * `docs/superpowers/specs/2026-08-17-category-presets-ranking-weights-design.md`,
 * que decidiu a reescala ×10 sem repesagem). Este módulo é a emenda daquela
 * decisão: recalcula cada resultado JÁ GRAVADO com a fórmula vigente.
 *
 * Duas propriedades sustentam o desenho do script:
 *
 *  1. `finalPlace` é reversível para a base — 1-4 direto, 5 = quartas, 9 =
 *     fase de grupos (`finalPlaceForAward` no motor) — então dá para recalcular
 *     do zero sem reprocessar partida nenhuma.
 *  2. Por ser função pura do dado gravado, o recálculo CONVERGE: rodar duas
 *     vezes dá o mesmo resultado, e uma entrada escrita pelo motor novo já
 *     nasce com o valor final e não é tocada. É por isso que o script não
 *     precisa de carimbo tipo `scaleVersion` para saber onde parou.
 *
 * PARIDADE (script standalone, sem import do bundle compilado): as tabelas
 * abaixo são cópias literais de `functions/src/tournament-ranking.ts`
 * (`DEFAULT_GLOBAL_POINTS`, `bracketSizeFactor`, `aggregateRankingResults`),
 * `functions/src/category-presets.ts` (`CATEGORY_PRESETS`,
 * `LEGACY_CATEGORY_WEIGHT`) e `functions/src/category-level-eligibility.ts`
 * (`LEVEL_RANK`, `levelRank`). Mudou lá, muda aqui — o teste é quem cobra.
 */

/** Cópia de `DEFAULT_GLOBAL_POINTS` (base ×10 da fase 3). */
const DEFAULT_GLOBAL_POINTS = {
  "1": 1000,
  "2": 800,
  "3": 600,
  "4": 500,
  quarters: 330,
  r16: 200,
  r32: 130,
  groups: 100,
};

/**
 * Inverso de `finalPlaceForAward` NA ESCADA POR FASE ALCANÇADA (19/08): 1-4 são
 * colocação direta, 5 é o topo de quartas, 9 o de oitavas, 17 o de 16-avos e 0
 * é participação (sem colocação de mata-mata). Qualquer outro valor devolve
 * `null` — o script prefere deixar a entrada intocada e reportar a chutar base.
 *
 * ATENÇÃO AO CONTRATO ANTIGO: antes desta escada, `finalPlace: 9` significava
 * PARTICIPAÇÃO (base 100), não oitavas. Rodar este recálculo sobre dado ainda
 * não re-derivado promoveria quem caiu na fase de grupos a oitavas (100 → 200).
 * Por isso `rederive-knockout-placements.js` roda ANTES: é ele quem converte os
 * `9` antigos em `0` junto com o resto da colocação.
 */
function basePointsForFinalPlace(finalPlace) {
  // `Number(null)` é 0, e 0 é participação — sem este guard uma entrada com
  // colocação AUSENTE viraria "participação" em vez de ser deixada em paz.
  if (finalPlace == null || finalPlace === "") return null;
  const place = Number(finalPlace);
  if (!Number.isInteger(place)) return null;
  if (place === 0) return DEFAULT_GLOBAL_POINTS.groups;
  if (place >= 1 && place <= 4) return DEFAULT_GLOBAL_POINTS[String(place)];
  if (place === 5) return DEFAULT_GLOBAL_POINTS.quarters;
  if (place === 9) return DEFAULT_GLOBAL_POINTS.r16;
  if (place === 17) return DEFAULT_GLOBAL_POINTS.r32;
  return null;
}

/** Cópia de `LEVEL_RANK` — escada de 7 degraus + legados de 3. */
const LEVEL_RANK = {
  iniciante_1: 0,
  iniciante1: 0,
  iniciante_2: 1,
  iniciante2: 1,
  intermediario_1: 2,
  intermediario1: 2,
  intermediario_2: 3,
  intermediario2: 3,
  avancado_1: 4,
  avancado1: 4,
  avancado_2: 5,
  avancado2: 5,
  open: 6,
  iniciante: 0,
  intermediario: 2,
};

/** Cópia de `normalizeLevelKey`: tira acento/caixa/espaço, preserva "/". */
function normalizeLevelKey(raw) {
  if (typeof raw !== "string") return "";
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
}

/** Cópia de `levelRank` — inclusive os legados básico/livre/open-federado. */
function levelRank(raw) {
  const key = normalizeLevelKey(raw);
  if (!key) return null;
  if (key in LEVEL_RANK) return LEVEL_RANK[key];
  if (key === "basico") return LEVEL_RANK.iniciante;
  if (key === "livre") return LEVEL_RANK.open;
  if (key === "open/federado") return LEVEL_RANK.open;
  return null;
}

/** Cópia de `CATEGORY_PRESETS` (faixa fechada + peso no ranking geral). */
const CATEGORY_PRESETS = [
  {key: "iniciante", minRank: 0, maxRank: 1, weight: 0.125},
  {key: "intermediario", minRank: 2, maxRank: 3, weight: 0.25},
  {key: "avancado", minRank: 4, maxRank: 5, weight: 0.5},
  {key: "open", minRank: 4, maxRank: 6, weight: 1},
  {key: "elite", minRank: 6, maxRank: 6, weight: 1.2},
  {key: "livre", minRank: 0, maxRank: 6, weight: 0.125},
];

/** Cópia de `LEGACY_CATEGORY_WEIGHT`: categoria sem preset reconhecido. */
const LEGACY_CATEGORY_WEIGHT = 1;

/**
 * Inferência de preset para categoria LEGADA (sem `minLevel` gravado): assume
 * que a faixa era a canônica do preset com AQUELE teto. O teto 6 é ambíguo
 * entre `open` (4-6), `elite` (6-6) e `livre` (0-6); resolve em `open`, cujo
 * peso 1 é exatamente o que a categoria já vale hoje — na dúvida, ninguém
 * perde nem ganha ponto por adivinhação nossa.
 */
const INFERRED_PRESET_BY_TOP_RANK = {
  0: "iniciante",
  1: "iniciante",
  2: "intermediario",
  3: "intermediario",
  4: "avancado",
  5: "avancado",
  6: "open",
};

function presetByKey(key) {
  return CATEGORY_PRESETS.find((p) => p.key === key) ?? null;
}

/**
 * Peso da categoria no ranking geral.
 *
 * @param {Record<string, unknown>|null|undefined} category doc da categoria
 *   dentro de `tournaments/{id}.categories[]` (`level` = teto, `minLevel` =
 *   piso; ambos guardam LABEL, não código).
 * @returns {{weight: number, presetKey: string|null, inferred: boolean}|null}
 *   `null` quando não dá para decidir (categoria ausente ou teto
 *   irreconhecível) — o chamador deve deixar a entrada intocada e reportar.
 */
function presetWeightForCategory(category) {
  if (!category || typeof category !== "object") return null;
  const maxRank = levelRank(category.level);
  if (maxRank == null) return null;

  const minRank = levelRank(category.minLevel);
  if (minRank != null) {
    // Categoria da fase 2 em diante: faixa exata → preset canônico.
    const preset = CATEGORY_PRESETS.find(
      (p) => p.minRank === minRank && p.maxRank === maxRank,
    );
    return preset
      ? {weight: preset.weight, presetKey: preset.key, inferred: false}
      : {weight: LEGACY_CATEGORY_WEIGHT, presetKey: null, inferred: false};
  }

  // Categoria legada (regra só-teto) ou piso irreconhecível: infere pelo teto.
  const preset = presetByKey(INFERRED_PRESET_BY_TOP_RANK[maxRank]);
  if (!preset) return null;
  return {weight: preset.weight, presetKey: preset.key, inferred: true};
}

/** Mesmo saneamento do motor para `tournaments/{id}.rankingWeight`. */
function sanitizeRankingWeight(raw) {
  const value = Number(raw ?? 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** Cópia de `bracketSizeFactor` (D7) — duplas PAGAS da categoria. */
function bracketSizeFactor(paidTeamsCount) {
  if (paidTeamsCount >= 8) return 1;
  if (paidTeamsCount >= 4) return 0.6;
  return 0.25;
}

/**
 * Pontos de UMA entrada do histórico, pela fórmula vigente do motor:
 * `base × pesoPreset × rankingWeight × fatorChave`, arredondada uma única vez
 * no fim. `null` quando a colocação não é reconhecida.
 */
function pointsForEntry(finalPlace, context) {
  const base = basePointsForFinalPlace(finalPlace);
  if (base == null) return null;
  const multiplier =
    Number(context.weight) *
    Number(context.rankingWeight) *
    Number(context.bracketFactor);
  const safeMultiplier =
    Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  return Math.max(0, Math.round(base * safeMultiplier));
}

/**
 * Cópia de `aggregateRankingResults` pós-D1: soma TODOS os resultados de cada
 * ano (sem descarte de "melhores N") e o total entre os anos.
 */
function aggregateRankingResults(results) {
  const pointsByYear = {};
  let totalPoints = 0;
  for (const result of results) {
    const year = String(result.year ?? 0);
    const points = Math.max(0, Math.round(Number(result.points) || 0));
    pointsByYear[year] = (pointsByYear[year] || 0) + points;
  }
  for (const year of Object.keys(pointsByYear)) totalPoints += pointsByYear[year];
  return {totalPoints, tournamentsCount: results.length, pointsByYear};
}

module.exports = {
  DEFAULT_GLOBAL_POINTS,
  CATEGORY_PRESETS,
  LEGACY_CATEGORY_WEIGHT,
  basePointsForFinalPlace,
  levelRank,
  presetWeightForCategory,
  sanitizeRankingWeight,
  bracketSizeFactor,
  pointsForEntry,
  aggregateRankingResults,
};
