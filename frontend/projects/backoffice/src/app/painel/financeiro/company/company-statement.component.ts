import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { SquadKpiComponent } from '../../squad/ui/squad-kpi.component';
import { IconComponent } from '../../ui/icon.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import {
  isFeeEntry,
  money,
  monthLabel,
  outMoney,
  signedMoney,
  statementTypeLabel,
  type CompanyFinance,
  type StatementEntry,
} from '../data/company-finance';

type Filter = 'todos' | 'entradas' | 'saidas' | 'tarifas';

const PAGE = 100;

/** Extrato do Asaas do mês: cada movimento da conta, com as tarifas destacadas. */
@Component({
  selector: 'bo-company-statement',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, SquadKpiComponent, IconComponent],
  template: `
    @if (!statement().available) {
      <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>O extrato do Asaas não respondeu agora. Tente atualizar em instantes.</span></div>
    } @else {
      <div class="kpis">
        <bo-squad-kpi label="Entrou" [value]="money(totals().in)" [hint]="countIn() + ' movimentos'" />
        <bo-squad-kpi label="Saiu" [value]="outMoney(totals().out)" hint="Saques, transferências e estornos" />
        <bo-squad-kpi label="Tarifas" [value]="outMoney(totals().fees)" hint="Cobradas pelo Asaas" />
        <bo-squad-kpi label="Variação do mês" [value]="signedMoney(totals().in - totals().out - totals().fees)" [hint]="monthName(month())" />
      </div>

      <bo-panel-card pad="sm" title="Extrato do Asaas" [kicker]="statement().entries.length + ' lançamentos · mais recentes primeiro'">
        <div card-actions class="chips" role="group" aria-label="Filtro">
          @for (f of filters; track f.id) {
            <button type="button" class="bo-chip" [class.active]="filter() === f.id" [attr.aria-pressed]="filter() === f.id" (click)="setFilter(f.id)">{{ f.label }}</button>
          }
        </div>
        <div class="scroll">
          <div class="table">
            <div class="row head"><span>Data</span><span>Tipo</span><span>Descrição</span><span class="r">Valor</span><span class="r">Saldo</span></div>
            @for (e of visible(); track e.id || $index) {
              <div class="row" [class.fee]="isFee(e)">
                <span class="mono dim">{{ day(e.date) }}</span>
                <span class="type">{{ typeLabel(e.type) }}</span>
                <span class="desc" [title]="e.description">{{ e.description || '—' }}</span>
                <span class="num" [class.in]="e.valueCents > 0" [class.out]="e.valueCents < 0">{{ signedMoney(e.valueCents) }}</span>
                <span class="num dim">{{ e.balanceCents == null ? '—' : money(e.balanceCents) }}</span>
              </div>
            } @empty {
              <p class="empty">Nenhum lançamento {{ filter() === 'todos' ? 'neste mês' : 'com este filtro' }}.</p>
            }
          </div>
        </div>
        @if (filtered().length > limit()) {
          <button type="button" class="bo-mini-btn more" (click)="limit.set(limit() + page)">Mostrar mais</button>
        }
      </bo-panel-card>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .scroll { overflow-x: auto; margin: 0 -4px; }
    .table { min-width: 860px; padding: 0 4px; }
    .row { display: grid; grid-template-columns: 84px 200px minmax(0, 1fr) 120px 120px; gap: 12px; align-items: center; padding: 10px; border-bottom: 1px solid var(--nx-line); font-size: 13px; }
    .row:last-child { border-bottom: none; }
    .row.fee { background: rgba(255, 106, 26, 0.05); }
    .head { padding-top: 4px; }
    .head span { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-dim); }
    .r { text-align: right; }
    .mono { font-family: var(--nx-font-mono); font-size: 12px; }
    .dim { color: var(--nx-text-dim); }
    .type { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .desc { color: var(--nx-text-mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .num { font-family: var(--nx-font-mono); font-size: 12.5px; text-align: right; white-space: nowrap; }
    .num.in { color: var(--nx-win); }
    .num.out { color: var(--nx-text); }
    .empty { margin: 14px 10px 4px; font-size: 12.5px; color: var(--nx-text-dim); }
    .more { align-self: flex-start; margin-top: 12px; }
    @media (max-width: 1280px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) { .kpis { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class CompanyStatementComponent {
  readonly statement = input.required<CompanyFinance['statement']>();
  readonly month = input.required<string>();

  protected readonly filters: ReadonlyArray<{ id: Filter; label: string }> = [
    { id: 'todos', label: 'Todos' },
    { id: 'entradas', label: 'Entradas' },
    { id: 'saidas', label: 'Saídas' },
    { id: 'tarifas', label: 'Tarifas' },
  ];
  protected readonly page = PAGE;
  protected readonly filter = signal<Filter>('todos');
  protected readonly limit = signal(PAGE);

  protected readonly money = money;
  protected readonly outMoney = outMoney;
  protected readonly signedMoney = signedMoney;
  protected readonly typeLabel = statementTypeLabel;
  protected readonly monthName = monthLabel;
  protected readonly isFee = isFeeEntry;

  protected readonly totals = computed(() => {
    let inCents = 0;
    let out = 0;
    let fees = 0;
    for (const e of this.statement().entries) {
      if (isFeeEntry(e)) fees -= e.valueCents;
      else if (e.valueCents > 0) inCents += e.valueCents;
      else out -= e.valueCents;
    }
    return { in: inCents, out, fees };
  });
  protected readonly countIn = computed(() => this.statement().entries.filter((e) => e.valueCents > 0).length);

  protected readonly filtered = computed<StatementEntry[]>(() => {
    const f = this.filter();
    return this.statement().entries.filter((e) => {
      if (f === 'tarifas') return isFeeEntry(e);
      if (f === 'entradas') return e.valueCents > 0;
      if (f === 'saidas') return e.valueCents < 0 && !isFeeEntry(e);
      return true;
    });
  });
  protected readonly visible = computed(() => this.filtered().slice(0, this.limit()));

  protected setFilter(f: Filter): void {
    this.filter.set(f);
    this.limit.set(PAGE);
  }

  /** `2026-11-05` → `05/11`. */
  protected day(date: string): string {
    return date.length >= 10 ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : date;
  }
}
