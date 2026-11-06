import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { IconComponent } from '../../ui/icon.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import {
  DEDUCTIONS,
  DEDUCTION_LABEL,
  ESTIMATED_SOURCES,
  REVENUE_SOURCES,
  SOURCE_LABEL,
  deductionsTotal,
  margin,
  monthResult,
  monthShort,
  pctLabel,
  resultCsv,
  revenueTotal,
  signedMoney,
  sumMonths,
  type MonthResult,
} from '../data/company-finance';

type RowKind = 'section' | 'item' | 'cost' | 'total' | 'result' | 'margin';

interface Row {
  label: string;
  kind: RowKind;
  cells: string[];
  /** Células negativas (resultado/margem) em vermelho. */
  negative: boolean[];
}

function cell(cents: number | null): string {
  return cents == null ? '—' : cents === 0 ? '—' : signedMoney(cents);
}

/** Resultado mês a mês (DRE simplificada): receitas por fonte, deduções, custos e resultado. */
@Component({
  selector: 'bo-company-result',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, IconComponent],
  template: `
    <bo-panel-card pad="sm" title="Resultado mês a mês" kicker="Pela data em que o dinheiro entrou ou saiu">
      <div card-actions><button type="button" class="bo-mini-btn" (click)="exportCsv()"><bo-icon name="download" [size]="13" /> Exportar CSV</button></div>
      <div class="scroll">
        <table>
          <thead>
            <tr><th scope="col">Linha</th>@for (h of heads(); track h) { <th scope="col">{{ h }}</th> }</tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.label) {
              <tr [class]="r.kind">
                <th scope="row">{{ r.label }}</th>
                @for (c of r.cells; track $index) { <td [class.neg]="r.negative[$index]">{{ c }}</td> }
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="legend">
        ≈ Professores e centros de treino: 5% estimado sobre o valor (o Asaas faz o split e a parte da plataforma não fica gravada).
        Tarifas Asaas vêm do extrato de cada mês; as recuperadas são as repassadas a organizadores e arenas e as pagas pelo atleta por cima.
        Custos operacionais são os cadastrados em Custos e assinaturas, aplicados a cada mês.
      </p>
    </bo-panel-card>
  `,
  styles: `
    .scroll { overflow-x: auto; margin: 4px -4px 0; }
    table { width: 100%; min-width: 1000px; border-collapse: separate; border-spacing: 0; }
    th, td { padding: 8px 12px; font-family: var(--nx-font-mono); font-size: 12px; text-align: right; white-space: nowrap; border-bottom: 1px solid var(--nx-line); }
    thead th { font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-dim); border-bottom-color: var(--nx-line-strong); }
    th[scope='row'], thead th:first-child { text-align: left; font-family: var(--nx-font-ui); font-size: 13px; font-weight: 400; width: 230px; }
    thead th:first-child { font-family: var(--nx-font-mono); font-size: 9.5px; }
    tr.section th { padding-top: 18px; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-dim); border-bottom: none; }
    tr.section td { border-bottom: none; }
    tr.item th, tr.cost th { padding-left: 24px; color: var(--nx-text-mute); }
    tr.cost td { color: var(--nx-text-mute); }
    tr.total th, tr.total td { background: var(--nx-surface-1); font-weight: 600; border-bottom: none; }
    tr.total th { font-family: var(--nx-font-display); font-weight: 700; }
    tr.result th, tr.result td { background: rgba(255, 106, 26, 0.1); border-top: 1px solid rgba(255, 106, 26, 0.3); border-bottom: 1px solid rgba(255, 106, 26, 0.3); font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; color: var(--nx-orange-400); }
    tr.result th { color: var(--nx-text); }
    tr.margin td, tr.margin th { color: var(--nx-text-dim); border-bottom: none; }
    td.neg { color: var(--nx-live) !important; }
    .legend { margin: 12px 6px 2px; font-size: 11.5px; line-height: 1.5; color: var(--nx-text-dim); }
  `,
})
export class CompanyResultComponent {
  private readonly document = inject(DOCUMENT);

  readonly months = input.required<readonly MonthResult[]>();

  /** Os meses e a coluna do total do período. */
  private readonly columns = computed(() => [...this.months(), sumMonths(this.months(), 'total')]);
  protected readonly heads = computed(() => [...this.months().map((m) => monthShort(m.key)), `${this.months().length} meses`]);

  protected readonly rows = computed<Row[]>(() => {
    const cols = this.columns();
    const line = (label: string, kind: RowKind, value: (m: MonthResult) => number | null): Row => {
      const values = cols.map(value);
      return { label, kind, cells: values.map(cell), negative: values.map((v) => (kind === 'result' ? (v ?? 0) < 0 : false)) };
    };
    const section = (label: string): Row => ({ label, kind: 'section', cells: cols.map(() => ''), negative: [] });
    return [
      section('Receita'),
      ...REVENUE_SOURCES.map((s) => line(`${SOURCE_LABEL[s]}${ESTIMATED_SOURCES.has(s) ? ' ≈' : ''}`, 'item', (m) => m.revenue[s])),
      line('Receita bruta', 'total', revenueTotal),
      section('Deduções'),
      ...DEDUCTIONS.map((d) => line(DEDUCTION_LABEL[d], 'cost', (m) => -m.deductions[d])),
      line('Receita líquida', 'total', (m) => revenueTotal(m) - deductionsTotal(m)),
      section('Custos'),
      line('Tarifas Asaas (extrato)', 'cost', (m) => (m.asaasFees == null ? null : -m.asaasFees)),
      line('Tarifas recuperadas', 'cost', (m) => m.feesRecovered),
      line('Compras de estoque', 'cost', (m) => -m.stockPurchases),
      line('Custos operacionais', 'cost', (m) => -m.operatingCosts),
      line('Resultado', 'result', monthResult),
      { label: 'Margem', kind: 'margin', cells: cols.map((m) => pctLabel(margin(m))), negative: cols.map((m) => (margin(m) ?? 0) < 0) },
    ];
  });

  protected exportCsv(): void {
    const months = this.months();
    const blob = new Blob(['﻿', resultCsv(months)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = `resultado-nexago-${months[0]?.key ?? ''}-a-${months.at(-1)?.key ?? ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
