import type {Firestore} from "firebase-admin/firestore";
import {levelRank} from "./category-level-eligibility";

/**
 * Configuração da escada de rating por esporte (`ratingLadders/{sportCode}`).
 *
 * O doc do Firestore é opcional: [loadRatingLadderConfig] mescla o que existir
 * sobre os defaults hardcoded, então doc ausente/incompleto nunca quebra os
 * triggers. Ajustes de banda/flag em produção são edição de config, sem deploy.
 */

/**
 * Esportes com escada de rating no v1 (beach tennis/futevôlei adiados — sem
 * volume de torneios ainda). Gate explícito da engine: ter código de esporte
 * no perfil NÃO significa ser rateado.
 */
export const RATED_SPORT_CODES = ["VOLEI_PRAIA", "VOLEI_QUADRA"] as const;

export interface RatingLadderLevel {
  code: string;
  rank: number;
  label: string;
  initialRating: number;
  /** Rating que abre a zona de promoção; null no topo da escada. */
  promoteAt: number | null;
  /** Rating que abre a zona de rebaixamento; null no piso. */
  demoteAt: number | null;
}

export interface RatingGlickoParams {
  initialRd: number;
  minRd: number;
  maxRd: number;
  tau: number;
  initialVolatility: number;
  inactivityRdPerWeek: number;
}

export interface RatingLadderRules {
  minRatedMatches: number;
  maxRdForDecision: number;
  relegationObservationDays: number;
  relegationObservationMinMatches: number;
  relegationRecoveryMargin: number;
  promotionProtectionDays: number;
}

export interface RatingFlags {
  ratingEnabled: boolean;
  shadowMode: boolean;
  notificationsEnabled: boolean;
  autoPromotionEnabled: boolean;
  autoRelegationEnabled: boolean;
  movEnabled: boolean;
}

export interface RatingLadderConfig {
  sportCode: string;
  levels: RatingLadderLevel[];
  glicko: RatingGlickoParams;
  ladder: RatingLadderRules;
  flags: RatingFlags;
}

/**
 * Escada de 5 níveis (a mesma para todos os esportes). `open` fica no rank 5
 * por compatibilidade histórica — o rank 4 não é usado e a numeração não pode
 * mudar (está gravada em `athleteRatings.levelRank` e nas rules deployadas).
 */
const VOLLEYBALL_LEVELS: RatingLadderLevel[] = [
  {code: "iniciante_1", rank: 0, label: "Iniciante 1", initialRating: 1250, promoteAt: 1420, demoteAt: null},
  {code: "iniciante_2", rank: 1, label: "Iniciante 2", initialRating: 1450, promoteAt: 1570, demoteAt: 1350},
  {code: "intermediario_1", rank: 2, label: "Intermediário 1", initialRating: 1600, promoteAt: 1720, demoteAt: 1500},
  {code: "intermediario_2", rank: 3, label: "Intermediário 2", initialRating: 1750, promoteAt: 1870, demoteAt: 1650},
  {code: "open", rank: 5, label: "Open", initialRating: 1900, promoteAt: null, demoteAt: 1800},
];

export const DEFAULT_LADDER_CONFIG: Omit<RatingLadderConfig, "sportCode"> = {
  levels: VOLLEYBALL_LEVELS,
  glicko: {
    initialRd: 300,
    minRd: 60,
    maxRd: 350,
    tau: 0.5,
    initialVolatility: 0.06,
    inactivityRdPerWeek: 6,
  },
  ladder: {
    minRatedMatches: 10,
    maxRdForDecision: 120,
    relegationObservationDays: 90,
    relegationObservationMinMatches: 6,
    relegationRecoveryMargin: 40,
    promotionProtectionDays: 120,
  },
  flags: {
    ratingEnabled: true,
    shadowMode: true,
    notificationsEnabled: false,
    autoPromotionEnabled: false,
    autoRelegationEnabled: false,
    movEnabled: false,
  },
};

