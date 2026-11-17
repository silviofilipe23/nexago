/**
 * Clube de Vantagens Nexa · desconto por elo do SandRanking (`partners/{id}.levelTiers`, spec
 * `docs/product/vantagens-nexago-spec.md`, seção "Desconto por elo do SandRanking").
 *
 * O benefício-base do parceiro vale para Iniciante (e quem não tem elo). Cada faixa vale "a partir
 * do elo X" e troca selo, título e cupom: o atleta fica com a faixa mais alta que o elo alcança.
 * O texto vai no doc público; o cupom da faixa, em `partnerPrivate/{id}.tierCoupons` (só a equipe
 * lê). Só com cupom fixo (as rules garantem). Leitura espelha `parseLevelTiers` do servidor
 * (`functions/src/benefits-club-level-tiers.ts`).
 */

/** Elos que abrem faixa, na ordem da escada (Iniciante é o benefício-base). */
export const LEVEL_TIER_RANKS = ['COMPETIDOR', 'DESAFIANTE', 'ELITE', 'MESTRE', 'LENDA'] as const;
export type LevelTierRank = (typeof LEVEL_TIER_RANKS)[number];

export const LEVEL_TIER_RANK_LABELS: Record<LevelTierRank, string> = {
  COMPETIDOR: 'Competidor',
  DESAFIANTE: 'Desafiante',
  ELITE: 'Elite',
  MESTRE: 'Mestre',
  LENDA: 'Lenda',
};

export const LEVEL_TIERS_MAX = LEVEL_TIER_RANKS.length;
// Mesmos limites do benefício-base e do cupom (`partnerValid`, `partnerPrivateValid`).
const TIER_HIGHLIGHT_MAX = 24;
const TIER_TITLE_MAX = 80;
const TIER_COUPON_MAX = 24;

/** Item gravado em `partners/{id}.levelTiers`. */
export interface PartnerLevelTier {
  minRank: LevelTierRank;
  benefitHighlight: string;
  benefitTitle: string;
}

/** `partnerPrivate/{id}.tierCoupons`: o código de cada faixa, pelo elo. */
export type TierCoupons = Partial<Record<LevelTierRank, string>>;

/** Uma faixa no editor: texto cru e o cupom (que vai para o doc privado). */
export interface LevelTierForm {
  minRank: LevelTierRank;
  benefitHighlight: string;
  benefitTitle: string;
  couponCode: string;
}

function isRank(value: unknown): value is LevelTierRank {
  return typeof value === 'string' && (LEVEL_TIER_RANKS as readonly string[]).includes(value);
}

const rankOrder = (rank: LevelTierRank): number => LEVEL_TIER_RANKS.indexOf(rank);

function byLadder<T extends { minRank: LevelTierRank }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => rankOrder(a.minRank) - rankOrder(b.minRank));
}

/**
 * Lê `levelTiers` como o servidor: só faixas bem-formadas, uma por elo (a primeira vence), em
 * ordem da escada. Item malformado é ignorado.
 */
export function levelTiersFromDoc(raw: unknown): PartnerLevelTier[] {
  if (!Array.isArray(raw)) return [];
  const byRank = new Map<LevelTierRank, PartnerLevelTier>();
  for (const item of raw) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    const { minRank, benefitHighlight, benefitTitle } = item as Record<string, unknown>;
    if (!isRank(minRank) || byRank.has(minRank)) continue;
    if (typeof benefitHighlight !== 'string' || benefitHighlight.length > TIER_HIGHLIGHT_MAX) continue;
    if (typeof benefitTitle !== 'string' || benefitTitle.trim() === '' || benefitTitle.length > TIER_TITLE_MAX) continue;
    byRank.set(minRank, { minRank, benefitHighlight, benefitTitle });
  }
  return byLadder([...byRank.values()]);
}

