import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { callableErrorMessage } from '../../../data/callable-error';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import { postResultRows, type BlogPostMetrics } from '../data/blog-metrics';
import { BlogMetricsRepository } from '../data/blog-metrics.repository';

type State = { state: 'loading' } | { state: 'ok'; metrics: BlogPostMetrics } | { state: 'error'; message: string };

/**
 * "Resultado do post" no painel lateral do editor (só post publicado): leituras do app agregadas
 * em `blogReads` + os contadores que o doc já tem ("Ajudou" e leitores).
 */
@Component({
  selector: 'bo-blog-post-result',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, RouterLink],
  template: `
    <bo-panel-card pad="sm" title="Resultado do post" kicker="Desde a publicação · app">
      @switch (result().state) {
        @case ('loading') {
          <div class="skeleton" aria-busy="true"></div>
        }
        @case ('error') {
          <p class="error" role="status">Não foi possível carregar o resultado. {{ errorMessage() }}</p>
          <button type="button" class="bo-mini-btn" (click)="load(postId())">Tentar de novo</button>
        }
        @case ('ok') {
          <dl class="rows">
            @for (row of rows(); track row.label) {
              <div class="row">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </div>
            }
          </dl>
          <a class="comments" routerLink="/painel/conteudo/blog/comentarios" [queryParams]="{ post: postId(), aba: 'approved' }">
            Comentários: {{ commentCount() }} {{ commentCount() === 1 ? 'aprovado' : 'aprovados' }} →
          </a>
          <p class="foot">Leituras pelo site não entram.</p>
        }
      }
    </bo-panel-card>
  `,
  styles: `
    .rows { margin: 0; display: flex; flex-direction: column; }
    .row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid var(--nx-line); }
    .row:first-child { border-top: none; padding-top: 0; }
    dt { font-size: 12.5px; color: var(--nx-text-mute); }
    dd { margin: 0; font-family: var(--nx-font-mono); font-size: 13px; font-weight: 600; color: var(--nx-text); white-space: nowrap; }
    .comments { display: inline-block; margin-top: 10px; font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; color: var(--nx-orange-400); text-decoration: none; }
    .comments:hover { color: var(--nx-orange-500); }
    .foot { margin: 10px 0 0; font-size: 11px; color: var(--nx-text-dim); }
    .error { margin: 0 0 10px; font-size: 12px; line-height: 1.45; color: var(--nx-pending); }
    .skeleton { height: 150px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); opacity: 0.6; }
  `,
})
export class BlogPostResultComponent {
  private readonly repository = inject(BlogMetricsRepository);

  readonly postId = input.required<string>();
  readonly hasCta = input(false);
  readonly helpfulCount = input(0);
  readonly readCount = input(0);
  /** Aprovados (`commentCount` do post). */
  readonly commentCount = input(0);

  protected readonly result = signal<State>({ state: 'loading' });
  private seq = 0;

  protected readonly errorMessage = computed(() => {
    const r = this.result();
    return r.state === 'error' ? r.message : '';
  });

  protected readonly rows = computed(() => {
    const r = this.result();
    return r.state === 'ok'
      ? postResultRows(r.metrics, { hasCta: this.hasCta(), helpfulCount: this.helpfulCount(), readCount: this.readCount() })
      : [];
  });

  constructor() {
    effect(() => {
      const id = this.postId();
      untracked(() => void this.load(id));
    });
  }

  async load(id: string): Promise<void> {
    const seq = ++this.seq;
    this.result.set({ state: 'loading' });
    try {
      const metrics = await this.repository.post(id);
      if (seq === this.seq) {
        this.result.set({ state: 'ok', metrics });
      }
    } catch (error) {
      if (seq === this.seq) {
        this.result.set({ state: 'error', message: callableErrorMessage(error) });
      }
    }
  }
}
