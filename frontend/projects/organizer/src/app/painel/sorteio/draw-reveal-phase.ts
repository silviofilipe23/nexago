/**
 * Motor de fase do Sorteio ao Vivo — a única fonte de tempo das duas telas.
 *
 * A âncora é o `at` que o SERVIDOR gravou na revelação, nunca um timer local.
 * Isso tem três consequências que valem o módulo existir:
 *
 *  1. o telão da TV e o espelho do console ficam em fase sem se falarem;
 *  2. quem conecta no meio da revelação cai na fase certa, não no começo;
 *  3. um F5 na TV durante a transmissão retoma no ponto exato.
 *
 * Função pura, sem DOM e sem relógio próprio — quem chama passa o `now`.
 */

/** Os dados rolam com os nomes ainda no pote. */
export const ROLL_MS = 2400;
/** Os dados desaceleram e param de frente na dupla sorteada. */
export const LAND_MS = 1100;
/** A dupla toma o telão inteiro: nomes gigantes, estatística e a frase. */
export const SPOTLIGHT_MS = 3500;

export type RevealPhase = 'grid' | 'roll' | 'land' | 'spotlight';

/** Duração de um ciclo completo de revelação. */
export function revealCycleMs(): number {
  return ROLL_MS + LAND_MS + SPOTLIGHT_MS;
}

/**
 * Fase da revelação que começou em `at`.
 *
 * `now` antes de `at` acontece de verdade: o relógio do navegador pode estar
 * alguns segundos atrás do servidor. Tratar isso como "acabou de sair" é melhor
 * que pular a revelação — o pior caso é o espectador ver o rolamento um pouco
 * mais longo, e não perder a revelação inteira.
 */
export function revealPhaseAt(at: number | null, now: number): RevealPhase {
  if (at == null) return 'grid';
  const elapsed = now - at;
  if (elapsed < ROLL_MS) return 'roll';
  if (elapsed < ROLL_MS + LAND_MS) return 'land';
  if (elapsed < revealCycleMs()) return 'spotlight';
  return 'grid';
}

/** Progresso de 0 a 1 dentro do spotlight — move a barra de tempo do telão. */
export function spotlightProgressAt(at: number | null, now: number): number {
  if (at == null) return 0;
  const into = now - at - ROLL_MS - LAND_MS;
  if (into <= 0) return 0;
  return Math.min(1, into / SPOTLIGHT_MS);
}

export interface CountdownParts {
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

/**
 * Contagem regressiva até o horário agendado. Em HORAS, sem "dias": um relógio
 * marcando "1 dia" não cria urgência nenhuma, e "30:00:00" cria.
 */
export function countdownPartsOf(scheduledAt: number | null, now: number): CountdownParts | null {
  if (scheduledAt == null) return null;
  const remaining = scheduledAt - now;
  if (remaining <= 0) return { hours: 0, minutes: 0, seconds: 0, done: true };
  const totalSeconds = Math.floor(remaining / 1000);
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    done: false,
  };
}
