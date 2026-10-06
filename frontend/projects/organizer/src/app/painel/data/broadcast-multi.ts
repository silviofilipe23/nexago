/** Controle da tela Multi-quadras — placar de TODAS as quadras ao vivo.
 *
 *  Diferente do Pré-jogo e do Ranking, aqui NÃO há card montado no painel: o overlay lê as
 *  partidas do torneio (públicas) e atualiza sozinho a cada ponto. O painel só liga/desliga, escolhe
 *  o modo e destaca uma quadra. */
export type MultiMode = 'full' | 'strip';

export interface BroadcastMulti {
  on: boolean;
  /** `full` = tela cheia opaca com cabeçalho e patrocinadores; `strip` = faixa sobre o vídeo. */
  mode: MultiMode;
  /** Quadra com borda branca de destaque; `null` = nenhuma. */
  focusCourtId: string | null;
}

export const DEFAULT_BROADCAST_MULTI: BroadcastMulti = { on: false, mode: 'full', focusCourtId: null };

export function multiFromRaw(raw: unknown): BroadcastMulti {
  const d = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const focus = d['focusCourtId'];
  return {
    on: d['on'] === true,
    mode: d['mode'] === 'strip' ? 'strip' : 'full',
    focusCourtId: typeof focus === 'string' && focus.trim() ? focus.trim() : null,
  };
}