/** Lê `tierCoupons`: só elos conhecidos com código em texto. Ausente = `{}`. */
export function tierCouponsFromDoc(raw: unknown): TierCoupons {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: TierCoupons = {};
  for (const [rank, code] of Object.entries(raw as Record<string, unknown>)) {
    if (isRank(rank) && typeof code === 'string' && code.trim() !== '') out[rank] = code.trim();
  }
  return out;
}

export function levelTierForm(tier: PartnerLevelTier, coupons: TierCoupons): LevelTierForm {
  return { ...tier, couponCode: coupons[tier.minRank] ?? '' };
}

/** Faixa nova com o primeiro elo da escada ainda sem faixa; `null` quando os 5 já têm. */
export function emptyLevelTier(list: readonly LevelTierForm[]): LevelTierForm | null {
  const used = new Set(list.map((t) => t.minRank));
  const rank = LEVEL_TIER_RANKS.find((r) => !used.has(r));
  return rank ? { minRank: rank, benefitHighlight: '', benefitTitle: '', couponCode: '' } : null;
}

function rowError(tier: LevelTierForm, repeated: boolean): string | null {
  if (repeated) return `${LEVEL_TIER_RANK_LABELS[tier.minRank]} já tem faixa: escolha outro elo.`;
  const highlight = tier.benefitHighlight.trim();
  if (highlight === '') return 'Informe o selo.';
  if (highlight.length > TIER_HIGHLIGHT_MAX) return `Selo até ${TIER_HIGHLIGHT_MAX} caracteres (tem ${highlight.length}).`;
  const title = tier.benefitTitle.trim();
  if (title === '') return 'Descreva o benefício.';
  if (title.length > TIER_TITLE_MAX) return `Benefício até ${TIER_TITLE_MAX} caracteres (tem ${title.length}).`;
  const code = tier.couponCode.trim();
  if (code === '') return 'Informe o cupom.';
  if (code.length > TIER_COUPON_MAX) return `Cupom até ${TIER_COUPON_MAX} caracteres (tem ${code.length}).`;
  return null;
}

/** Erro de cada faixa (`null` = ok), na ordem do editor. Elo repetido marca a segunda. */
export function levelTierErrors(list: readonly LevelTierForm[]): Array<string | null> {
  const seen = new Set<LevelTierRank>();
  return list.map((tier) => {
    const repeated = seen.has(tier.minRank);
    seen.add(tier.minRank);
    return rowError(tier, repeated);
  });
}

/** Erro da lista inteira para o form, ou `null`. Fora do cupom fixo as faixas não valem. */
export function levelTiersError(list: readonly LevelTierForm[], fixedCoupon: boolean): string | null {
  if (!fixedCoupon) return null;
  if (list.length > LEVEL_TIERS_MAX) return `No máximo ${LEVEL_TIERS_MAX} faixas.`;
  const errors = levelTierErrors(list);
  const at = errors.findIndex((e) => e !== null);
  return at >= 0 ? `Faixa ${at + 1}: ${errors[at]}` : null;
}

/** O que vai em `levelTiers`: em ordem da escada; `[]` fora do cupom fixo (a rule exige). */
export function levelTiersPayload(list: readonly LevelTierForm[], fixedCoupon: boolean): PartnerLevelTier[] {
  if (!fixedCoupon) return [];
  return byLadder(list).map((t) => ({
    minRank: t.minRank,
    benefitHighlight: t.benefitHighlight.trim(),
    benefitTitle: t.benefitTitle.trim(),
  }));
}

/**
 * O mapa inteiro de `tierCoupons` (substitui o gravado: faixa removida some). `{}` fora do cupom
 * fixo. Elos em ordem da escada, para o "alterado" do editor não depender da ordem das linhas.
 */
export function tierCouponsPayload(list: readonly LevelTierForm[], fixedCoupon: boolean): TierCoupons {
  if (!fixedCoupon) return {};
  const out: TierCoupons = {};
  for (const t of byLadder(list)) {
    const code = t.couponCode.trim();
    if (code !== '') out[t.minRank] = code;
  }
  return out;
}
