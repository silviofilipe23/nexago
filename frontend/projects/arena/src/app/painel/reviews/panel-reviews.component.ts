import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { resolveAthleteLabel } from '../bookings/bookings-repository';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { computeReviewMetrics, formatRating, formatRelativeDate, type ArenaReview } from './arena-review.model';
import { replyToReview, updateReviewReply, watchReviewsForArena } from './reviews-repository';

type ReviewFilter = 'todas' | 'pendentes' | 'respondidas' | 'negativas';

const FILTERS: { key: ReviewFilter; label: string }[] = [
  { key: 'pendentes', label: 'Pendentes' },
  { key: 'respondidas', label: 'Respondidas' },
  { key: 'negativas', label: 'Negativas (≤2★)' },
  { key: 'todas', label: 'Todas' },
];

/** Tela Avaliações: reputação real de `arena_reviews` (rating + comentário por reserva
 *  concluída), com resposta do gestor — espelha `ArenaReviewsManagementPage` (Flutter). */
@Component({
  selector: 'ar-panel-reviews',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent, DecimalPipe],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Avaliações" [subtitle]="headerSubtitle()" />

      <div class="body">
        @if (arenaNotFound()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Nenhuma arena vinculada à sua conta ainda. Fale com o suporte para concluir o cadastro.</p>
          </ar-panel-card>
        } @else if (arenaLoading() || loading()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Carregando avaliações…</p>
          </ar-panel-card>
        } @else {
          <div class="summary-row">
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-orange">Nota média</div>
              <div class="summary-value">{{ formatRating(metrics().averageRating) }} ★</div>
            </ar-panel-card>
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-dim">Avaliações</div>
              <div class="summary-value">{{ metrics().totalReviews }}</div>
            </ar-panel-card>
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-dim">Respondidas</div>
              <div class="summary-value">{{ metrics().repliedPercent | number: '1.0-0' }}%</div>
            </ar-panel-card>
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-dim">Negativas pendentes</div>
              <div class="summary-value" [class.tone-red]="metrics().negativePendingCount > 0">{{ metrics().negativePendingCount }}</div>
            </ar-panel-card>
          </div>

          <ar-panel-card [kicker]="listKicker()" title="Avaliações" class="list-card">
            <div class="ar-filter-bar" card-actions>
              @for (f of filters; track f.key) {
                <button type="button" class="ar-chip" [class.active]="filter() === f.key" (click)="filter.set(f.key)">{{ f.label }}</button>
              }
            </div>

            @if (filteredReviews().length === 0) {
              <p class="state-text empty-text">Nenhuma avaliação por aqui.</p>
            } @else {
              <div class="review-list">
                @for (r of filteredReviews(); track r.id) {
                  <div class="review-item">
                    <div class="review-head">
                      <div class="review-avatar">{{ initialsOf(athleteLabel(r.userId)) }}</div>
                      <div class="review-who">
                        <div class="review-name">{{ athleteLabel(r.userId) }}</div>
                        <div class="review-date">{{ formatRelativeDate(r.createdAt) }}</div>
                      </div>
                      <div class="spacer"></div>
                      <ar-pill [tone]="r.rating <= 2 ? 'red' : r.rating === 3 ? 'yellow' : 'green'">{{ r.rating }} ★</ar-pill>
                    </div>

                    @if (r.comment) {
                      <p class="review-comment">{{ r.comment }}</p>
                    }

                    @if (r.reply; as reply) {
                      <div class="reply-box">
                        <div class="reply-kicker">Sua resposta</div>
                        <p class="reply-message">{{ reply.message }}</p>
                        <button type="button" class="ar-ghost-btn edit-reply-btn" [disabled]="readOnly()" (click)="startReply(r, true)">Editar resposta</button>
                      </div>
                    } @else if (replyingId() === r.id) {
                      <div class="reply-form">
                        <textarea
                          class="reply-textarea"
                          rows="3"
                          maxlength="300"
                          placeholder="Responda de forma pública e cordial (5–300 caracteres)…"
                          [value]="replyDraft()"
                          (input)="replyDraft.set($any($event.target).value)"
                        ></textarea>
                        @if (replyError(); as err) {
                          <div class="error-banner">{{ err }}</div>
                        }
                        <div class="reply-actions">
                          <button type="button" class="ar-ghost-btn" [disabled]="sendingReply()" (click)="cancelReply()">Cancelar</button>
                          <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="!canSendReply()" (click)="sendReply(r)">
                            {{ sendingReply() ? 'Enviando…' : 'Enviar resposta' }}
                          </button>
                        </div>
                      </div>
                    } @else {
                      <button type="button" class="ar-mini-btn reply-btn" [disabled]="readOnly()" (click)="startReply(r, false)">
                        <ar-icon name="edit" [size]="13" />
                        Responder
                      </button>
                    }
                  </div>
                }
              </div>
            }
          </ar-panel-card>
        }
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0 0 12px;
    }

    .empty-text {
      margin: 12px 0;
    }

    .summary-row {
      display: flex;
      gap: 16px;
      flex: none;
    }

    .summary-card {
      flex: 1;
    }

    .summary-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .summary-label.tone-orange {
      color: var(--nx-orange-500);
    }

    .summary-label.tone-dim {
      color: var(--nx-text-dim);
    }

    .summary-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 26px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin-top: 8px;
    }

    .summary-value.tone-red {
      color: var(--nx-live);
    }

    .list-card {
      flex: 1;
      min-height: 0;
    }

    .review-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .review-item {
      padding: 16px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .review-item:last-child {
      border-bottom: none;
    }

    .review-head {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .review-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      flex: none;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.35);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 11px;
      color: var(--nx-orange-500);
    }

    .review-who {
      min-width: 0;
    }

    .review-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .review-date {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
    }

    .spacer {
      flex: 1;
    }

    .review-comment {
      font-size: 13.5px;
      line-height: 1.55;
      color: var(--nx-text-mute);
      margin: 10px 0 0;
    }

    .reply-box {
      margin-top: 12px;
      padding: 12px 14px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }

    .reply-kicker {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
      margin-bottom: 6px;
    }

    .reply-message {
      font-size: 13px;
      line-height: 1.5;
      color: var(--nx-text);
      margin: 0;
    }

    .edit-reply-btn {
      margin-top: 8px;
      height: 30px;
      padding: 0 10px;
      font-size: 12px;
    }

    .reply-btn {
      margin-top: 12px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .reply-form {
      margin-top: 12px;
    }

    .reply-textarea {
      width: 100%;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13.5px;
      padding: 10px 12px;
      box-sizing: border-box;
      resize: vertical;
    }

    .reply-textarea:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }

    .error-banner {
      margin-top: 8px;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
      padding: 8px 12px;
      font-size: 12px;
    }

    .reply-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 10px;
    }

    @media (max-width: 1180px) {
      .summary-row {
        flex-wrap: wrap;
      }
    }
  `,
})
export class PanelReviewsComponent {
  private readonly auth = inject(AuthService);
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);

  /** Cargo com leitura mas sem escrita em `comunidade` (recepção e financeiro): responder
   *  ou editar resposta fica indisponível — a lista de avaliações segue visível. */
  protected readonly readOnly = computed(() => !this.access.canWrite('comunidade'));

  protected readonly filters = FILTERS;
  protected readonly formatRating = formatRating;
  protected readonly formatRelativeDate = formatRelativeDate;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());

  protected readonly loading = signal(true);
  protected readonly reviews = signal<ArenaReview[]>([]);
  protected readonly athleteLabels = signal<Record<string, string>>({});
  protected readonly filter = signal<ReviewFilter>('pendentes');

  protected readonly replyingId = signal<string | null>(null);
  protected readonly replyDraft = signal('');
  protected readonly replyError = signal<string | null>(null);
  protected readonly sendingReply = signal(false);

  private unsubscribeReviews: (() => void) | null = null;

  protected readonly metrics = computed(() => computeReviewMetrics(this.reviews()));

  protected readonly filteredReviews = computed(() => {
    const list = this.reviews();
    switch (this.filter()) {
      case 'pendentes':
        return list.filter((r) => r.reply == null);
      case 'respondidas':
        return list.filter((r) => r.reply != null);
      case 'negativas':
        return list.filter((r) => r.rating <= 2);
      default:
        return list;
    }
  });

  protected readonly listKicker = computed(() => `${this.filteredReviews().length} registros`);
  protected readonly headerSubtitle = computed(() => `${this.arenaContext.arenaName() ?? 'Arena'} · reputação e resposta a avaliações`);

  protected readonly canSendReply = computed(() => {
    const len = this.replyDraft().trim().length;
    return len >= 5 && len <= 300 && !this.sendingReply();
  });

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      this.unsubscribeReviews?.();
      this.unsubscribeReviews = null;
      if (!arenaId) return;

      this.loading.set(true);
      const db = arenaFirestore();
      this.unsubscribeReviews = watchReviewsForArena(db, arenaId, (list) => {
        this.reviews.set(list);
        this.loading.set(false);
        this.resolveMissingAthleteLabels(list);
      });
    });
  }

  private resolveMissingAthleteLabels(list: ArenaReview[]): void {
    const known = this.athleteLabels();
    const missing = new Set(list.map((r) => r.userId).filter((id) => id && !(id in known)));
    if (missing.size === 0) return;
    const db = arenaFirestore();
    for (const userId of missing) {
      void resolveAthleteLabel(db, userId).then((label) => {
        this.athleteLabels.update((current) => ({ ...current, [userId]: label }));
      });
    }
  }

  protected athleteLabel(userId: string): string {
    return this.athleteLabels()[userId] ?? 'Carregando…';
  }

  protected initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0]![0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
    return (first + last).toUpperCase();
  }

  protected startReply(review: ArenaReview, isEdit: boolean): void {
    if (this.readOnly()) return;
    this.replyingId.set(review.id);
    this.replyDraft.set(isEdit ? (review.reply?.message ?? '') : '');
    this.replyError.set(null);
  }

  protected cancelReply(): void {
    this.replyingId.set(null);
    this.replyDraft.set('');
    this.replyError.set(null);
  }

  protected async sendReply(review: ArenaReview): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    const uid = this.auth.user()?.uid;
    if (!arenaId || !uid || this.readOnly()) return;

    this.sendingReply.set(true);
    this.replyError.set(null);
    try {
      const db = arenaFirestore();
      if (review.reply) {
        await updateReviewReply(db, review.id, arenaId, uid, this.replyDraft());
      } else {
        await replyToReview(db, review.id, arenaId, uid, this.replyDraft());
      }
      this.cancelReply();
    } catch (err) {
      this.replyError.set(err instanceof Error ? err.message : 'Não foi possível enviar a resposta.');
    } finally {
      this.sendingReply.set(false);
    }
  }
}
