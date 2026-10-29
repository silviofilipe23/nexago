import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { formatBRL } from '../bookings/arena-booking.model';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { AvatarComponent } from '../ui/avatar.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { watchWeatherCredits } from './weather-repository';
import {
  WEATHER_CREDIT_FILTERS,
  creditBalanceShown,
  creditIsFaded,
  creditOriginLabel,
  creditValidityText,
  dateKeyFrom,
  filterWeatherCredits,
  monthLongLabel,
  weatherCreditKpis,
  weatherCreditPill,
  weatherCreditsCsv,
  type WeatherCredit,
  type WeatherCreditFilter,
} from './weather.model';

interface CreditKpiCard {
  label: string;
  value: string;
  sub: string;
  warn: boolean;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** 04 · Créditos de clima (`/painel/financeiro/creditos-clima`): saldo que a chuva deixou com os
 *  atletas (`arenaWeatherCredits`). Só leitura: o crédito nasce e morre no servidor (escolha,
 *  varredura de 24h, uso na reserva, vencimento). Nada disso movimenta `arenaWallets`. */
@Component({
  selector: 'ar-panel-weather-credits',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, AvatarComponent, IconComponent],
  styleUrl: './weather.scss',
  template: `
    <ar-panel-shell>
      <ar-page-header title="Créditos de clima" subtitle="Financeiro · Saldo dos atletas gerado por chuva">
        <div class="header-actions">
          <button type="button" class="ar-mini-btn export-btn" [disabled]="loading() || filtered().length === 0" (click)="exportCsv()">
            <ar-icon name="download" [size]="13" />
            Exportar
          </button>
        </div>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else {
          @if (error(); as err) {
            <div class="error-banner" role="alert">{{ err }}</div>
          }

          <div class="kpis">
            @for (k of kpiCards(); track k.label) {
              <ar-panel-card pad="sm" class="kpi">
                <div class="wx-kicker">{{ k.label }}</div>
                <div class="kpi-value" [class.warn]="k.warn">{{ k.value }}</div>
                <div class="kpi-sub">{{ k.sub }}</div>
              </ar-panel-card>
            }
          </div>

          <ar-panel-card title="Extrato de créditos" [kicker]="countLabel()">
            <div card-actions class="ar-filter-bar">
              @for (f of filters; track f.id) {
                <button type="button" class="ar-chip filter-chip" [class.active]="filter() === f.id" (click)="filter.set(f.id)">{{ f.label }}</button>
              }
            </div>

            @if (loading()) {
              <p class="state-text">Carregando créditos…</p>
            } @else {
              <div class="ar-table-scroll" tabindex="0" role="region" aria-label="Extrato de créditos de clima">
                <div class="credit-table">
                  <div class="table-head credit-grid">
                    <span class="wx-kicker">Atleta</span>
                    <span class="wx-kicker">Reserva de origem</span>
                    <span class="wx-kicker">Crédito</span>
                    <span class="wx-kicker">Saldo</span>
                    <span class="wx-kicker">Validade</span>
                    <span class="wx-kicker">Status</span>
                  </div>
                  @for (row of rows(); track row.credit.id) {
                    <div class="table-row credit-grid credit-row" [class.faded]="row.faded">
                      <div class="who">
                        <ar-avatar [name]="row.credit.athleteName" [size]="28" />
                        <span class="who-name">{{ row.credit.athleteName }}</span>
                      </div>
                      <span class="cell-mono">{{ row.origin }}</span>
                      <span class="cell-mono">{{ formatBRL(row.credit.amountReais) }}</span>
                      <span class="cell-money">{{ formatBRL(row.balance) }}</span>
                      <span class="cell-mono">{{ row.validity }}</span>
                      <span><ar-pill [tone]="row.pill.tone">{{ row.pill.label }}</ar-pill></span>
                    </div>
                  } @empty {
                    <p class="state-text empty-text">{{ emptyText() }}</p>
                  }
                </div>
              </div>
            }
            <p class="fine footnote">
              Atletas com crédito vencendo recebem um lembrete 7 dias antes. Créditos expirados voltam como receita da arena.
            </p>
          </ar-panel-card>
        }
      </div>
    </ar-panel-shell>
  `,
  styles: `
    @use 'breakpoints' as ar;

    .kpis {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
    }

    .kpi-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 24px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin-top: 8px;
      overflow-wrap: anywhere;
    }

    .kpi-value.warn {
      color: var(--nx-pending);
    }

    .kpi-sub {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
      margin-top: 4px;
    }

    /* Ver .affected-table no Modo chuva: largura mínima fixa em vez do max-content global. */
    .credit-table {
      min-width: 712px;
    }

    .credit-grid {
      grid-template-columns: minmax(130px, 1.4fr) minmax(140px, 1.3fr) 84px 84px 96px 128px;
      column-gap: 10px;
    }

    .credit-row {
      padding: 12px 0;
    }

    .credit-row.faded {
      opacity: 0.6;
    }

    .empty-text {
      padding: 14px 0 4px;
    }

    .footnote {
      margin-top: 14px;
    }

    @include ar.below(lg) {
      .kpis {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    /* Celular: 2x2 continua (4 cartões empilhados ocupavam a tela inteira), com o valor menor. */
    @include ar.below(sm) {
      .kpis {
        gap: 10px;
      }

      .kpi-value {
        font-size: 19px;
      }
    }
  `,
})
export class PanelWeatherCreditsComponent {
  private readonly arenaContext = inject(ArenaContextService);

