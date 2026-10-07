/** Controle da tela "Tabela do grupo" — a classificação de uma categoria disputada em grupos.
 *
 *  Como Multi-quadras e Grade do dia, não há card montado: o overlay lê as partidas do torneio
 *  (públicas) e calcula a classificação sozinho. O painel só liga, escolhe a categoria e o modo. */
export type GrupoMode = 'um' | 'todos';

export interface BroadcastGrupo {
  on: boolean;
  /** Categoria cujos grupos aparecem; `null` = a primeira que tiver grupos. */
  categoryId: string | null;
  /** `um` = card de um grupo (tabela + jogos); `todos` = grade 2×2 com os grupos compactos. */
  mode: GrupoMode;
  /** Letra do grupo no modo `um` ("A"); `null` = o primeiro. No modo `todos` é o destacado. */
  group: string | null;
}

export const DEFAULT_BROADCAST_GRUPO: BroadcastGrupo = { on: false, categoryId: null, mode: 'um', group: null };

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function grupoFromRaw(raw: unknown): BroadcastGrupo {
  const d = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    on: d['on'] === true,
    categoryId: text(d['categoryId']),
    mode: d['mode'] === 'todos' ? 'todos' : 'um',
    group: text(d['group']),
  };
}
