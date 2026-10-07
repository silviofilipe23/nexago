/** Controle da tela "Bolão ao vivo" — a divisão dos palpites da partida entre as duas duplas.
 *
 *  Sem card montado: o overlay conta os palpites sozinho (`tournamentPredictions/{id}/entries` tem
 *  leitura pública) da partida que está na tela. O painel só liga e desliga. */
export interface BroadcastBolao {
  on: boolean;
}

export const DEFAULT_BROADCAST_BOLAO: BroadcastBolao = { on: false };

export function bolaoFromRaw(raw: unknown): BroadcastBolao {
  const d = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return { on: d['on'] === true };
}
