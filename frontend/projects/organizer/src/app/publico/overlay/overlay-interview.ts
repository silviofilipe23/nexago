import { signal } from '@angular/core';
import type { BroadcastInterview } from '../../painel/data/broadcast-control';

/** Entrada, troca e saída da tarja de entrevista.
 *
 *  Os blocos ficam no DOM enquanto saem — o CSS anima pela fase (`in`/`swap`/`out`) — e só
 *  depois o conteúdo troca ou desmonta. Por isso não é `@if` + `animate.leave`: a troca de
 *  entrevistado é saída, espera e entrada, e o bug do topo e a marca não saem numa troca. */

/** `swap`: o entrevistado sai pra outro entrar; `out`: a tarja inteira sai do ar. */
export type InterviewPhase = 'in' | 'swap' | 'out';

export interface InterviewStage {
  shown: BroadcastInterview | null;
  phase: InterviewPhase;
}

export interface InterviewStageStep {
  stage: InterviewStage;
  /** Quando não nulo, `stageSettled` decide o que vem depois deste tempo. */
  settleInMs: number | null;
}

export const STAGE_EMPTY: InterviewStage = { shown: null, phase: 'in' };

/** Espera da troca de entrevistado, do protótipo do dono. */
export const INTERVIEW_SWAP_MS = 520;
/** Saída escalonada completa: o card é o último a sair — `(3 − 1) × 60 ms` de atraso + 600 ms
 *  do deslize. Desmontar antes cortaria a animação no meio. */
export const INTERVIEW_EXIT_MS = 720;

/** Reação a um pedido novo quando nenhuma transição está pendente. */
export function stageToward(stage: InterviewStage, target: BroadcastInterview | null): InterviewStageStep {
  if (!target) {
    if (!stage.shown) return { stage, settleInMs: null };
    return { stage: { shown: stage.shown, phase: 'out' }, settleInMs: INTERVIEW_EXIT_MS };
  }
  if (!stage.shown || stage.shown.key === target.key) return { stage: { shown: target, phase: 'in' }, settleInMs: null };
  return { stage: { shown: stage.shown, phase: 'swap' }, settleInMs: INTERVIEW_SWAP_MS };
}

/** Fim da espera: entra o pedido MAIS RECENTE. Tirada do ar no meio de uma troca ainda deve a
 *  saída do bug e da marca, que não saem numa troca. */
export function stageSettled(stage: InterviewStage, target: BroadcastInterview | null): InterviewStageStep {
  if (!target && stage.phase === 'swap' && stage.shown) {
    return { stage: { shown: stage.shown, phase: 'out' }, settleInMs: INTERVIEW_EXIT_MS };
  }
  return { stage: target ? { shown: target, phase: 'in' } : STAGE_EMPTY, settleInMs: null };
}

/** Aplica os passos com timer. Pedido que chega com transição pendente só atualiza o alvo — o
 *  fim da espera lê o mais recente, então rajada de cliques no painel não empilha trocas. */
export class InterviewStageDriver {
  readonly stage = signal<InterviewStage>(STAGE_EMPTY);
  private target: BroadcastInterview | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  push(target: BroadcastInterview | null): void {
    this.target = target;
    if (this.timer == null) this.apply(stageToward(this.stage(), target));
  }

  destroy(): void {
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = null;
  }

  private apply(step: InterviewStageStep): void {
    this.stage.set(step.stage);
    if (step.settleInMs == null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.apply(stageSettled(this.stage(), this.target));
    }, step.settleInMs);
  }
}

export type PodiumTone = 'ouro' | 'prata' | 'bronze';

export function podiumToneOf(rankingPos: number | null): PodiumTone | null {
  if (rankingPos === 1) return 'ouro';
  if (rankingPos === 2) return 'prata';
  if (rankingPos === 3) return 'bronze';
  return null;
}
