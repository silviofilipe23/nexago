import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFunctions } from '../data/functions';
import { PanelCardComponent } from '../ui/panel-card.component';
import { AulasPageComponent } from './aulas-ui';
import {
  CLASS_REVIEW_REPLY_MAX,
  REVIEW_FILTERS,
  REVIEW_PARTS,
  TICKET_LABEL,
  applyReply,
  fetchArenaReviews,
  filterReviews,
  formatAverage,
  professorOptions,
  replyError,
  replyReviewTicket,
  reviewerLabel,
  shortDate,
  shortDateFromIso,
  type ManagerReview,
  type ManagerReviewsPage,
  type ReviewFilter,
} from './reviews.model';

/** Avaliações das aulas — o que os alunos disseram da aula, do professor e da arena depois de
 *  cada treino com presença, e os chamados que pedem retorno da gestão. */
@Component({
  selector: 'ar-panel-aulas-reviews',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AulasPageComponent, PanelCardComponent],
  styleUrl: './aulas-form.scss',
  template: `
    <ar-aulas-page title="Aulas" subtitle="O que os alunos acharam das aulas, dos professores e da arena" tab="avaliacoes">
      @if (loading()) {
        <p class="state-text">Carregando avaliações…</p>
      } @else {
        @if (error(); as err) {
          <div class="error-banner">{{ err }}</div>
        }
        @if (page(); as p) {
          <div class="stats">
            <ar-panel-card pad="sm">
              <div class="s-label">Média do local</div>
              @if (p.rating != null) {
                <div class="s-value">{{ fmt(p.rating) }} <span class="star on">★</span></div>
                <div class="s-sub">{{ p.ratingCount }} {{ p.ratingCount === 1 ? 'avaliação' : 'avaliações' }}</div>
              } @else {
                <div class="s-value dim">—</div>
                <div class="s-sub">a partir de 3 avaliações · {{ p.ratingCount }} até agora</div>
              }
            </ar-panel-card>
            <ar-panel-card pad="sm">
              <div class="s-label">Médias por parte</div>
              <div class="parts">
                @for (part of parts; track part.key) {
                  <div class="part">
                    <span class="part-label">{{ part.label }}</span>
                    <span class="part-value">{{ fmt(p.averages[part.key]) }}</span>
                  </div>
                }
              </div>
              <div class="s-sub">{{ p.total }} {{ p.total === 1 ? 'avaliação' : 'avaliações' }} no total</div>
            </ar-panel-card>
            <ar-panel-card pad="sm">
              <div class="s-label">Chamados abertos</div>
              <div class="s-value" [class.alert]="p.openTickets > 0">{{ p.openTickets }}</div>
              <div class="s-sub">{{ p.openTickets > 0 ? 'alunos esperando retorno' : 'nenhum esperando retorno' }}</div>
            </ar-panel-card>
          </div>

          @if (reviews().length === 0) {
            <ar-panel-card pad="lg">
              <p class="state-text">
                Nenhuma avaliação ainda. Depois de cada treino com presença, os alunos avaliam a aula,
                o professor e a arena pelo app.
              </p>
            </ar-panel-card>
          } @else {
            <div class="filters">
              <div class="chips" role="group" aria-label="Filtrar avaliações">
                @for (f of filterOptions; track f.id) {
                  <button type="button" class="chip" [class.active]="filter() === f.id" [attr.aria-pressed]="filter() === f.id" (click)="filter.set(f.id)">
                    {{ f.label }}
                  </button>
                }
              </div>
              @if (professors().length > 1) {
                <select class="input-box prof-select" aria-label="Professor" [value]="professor() ?? ''" (change)="setProfessor($any($event.target).value)">
                  <option value="">Todos os professores</option>
                  @for (name of professors(); track name) {
                    <option [value]="name">{{ name }}</option>
                  }
                </select>
              }
            </div>

            @if (visible().length === 0) {
              <p class="state-text">Nenhuma avaliação neste filtro.</p>
            }

            <div class="list">
              @for (r of visible(); track r.id) {
                <ar-panel-card>
                  <div class="r-head">
                    <div class="r-titles">
                      <div class="r-title">{{ r.title }}</div>
                      <div class="r-meta">
                        {{ date(r.date) }}{{ r.startTime ? ' · ' + r.startTime : '' }}
                        @if (r.professorName) {
                          · Prof. {{ r.professorName }}
                        }
                      </div>
                    </div>
                    @if (r.ticket; as t) {
                      <span class="badge" [class]="'t-' + t.status">{{ ticketLabel[t.status] }}</span>
                    }
                  </div>

                  <div class="scores">
                    @for (part of parts; track part.key) {
                      @if (r.scores[part.key]; as s) {
                        <div class="score" [class.low]="s.stars <= 2">
                          <span class="score-label">{{ part.label }}</span>
                          <span class="stars" [attr.aria-label]="s.stars + ' de 5 estrelas'">
                            @for (i of five; track i) {
                              <span class="star" [class.on]="i <= s.stars">★</span>
                            }
                          </span>
                          @for (tag of s.tags; track tag) {
                            <span class="tag">{{ tag }}</span>
                          }
                        </div>
                      }
                    }
                  </div>

                  @if (r.comment.trim()) {
                    <p class="comment">“{{ r.comment.trim() }}”</p>
                  }

                  <div class="who">
                    {{ reviewer(r) }}
                    @if (!r.anonymous && r.reviewedOn) {
                      · avaliou em {{ date(r.reviewedOn) }}
                    }
                  </div>

                  @if (r.ticket; as t) {
                    @if (t.reply) {
                      <div class="reply">
                        <div class="reply-head">
                          Resposta{{ t.repliedByName ? ' de ' + t.repliedByName : '' }}{{ t.repliedAt ? ' · ' + isoDate(t.repliedAt) : '' }}
                        </div>
                        <p>{{ t.reply }}</p>
                      </div>
                    }
                    @if (canWrite()) {
                      <div class="reply-form">
                        <textarea
                          class="input-box"
                          rows="3"
                          [attr.maxlength]="replyMax"
                          [disabled]="sending() === r.id"
                          [value]="draft(r.id)"
                          [placeholder]="t.reply ? 'Escreva uma nova resposta…' : 'Responda ao aluno…'"
                          [attr.aria-label]="'Resposta para ' + r.title"
                          (input)="setDraft(r.id, $any($event.target).value)"
                        ></textarea>
                        <div class="reply-actions">
                          <span class="hint counter">{{ draft(r.id).length }}/{{ replyMax }}</span>
                          <button type="button" class="ar-mini-btn" [disabled]="!canSend(r.id)" (click)="reply(r, false)">
                            {{ sending() === r.id ? 'Enviando…' : 'Responder' }}
                          </button>
                          <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="!canSend(r.id)" (click)="reply(r, true)">
                            Responder e resolver
                          </button>
                        </div>
                      </div>
                    }
                  }
                </ar-panel-card>
              }
            </div>

            @if (p.nextCursor) {
              <button type="button" class="ar-mini-btn more" [disabled]="loadingMore()" (click)="loadMore()">
                {{ loadingMore() ? 'Carregando…' : 'Carregar mais' }}
              </button>
            }
          }
        }
      }
    </ar-aulas-page>
  `,
  styles: `
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; line-height: 1.5; }
    .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .s-label {
      font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em;
      text-transform: uppercase; color: var(--nx-text-dim);
    }
    .s-value {
      font-family: var(--nx-font-display); font-weight: 800; font-size: 26px; letter-spacing: -0.02em;
      color: var(--nx-text); margin-top: 8px;
    }
    .s-value.dim { color: var(--nx-text-dim); }
    .s-value.alert { color: var(--nx-orange-500); }
    .s-sub { font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); margin-top: 4px; }
    .parts { display: flex; gap: 18px; margin-top: 8px; }
    .part { display: flex; flex-direction: column; gap: 2px; }
    .part-label { font-size: 11.5px; color: var(--nx-text-mute); }
    .part-value { font-family: var(--nx-font-display); font-weight: 700; font-size: 20px; color: var(--nx-text); }

    .filters { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; min-width: 0; }
    .chip {
      height: 30px; padding: 0 12px; border-radius: 999px; cursor: pointer;
      border: 1px solid var(--nx-line); background: var(--nx-surface-1); color: var(--nx-text-mute);
      font-family: var(--nx-font-display); font-weight: 600; font-size: 12px;
    }
    .chip:hover { color: var(--nx-text); }
    .chip.active { border-color: var(--nx-orange-500); color: var(--nx-text); background: var(--nx-surface-2); }
    .prof-select { width: auto; min-width: 200px; height: 34px; }

    .list { display: flex; flex-direction: column; gap: 12px; }
    .r-head { display: flex; align-items: flex-start; gap: 12px; }
    .r-titles { flex: 1; min-width: 0; }
    .r-title { font-family: var(--nx-font-display); font-weight: 700; font-size: 14.5px; color: var(--nx-text); }
    .r-meta { font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-dim); margin-top: 3px; }
    .badge {
      display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 6px; flex: none;
      font-family: var(--nx-font-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
      border: 1px solid currentColor;
    }
    .badge.t-open { color: var(--nx-orange-500); }
    .badge.t-answered { color: var(--nx-pending); }
    .badge.t-resolved { color: var(--nx-win); }

    .scores { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
    .score { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .score-label { width: 72px; font-size: 12px; color: var(--nx-text-mute); flex: none; }
    .score.low .score-label { color: var(--nx-live); }
    .stars { display: inline-flex; gap: 1px; font-size: 14px; line-height: 1; }
    .star { color: var(--nx-line-strong); }
    .star.on { color: var(--nx-orange-500); }
    .tag {
      font-size: 11px; color: var(--nx-text-mute); padding: 2px 8px; border-radius: 999px;
      background: var(--nx-surface-1); border: 1px solid var(--nx-line);
    }
    .comment { margin: 12px 0 0; font-size: 13.5px; line-height: 1.5; color: var(--nx-text); white-space: pre-line; }
    .who { margin-top: 10px; font-size: 12px; color: var(--nx-text-dim); }

    .reply {
      margin-top: 12px; padding: 10px 12px; border-radius: var(--nx-r-2);
      background: var(--nx-surface-1); border-left: 3px solid var(--nx-orange-500);
    }
    .reply-head { font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); }
    .reply p { margin: 4px 0 0; font-size: 13px; line-height: 1.5; color: var(--nx-text); white-space: pre-line; }
    .reply-form { margin-top: 12px; }
    .reply-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; }
    .reply-actions .counter { flex: 1; margin: 0; }
    .more { align-self: center; }

    @media (max-width: 900px) {
      .stats { grid-template-columns: minmax(0, 1fr); }
      .prof-select { width: 100%; }
    }
  `,
})
export class PanelAulasReviewsComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);

  protected readonly parts = REVIEW_PARTS;
  protected readonly filterOptions = REVIEW_FILTERS;
  protected readonly ticketLabel = TICKET_LABEL;
  protected readonly replyMax = CLASS_REVIEW_REPLY_MAX;
  protected readonly five = [1, 2, 3, 4, 5];
  protected readonly fmt = formatAverage;
  protected readonly date = shortDate;
  protected readonly isoDate = shortDateFromIso;
  protected readonly reviewer = reviewerLabel;

  protected readonly canWrite = computed(() => this.access.canWrite('agenda'));
  protected readonly page = signal<ManagerReviewsPage | null>(null);
  protected readonly reviews = computed(() => this.page()?.reviews ?? []);
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly filter = signal<ReviewFilter>('all');
  protected readonly professor = signal<string | null>(null);
  protected readonly drafts = signal<Record<string, string>>({});
  protected readonly sending = signal<string | null>(null);

  protected readonly professors = computed(() => professorOptions(this.reviews()));
  protected readonly visible = computed(() => filterReviews(this.reviews(), this.filter(), this.professor()));

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (arenaId) void this.load(arenaId);
    });
  }

  private async load(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.page.set(await fetchArenaReviews(arenaFunctions(), arenaId));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível carregar as avaliações.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async loadMore(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    const current = this.page();
    if (!arenaId || !current?.nextCursor || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.error.set(null);
    try {
      const next = await fetchArenaReviews(arenaFunctions(), arenaId, current.nextCursor);
      const seen = new Set(current.reviews.map((r) => r.id));
      this.page.set({ ...next, reviews: [...current.reviews, ...next.reviews.filter((r) => !seen.has(r.id))] });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível carregar mais avaliações.');
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected setProfessor(value: string): void {
    this.professor.set(value || null);
  }

  protected draft(id: string): string {
    return this.drafts()[id] ?? '';
  }

  protected setDraft(id: string, value: string): void {
    this.drafts.update((d) => ({ ...d, [id]: value }));
  }

  protected canSend(id: string): boolean {
    return this.sending() === null && replyError(this.draft(id)) === null;
  }

  protected async reply(review: ManagerReview, resolve: boolean): Promise<void> {
    if (!this.canWrite() || this.sending()) return;
    const text = this.draft(review.id);
    const invalid = replyError(text);
    if (invalid) {
      this.error.set(invalid);
      return;
    }
    this.sending.set(review.id);
    this.error.set(null);
    try {
      const res = await replyReviewTicket(arenaFunctions(), review.id, text, resolve);
      this.page.update((p) => {
        if (!p) return p;
        const next = applyReply(p.reviews, p.openTickets, res.review);
        return { ...p, reviews: next.reviews, openTickets: next.openTickets };
      });
      this.drafts.update((d) => {
        const { [review.id]: _sent, ...rest } = d;
        return rest;
      });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível enviar a resposta.');
    } finally {
      this.sending.set(null);
    }
  }
}
