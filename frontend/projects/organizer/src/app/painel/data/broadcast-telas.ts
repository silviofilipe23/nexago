/** Controle das telas "Início" e "Fim" da transmissão — duas telas cheias, trocadas pelo painel.
 *
 *  Início: contagem até a transmissão começar. A contagem NÃO é um cronômetro gravado: o doc guarda o
 *  carimbo do servidor do início e a duração, e cada tela calcula o que falta (como o Intervalo).
 *  Fim: agradecimento + card da próxima etapa (vem do card de Próximos eventos, montado no painel). */
export type TelasTela = 'ini' | 'fim';

export interface BroadcastTelas {
  on: boolean;
  tela: TelasTela;
  /** Duração da contagem do Início, em segundos (5/10/15 min, ±1 min). */
  durationSec: number;
  /** Início da contagem (carimbo do servidor); `null` = contagem não iniciada. */
  startedAt: Date | null;
}

export const TELAS_MAX_SEC = 99 * 60 + 59;

export const DEFAULT_BROADCAST_TELAS: BroadcastTelas = { on: false, tela: 'ini', durationSec: 600, startedAt: null };

export function telasFromRaw(raw: unknown): BroadcastTelas {
  const d = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const dur = d['durationSec'];
  const started = d['startedAt'] as { toDate?: () => Date } | undefined;
  return {
    on: d['on'] === true,
    tela: d['tela'] === 'fim' ? 'fim' : 'ini',
    durationSec: typeof dur === 'number' && Number.isFinite(dur) && dur >= 0 ? Math.min(Math.trunc(dur), TELAS_MAX_SEC) : DEFAULT_BROADCAST_TELAS.durationSec,
    startedAt: typeof started?.toDate === 'function' ? started.toDate() : null,
  };
}
