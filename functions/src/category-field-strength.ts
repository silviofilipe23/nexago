/**
 * Força real do campo de uma categoria LIVRE (spec 2026-09-10).
 *
 * O preset `livre` (faixa 0–6) pesa 0.125 na tabela de presets porque o peso foi
 * escolhido pelo PISO declarado da faixa. Quando o campo que de fato se inscreveu
 * é forte, esse peso pune a categoria inteira: no `DESAFIO OPEN - JHON JHON`, 5
 * das 10 duplas tinham um Open e o campeão saiu com 125 pontos.
 *
 * Este módulo é PURO (sem I/O) e responde a uma pergunta só: dados os degraus das
 * duplas, quanto vale esta categoria? A leitura do Firestore mora em
 * `category-field-strength-store.ts`.
 */

/** Piso e teto do peso medido (D3: o Livre nunca alcança o Elite, 1.2). */
export const LIVRE_MIN_WEIGHT = 0.125;
export const LIVRE_MAX_WEIGHT = 1;

/**
 * Degrau de uma dupla = o do integrante MAIS FORTE — a mesma convenção que
 * `category-level-eligibility.ts` usa para decidir quem pode se inscrever
 * ("Para duplas, vale o atleta de MAIOR nível"). `null` quando nenhum integrante
 * tem degrau conhecido.
 */
export function teamLevelRank(
  memberRanks: Array<number | null | undefined>,
): number | null {
  let best: number | null = null;
  for (const rank of memberRanks) {
    if (typeof rank !== "number" || !Number.isFinite(rank)) continue;
    if (best == null || rank > best) best = rank;
  }
  return best;
}

/**
 * Degrau médio → peso, ancorado na escada de presets FECHADOS. `Math.round` (D7)
 * em vez de piso: com piso, um campo de 9 duplas Open e 1 intermediária (média
 * 5.6) pagaria 0.5 e o teto de 1.0 seria inalcançável fora de um Open puro.
 */
export function weightFromRank(rank: number): number {
  if (!Number.isFinite(rank)) return LIVRE_MIN_WEIGHT;
  const step = Math.round(rank);
  const weight = step <= 1 ? 0.125 : step <= 3 ? 0.25 : step <= 5 ? 0.5 : 1;
  return Math.min(LIVRE_MAX_WEIGHT, Math.max(LIVRE_MIN_WEIGHT, weight));
}

export interface FieldStrength {
  /** Média NÃO arredondada dos degraus das duplas — guardada para auditoria. */
  fieldRank: number;
  /** Peso já arredondado e clampado. */
  weight: number;
  /** Duplas que entraram na média (as sem degrau algum ficam de fora). */
  measuredTeams: number;
}

/**
 * Média dos degraus das duplas mensuráveis. `null` quando NENHUMA dupla é
 * mensurável — nesse caso o chamador NÃO carimba: a premiação cai no peso
 * declarado e tenta medir de novo depois, já que os atletas podem declarar nível
 * mais tarde. Carimbar um zero congelaria o pior caso para sempre.
 */
export function fieldStrengthFromTeamRanks(
  teamRanks: Array<number | null>,
): FieldStrength | null {
  const known = teamRanks.filter(
    (rank): rank is number => typeof rank === "number" && Number.isFinite(rank),
  );
  if (known.length === 0) return null;
  const fieldRank = known.reduce((sum, rank) => sum + rank, 0) / known.length;
  return {
    fieldRank,
    weight: weightFromRank(fieldRank),
    measuredTeams: known.length,
  };
}
