/** Controle da tela "Grade do dia" — a programação das quadras. Como o Multi-quadras, não há card
 *  montado: o overlay lê as partidas do torneio (públicas); o painel só liga e filtra categoria. */
export interface BroadcastGrade {
  on: boolean;
  /** Categoria em destaque; os outros jogos ficam esmaecidos. `null` = todas. */
  categoryId: string | null;
}

export const DEFAULT_BROADCAST_GRADE: BroadcastGrade = { on: false, categoryId: null };

export function gradeFromRaw(raw: unknown): BroadcastGrade {
  const d = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const cat = d['categoryId'];
  return { on: d['on'] === true, categoryId: typeof cat === 'string' && cat.trim() ? cat.trim() : null };
}
