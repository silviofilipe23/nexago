import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { ReviewsActions } from '../../data/actions/reviews.actions';
import { BannerComponent, PageHeaderComponent, StatComponent } from '../../ui/kit';
import {
  PART_LABELS,
  PART_ORDER,
  REPLY_MAX,
  TICKET_STATUS,
  appendPage,
  applyReply,
  authorLabel,
  filterReviews,
  formatAverage,
  formatIsoDate,
  formatShortDate,
  professorOptions,
  reviewErrorMessage,
  type ManagerReview,
  type ManagerReviewsPage,
  type ReviewFilter,
} from './review-view';

const FILTERS: { value: ReviewFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'open', label: 'Chamados abertos' },
  { value: 'low', label: 'Nota baixa' },
  { value: 'comment', label: 'Com comentário' },
];

/** Avaliações das aulas do centro: resumo, filtros e resposta aos chamados (owner/admin). */
@Component({
  selector: 'ct-reviews',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, StatComponent, BannerComponent],
  template: `
    <ct-page-header title="Avaliações" [subtitle]="subtitle()" />
    @if (err()) {
      <ct-banner tone="red" title="Algo deu errado">{{ err() }}</ct-banner>
    }
    <div class="page">
      @if (page(); as p) {
        <div class="ct-stats">
          <ct-stat label="Média do centro" [value]="p.rating == null ? '—' : formatAverage(p.rating)"
            [sub]="p.rating == null ? 'a partir de 3 avaliações · ' + countLabel(p.ratingCount) : countLabel(p.ratingCount)" />
          @for (k of PARTS; track k) {
            <ct-stat [label]="PART_LABELS[k]" [value]="formatAverage(p.averages[k])" sub="média das avaliações" />
          }
          <ct-stat label="Chamados abertos" [value]="'' + p.openTickets" [tone]="p.openTickets ? 'red' : ''" sub="pedem retorno do centro" />
        </div>

        <div class="filters">
          <div class="ct-filter-bar">
            @for (f of FILTERS; track f.value) {
              <button type="button" class="ct-chip" [class.active]="filter() === f.value" (click)="filter.set(f.value)">
                {{ f.label }}{{ f.value === 'open' ? ' · ' + p.openTickets : '' }}
              </button>
            }
          </div>
          @if (professors().length > 1) {
            <select class="ct-input prof" aria-label="Professor" [value]="professor()" (change)="professor.set(value($event))">
              <option value="">Todos os professores</option>
              @for (name of professors(); track name) {
                <option [value]="name">{{ name }}</option>
              }
            </select>
          }
        </div>

        <section class="ct-card flush list">
          @for (r of visible(); track r.id) {
            <article class="item" [class.open]="r.ticket?.status === 'open'">
              <header class="top">
                <div class="ct-grow">
                  <div class="ct-disp">{{ r.title }}</div>
                  <div class="ct-mono">{{ formatShortDate(r.date) }}{{ r.startTime ? ' · ' + r.startTime : '' }}{{ r.professorName ? ' · ' + r.professorName : '' }}</div>
                </div>
                @if (r.ticket; as t) {
                  <span [class]="'ct-pill ' + TICKET[t.status][1]">{{ TICKET[t.status][0] }}</span>
                }
              </header>

              <div class="parts">
                @for (k of PARTS; track k) {
                  @if (r.scores[k]; as s) {
                    <div class="part">
                      <span class="ct-kick">{{ PART_LABELS[k] }}</span>
                      <span class="stars" [class.low]="s.stars <= 2" [attr.aria-label]="s.stars + ' de 5 estrelas'">{{ stars(s.stars) }}</span>
                      @for (tag of s.tags; track tag) {
                        <span class="ct-tag">{{ tag }}</span>
                      }
                    </div>
                  }
                }
              </div>

              @if (r.comment) {
                <p class="comment">“{{ r.comment }}”</p>
              }
              <div class="author ct-dim">{{ authorLabel(r) }}{{ !r.anonymous && r.reviewedOn ? ' · avaliou em ' + formatShortDate(r.reviewedOn) : '' }}</div>

              @if (r.ticket?.reply) {
                <div class="reply">
                  <div class="ct-kick">Resposta do centro{{ r.ticket?.repliedByName ? ' · ' + r.ticket?.repliedByName : '' }}{{ r.ticket?.repliedAt ? ' · ' + formatIsoDate(r.ticket?.repliedAt ?? null) : '' }}</div>
                  <p>{{ r.ticket?.reply }}</p>
                </div>
              }

              @if (r.ticket) {
                <div class="answer">
                  <textarea class="ct-input" rows="3" [attr.maxlength]="REPLY_MAX" [attr.aria-label]="'Resposta para a avaliação de ' + authorLabel(r)"
                    [placeholder]="r.ticket.reply ? 'Nova resposta (substitui a anterior)' : 'Escreva a resposta para o aluno'"
                    [value]="draft(r.id)" [disabled]="busyId() === r.id" (input)="setDraft(r.id, value($event))"></textarea>
                  <div class="answer-foot">
                    <span class="ct-mono count">{{ draft(r.id).length }}/{{ REPLY_MAX }}</span>
                    <span class="ct-grow"></span>
                    <button type="button" class="ct-ghost-btn" [disabled]="!canSend(r.id)" (click)="send(r, false)">Responder</button>
                    <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="!canSend(r.id)" (click)="send(r, true)">
                      {{ busyId() === r.id ? 'Enviando…' : 'Responder e resolver' }}
                    </button>
                  </div>
                </div>
              }
            </article>
          } @empty {
            <div class="ct-empty">
              {{ p.reviews.length ? 'Nenhuma avaliação neste filtro.' : 'Nenhuma avaliação ainda. Depois de cada treino com presença, os alunos avaliam a aula, o professor e o centro pelo app.' }}
            </div>
          }
        </section>

        @if (p.nextCursor) {
          <div class="more">
            <button type="button" class="ct-ghost-btn" [disabled]="loading()" (click)="loadMore()">{{ loading() ? 'Carregando…' : 'Carregar mais' }}</button>
          </div>
        }
      } @else if (loading()) {
        <div class="ct-empty">Carregando…</div>
      }
    </div>
  `,
  styles: `
    .page { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .filters { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: space-between; }
    .prof { width: auto; min-width: 200px; height: 36px; }
    .list { padding: 0; }
    .item { padding: 16px 18px; border-top: 1px solid var(--nx-line); display: flex; flex-direction: column; gap: 10px; }
    .item:first-child { border-top: 0; }
    .item.open { box-shadow: inset 3px 0 0 var(--nx-live); }
    .top { display: flex; align-items: flex-start; gap: 12px; }
    .parts { display: flex; flex-wrap: wrap; gap: 8px 18px; }
    .part { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .stars { color: var(--nx-pending); letter-spacing: 1px; font-size: 13px; }
    .stars.low { color: var(--nx-live); }
    .comment { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--nx-text); white-space: pre-line; }
    .author { font-size: 12px; }
    .reply { padding: 10px 12px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .reply p { margin: 6px 0 0; font-size: 13px; line-height: 1.45; color: var(--nx-text-mute); white-space: pre-line; }
    .answer { display: flex; flex-direction: column; gap: 8px; }
    .answer-foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .count { font-size: 11px; }
    .more { display: flex; justify-content: center; }
  `,
})
export class ReviewsComponent {
  protected readonly ctx = inject(CenterContextService);
  private readonly actions = inject(ReviewsActions);

