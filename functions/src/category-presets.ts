import {levelLabelForRank, levelRank} from "./category-level-eligibility";
import {
  LIVRE_MAX_WEIGHT,
  LIVRE_MIN_WEIGHT,
  weightFromRank,
} from "./category-field-strength";

export type CategoryPresetKey =
  | "iniciante" | "intermediario" | "avancado" | "open" | "elite" | "livre" | "ate";

export interface CategoryPreset {
  key: CategoryPresetKey;
  label: string;
  minRank: number;
  maxRank: number;
  /** Peso no ranking geral (D4 da spec — consumido pela fase 3). Num preset
   *  medido é só o fallback de campo imensurável. */
  weight: number;
  /** Peso vem da força REAL do campo inscrito (Livre e "até X"), não da faixa
   *  declarada — ver `category-field-strength.ts`. */
  measured: boolean;
  /** Teto do peso medido. Nos presets fechados é igual a `weight` e não é lido. */
  maxWeight: number;
}

/**
 * Presets de faixa de nível (spec emendada 18/08). A faixa é regra da
 * plataforma: o wizard só oferece estas 6 (mais o "até X", derivado); o preset
 * NUNCA é gravado no doc — deriva da faixa exata via [presetFromRange], o que
 * torna os pesos da fase 3 à prova de adulteração no cliente.
 */
export const CATEGORY_PRESETS: readonly CategoryPreset[] = [
  {
    key: "iniciante", label: "Iniciante", minRank: 0, maxRank: 1,
    weight: 0.125, measured: false, maxWeight: 0.125,
  },
  {
    key: "intermediario", label: "Intermediário", minRank: 2, maxRank: 3,
    weight: 0.25, measured: false, maxWeight: 0.25,
  },
  {
    key: "avancado", label: "Avançado", minRank: 4, maxRank: 5,
    weight: 0.5, measured: false, maxWeight: 0.5,
  },
  {
    key: "open", label: "Open", minRank: 4, maxRank: 6,
    weight: 1, measured: false, maxWeight: 1,
  },
  {
    key: "elite", label: "Elite", minRank: 6, maxRank: 6,
    weight: 1.2, measured: false, maxWeight: 1.2,
  },
  {
    key: "livre", label: "Livre", minRank: 0, maxRank: 6,
    weight: 0.125, measured: true, maxWeight: LIVRE_MAX_WEIGHT,
  },
];

/** Peso de categoria sem preset (legada/faixa fora da tabela) — emenda 3. */
export const LEGACY_CATEGORY_WEIGHT = 1;

/**
 * Derivação canônica faixa→preset. `minRank === null` (piso ausente no doc)
 * é categoria LEGADA da regra só-teto — nunca um preset, nem o Livre: o
 * Livre grava piso explícito `iniciante_1` justamente para se distinguir.
 * Piso 0 com teto fora da tabela é a faixa "até X" ([upToPreset]).
 */
export function presetFromRange(
  minRank: number | null,
  maxRank: number,
): CategoryPreset | null {
  if (minRank == null) return null;
  const exact = CATEGORY_PRESETS.find(
    (p) => p.minRank === minRank && p.maxRank === maxRank,
  );
  if (exact) return exact;
  if (minRank === 0 && Number.isInteger(maxRank) && maxRank >= 0 && maxRank <= 6) {
    return upToPreset(maxRank);
  }
  return null;
}

/**
 * Faixa "até X" (spec 2026-09-30): piso Iniciante 1 e teto X fora da tabela.
 * Libera todos os níveis abaixo de X, então pesa como o Livre — pela força real
 * do campo — com teto na família de X ("até Intermediário 2" nunca passa de
 * 0.25). O Livre é o caso "até Open" e continua na tabela.
 */
function upToPreset(maxRank: number): CategoryPreset {
  return {
    key: "ate",
    label: `Até ${levelLabelForRank(maxRank)}`,
    minRank: 0,
    maxRank,
    weight: LIVRE_MIN_WEIGHT,
    measured: true,
    maxWeight: weightFromRank(maxRank),
  };
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
