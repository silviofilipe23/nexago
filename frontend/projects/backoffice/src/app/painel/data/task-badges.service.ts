import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { dateKeyOf, myDueCount } from '../tarefas/data/task';
import { TasksRepository } from '../tarefas/data/tasks.repository';

/**
 * Número de Tarefas na sidebar: minhas abertas atrasadas ou vencendo hoje. Lê uma vez por sessão;
 * o quadro publica o número fresco a cada mudança ao vivo.
 */
@Injectable({ providedIn: 'root' })
export class TaskBadgesService {
  private readonly auth = inject(AuthService);
  private readonly repo = inject(TasksRepository);
  readonly mineDue = signal<number | null>(null);
  private loading: Promise<void> | null = null;

  load(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) return Promise.resolve();
    // Sem badge é melhor que badge errado.
    this.loading ??= this.repo
      .mine(uid)
      .then((tasks) => {
        if (this.mineDue() === null) this.mineDue.set(myDueCount(tasks, uid, dateKeyOf(new Date())));
      })
      .catch(() => undefined);
    return this.loading;
  }

  set(count: number): void {
    this.mineDue.set(count);
  }
}