  protected readonly FILTERS = FILTERS;
  protected readonly PARTS = PART_ORDER;
  protected readonly PART_LABELS = PART_LABELS;
  protected readonly TICKET = TICKET_STATUS;
  protected readonly REPLY_MAX = REPLY_MAX;
  protected readonly formatAverage = formatAverage;
  protected readonly formatShortDate = formatShortDate;
  protected readonly formatIsoDate = formatIsoDate;
  protected readonly authorLabel = authorLabel;

  protected readonly page = signal<ManagerReviewsPage | null>(null);
  protected readonly loading = signal(false);
  protected readonly err = signal('');
  protected readonly filter = signal<ReviewFilter>('all');
  protected readonly professor = signal('');
  protected readonly drafts = signal<Record<string, string>>({});
  protected readonly busyId = signal<string | null>(null);

  protected readonly professors = computed(() => professorOptions(this.page()?.reviews ?? []));
  protected readonly visible = computed(() => filterReviews(this.page()?.reviews ?? [], this.filter(), this.professor()));
  protected readonly subtitle = computed(() => {
    const p = this.page();
    const name = p?.placeName || this.ctx.center()?.name || '';
    return p ? `${name} · ${this.countLabel(p.total)}` : name;
  });

  /** Requisição em voo — uma resposta de outro centro (troca rápida) é descartada. */
  private seq = 0;

  constructor() {
    effect(() => {
      const centerId = this.ctx.activeCenterId();
      if (!centerId) return;
      untracked(() => this.reload());
    });
  }

  protected countLabel(n: number): string {
    return n === 1 ? '1 avaliação' : `${n} avaliações`;
  }

  protected stars(n: number): string {
    const full = Math.max(0, Math.min(5, Math.round(n)));
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  protected draft(id: string): string {
    return this.drafts()[id] ?? '';
  }

  protected setDraft(id: string, text: string): void {
    this.drafts.update((d) => ({ ...d, [id]: text.slice(0, REPLY_MAX) }));
  }

  protected canSend(id: string): boolean {
    return this.busyId() == null && this.draft(id).trim().length > 0;
  }

  private async reload(): Promise<void> {
    const seq = ++this.seq;
    this.page.set(null);
    this.drafts.set({});
    this.professor.set('');
    this.loading.set(true);
    this.err.set('');
    try {
      const p = await this.actions.load(null);
      if (seq === this.seq) this.page.set(p);
    } catch (e) {
      if (seq === this.seq) this.err.set(reviewErrorMessage(e));
    } finally {
      if (seq === this.seq) this.loading.set(false);
    }
  }

  protected async loadMore(): Promise<void> {
    const cursor = this.page()?.nextCursor;
    if (!cursor || this.loading()) return;
    const seq = this.seq;
    this.loading.set(true);
    this.err.set('');
    try {
      const next = await this.actions.load(cursor);
      if (seq === this.seq) this.page.update((cur) => appendPage(cur, next));
    } catch (e) {
      if (seq === this.seq) this.err.set(reviewErrorMessage(e));
    } finally {
      if (seq === this.seq) this.loading.set(false);
    }
  }

  protected async send(r: ManagerReview, resolve: boolean): Promise<void> {
    const text = this.draft(r.id).trim();
    if (!text || this.busyId()) return;
    this.busyId.set(r.id);
    this.err.set('');
    try {
      const result = await this.actions.reply(r, text, resolve);
      this.page.update((p) => (p ? applyReply(p, r, result) : p));
      this.drafts.update((d) => {
        const { [r.id]: _sent, ...rest } = d;
        return rest;
      });
    } catch (e) {
      this.err.set(reviewErrorMessage(e));
    } finally {
      this.busyId.set(null);
    }
  }
}