  protected readonly filters = WEATHER_CREDIT_FILTERS;
  protected readonly formatBRL = formatBRL;

  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly credits = signal<WeatherCredit[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly filter = signal<WeatherCreditFilter>('all');
  protected readonly now = signal(new Date());

  protected readonly kpis = computed(() => weatherCreditKpis(this.credits(), this.now()));
  protected readonly kpiCards = computed<CreditKpiCard[]>(() => {
    const k = this.kpis();
    const month = monthLongLabel(this.now());
    return [
      { label: 'Em aberto', value: formatBRL(k.openBalanceReais), sub: plural(k.openAthletes, 'atleta', 'atletas'), warn: false },
      { label: `Usados em ${month}`, value: formatBRL(k.usedThisMonthReais), sub: plural(k.usedThisMonthBookings, 'reserva', 'reservas'), warn: false },
      { label: 'Remarcações', value: String(k.reschedulesThisMonth), sub: `em ${month}`, warn: false },
      { label: 'Vencem em 30 dias', value: formatBRL(k.expiringIn30Reais), sub: plural(k.expiringIn30Athletes, 'atleta', 'atletas'), warn: k.expiringIn30Reais > 0 },
    ];
  });

  protected readonly filtered = computed(() => filterWeatherCredits(this.credits(), this.filter(), this.now()));
  protected readonly rows = computed(() =>
    this.filtered().map((credit) => ({
      credit,
      origin: creditOriginLabel(credit),
      balance: creditBalanceShown(credit),
      validity: creditValidityText(credit),
      pill: weatherCreditPill(credit, this.now()),
      faded: creditIsFaded(credit),
    })),
  );
  protected readonly countLabel = computed(() => plural(this.filtered().length, 'crédito', 'créditos'));
  protected readonly emptyText = computed(() => {
    switch (this.filter()) {
      case 'all':
        return 'Nenhum crédito de clima ainda. Eles aparecem quando um atleta guarda o valor de uma reserva liberada por chuva.';
      case 'open':
        return 'Nenhum crédito em aberto.';
      case 'expiring':
        return 'Nenhum crédito vence nos próximos 30 dias.';
    }
  });

  constructor() {
    effect((onCleanup) => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      this.loading.set(true);
      const unsub = watchWeatherCredits(
        arenaFirestore(),
        arenaId,
        (credits) => {
          this.credits.set(credits);
          this.now.set(new Date());
          this.loading.set(false);
          this.error.set(null);
        },
        (message) => {
          this.error.set(message);
          this.loading.set(false);
        },
      );
      onCleanup(() => unsub());
    });
  }

  protected exportCsv(): void {
    const csv = weatherCreditsCsv(this.filtered(), this.now());
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `creditos-clima-${dateKeyFrom(this.now())}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
