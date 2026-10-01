import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import {
  MIN_PUBLIC_REVIEWS,
  aspectRows,
  formatRating,
  reputationRows,
  type OrganizerReputation,
  type TournamentReviewSummary,
} from '../data/tournament-reviews';
import { watchOrganizerReputation, watchOrganizerReviewSummaries } from '../data/tournament-reviews-repository';
import { OgCardComponent } from '../ui/card.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';

/** Reputação do organizador — spec §4. Soma de `organizerReputation/{uid}` mais a tabela por
 *  torneio de `tournamentReviewSummaries where organizerId == uid`. Só os torneios de que ele
 *  é dono: a reputação é de quem organiza, não de quem ajuda. */
@Component({
  selector: 'og-reputacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgCardComponent, NxPageLoadingComponent],
  template: `
    <og-page-header title="Reputação" subtitle="Como os atletas avaliam os seus torneios" />

    <div class="og-content og-rep">
      @if (failed()) {
        <p class="og-rep-empty">Não foi possível carregar a reputação. Recarregue a página.</p>
      } @else if (loading()) {
        <app-nx-page-loading title="Carregando reputação…" />
      } @else {
        <div class="og-kpi-row og-rep-kpis">
          <og-card pad="sm" flex="1">
            <div class="og-kpi-label">Média geral</div>
            <div class="og-kpi-value">{{ average() }}</div>
          </og-card>
          <og-card pad="sm" flex="1">
            <div class="og-kpi-label">Avaliações</div>
            <div class="og-kpi-value">{{ reputation()?.reviewsCount ?? 0 }}</div>
          </og-card>
          <og-card pad="sm" flex="1">
            <div class="og-kpi-label">Torneios avaliados</div>
            <div class="og-kpi-value">{{ reputation()?.tournamentsRated ?? 0 }}</div>
          </og-card>
        </div>

        @if (!hasAverage()) {
          <p class="og-rep-note">As notas aparecem a partir de {{ minReviews }} avaliações.</p>
        }

        @if (aspects().length) {
          <og-card kicker="Aspectos" title="Somando todos os torneios">
            @for (a of aspects(); track a.key) {
              <div class="og-rep-aspect">
                <span class="og-rep-aspect-name">{{ a.label }}</span>
                <span class="og-rep-aspect-val">{{ a.text }}</span>
              </div>
            }
          </og-card>
        }

        <og-card kicker="Por torneio" title="Avaliações de cada evento" pad="0">
          <div class="og-rep-table">
            <div class="og-rep-head">
              <span>Torneio</span>
              <span class="c-date">Data</span>
              <span>Média</span>
              <span>Avaliações</span>
              <span class="c-resp">Resposta</span>
              <span class="c-weak">Mais fraco</span>
            </div>
            @for (row of rows(); track row.tournamentId) {
              <a class="og-rep-row" [routerLink]="['/painel/eventos', row.tournamentId, 'avaliacoes']">
                <span class="og-rep-name">
                  <span class="og-rep-title">{{ row.name }}</span>
                  <span class="og-rep-meta">{{ row.date }} · {{ row.response }} · {{ row.weakest }}</span>
                </span>
                <span class="c-date">{{ row.date }}</span>
                <span class="og-rep-avg">{{ row.average }}</span>
                <span>{{ row.reviews }}</span>
                <span class="c-resp">{{ row.response }}</span>
                <span class="c-weak">{{ row.weakest }}</span>
              </a>
            } @empty {
              <p class="og-rep-empty og-rep-empty-pad">Nenhum torneio seu passou pela avaliação dos atletas ainda.</p>
            }
          </div>
        </og-card>
      }
    </div>
  `,
  styles: `
    .og-rep {
      container-type: inline-size;
    }
    .og-rep-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      padding: 8px 0;
      margin: 0;
    }
    .og-rep-empty-pad {
      padding: 16px 18px;
    }
    .og-rep-note {
      margin: 0;
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
    }
    .og-rep-aspect {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 9px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-rep-aspect:last-child {
      border-bottom: none;
    }
    .og-rep-aspect-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-rep-aspect-val {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-mute);
      white-space: nowrap;
    }
    /* "4,7 ★" não pode quebrar a estrela pra linha de baixo no card estreito do telefone. */
    .og-rep-kpis .og-kpi-value {
      white-space: nowrap;
    }
    /* Uma grade só, pro cabeçalho e as linhas alinharem (ver memória organizer-list-fake-table-grid). */
    .og-rep-table {
      --rep-cols: minmax(0, 2fr) 96px 64px 88px 80px minmax(0, 1.3fr);
    }
    .og-rep-head,
    .og-rep-row {
      display: grid;
      grid-template-columns: var(--rep-cols);
      gap: 12px;
      align-items: center;
      padding: 10px 18px;
    }
    .og-rep-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-rep-row {
      border-top: 1px solid var(--nx-line);
      color: var(--nx-text);
      text-decoration: none;
      font-family: var(--nx-font-ui);
      font-size: 13px;
    }
    .og-rep-row:hover {
      background: var(--nx-surface-1);
    }
    .og-rep-name {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .og-rep-title {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .og-rep-meta {
      display: none;
      font-size: 11px;
      color: var(--nx-text-mute);
    }
    .og-rep-avg {
      font-family: var(--nx-font-mono);
      font-weight: 700;
    }
    @container (max-width: 520px) {
      .og-rep-kpis .og-kpi-value {
        font-size: 22px;
      }
    }
    @container (max-width: 720px) {
      .og-rep-table {
        --rep-cols: minmax(0, 1fr) 56px 80px;
      }
      .c-date,
      .c-resp,
      .c-weak {
        display: none;
      }
      .og-rep-meta {
        display: block;
      }
    }
  `,
})
export class ReputacaoComponent {
  private readonly auth = inject(AuthService);

  protected readonly minReviews = MIN_PUBLIC_REVIEWS;
  protected readonly reputationReady = signal(false);
  protected readonly summariesReady = signal(false);
  protected readonly failed = signal(false);
  protected readonly reputation = signal<OrganizerReputation | null>(null);
  protected readonly summaries = signal<TournamentReviewSummary[]>([]);

  protected readonly loading = computed(() => !this.reputationReady() || !this.summariesReady());
  protected readonly hasAverage = computed(() => {
    const r = this.reputation();
    return r != null && r.reviewsCount >= MIN_PUBLIC_REVIEWS && r.average != null;
  });
  protected readonly average = computed(() => {
    const r = this.reputation();
    return this.hasAverage() && r?.average != null ? `${formatRating(r.average)} ★` : '—';
  });
  protected readonly aspects = computed(() => (this.hasAverage() ? aspectRows(this.reputation()?.aspects ?? null) : []));
  protected readonly rows = computed(() => reputationRows(this.summaries()));

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? '';
      // O `painel` já exige login; sem usuário (só nos specs) não há o que ouvir.
      if (!uid) return;
      this.reputationReady.set(false);
      this.summariesReady.set(false);
      this.failed.set(false);
      const fail = () => this.failed.set(true);
      const stopReputation = watchOrganizerReputation(
        uid,
        (r) => {
          this.reputation.set(r);
          this.reputationReady.set(true);
        },
        fail,
      );
      const stopSummaries = watchOrganizerReviewSummaries(
        uid,
        (list) => {
          this.summaries.set(list);
          this.summariesReady.set(true);
        },
        fail,
      );
      onCleanup(() => {
        stopReputation();
        stopSummaries();
      });
    });
  }
}