function finiteNumber(raw: unknown, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function nullableNumber(raw: unknown): number | null {
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function booleanOr(raw: unknown, fallback: boolean): boolean {
  return typeof raw === "boolean" ? raw : fallback;
}

function parseLevels(raw: unknown): RatingLadderLevel[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const levels: RatingLadderLevel[] = [];
  for (const entry of raw) {
    if (entry == null || typeof entry !== "object") return null;
    const row = entry as Record<string, unknown>;
    const code = typeof row.code === "string" ? row.code.trim() : "";
    const rank = Number(row.rank);
    const initialRating = Number(row.initialRating);
    if (!code || !Number.isFinite(rank) || !Number.isFinite(initialRating)) {
      return null;
    }
    levels.push({
      code,
      rank,
      label: typeof row.label === "string" && row.label.trim() ? row.label.trim() : code,
      initialRating,
      promoteAt: nullableNumber(row.promoteAt),
      demoteAt: nullableNumber(row.demoteAt),
    });
  }
  return levels.sort((a, b) => a.rank - b.rank);
}

/** Mescla um doc (parcial) de `ratingLadders` sobre os defaults hardcoded. */
export function parseLadderConfig(
  sportCode: string,
  raw: Record<string, unknown> | undefined,
): RatingLadderConfig {
  const defaults = DEFAULT_LADDER_CONFIG;
  const glickoRaw = (raw?.glicko ?? {}) as Record<string, unknown>;
  const ladderRaw = (raw?.ladder ?? {}) as Record<string, unknown>;
  const flagsRaw = (raw?.flags ?? {}) as Record<string, unknown>;

  return {
    sportCode,
    levels: parseLevels(raw?.levels) ?? defaults.levels,
    glicko: {
      initialRd: finiteNumber(glickoRaw.initialRd, defaults.glicko.initialRd),
      minRd: finiteNumber(glickoRaw.minRd, defaults.glicko.minRd),
      maxRd: finiteNumber(glickoRaw.maxRd, defaults.glicko.maxRd),
      tau: finiteNumber(glickoRaw.tau, defaults.glicko.tau),
      initialVolatility: finiteNumber(
        glickoRaw.initialVolatility,
        defaults.glicko.initialVolatility,
      ),
      inactivityRdPerWeek: finiteNumber(
        glickoRaw.inactivityRdPerWeek,
        defaults.glicko.inactivityRdPerWeek,
      ),
    },
    ladder: {
      minRatedMatches: finiteNumber(
        ladderRaw.minRatedMatches,
        defaults.ladder.minRatedMatches,
      ),
      maxRdForDecision: finiteNumber(
        ladderRaw.maxRdForDecision,
        defaults.ladder.maxRdForDecision,
      ),
      relegationObservationDays: finiteNumber(
        ladderRaw.relegationObservationDays,
        defaults.ladder.relegationObservationDays,
      ),
      relegationObservationMinMatches: finiteNumber(
        ladderRaw.relegationObservationMinMatches,
        defaults.ladder.relegationObservationMinMatches,
      ),
      relegationRecoveryMargin: finiteNumber(
        ladderRaw.relegationRecoveryMargin,
        defaults.ladder.relegationRecoveryMargin,
      ),
      promotionProtectionDays: finiteNumber(
        ladderRaw.promotionProtectionDays,
        defaults.ladder.promotionProtectionDays,
      ),
    },
    flags: {
      ratingEnabled: booleanOr(flagsRaw.ratingEnabled, defaults.flags.ratingEnabled),
      shadowMode: booleanOr(flagsRaw.shadowMode, defaults.flags.shadowMode),
      notificationsEnabled: booleanOr(
        flagsRaw.notificationsEnabled,
        defaults.flags.notificationsEnabled,
      ),
      autoPromotionEnabled: booleanOr(
        flagsRaw.autoPromotionEnabled,
        defaults.flags.autoPromotionEnabled,
      ),
      autoRelegationEnabled: booleanOr(
        flagsRaw.autoRelegationEnabled,
        defaults.flags.autoRelegationEnabled,
      ),
      movEnabled: booleanOr(flagsRaw.movEnabled, defaults.flags.movEnabled),
    },
  };
}

/**
 * Carrega `ratingLadders/{sportCode}` (fallback: `ratingLadders/default`,
 * depois defaults hardcoded). Nunca lança por doc ausente/malformado.
 */
export async function loadRatingLadderConfig(
  db: Firestore,
  sportCode: string,
): Promise<RatingLadderConfig> {
  let data: Record<string, unknown> | undefined;
  try {
    const snap = await db.doc(`ratingLadders/${sportCode}`).get();
    if (snap.exists) {
      data = snap.data();
    } else {
      const fallback = await db.doc("ratingLadders/default").get();
      if (fallback.exists) data = fallback.data();
    }
  } catch {
    data = undefined;
  }
  return parseLadderConfig(sportCode, data);
}

/** Nível da escada pelo código exato (novo) ou por aliasing de rank (legado). */
export function resolveLadderLevel(
  config: RatingLadderConfig,
  rawLevel: unknown,
): RatingLadderLevel {
  const floor = config.levels[0];
  if (typeof rawLevel === "string" && rawLevel.trim()) {
    const code = rawLevel.trim();
    const exact = config.levels.find((level) => level.code === code);
    if (exact) return exact;
    // Legados (`iniciante`, `intermediario`, `open`, `basico`, `livre`) casam
    // pelo rank unificado: o alias aponta para o degrau de mesmo rank.
    const rank = levelRank(code);
    if (rank != null) {
      const byRank = config.levels.find((level) => level.rank === rank);
      if (byRank) return byRank;
      // Rank sem degrau exato (ex.: legado acima do teto): maior degrau ≤ rank.
      const below = [...config.levels]
        .reverse()
        .find((level) => level.rank <= rank);
      if (below) return below;
    }
  }
  return floor;
}

/** Próximo degrau acima/abaixo na escada (null nas extremidades). */
export function adjacentLevel(
  config: RatingLadderConfig,
  current: RatingLadderLevel,
  direction: "up" | "down",
): RatingLadderLevel | null {
  const index = config.levels.findIndex((level) => level.code === current.code);
  if (index < 0) return null;
  const next = direction === "up" ? index + 1 : index - 1;
  return config.levels[next] ?? null;
}
