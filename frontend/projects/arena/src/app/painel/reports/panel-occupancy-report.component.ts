import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFunctions } from '../data/functions';
import { IconComponent } from '../ui/icon.component';
import { KpiCardComponent } from '../ui/kpi-card.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { ArenaOccupancyReportError, fetchArenaOccupancyReport } from './occupancy-report-repository';
import {
  formatDateBR,
  formatHours,
  formatPercent,
  lastNDaysRange,
  type ArenaOccupancyReport,
  type OccupancyRangeShortcut,
} from './occupancy-report.model';

interface RangeShortcutOption {
  key: OccupancyRangeShortcut;
  label: string;
}

const RANGE_SHORTCUTS: RangeShortcutOption[] = [
  { key: 7, label: 'Últimos 7 dias' },
  { key: 30, label: 'Últimos 30 dias' },
  { key: 90, label: 'Últimos 90 dias' },
];

/** Mesma mensagem do gate no servidor (`getArenaOccupancyReportCore`) — usada quando a UI já
 *  sabe pela `ArenaContextService` que a arena não é Pro/Elite, sem precisar chamar a function
 *  só pra receber o erro de volta. */
const PLAN_GATE_MESSAGE =
  'Relatórios de ocupação estão disponíveis nos planos Pro e Elite. Faça upgrade do plano da arena para acessar.';

function numberBR(n: number): string {
  return n.toLocaleString('pt-BR');
}

/** Relatório de ocupação de quadras (Pro/Elite): agregação 100% server-side via
 *  `getArenaOccupancyReport` — sem leitura direta de `arenaBookings` aqui, o volume de reservas
 *  no intervalo pode ser grande e a Cloud Function já devolve os totais prontos. */
