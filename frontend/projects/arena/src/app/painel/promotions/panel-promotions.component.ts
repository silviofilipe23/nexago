import type { ArenaPromotion } from '@nexago/arena-discovery';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import {
  derivePromoStatus,
  formatDiscount,
  formatWeekdays,
  PROMO_STATUS_LABEL,
  type PromoDisplayStatus,
} from './promotion.model';
import { fetchAllPromotions } from './promotions-repository';

type StatusFilter = 'todas' | PromoDisplayStatus;

const STATUS_TONE: Record<PromoDisplayStatus, PillTone> = {
  ativa: 'green',
  agendada: 'yellow',
  expirada: 'dim',
  pausada: 'dim',
};

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'ativa', label: 'Ativas' },
  { key: 'agendada', label: 'Agendadas' },
  { key: 'expirada', label: 'Expiradas' },
  { key: 'pausada', label: 'Pausadas' },
];

/** Tela Promoções do painel: CRUD real de `arenas/{arenaId}/promotions` (Pro/Elite pra
 *  criar/editar; excluir é livre). Sem "usos no mês"/"horário mais fraco"/"receita
 *  incremental" — não existe contagem de resgate de promoção no backend, eram só protótipo.
 *  Status "agendada"/"expirada" são derivados de validFrom/validUntil, não persistidos. */
@Component({
  selector: 'ar-panel-promotions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Promoções" [subtitle]="headerSubtitle()">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="readOnly()" (click)="createPromotion()">
          <ar-icon name="plus" [size]="14" />
          Nova promoção
        </button>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else if (arenaLoading() || loading()) {
          <p class="state-text">Carregando promoções…</p>
        } @else if (loadError(); as err) {
          <p class="state-text">{{ err }}</p>
        } @else if (showPaywall()) {
          <ar-panel-card pad="lg">
            <p class="paywall-title">Promoções são um recurso dos planos Pro e Elite</p>
            <p class="state-text">Fale com o suporte para fazer upgrade e liberar descontos automáticos por dia/horário.</p>
          </ar-panel-card>
        } @else {
          @if (readOnly()) {
            <div class="readonly-banner">Seu plano atual não inclui criar/editar promoções — fale com o suporte para fazer upgrade.</div>
          }

          <div class="summary-row">
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-orange">Promoções ativas</div>
              <div class="summary-value">{{ activeCount() }}</div>
            </ar-panel-card>
          </div>

          <ar-panel-card [kicker]="listKicker()" title="Promoções" class="table-card">
            <div class="ar-filter-bar" card-actions>
              @for (f of statusFilters; track f.key) {
                <button type="button" class="ar-chip" [class.active]="filter() === f.key" (click)="filter.set(f.key)">{{ f.label }}</button>
              }
            </div>

            <div class="table-head">
              <span>Promoção</span>
              <span>Desconto</span>
              <span>Dias</span>
              <span>Horário</span>
              <span>Status</span>
              <span></span>
            </div>
            <div class="table-list">
              @for (row of filteredPromotions(); track row.promo.id) {
                <div class="table-row">
                  <div>
                    <div class="promo-name">{{ row.promo.label }}</div>
                    <div class="promo-scope">{{ scopeLabel(row.promo) }}</div>
                  </div>
                  <div class="promo-discount">{{ formatDiscount(row.promo) }}</div>
                  <div class="promo-days">{{ formatWeekdays(row.promo.weekdays) }}</div>
                  <div class="promo-time">{{ row.promo.startTime }}-{{ row.promo.endTime }}</div>
                  <div><ar-pill [tone]="statusTone[row.status]">{{ statusLabel[row.status] }}</ar-pill></div>
                  <div class="promo-actions">
                    <button type="button" class="ar-mini-btn" (click)="editPromotion(row.promo.id)">
                      <ar-icon name="edit" [size]="13" />
                      Editar
                    </button>
                  </div>
                </div>
              } @empty {
                <p class="state-text empty-text">Nenhuma promoção por aqui.</p>
              }
            </div>
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
      margin: 0;
    }

    .empty-text {
      margin: 12px 0;
    }

    .paywall-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
      margin: 0 0 8px;
    }

    .readonly-banner {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      padding: 10px 14px;
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .summary-row {
      display: flex;
      gap: 16px;
      flex: none;
    }

    .summary-card {
      flex: 1;
      max-width: 240px;
    }

    .summary-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }

    .summary-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 26px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin-top: 8px;
    }

    .table-card {
      flex: 1;
      min-height: 0;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 1.8fr 110px 190px 110px 110px 100px;
      gap: 12px;
      align-items: center;
    }

    .table-head {
      padding: 0 0 8px;
      border-bottom: 1px solid var(--nx-line-strong);
      flex: none;
    }

    .table-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .table-list {
      display: flex;
      flex-direction: column;
    }

    .table-row {
      padding: 14px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .promo-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 14px;
      color: var(--nx-text);
    }

    .promo-scope {
      font-size: 12px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }

    .promo-discount {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-orange-500);
    }

    .promo-days,
    .promo-time {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-mute);
    }

    .promo-actions {
      display: flex;
      justify-content: flex-end;
    }

    @media (max-width: 1180px) {
      .summary-row {
        flex-wrap: wrap;
      }
    }
  `,
})
export class PanelPromotionsComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly router = inject(Router);

  protected readonly formatDiscount = formatDiscount;
  protected readonly formatWeekdays = formatWeekdays;
  protected readonly statusLabel = PROMO_STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly statusFilters = STATUS_FILTERS;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly readOnly = computed(() => !this.arenaContext.hasCapability('promocoes'));

  protected readonly promotions = signal<ArenaPromotion[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly filter = signal<StatusFilter>('todas');

  protected readonly rows = computed(() => this.promotions().map((promo) => ({ promo, status: derivePromoStatus(promo) })));

  protected readonly filteredPromotions = computed(() => {
    const f = this.filter();
    return f === 'todas' ? this.rows() : this.rows().filter((r) => r.status === f);
  });

  protected readonly listKicker = computed(() => `${this.filteredPromotions().length} de ${this.promotions().length}`);
  protected readonly activeCount = computed(() => this.rows().filter((r) => r.status === 'ativa').length);
  protected readonly showPaywall = computed(() => this.readOnly() && this.promotions().length === 0);

  protected readonly headerSubtitle = computed(
    () => `${this.arenaContext.arenaName() ?? 'Arena'} · descontos por dia e horário`,
  );

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      void this.load(arenaId);
    });
  }

  private async load(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.promotions.set(await fetchAllPromotions(arenaFirestore(), arenaId));
    } catch {
      this.loadError.set('Não foi possível carregar as promoções.');
    } finally {
      this.loading.set(false);
    }
  }

  protected scopeLabel(promo: ArenaPromotion): string {
    return promo.courtIds.length === 0 ? 'Todas as quadras' : `${promo.courtIds.length} quadra${promo.courtIds.length === 1 ? '' : 's'}`;
  }

  protected createPromotion(): void {
    if (this.readOnly()) return;
    this.router.navigate(['/painel/promocoes/nova']);
  }

  protected editPromotion(id: string): void {
    this.router.navigate(['/painel/promocoes', id, 'editar']);
  }
}
