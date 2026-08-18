import {levelRank} from "./category-level-eligibility";

export type CategoryPresetKey =
  | "iniciante" | "intermediario" | "avancado" | "open" | "elite" | "livre";

export interface CategoryPreset {
  key: CategoryPresetKey;
  label: string;
  minRank: number;
  maxRank: number;
  /** Peso no ranking geral (D4 da spec — consumido pela fase 3). */
  weight: number;
}

/**
 * Presets de faixa de nível (spec emendada 18/08). A faixa é regra da
 * plataforma: o wizard só oferece estas 6; o preset NUNCA é gravado no doc —
 * deriva da faixa exata via [presetFromRange], o que torna os pesos da fase 3
 * à prova de adulteração no cliente.
 */
export const CATEGORY_PRESETS: readonly CategoryPreset[] = [
  {key: "iniciante", label: "Iniciante", minRank: 0, maxRank: 1, weight: 0.125},
  {key: "intermediario", label: "Intermediário", minRank: 2, maxRank: 3, weight: 0.25},
  {key: "avancado", label: "Avançado", minRank: 4, maxRank: 5, weight: 0.5},
  {key: "open", label: "Open", minRank: 4, maxRank: 6, weight: 1},
  {key: "elite", label: "Elite", minRank: 6, maxRank: 6, weight: 1.2},
  {key: "livre", label: "Livre", minRank: 0, maxRank: 6, weight: 0.125},
];

/** Peso de categoria sem preset (legada/faixa fora da tabela) — emenda 3. */
export const LEGACY_CATEGORY_WEIGHT = 1;

/**
 * Derivação canônica faixa→preset. `minRank === null` (piso ausente no doc)
 * é categoria LEGADA da regra só-teto — nunca um preset, nem o Livre: o
 * Livre grava piso explícito `iniciante_1` justamente para se distinguir.
 */
export function presetFromRange(
  minRank: number | null,
  maxRank: number,
): CategoryPreset | null {
  if (minRank == null) return null;
  return (
    CATEGORY_PRESETS.find((p) => p.minRank === minRank && p.maxRank === maxRank) ??
    null
  );
}

/** Preset de um doc de categoria (`level`/`minLevel` guardam labels). */
export function categoryPreset(
  category: Record<string, unknown> | null | undefined,
): CategoryPreset | null {
  if (!category) return null;
  const max = levelRank(category.level);
  if (max == null) return null;
  return presetFromRange(levelRank(category.minLevel), max);
}
