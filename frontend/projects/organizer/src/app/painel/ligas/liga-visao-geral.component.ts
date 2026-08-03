import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  LEAGUE_COUNTING_MODE_LABEL,
  LEAGUE_STATUS_LABEL,
  canCancelLeague,
  canCloseLeagueSeason,
} from '@nexago/leagues';
import { rankLeagueRows } from '@nexago/leagues';
import { AuthService } from '../../auth/auth.service';
import type { PillTone } from '../data/mock-data';
import { cancelLeague, closeLeagueSeason, listLeagueRanking, type LeagueRankingNamedEntry } from '../data/leagues-repository';
import { OgCardComponent } from '../ui/card.component';
import { OgConfirmDialogComponent } from '../ui/confirm-dialog.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';
import { LigaStore } from './liga.store';

type PendingAction = 'close' | 'cancel';

const STATUS_TONE: Record<string, PillTone> = {
  draft: 'yellow',
  open: 'green',
  closed: 'dim',
  cancelled: 'red',
};

const PREVIEW_LIMIT = 5;

const LONG_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

/** Visão geral do circuito — o "Ver circuito" do app trazido pro painel: identidade, números
 *  da temporada, prévia do ranking e as ações de ciclo de vida (encerrar/cancelar). */
@Component({
  selector: 'og-liga-visao-geral',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgCardComponent, OgPillComponent, OgIconComponent, OgConfirmDialogComponent],
  template: `
    <og-page-header [title]="league()?.name ?? 'Liga'" [subtitle]="subtitle()">
      @if (isOpen()) {
        <a class="og-mini-btn og-mini-btn-primary" [routerLink]="[base(), 'nova-etapa']">
          <og-icon name="plus" [size]="14" />Adicionar etapa
        </a>
      }
      @if (canClose()) {
        <button type="button" class="og-mini-btn" (click)="pending.set('close')">Encerrar temporada</button>
      }
      @if (canCancel()) {
        <button type="button" class="og-mini-btn" (click)="pending.set('cancel')">Cancelar liga</button>
      }
    </og-page-header>

    <div class="og-content">
      @if (league(); as l) {
        <div class="og-liga-hero">
          @if (l.coverUrl && !coverFailed()) {
            <img [src]="l.coverUrl" alt="" (error)="coverFailed.set(true)" />
          } @else {
            <span class="og-liga-hero-fallback"><og-icon name="flag" [size]="34" [strokeWidth]="1.5" /></span>
          }
          <div class="og-liga-hero-body">
            <og-pill [tone]="statusTone()">{{ statusLabel() }}</og-pill>
            <div class="og-liga-hero-name">{{ l.name }}</div>
            <div class="og-liga-hero-meta">{{ seasonRange() }}</div>
          </div>
        </div>

        <div class="og-kpi-row">
          <og-card pad="sm" flex="1">
            <div class="og-kpi-label">Etapas publicadas</div>
            <div class="og-kpi-value">{{ store.etapasPublicadas() }}<span class="og-kpi-of">/{{ etapasPlanejadas() }}</span></div>
            <div class="og-kpi-sub">{{ l.grandFinalEnabled ? 'Com Grande Final' : 'Sem Grande Final' }}</div>
          </og-card>
          <og-card pad="sm" flex="1">
            <div class="og-kpi-label">Próxima etapa</div>
            <div class="og-kpi-value og-kpi-value-sm">{{ store.proximaEtapa()?.name ?? '—' }}</div>
            <div class="og-kpi-sub">{{ store.proximaEtapa()?.dateLabel ?? 'Nenhuma etapa em aberto' }}</div>
          </og-card>
          <og-card pad="sm" flex="1">
            <div class="og-kpi-label">Inscritos na temporada</div>
            <div class="og-kpi-value">{{ store.totalInscritos() }}</div>
            <div class="og-kpi-sub">Somando todas as etapas publicadas</div>
          </og-card>
          <og-card pad="sm" flex="1">
            <div class="og-kpi-label">Categorias</div>
            <div class="og-kpi-value">{{ l.categories.length }}</div>
            <div class="og-kpi-sub">{{ countingLabel() }}</div>
          </og-card>
        </div>

        <div class="og-liga-grid">
          <og-card kicker="Ranking" [title]="'Líderes · ' + (previewCategoryName() ?? 'sem categoria')">
            <a card-action class="og-ghost-btn" [routerLink]="[base(), 'ranking']">Ver ranking</a>
            @if (rankingLoading()) {
              @for (i of [1, 2, 3]; track i) {
                <div class="og-skeleton-line" style="width:100%"></div>
              }
            } @else if (preview().length === 0) {
              <p class="og-empty">Sem pontuação ainda — o ranking aparece quando as partidas das etapas forem encerradas.</p>
            } @else {
              @for (row of preview(); track row.id) {
                <div class="og-row">
                  <span class="og-liga-rank">{{ row.rank }}º</span>
                  <span class="og-liga-rank-name">{{ row.displayName }}</span>
                  <span class="og-liga-rank-stages">{{ row.stagesPlayed }} etapa{{ row.stagesPlayed === 1 ? '' : 's' }}</span>
                  <span class="og-liga-rank-points">{{ row.effectivePoints }} pts</span>
                </div>
              }
            }
          </og-card>

          <og-card kicker="Circuito" title="Sobre a temporada">
            @if (l.description) {
              <p class="og-liga-desc">{{ l.description }}</p>
            }
            <div class="og-row">
              <span class="og-liga-info-label">Organização</span>
              <span class="og-liga-info-value">{{ l.organizationName ?? '—' }}</span>
            </div>
            <div class="og-row">
              <span class="og-liga-info-label">Local</span>
              <span class="og-liga-info-value">{{ localLabel() }}</span>
            </div>
            <div class="og-row">
              <span class="og-liga-info-label">Contagem de pontos</span>
              <span class="og-liga-info-value">{{ countingLabel() }}</span>
            </div>
            @if (l.grandFinalEnabled) {
              <div class="og-row">
                <span class="og-liga-info-label">Grande Final</span>
                <span class="og-liga-info-value">{{ l.grandFinalSpots }} vagas pelo ranking</span>
              </div>
            }
          </og-card>
        </div>
      } @else {
        <div class="og-kpi-row">
          @for (i of [1, 2, 3, 4]; track i) {
            <og-card pad="sm" flex="1">
              <div class="og-skeleton-line" style="width:70%"></div>
              <div class="og-skeleton-line og-skeleton-value" style="width:40%"></div>
            </og-card>
          }
        </div>
      }
    </div>

    @if (pending(); as action) {
      <og-confirm-dialog
        [title]="action === 'close' ? 'Encerrar temporada?' : 'Cancelar liga?'"
        [message]="
          action === 'close'
            ? 'A liga sai do modo ativo. O ranking continua visível, mas novas etapas não podem ser adicionadas.'
            : 'A liga deixa de aparecer no catálogo público. Etapas já publicadas permanecem no histórico.'
        "
        [confirmLabel]="action === 'close' ? 'Encerrar' : 'Cancelar liga'"
        [destructive]="action === 'cancel'"
        [busy]="acting()"
        [error]="actionError()"
        (confirmed)="confirm(action)"
        (cancelled)="dismiss()"
      />
    }
  `,
  styles: `
    .og-liga-hero {
      display: flex;
      gap: 18px;
      align-items: center;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 16px 20px;
    }
    .og-liga-hero img,
    .og-liga-hero-fallback {
      width: 132px;
      height: 78px;
      flex: none;
      border-radius: var(--nx-r-3);
      object-fit: cover;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, rgba(255, 106, 26, 0.16), var(--nx-surface-1) 70%);
      color: var(--nx-orange-500);
    }
    .og-liga-hero-body {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }
    .og-liga-hero-name {
      font-family: var(--nx-font-display);
      font-size: 20px;
      font-weight: 800;
      color: var(--nx-text);
    }
    .og-liga-hero-meta {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }
    .og-kpi-of {
      font-size: 15px;
      color: var(--nx-text-dim);
    }
    .og-kpi-value-sm {
      font-size: 17px;
      line-height: 1.3;
    }
    .og-liga-grid {
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      gap: 16px;
      align-items: start;
    }
    .og-liga-desc {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      line-height: 1.55;
      color: var(--nx-text-mute);
      margin: 0 0 6px;
    }
    .og-liga-rank {
      width: 34px;
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-orange-500);
    }
    .og-liga-rank-name {
      flex: 1;
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-liga-rank-stages {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-liga-rank-points {
      width: 68px;
      text-align: right;
      font-family: var(--nx-font-mono);
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .og-liga-info-label {
      flex: 1;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }
    .og-liga-info-value {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text);
      text-align: right;
    }
    .og-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      padding: 8px 0;
      margin: 0;
    }
    .og-skeleton-line {
      height: 12px;
      border-radius: 4px;
      background: var(--nx-surface-1);
      margin: 8px 0;
    }
    .og-skeleton-value {
      height: 22px;
    }
    @media (max-width: 1100px) {
      .og-liga-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class LigaVisaoGeralComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly store = inject(LigaStore);

  protected readonly league = this.store.league;
  protected readonly base = computed(() => this.store.leagueBase() ?? '/painel/eventos');
  protected readonly coverFailed = signal(false);

  protected readonly pending = signal<PendingAction | null>(null);
  protected readonly acting = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected readonly rankingLoading = signal(true);
  protected readonly preview = signal<(LeagueRankingNamedEntry & { rank: number })[]>([]);
  private previewLoadedFor: string | null = null;

  protected readonly statusLabel = computed(() => {
    const l = this.league();
    return l ? LEAGUE_STATUS_LABEL[l.listingStatus] : '';
  });

  protected readonly statusTone = computed<PillTone>(() => {
    const l = this.league();
    return l ? (STATUS_TONE[l.listingStatus] ?? 'dim') : 'dim';
  });

  protected readonly isOpen = computed(() => this.league()?.listingStatus === 'open');
  protected readonly canClose = computed(() => {
    const l = this.league();
    return !!l && canCloseLeagueSeason(l.listingStatus);
  });
  protected readonly canCancel = computed(() => {
    const l = this.league();
    return !!l && canCancelLeague(l.listingStatus);
  });

  protected readonly subtitle = computed(() => {
    const l = this.league();
    if (!l) return '';
    return [l.sportLabel, l.seasonLabel, l.city].filter((p): p is string => !!p).join(' · ');
  });

  protected readonly seasonRange = computed(() => {
    const l = this.league();
    if (!l) return '';
    if (!l.seasonStartAt) return l.seasonLabel ?? 'Temporada a definir';
    const end = l.seasonEndAt;
    return end ? `${LONG_DATE.format(l.seasonStartAt)} – ${LONG_DATE.format(end)}` : LONG_DATE.format(l.seasonStartAt);
  });

  /** Total planejado da temporada: o número do wizard, ou o tamanho do plano quando ausente. */
  protected readonly etapasPlanejadas = computed(() => {
    const l = this.league();
    if (!l) return 0;
    return l.plannedStagesCount ?? l.stages.length;
  });

  protected readonly localLabel = computed(() => {
    const l = this.league();
    if (!l) return '—';
    return [l.city, l.state].filter((p): p is string => !!p).join(' / ') || '—';
  });

  protected readonly countingLabel = computed(() => {
    const l = this.league();
    return l ? LEAGUE_COUNTING_MODE_LABEL[l.countingStagesMode] : '';
  });

  /** O ranking é por categoria (igual ao app) — a prévia usa a primeira da liga. */
  private readonly previewCategory = computed(() => this.league()?.categories[0] ?? null);
  protected readonly previewCategoryName = computed(() => this.previewCategory()?.categoryName ?? null);

  constructor() {
    // A liga chega de forma assíncrona (o contexto busca o doc); carrega a prévia quando vier.
    effect(() => {
      const l = this.league();
      if (!l || this.previewLoadedFor === l.id) return;
      this.previewLoadedFor = l.id;

      const category = this.previewCategory();
      if (!category) {
        this.preview.set([]);
        this.rankingLoading.set(false);
        return;
      }
      this.rankingLoading.set(true);
      void listLeagueRanking({ leagueId: l.id, scope: 'teams', mode: l.countingStagesMode })
        .then((rows) => this.preview.set(rankLeagueRows(rows, category.id).slice(0, PREVIEW_LIMIT)))
        .catch(() => this.preview.set([]))
        .finally(() => this.rankingLoading.set(false));
    });
  }

  protected dismiss(): void {
    if (this.acting()) return;
    this.pending.set(null);
    this.actionError.set(null);
  }

  protected async confirm(action: PendingAction): Promise<void> {
    const l = this.league();
    const uid = this.auth.user()?.uid;
    if (!l || !uid || this.acting()) return;
    this.acting.set(true);
    this.actionError.set(null);
    try {
      if (action === 'close') await closeLeagueSeason(l.id, uid);
      else await cancelLeague(l.id, uid);
      this.pending.set(null);
      await this.store.reload();
      // Liga cancelada sai do catálogo — não faz sentido continuar dentro dela.
      if (action === 'cancel') void this.router.navigateByUrl('/painel/eventos');
    } catch (e) {
      this.actionError.set((e as Error).message || 'Não foi possível concluir a ação.');
    } finally {
      this.acting.set(false);
    }
  }
}