@Component({
  selector: 'ar-panel-occupancy-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, KpiCardComponent, IconComponent, RouterLink],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Ocupação" [subtitle]="headerSubtitle()" />

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else if (arenaLoading()) {
          <p class="state-text">Carregando…</p>
        } @else if (showPaywall()) {
          <ar-panel-card pad="lg">
            <p class="paywall-title">Relatório de ocupação é um recurso dos planos Pro e Elite</p>
            <p class="state-text">{{ paywallMessage() }}</p>
            <a routerLink="/painel/planos" class="ar-mini-btn ar-mini-btn-primary paywall-cta">
              <ar-icon name="card" [size]="14" />
              Ver planos
            </a>
          </ar-panel-card>
        } @else {
          <ar-panel-card pad="sm" class="period-card">
            <div class="ar-filter-bar">
              @for (opt of rangeShortcuts; track opt.key) {
                <button type="button" class="ar-chip" [class.active]="activeShortcut() === opt.key" (click)="selectShortcut(opt.key)">
                  {{ opt.label }}
                </button>
              }
            </div>
            <div class="custom-range">
              <div class="custom-field">
                <span class="field-label">De</span>
                <input type="date" class="input-box" [value]="customFrom()" [max]="customTo()" (input)="customFrom.set($any($event.target).value)" />
              </div>
              <div class="custom-field">
                <span class="field-label">Até</span>
                <input type="date" class="input-box" [value]="customTo()" [min]="customFrom()" (input)="customTo.set($any($event.target).value)" />
              </div>
              <button type="button" class="ar-mini-btn" [disabled]="!canApplyCustomRange()" (click)="applyCustomRange()">Aplicar</button>
            </div>
          </ar-panel-card>

          @if (loading()) {
            <p class="state-text">Carregando relatório…</p>
          } @else if (loadError(); as err) {
            <div class="error-banner">{{ err }}</div>
          } @else if (report(); as r) {
            @if (r.totalBookings === 0) {
              <ar-panel-card pad="lg">
                <p class="state-text">Nenhuma reserva no período selecionado ({{ formatDateBR(r.dateFrom) }} – {{ formatDateBR(r.dateTo) }}).</p>
              </ar-panel-card>
            } @else {
              <div class="kpi-row">
                <ar-kpi-card label="Total de reservas" [value]="numberBR(r.totalBookings)" icon="bookmark" />
                <ar-kpi-card label="Horas reservadas" [value]="formatHours(r.totalHoursReserved)" icon="clock" />
                <ar-kpi-card label="Atletas únicos" [value]="numberBR(r.uniqueAthletesCount)" icon="users" />
                <ar-kpi-card label="Taxa de no-show" [value]="formatPercent(r.noShowRatePercent)" icon="alert-triangle" />
                <ar-kpi-card label="Recorrência" [value]="formatPercent(r.recurringSharePercent)" icon="repeat" />
              </div>

              <ar-panel-card [kicker]="courtsKicker()" title="Ocupação por quadra" class="table-card">
                <div class="table-head">
                  <span>Quadra</span>
                  <span class="right">Reservas</span>
                  <span class="right">Horas reservadas</span>
                  <span class="right">% do total</span>
                </div>
                <div class="table-list">
                  @for (c of r.courts; track c.courtId) {
                    <div class="table-row">
                      <div class="cell-court">{{ c.courtName }}</div>
                      <div class="right">{{ numberBR(c.bookingsCount) }}</div>
                      <div class="right cell-hours">{{ formatHours(c.hoursReserved) }}</div>
                      <div class="right">{{ formatPercent(courtSharePercent(c.hoursReserved, r.totalHoursReserved)) }}</div>
                    </div>
                  }
                </div>
              </ar-panel-card>
            }
          }
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

    .paywall-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
      margin: 0 0 8px;
    }

    .paywall-cta {
      margin-top: 16px;
      width: fit-content;
    }

    .period-card {
      flex: none;
    }

    .custom-range {
      display: flex;
      align-items: flex-end;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 14px;
    }

    .custom-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .input-box {
      height: 34px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text);
      padding: 0 10px;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
    }

    .error-banner {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
      padding: 10px 14px;
      font-size: 12.5px;
    }

    .kpi-row {
      display: flex;
      gap: 16px;
      flex: none;
    }

    .table-card {
      flex: 1;
      min-height: 0;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 1.6fr 1fr 1.3fr 1fr;
      gap: 14px;
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

    .cell-court {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .cell-hours {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      color: var(--nx-orange-500);
    }

    .right {
      text-align: right;
    }

    @media (max-width: 720px) {
      .kpi-row {
        flex-wrap: wrap;
      }
    }
  `,
})
export class PanelOccupancyReportComponent {
  private readonly arenaContext = inject(ArenaContextService);

  protected readonly rangeShortcuts = RANGE_SHORTCUTS;
  protected readonly numberBR = numberBR;
  protected readonly formatHours = formatHours;
  protected readonly formatPercent = formatPercent;
  protected readonly formatDateBR = formatDateBR;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly entitled = computed(() => this.arenaContext.hasCapability('metricasCompletas'));

  private readonly defaultRange = lastNDaysRange(30);

  protected readonly activeShortcut = signal<OccupancyRangeShortcut | null>(30);
  protected readonly dateFrom = signal(this.defaultRange.dateFrom);
  protected readonly dateTo = signal(this.defaultRange.dateTo);
  protected readonly customFrom = signal(this.defaultRange.dateFrom);
  protected readonly customTo = signal(this.defaultRange.dateTo);

  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly planGateMessage = signal<string | null>(null);
  protected readonly report = signal<ArenaOccupancyReport | null>(null);

  protected readonly showPaywall = computed(() => !this.entitled() || this.planGateMessage() != null);
  protected readonly paywallMessage = computed(() => this.planGateMessage() ?? PLAN_GATE_MESSAGE);

  protected readonly canApplyCustomRange = computed(() => {
    const from = this.customFrom();
    const to = this.customTo();
    return from.length > 0 && to.length > 0 && from <= to && (from !== this.dateFrom() || to !== this.dateTo());
  });

  protected readonly headerSubtitle = computed(() => {
    const name = this.arenaContext.arenaName() ?? 'Arena';
    const r = this.report();
    if (!r) return name;
    return `${name} · ${formatDateBR(r.dateFrom)} – ${formatDateBR(r.dateTo)}`;
  });

  protected readonly courtsKicker = computed(() => `${this.report()?.courts.length ?? 0} quadras`);

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      const entitled = this.entitled();
      const dateFrom = this.dateFrom();
      const dateTo = this.dateTo();
      if (!arenaId || !entitled) return;
      void this.load(arenaId, dateFrom, dateTo);
    });
  }

  protected selectShortcut(days: OccupancyRangeShortcut): void {
    const range = lastNDaysRange(days);
    this.activeShortcut.set(days);
    this.customFrom.set(range.dateFrom);
    this.customTo.set(range.dateTo);
    this.dateFrom.set(range.dateFrom);
    this.dateTo.set(range.dateTo);
  }

  protected applyCustomRange(): void {
    if (!this.canApplyCustomRange()) return;
    this.activeShortcut.set(null);
    this.dateFrom.set(this.customFrom());
    this.dateTo.set(this.customTo());
  }

  protected courtSharePercent(hoursReserved: number, totalHours: number): number {
    return totalHours === 0 ? 0 : Math.round((hoursReserved / totalHours) * 1000) / 10;
  }

  private async load(arenaId: string, dateFrom: string, dateTo: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    this.planGateMessage.set(null);
    try {
      const report = await fetchArenaOccupancyReport(arenaFunctions(), { arenaId, dateFrom, dateTo });
      this.report.set(report);
    } catch (err) {
      this.report.set(null);
      if (err instanceof ArenaOccupancyReportError && err.isPlanGate) {
        this.planGateMessage.set(err.message);
      } else {
        this.loadError.set(err instanceof Error ? err.message : 'Não foi possível carregar o relatório de ocupação. Tente novamente.');
      }
    } finally {
      this.loading.set(false);
    }
  }
}
