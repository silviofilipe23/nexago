import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { KpiMiniComponent } from '../ui/kpi-mini.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import {
  MIN_PUBLIC_REVIEWS,
  adminReviewRows,
  countMismatchNote,
  formatRating,
  isReviewWindowOpen,
  organizerName,
  responseRateLabel,
  reviewDate,
  reviewWindowLabel,
  reviewsErrorMessage,
  type AdminReview,
  type ReviewSummary,
} from './data/tournament-reviews';
import { TournamentReviewsAdminRepository } from './data/tournament-reviews.repository';

type LoadState = 'loading' | 'ok' | 'error';

/** Avaliações de um torneio, com o nome de cada atleta (spec §4 "Backoffice"). O organizador
 *  nunca vê isto: a rule só libera `tournamentReviews` a admin/superAdmin. */
@Component({
  selector: 'bo-avaliacao-torneio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PanelShellComponent, PanelCardComponent, KpiMiniComponent, IconComponent],
  template: `
    <bo-panel-shell>
      <header class="bo-detail-header">
        <a class="bo-back-btn" routerLink="/painel/avaliacoes" aria-label="Voltar para Avaliações">
          <bo-icon name="chevron-left" [size]="18" />
        </a>
        <div class="titles">
          <h1>{{ title() }}</h1>
          <p>{{ headerLine() }}</p>
        </div>
        <button type="button" class="bo-mini-btn" [disabled]="state() === 'loading'" (click)="reload()">
          <bo-icon name="swap" [size]="13" />
          Atualizar
        </button>
      </header>

      <div class="bo-detail-body">
        @if (state() === 'error') {
          <div class="bo-alert">
            <bo-icon name="alert" [size]="16" />
            <span>{{ errorMessage() }}</span>
          </div>
          <button type="button" class="bo-mini-btn retry" (click)="reload()">Tentar de novo</button>
        } @else if (state() === 'loading') {
          <p class="status">Carregando avaliações…</p>
        } @else if (notFound()) {
          <bo-panel-card title="Avaliações do torneio">
            <p class="status">Este torneio não tem resumo de avaliação.</p>
            <a class="bo-mini-btn" routerLink="/painel/avaliacoes">Voltar para Avaliações</a>
          </bo-panel-card>
        } @else {
          <div class="kpis">
            <bo-kpi-mini label="Média" [value]="average()" />
            <bo-kpi-mini label="Avaliações" [value]="countLabel()" />
            <bo-kpi-mini label="Resposta" [value]="response()" />
            <bo-kpi-mini label="Janela" [value]="windowLabel()" [tone]="windowOpen() ? 'green' : 'neutral'" />
          </div>

          <bo-panel-card pad="sm" kicker="coleção tournamentReviews" title="Avaliações dos atletas">
            @if (countNote(); as note) {
              <p class="status count-note">{{ note }}</p>
            }
            @for (row of rows(); track row.id) {
              <article class="rv">
                <div class="rv-head">
                  <span class="rv-athlete">{{ row.athlete }}</span>
                  <span class="rv-stars" role="img" [attr.aria-label]="row.overall + ' de 5 estrelas'">{{ row.stars }}</span>
                </div>
                <div class="rv-date">{{ row.sentAt }}</div>
                @if (row.aspects.length) {
                  <div class="rv-chips">
                    @for (chip of row.aspects; track chip) {
                      <span class="rv-chip">{{ chip }}</span>
                    }
                  </div>
                }
                <p class="rv-comment" [class.rv-empty]="!row.comment">{{ row.comment ?? 'Sem comentário.' }}</p>
              </article>
            } @empty {
              <p class="status">Nenhum atleta avaliou este torneio ainda.</p>
            }
          </bo-panel-card>
        }
      </div>
    </bo-panel-shell>
  `,
  styles: `
    .status {
      margin: 0 0 12px;
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }
    .retry {
      margin-top: 14px;
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }
    .rv {
      padding: 12px 4px;
      border-bottom: 1px solid var(--nx-line);
    }
    .rv:last-child {
      border-bottom: none;
    }
    .rv-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }
    .rv-athlete {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .rv-stars {
      color: var(--nx-orange-500);
      letter-spacing: 1px;
    }
    .rv-date {
      margin-top: 2px;
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
    }
    .rv-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }
    .rv-chip {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-mute);
      background: var(--nx-surface-1);
      border-radius: var(--nx-r-pill);
      padding: 2px 8px;
    }
    .rv-comment {
      margin: 8px 0 0;
      font-size: 13.5px;
      line-height: 1.5;
      color: var(--nx-text);
      white-space: pre-line;
      overflow-wrap: anywhere;
    }
    .rv-empty {
      color: var(--nx-text-dim);
    }
    @media (max-width: 720px) {
      .kpis {
        grid-template-columns: 1fr 1fr;
      }
    }
  `,
})
export class AvaliacaoTorneioComponent {
  /** Vem do parâmetro de rota :id (withComponentInputBinding). */
  readonly id = input.required<string>();

