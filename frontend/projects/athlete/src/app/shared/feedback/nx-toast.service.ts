import { Injectable, signal } from '@angular/core';
import type { NxFeedbackAction, NxFeedbackTone } from './nx-feedback.types';

/** Máximo de toasts empilhados; o mais antigo sai pra abrir espaço (design 12). */
const MAX_STACK = 3;
/** Auto-dismiss padrão. Com ação vai a 8s: o atleta precisa de tempo pra decidir. */
const DURATION_PLAIN = 5000;
const DURATION_WITH_ACTION = 8000;

export interface NxToast {
  readonly id: number;
  readonly tone: NxFeedbackTone;
  readonly title: string;
  readonly body?: string;
  readonly action?: NxFeedbackAction;
  /** Duração total, em ms — alimenta também a barra de progresso do host. */
  readonly durationMs: number;
}

interface ToastTimer {
  handle: ReturnType<typeof setTimeout>;
  /** Quanto ainda falta quando o timer está pausado (mouse em cima / foco dentro). */
  remainingMs: number;
  resumedAt: number;
}

/** Fila de toasts do portal. Feedback de AÇÃO — nunca use pra estado persistente
 *  (isso é banner) nem pra erro que o atleta precisa consertar num campo (isso é
 *  inline). Toast some sozinho; se a informação não pode sumir, ela não é toast. */
@Injectable({ providedIn: 'root' })
export class NxToastService {
  private readonly items = signal<readonly NxToast[]>([]);
  readonly toasts = this.items.asReadonly();

  private nextId = 1;
  private readonly timers = new Map<number, ToastTimer>();

  show(toast: Omit<NxToast, 'id' | 'durationMs'> & { durationMs?: number }): number {
    const id = this.nextId++;
    const durationMs =
      toast.durationMs ?? (toast.action ? DURATION_WITH_ACTION : DURATION_PLAIN);
    const next = [...this.items(), { ...toast, id, durationMs }];

    // Estoura a pilha: descarta os mais antigos (e os timers deles junto).
    for (const dropped of next.slice(0, Math.max(0, next.length - MAX_STACK))) {
      this.clearTimer(dropped.id);
    }
    this.items.set(next.slice(-MAX_STACK));
    this.startTimer(id, durationMs);
    return id;
  }

  success(title: string, body?: string): number {
    return this.show({ tone: 'success', title, body });
  }

  error(title: string, body?: string, action?: NxFeedbackAction): number {
    return this.show({ tone: 'error', title, body, action });
  }

  warning(title: string, body?: string, action?: NxFeedbackAction): number {
    return this.show({ tone: 'warning', title, body, action });
  }

  info(title: string, body?: string, action?: NxFeedbackAction): number {
    return this.show({ tone: 'info', title, body, action });
  }

  dismiss(id: number): void {
    this.clearTimer(id);
    this.items.update((list) => list.filter((t) => t.id !== id));
  }

  /** Congela o auto-dismiss enquanto o ponteiro/foco está sobre a pilha, pra
   *  ninguém perder um erro com ação no meio da leitura. */
  pauseAll(): void {
    const now = Date.now();
    for (const [id, timer] of this.timers) {
      clearTimeout(timer.handle);
      this.timers.set(id, {
        ...timer,
        remainingMs: Math.max(0, timer.remainingMs - (now - timer.resumedAt)),
      });
    }
  }

  resumeAll(): void {
    for (const [id, timer] of this.timers) {
      this.startTimer(id, timer.remainingMs);
    }
  }

  private startTimer(id: number, remainingMs: number): void {
    const existing = this.timers.get(id);
    if (existing) {
      clearTimeout(existing.handle);
    }
    this.timers.set(id, {
      handle: setTimeout(() => this.dismiss(id), remainingMs),
      remainingMs,
      resumedAt: Date.now(),
    });
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer.handle);
      this.timers.delete(id);
    }
  }
}
