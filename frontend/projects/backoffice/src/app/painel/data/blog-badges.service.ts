import { Injectable, inject, signal } from '@angular/core';
import { BlogCommentsRepository } from '../conteudo/blog/data/blog-comments.repository';

/**
 * Selo "Comentários" no menu: pendentes da fila de moderação do blog. Lê uma vez por sessão ao montar
 * o menu; a lista do blog e a fila pedem o número fresco (`refresh`), e moderar ajusta na hora
 * (`adjust`). Sem listener.
 */
@Injectable({ providedIn: 'root' })
export class BlogBadgesService {
  private readonly repository = inject(BlogCommentsRepository);

  readonly pendingComments = signal<number | null>(null);
  private loading: Promise<void> | null = null;

  load(): Promise<void> {
    this.loading ??= this.refresh();
    return this.loading;
  }

  /** Sem selo é melhor que selo errado: falha deixa como estava. */
  async refresh(): Promise<void> {
    try {
      this.pendingComments.set(await this.repository.pendingCount());
    } catch {
      // Mantém o último número conhecido.
    }
  }

  adjust(delta: number): void {
    this.pendingComments.update((n) => (n === null ? n : Math.max(0, n + delta)));
  }
}