  private readonly repository = inject(TournamentReviewsAdminRepository);
  private loadToken = 0;

  protected readonly state = signal<LoadState>('loading');
  protected readonly errorMessage = signal('');
  protected readonly summary = signal<ReviewSummary | null>(null);
  protected readonly reviews = signal<readonly AdminReview[]>([]);
  /** `null` enquanto os nomes carregam. */
  protected readonly names = signal<ReadonlyMap<string, string> | null>(null);
  protected readonly now = signal(new Date());

  protected readonly notFound = computed(() => this.summary() == null && this.reviews().length === 0);
  protected readonly rows = computed(() => adminReviewRows(this.reviews(), this.names()));
  protected readonly title = computed(() => this.summary()?.tournamentName || 'Avaliações do torneio');
  protected readonly headerLine = computed(() => {
    const s = this.summary();
    if (!s) return 'Avaliações de torneios';
    return `Organizado por ${organizerName(s.organizerId, this.names())} · ${reviewDate(s.tournamentStartAt ?? s.opensAt)}`;
  });
  protected readonly countNote = computed(() => countMismatchNote(this.summary(), this.reviews().length));
  protected readonly average = computed(() => {
    const s = this.summary();
    return s && s.count >= MIN_PUBLIC_REVIEWS && s.average != null ? formatRating(s.average) : '—';
  });
  protected readonly countLabel = computed(() => String(this.summary()?.count ?? this.reviews().length));
  protected readonly response = computed(() => {
    const s = this.summary();
    return s ? responseRateLabel(s) : '—';
  });
  protected readonly windowLabel = computed(() => {
    const s = this.summary();
    return s ? reviewWindowLabel(s, this.now()) : '—';
  });
  protected readonly windowOpen = computed(() => {
    const s = this.summary();
    return s != null && isReviewWindowOpen(s, this.now());
  });

  constructor() {
    effect(() => {
      const tournamentId = this.id();
      untracked(() => void this.load(tournamentId));
    });
  }

  protected reload(): void {
    void this.load(this.id());
  }

  /** O token descarta a resposta que chegar depois de trocar de torneio. */
  private async load(tournamentId: string): Promise<void> {
    const token = ++this.loadToken;
    this.state.set('loading');
    this.errorMessage.set('');
    this.summary.set(null);
    this.reviews.set([]);
    this.names.set(null);
    let summary: ReviewSummary | null;
    let reviews: AdminReview[];
    try {
      [summary, reviews] = await Promise.all([this.repository.getSummary(tournamentId), this.repository.listReviews(tournamentId)]);
    } catch (err) {
      if (token !== this.loadToken) return;
      this.errorMessage.set(reviewsErrorMessage(err));
      this.state.set('error');
      return;
    }
    if (token !== this.loadToken) return;
    this.now.set(new Date());
    this.summary.set(summary);
    this.reviews.set(reviews);
    this.state.set('ok');
    // Os nomes só enriquecem: se a leitura falhar, ficam os uids encurtados.
    const uids = [...reviews.map((r) => r.uid), ...(summary ? [summary.organizerId] : [])];
    const names = await this.repository.profileNames(uids).catch(() => new Map<string, string>());
    if (token !== this.loadToken) return;
    this.names.set(names);
  }
}
