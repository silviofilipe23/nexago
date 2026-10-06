import type { MatchSide } from './serving-player';

/** TEMPO TÉCNICO — o minuto de pausa tática (2 por set, zera a cada set) que a mesa chama.
 *
 *  A contagem de tempos usados continua sendo estado de tela de cada mesa. O que vai pro doc da
 *  partida é só o tempo EM ANDAMENTO, porque o overlay de transmissão precisa enxergá-lo — e como
 *  o tempo médico (ver `medical-timeout.ts`), não é um cronômetro gravado: o doc guarda o carimbo
 *  do servidor e a duração, e cada tela calcula o que falta. Ninguém escreve durante o minuto.
 *
 *  `scoreA`/`scoreB` são o placar do set no instante da chamada: qualquer ponto marcado encerra o
 *  tempo técnico, e comparar com o placar atual é o que faz o overlay sair sozinho, sem depender
 *  da mesa lembrar de apagar o campo. */
export const TECHNICAL_TIMEOUT_SECONDS = 60;

export interface TechnicalTimeout {
  side: MatchSide;
  teamId: string;
  startedAt: Date | null;
  durationSec: number;
  setIndex: number;
  scoreA: number;
  scoreB: number;
}

export function technicalTimeoutFromRaw(raw: unknown): TechnicalTimeout | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const side = o['side'] === 'A' || o['side'] === 'B' ? o['side'] : null;
  if (side == null) return null;
  const started = o['startedAt'] as { toDate?: () => Date } | undefined;
  const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 0);
  return {
    side,
    teamId: typeof o['teamId'] === 'string' ? o['teamId'] : '',
    startedAt: typeof started?.toDate === 'function' ? started.toDate() : null,
    durationSec: typeof o['durationSec'] === 'number' && o['durationSec'] > 0 ? Math.trunc(o['durationSec']) : TECHNICAL_TIMEOUT_SECONDS,
    setIndex: int(o['setIndex']),
    scoreA: int(o['scoreA']),
    scoreB: int(o['scoreB']),
  };
}

/** Quanto falta, em segundos. `startedAt` só chega `null` na janela entre a escrita local e o
 *  carimbo do servidor voltar pelo snapshot — nessa fração mostra o tempo cheio, não zero. */
export function technicalTimeoutRemainingSeconds(timeout: Pick<TechnicalTimeout, 'startedAt' | 'durationSec'>, now: Date): number {
  if (!timeout.startedAt) return timeout.durationSec;
  const elapsed = Math.floor((now.getTime() - timeout.startedAt.getTime()) / 1000);
  return Math.min(Math.max(timeout.durationSec - elapsed, 0), timeout.durationSec);
}

/** Cota do tempo técnico: 2 por equipe em cada set. Estado de tela de cada mesa (o doc só guarda
 *  o minuto em andamento), então recarregar zera — igual ao app. */
export const TECHNICAL_TIMEOUTS_PER_SET = 2;

/** Quantos tempos técnicos cada lado já usou no set corrente. */
export type TechnicalTimeoutCounts = Record<MatchSide, number>;

export const EMPTY_TECHNICAL_TIMEOUT_COUNTS: TechnicalTimeoutCounts = { A: 0, B: 0 };

export function canCallTechnicalTimeout(counts: TechnicalTimeoutCounts, side: MatchSide): boolean {
  return counts[side] < TECHNICAL_TIMEOUTS_PER_SET;
}

/** Chamado é chamado: a cota sai na escolha da equipe, mesmo que a mesa encerre antes do minuto. */
export function countTechnicalTimeout(counts: TechnicalTimeoutCounts, side: MatchSide): TechnicalTimeoutCounts {
  return canCallTechnicalTimeout(counts, side) ? { ...counts, [side]: counts[side] + 1 } : counts;
}
