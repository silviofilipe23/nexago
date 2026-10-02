import { signal } from '@angular/core';
import type { BroadcastInterview } from '../../painel/data/broadcast-control';

/** Entrada, troca e saída da tarja de entrevista (e, com tempos próprios, da pauta e do
 *  repórter dentro dela).
 *
 *  Os blocos ficam no DOM enquanto saem — o CSS anima pela fase (`in`/`swap`/`out`) — e só
 *  depois o conteúdo troca ou desmonta. Por isso não é `@if` + `animate.leave`: a troca de
 *  entrevistado é saída, espera e entrada, e o bug do topo e a marca não saem numa troca. */

/** `swap`: o conteúdo sai pra outro entrar; `out`: sai do ar. */
export type InterviewPhase = 'in' | 'swap' | 'out';

/** O que o palco mostra precisa de identidade: mudou a `key`, é troca. */
export interface Keyed {
  key: string;
}

export interface Stage<T> {
  shown: T | null;
  phase: InterviewPhase;
}

export type InterviewStage = Stage<BroadcastInterview>;

export interface StageStep<T> {
  stage: Stage<T>;
  /** Quando não nulo, `stageSettled` decide o que vem depois deste tempo. */
  settleInMs: number | null;
}

export interface StageTimings {
  swapMs: number;
  exitMs: number;
}

export const STAGE_EMPTY: Stage<never> = { shown: null, phase: 'in' };

/** Espera da troca de entrevistado, do protótipo do dono. */
export const INTERVIEW_SWAP_MS = 520;
/** Saída escalonada completa: o card é o último a sair — `(3 − 1) × 60 ms` de atraso + 600 ms
 *  do deslize. Desmontar antes cortaria a animação no meio. */
export const INTERVIEW_EXIT_MS = 720;
export const INTERVIEW_TIMINGS: StageTimings = { swapMs: INTERVIEW_SWAP_MS, exitMs: INTERVIEW_EXIT_MS };
/** Pauta: "próxima pergunta" some e volta em 380 ms; sozinha ela sai sem atraso (índice 3). */
export const QUESTION_TIMINGS: StageTimings = { swapMs: 380, exitMs: 600 };
/** Repórter (índice 2): 60 ms de atraso + 600 ms de deslize. */
export const REPORTER_TIMINGS: StageTimings = { swapMs: 380, exitMs: 660 };

/** Reação a um pedido novo quando nenhuma transição está pendente. */
export function stageToward<T extends Keyed>(
  stage: Stage<T>,
  target: T | null,
  timings: StageTimings = INTERVIEW_TIMINGS,
): StageStep<T> {
  if (!target) {
    if (!stage.shown) return { stage, settleInMs: null };
    return { stage: { shown: stage.shown, phase: 'out' }, settleInMs: timings.exitMs };
  }
  if (!stage.shown || stage.shown.key === target.key) return { stage: { shown: target, phase: 'in' }, settleInMs: null };
  return { stage: { shown: stage.shown, phase: 'swap' }, settleInMs: timings.swapMs };
}

/** Fim da espera: entra o pedido MAIS RECENTE. Tirada do ar no meio de uma troca ainda deve a
 *  saída do que não sai numa troca (o bug e a marca). */
export function stageSettled<T extends Keyed>(
  stage: Stage<T>,
  target: T | null,
  timings: StageTimings = INTERVIEW_TIMINGS,
): StageStep<T> {
  if (!target && stage.phase === 'swap' && stage.shown) {
    return { stage: { shown: stage.shown, phase: 'out' }, settleInMs: timings.exitMs };
  }
  return { stage: target ? { shown: target, phase: 'in' } : STAGE_EMPTY, settleInMs: null };
}

/** Aplica os passos com timer. Pedido que chega com transição pendente só atualiza o alvo — o
 *  fim da espera lê o mais recente, então rajada de cliques no painel não empilha trocas. */
export class StageDriver<T extends Keyed> {
  readonly stage = signal<Stage<T>>(STAGE_EMPTY);
  private target: T | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly timings: StageTimings = INTERVIEW_TIMINGS) {}

  push(target: T | null): void {
    this.target = target;
    if (this.timer == null) this.apply(stageToward(this.stage(), target, this.timings));
  }

  /** Troca na hora, sem animação própria — o conteúdo de quem o contém já está entrando. */
  reset(target: T | null): void {
    this.destroy();
    this.target = target;
    this.stage.set(target ? { shown: target, phase: 'in' } : STAGE_EMPTY);
  }

  destroy(): void {
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = null;
  }

  private apply(step: StageStep<T>): void {
    this.stage.set(step.stage);
    if (step.settleInMs == null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.apply(stageSettled(this.stage(), this.target, this.timings));
    }, step.settleInMs);
  }
}

export class InterviewStageDriver extends StageDriver<BroadcastInterview> {}

export type PodiumTone = 'ouro' | 'prata' | 'bronze';

export function podiumToneOf(rankingPos: number | null): PodiumTone | null {
  if (rankingPos === 1) return 'ouro';
  if (rankingPos === 2) return 'prata';
  if (rankingPos === 3) return 'bronze';
  return null;
}
