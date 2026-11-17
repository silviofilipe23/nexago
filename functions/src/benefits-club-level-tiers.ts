/**
 * Clube de Vantagens Nexa · desconto por elo do SandRanking (`partners/{id}.levelTiers`).
 *
 * O benefício-base do parceiro (`benefitHighlight`, `benefitTitle`, `couponCode`) vale para todo
 * mundo. Cada faixa vale "a partir do elo X" e troca o texto e o cupom: o atleta fica com a faixa
 * mais alta que o elo dele alcança. O cupom da faixa mora em `partnerPrivate/{id}.tierCoupons` e só
 * sai pela `claimBenefit`, porque o doc público é lido por qualquer pessoa logada.
 *
 * O elo é o espelho `users/{uid}.sandRank` (sand-rank-sync.ts), o mesmo que o atleta vê no app.
 */
import {SAND_RANK_TRACK} from "./sand-rank-engine";

type Raw = Record<string, unknown>;

/** Elos na ordem da escada (Iniciante → Lenda). */
export const SAND_RANK_CODES: readonly string[] = [...new Set(SAND_RANK_TRACK.map((s) => s.rankCode))];
/** O primeiro elo é o do benefício-base: faixa só a partir do segundo. */
export const LEVEL_TIER_RANKS: readonly string[] = SAND_RANK_CODES.slice(1);
export const MAX_LEVEL_TIERS = LEVEL_TIER_RANKS.length;

export interface LevelTier {
  minRank: string;
  benefitHighlight: string;
  benefitTitle: string;
}

function isObj(v: unknown): v is Raw {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

const rankOrder = (code: string): number => SAND_RANK_CODES.indexOf(code);

/**
 * Lê `partner.levelTiers`: só faixas bem-formadas, uma por elo, em ordem crescente. Item malformado
 * (só por escrita fora do backoffice) é ignorado: o atleta fica no benefício-base.
 */
export function parseLevelTiers(raw: unknown): LevelTier[] {
  if (!Array.isArray(raw)) return [];
  const byRank = new Map<string, LevelTier>();
  for (const item of raw) {
    if (!isObj(item)) continue;
    const {minRank, benefitHighlight, benefitTitle} = item;
    if (typeof minRank !== "string" || !LEVEL_TIER_RANKS.includes(minRank) || byRank.has(minRank)) continue;
    if (typeof benefitHighlight !== "string" || benefitHighlight.length > 24) continue;
    if (typeof benefitTitle !== "string" || !benefitTitle.trim() || benefitTitle.length > 80) continue;
    byRank.set(minRank, {minRank, benefitHighlight, benefitTitle});
  }
  return [...byRank.values()].sort((a, b) => rankOrder(a.minRank) - rankOrder(b.minRank));
}

/** Elo do atleta pelo espelho `sandRank` (código; sem ele, o degrau). Sem nada: o primeiro elo. */
export function sandRankCodeOf(user: Raw | undefined): string {
  const mirror = user?.["sandRank"];
  if (isObj(mirror)) {
    const code = mirror["code"];
    if (typeof code === "string" && SAND_RANK_CODES.includes(code)) return code;
    const step = SAND_RANK_TRACK.find((s) => s.trackIndex === mirror["trackIndex"]);
    if (step) return step.rankCode;
  }
  return SAND_RANK_CODES[0];
}

/** A faixa mais alta que o elo alcança; `null` = benefício-base. */
export function levelTierFor(tiers: readonly LevelTier[], rankCode: string): LevelTier | null {
  const rank = rankOrder(rankCode);
  let best: LevelTier | null = null;
  for (const tier of tiers) if (rankOrder(tier.minRank) <= rank) best = tier;
  return best;
}
