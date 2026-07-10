import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';

type PromoStatus = 'ativa' | 'agendada' | 'expirada';
type DiscountType = 'percent' | 'fixed';
type StatusFilter = 'todas' | PromoStatus;

interface Promotion {
  id: string;
  name: string;
  scope: string;
  discountType: DiscountType;
  discountValue: number;
  days: boolean[];
  timeStart: string;
  timeEnd: string;
  usageLabel: string;
  status: PromoStatus;
}

const DAY_LABELS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

const STATUS_LABEL: Record<PromoStatus, string> = {
  ativa: 'Ativa',
  agendada: 'Agendada',
  expirada: 'Expirada',
};

const STATUS_TONE: Record<PromoStatus, PillTone> = {
  ativa: 'green',
  agendada: 'yellow',
  expirada: 'dim',
};

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'ativa', label: 'Ativas' },
  { key: 'agendada', label: 'Agendadas' },
  { key: 'expirada', label: 'Expiradas' },
];

const PROMOTIONS: Promotion[] = [
  {
    id: 'p1',
    name: 'Happy Hour da Tarde',
    scope: 'Todas',
    discountType: 'percent',
    discountValue: 20,
    days: [true, true, true, true, true, false, false],
    timeStart: '14:00',
    timeEnd: '17:00',
    usageLabel: '38 usos',
    status: 'ativa',
  },
  {
    id: 'p2',
    name: 'Domingo em Dobro',
    scope: 'Quadra 2, 3',
    discountType: 'fixed',
    discountValue: 15,
    days: [false, false, false, false, false, false, true],
    timeStart: '08:00',
    timeEnd: '12:00',
    usageLabel: '12 usos de 40',
    status: 'ativa',
  },
  {
    id: 'p3',
    name: 'Madrugada Beach Tennis',
    scope: 'Quadra 1',
    discountType: 'percent',
    discountValue: 30,
    days: [false, false, false, false, true, true, false],
    timeStart: '06:00',
    timeEnd: '08:00',
    usageLabel: '0 usos · começa 15 Jul',
    status: 'agendada',
  },
  {
    id: 'p4',
    name: 'Volta às Aulas',
    scope: 'Todas',
    discountType: 'percent',
    discountValue: 15,
    days: [true, true, true, true, true, false, false],
    timeStart: '09:00',
    timeEnd: '12:00',
    usageLabel: '64 usos de 60',
    status: 'expirada',
  },
];

function formatDiscount(type: DiscountType, value: number): string {
  return type === 'percent' ? `${value}%` : `R$${value}`;
}

/** Tela Promoções do painel (protótipo ArPromocoesScreen): KPIs e tabela de descontos automáticos por dia/horário. */
@Component({
  selector: 'ar-panel-promotions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Promoções" [subtitle]="arenaName() + ' · descontos por dia e horário'">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="createPromotion()">
          <ar-icon name="plus" [size]="14" />
          Nova promoção
        </button>
      </ar-page-header>

      <div class="body">
        <div class="summary-row">
          <ar-panel-card pad="sm" class="summary-card">
            <div class="summary-label tone-orange">Promoções ativas</div>
            <div class="summary-value">{{ activeCount() }}</div>
          </ar-panel-card>
          <ar-panel-card pad="sm" class="summary-card">
            <div class="summary-label tone-dim">Usos no mês</div>
            <div class="summary-value">114</div>
          </ar-panel-card>
          <ar-panel-card pad="sm" class="summary-card">
            <div class="summary-label tone-dim">Horário mais fraco</div>
            <div class="summary-value">Ter · 14h–17h</div>
            <div class="summary-caption tone-dim">28% de ocupação média</div>
          </ar-panel-card>
          <ar-panel-card pad="sm" class="summary-card">
            <div class="summary-label tone-dim">Receita incremental</div>
            <div class="summary-value tone-green">R$ 1.860</div>
            <div class="summary-caption tone-dim">Reservas geradas via promo</div>
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
            <span>Uso</span>
            <span>Status</span>
            <span></span>
          </div>
          <div class="table-list">
            @for (p of filteredPromotions(); track p.id) {
              <div class="table-row">
                <div>
                  <div class="promo-name">{{ p.name }}</div>
                  <div class="promo-scope">{{ p.scope }}</div>
                </div>
                <div class="promo-discount">{{ formatDiscount(p.discountType, p.discountValue) }}</div>
                <div class="day-pills">
                  @for (d of dayLabels; track $index) {
                    <span class="day-pill" [class.active]="p.days[$index]">{{ d }}</span>
                  }
                </div>
                <div class="promo-time">{{ p.timeStart }}-{{ p.timeEnd }}</div>
                <div class="promo-usage">{{ p.usageLabel }}</div>
                <div><ar-pill [tone]="statusTone[p.status]">{{ statusLabel[p.status] }}</ar-pill></div>
                <div class="promo-actions">
                  <button type="button" class="ar-mini-btn" (click)="editPromotion(p.id)">
                    <ar-icon name="edit" [size]="13" />
                    Editar
                  </button>
                </div>
              </div>
            }
          </div>
        </ar-panel-card>
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

    .summary-value.tone-green {
      color: var(--nx-win);
    }

    .summary-caption {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      margin-top: 6px;
    }

    .summary-caption.tone-dim {
      color: var(--nx-text-dim);
    }

    .table-card {
      flex: 1;
      min-height: 0;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 1.8fr 90px 190px 110px 150px 110px 100px;
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

    .day-pills {
      display: flex;
      gap: 4px;
    }

    .day-pill {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      display: grid;
      place-items: center;
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 700;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-dim);
    }

    .day-pill.active {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.35);
      color: var(--nx-orange-500);
    }

    .promo-time,
    .promo-usage {
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
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly formatDiscount = formatDiscount;
  protected readonly dayLabels = DAY_LABELS;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly promotions = PROMOTIONS;

  protected readonly filter = signal<StatusFilter>('todas');

  protected readonly filteredPromotions = computed(() => {
    const f = this.filter();
    return f === 'todas' ? this.promotions : this.promotions.filter((p) => p.status === f);
  });

  protected readonly listKicker = computed(() => `${this.filteredPromotions().length} de ${this.promotions.length}`);

  protected readonly activeCount = computed(() => this.promotions.filter((p) => p.status === 'ativa').length);

  protected readonly arenaName = computed(() => this.auth.displayName() || 'Arena');

  protected createPromotion(): void {
    this.router.navigate(['/painel/promocoes/nova']);
  }

  protected editPromotion(id: string): void {
    this.router.navigate(['/painel/promocoes', id, 'editar']);
  }
}
