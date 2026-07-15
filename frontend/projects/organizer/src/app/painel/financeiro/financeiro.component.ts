import { ChangeDetectionStrategy, Component } from '@angular/core';
import { OG_EVENTOS, OG_TRANSACOES } from '../data/mock-data';
import { OgBarRowComponent } from '../ui/bar-row.component';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgLineChartComponent } from '../ui/line-chart.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';

/** Saldo consolidado, extrato de movimentação e arrecadação por evento. */
@Component({
  selector: 'og-financeiro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgCardComponent, OgIconComponent, OgLineChartComponent, OgBarRowComponent],
  template: `
    <og-page-header title="Financeiro" subtitle="Liga Amadora Goiânia · saldo consolidado">
      <button type="button" class="og-mini-btn og-mini-btn-primary"><og-icon name="download" [size]="14" />Sacar saldo</button>
    </og-page-header>

    <div class="og-content">
      <div class="og-kpi-row">
        <og-card pad="sm" flex="1.2">
          <div class="og-kpi-label">Saldo disponível</div>
          <div class="og-kpi-value" style="font-size:30px">R$ {{ saldo.toLocaleString('pt-BR') }}</div>
        </og-card>
        <og-card pad="sm" flex="1">
          <div class="og-kpi-label">Arrecadado (ano)</div>
          <div class="og-kpi-value sm" style="font-size:26px">R$ 13.040</div>
        </og-card>
        <og-card pad="sm" flex="1">
          <div class="og-kpi-label">Taxas da plataforma</div>
          <div class="og-kpi-value sm" style="font-size:26px">R$ 782</div>
        </og-card>
        <og-card pad="sm" flex="1">
          <div class="og-kpi-label">Pendente de repasse</div>
          <div class="og-kpi-value sm" style="font-size:26px;color:var(--nx-pending)">R$ 210</div>
        </og-card>
      </div>

      <div class="og-financeiro-grid">
        <og-card kicker="Movimentação" title="Extrato" pad="0">
          <div class="og-table-head">
            <span style="flex:1.4">Descrição</span>
            <span style="flex:1">Evento</span>
            <span style="width:60px">Data</span>
            <span style="width:90px;text-align:right">Valor</span>
          </div>
          <div class="og-table-body">
            @for (t of transacoes; track $index) {
              <div class="og-row">
                <span style="flex:1.4" class="og-fin-desc">{{ t.desc }}</span>
                <span style="flex:1" class="og-fin-evento">{{ t.evento }}</span>
                <span style="width:60px" class="og-fin-date">{{ t.date }}</span>
                <span
                  style="width:90px;text-align:right"
                  class="og-fin-value"
                  [style.color]="t.value > 0 ? 'var(--nx-win)' : t.tone === 'red' ? 'var(--nx-live)' : 'var(--nx-text-dim)'"
                >{{ t.value > 0 ? '+' : '' }}R$ {{ abs(t.value).toLocaleString('pt-BR') }}</span>
              </div>
            }
          </div>
        </og-card>

        <div class="og-financeiro-side">
          <og-card kicker="Evolução" title="Receita por mês">
            <og-line-chart [data]="[420, 680, 540, 900, 1180, 1400, 1620]" [labels]="['Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago']" />
          </og-card>
          <og-card kicker="Por evento" title="Arrecadação" flex="1">
            @for (e of eventos; track e.id; let last = $last) {
              <og-bar-row [label]="e.name" [sub]="e.sport" [pct]="pct(e.receita)" [last]="last" />
            }
          </og-card>
        </div>
      </div>
    </div>
  `,
  styles: `
    .og-financeiro-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 16px;
      flex: 1;
      min-height: 0;
    }
    .og-financeiro-side {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 0;
    }
    .og-fin-desc {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-fin-evento {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-fin-date {
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }
    .og-fin-value {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
    }
  `,
})
export class FinanceiroComponent {
  protected readonly saldo = 4260;
  protected readonly transacoes = OG_TRANSACOES;
  protected readonly eventos = OG_EVENTOS;

  protected abs(v: number): number {
    return Math.abs(v);
  }

  protected pct(receita: number): number {
    return Math.round((receita / 9600) * 100);
  }
}
