import type { RankingAthlete, RankingCard } from '../../painel/data/broadcast-ranking';

/** Linha da tabela: um atleta pode estar só no top 10 de antes (sai), só no de depois (entra) ou
 *  nos dois (desliza). `idx*` é a posição 0-based na tela em cada estado; `null` = fora. */
export interface RankingRow {
  athlete: RankingAthlete;
  idxBefore: number | null;
  idxAfter: number | null;
}

export type RankingMove = { kind: 'up' | 'down'; n: number } | { kind: 'same' } | { kind: 'new' };

export const RANKING_ROW_PITCH = 76;
/** Entra o "depois" ~2,6 s depois do "antes" no modo automático. */
export const RANKING_SWITCH_MS = 2600;
export const RANKING_ROW_STAGGER_MS = 90;
export const RANKING_COUNT_MS = 1000;

/** União das duas listas, na ordem do "depois" (quem sai vai pro fim): é a ordem de entrada em
 *  cascata. O `id` é a identidade que faz a linha DESLIZAR em vez de recriar. */
export function rankingRowsOf(card: RankingCard): RankingRow[] {
  const beforeIdx = new Map(card.before.map((a, i) => [a.id, i] as const));
  const rows: RankingRow[] = card.after.map((a, i) => ({ athlete: a, idxBefore: beforeIdx.get(a.id) ?? null, idxAfter: i }));
  const afterIds = new Set(card.after.map((a) => a.id));
  card.before.forEach((a, i) => {
    if (!afterIds.has(a.id)) rows.push({ athlete: a, idxBefore: i, idxAfter: null });
  });
  return rows;
}

/** Movimentação no RANKING INTEIRO: ▲ sobe, ▼ cai, — igual, "Novo" = não tinha pontos antes ou
 *  vinha de fora do top 10. */
export function rankingMoveOf(a: Pick<RankingAthlete, 'posBefore' | 'posAfter'>): RankingMove {
  if (a.posBefore == null || a.posBefore > 10) return { kind: 'new' };
  if (a.posBefore > a.posAfter) return { kind: 'up', n: a.posBefore - a.posAfter };
  if (a.posBefore < a.posAfter) return { kind: 'down', n: a.posAfter - a.posBefore };
  return { kind: 'same' };
}

/** "2.960" — milhar com ponto, como no resto do produto. */
export function rankingPointsText(n: number): string {
  return Math.round(n).toLocaleString('pt-BR');
}
