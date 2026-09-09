import type { DrawSessionPot } from '../data/draw-session.model';
import { revealCycleMs } from './draw-reveal-phase';

/**
 * Quando o modo automático deve disparar a próxima revelação.
 *
 * O maestro do ritmo é o CONSOLE, não o servidor: agendar revelação no servidor
 * custaria uma função por revelação, e "console fechou, show pausou" é
 * exatamente o comportamento que se quer — nada é sorteado sem alguém
 * conduzindo.
 *
 * A regra que não pode ser esquecida é o intervalo contar a partir do FIM do
 * ciclo da revelação anterior, e não do começo dela. Contando do começo, um
 * intervalo curto atropelaria o próprio show: a revelação seguinte entraria por
 * cima do spotlight da anterior no telão.
 */
export interface AutoDrawInput {
  playing: boolean;
  /** Instante da última revelação, ou `null` quando ainda não houve nenhuma. */
  lastRevealAt: number | null;
  intervalMs: number;
  now: number;
  /** Já existe uma chamada em voo. */
  pending: boolean;
  done: boolean;
}

export function shouldAutoDraw(input: AutoDrawInput): boolean {
  if (!input.playing || input.pending || input.done) return false;
  if (input.lastRevealAt == null) return true;
  return input.now - input.lastRevealAt >= revealCycleMs() + input.intervalMs;
}

/**
 * A revelação de número `revealedCount + 1` abre um pote novo?
 *
 * É o que o modo híbrido usa pra pausar sozinho entre potes — o respiro que dá
 * ao organizador espaço pra comentar sem travar o ritmo dentro do pote.
 * `revealedCount` é quantas já saíram.
 */
export function crossesPotBoundary(
  pots: readonly DrawSessionPot[],
  revealedCount: number,
): boolean {
  if (revealedCount <= 0) return false;

  let consumed = 0;
  for (const pot of pots) {
    consumed += pot.teamIds.length;
    // Fronteira é o instante em que um pote acabou E ainda existe pote adiante.
    if (consumed === revealedCount) return consumed < totalOf(pots);
    if (consumed > revealedCount) return false;
  }
  return false;
}

function totalOf(pots: readonly DrawSessionPot[]): number {
  return pots.reduce((sum, pot) => sum + pot.teamIds.length, 0);
}
