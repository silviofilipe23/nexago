/** Controle da tela "Chaves" — a chave eliminatória de uma categoria (simples ou dupla).
 *
 *  Sem card montado: o overlay lê as partidas do torneio (públicas) e desenha a chave sozinho. O
 *  painel só liga e escolhe a categoria. */
export interface BroadcastChave {
  on: boolean;
  /** Categoria cuja chave aparece; `null` = a primeira que tiver chave eliminatória. */
  categoryId: string | null;
}

export const DEFAULT_BROADCAST_CHAVE: BroadcastChave = { on: false, categoryId: null };

export function chaveFromRaw(raw: unknown): BroadcastChave {
  const d = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const cat = d['categoryId'];
  return { on: d['on'] === true, categoryId: typeof cat === 'string' && cat.trim() ? cat.trim() : null };
}
