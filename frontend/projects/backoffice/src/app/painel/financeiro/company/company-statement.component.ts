import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { callableErrorMessage } from '../../data/callable-error';
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
  transferTagLabel,
  type CompanyFinance,
  type PayoutTarget,
  type StatementEntry,
} from '../data/company-finance';
import { CompanyFinanceRepository } from '../data/company-finance.repository';
import { ClassifyTransferDialogComponent, type ClassifyChoice } from '../ui/classify-transfer-dialog.component';

type Filter = 'todos' | 'entradas' | 'saidas' | 'tarifas' | 'classificar';

const PAGE = 100;

/** Extrato do Asaas do mês: cada movimento da conta, com as tarifas destacadas. */
@Component({
  selector: 'bo-company-statement',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, SquadKpiComponent, IconComponent, ClassifyTransferDialogComponent],
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
            <div class="row head"><span>Data</span><span>Tipo</span><span>Descrição</span><span>Classificação</span><span class="r">Valor</span><span class="r">Saldo</span></div>
            @for (e of visible(); track e.id || $index) {
              <div class="row" [class.fee]="isFee(e)">
                <span class="mono dim">{{ day(e.date) }}</span>
                <span class="type">{{ typeLabel(e.type) }}</span>
                <span class="desc" [title]="e.description">{{ e.description || '—' }}</span>
                <span class="tag-cell">
                  @if (e.transfer; as t) {
                    @if (t.state === 'unclassified') {
                      <button type="button" class="tag todo" (click)="openClassify(e)">Classificar</button>
                    } @else if (t.kind === 'organizerPayout') {
                      <span class="tag payout" [title]="tagTitle(e)">{{ tagLabel(t) }}</span>
                    } @else {
                      <button type="button" class="tag" [class.withdrawal]="t.kind === 'withdrawal'" [class.expense]="t.kind === 'expense'"
                        [title]="tagTitle(e)" [attr.aria-label]="tagLabel(t) + ': alterar classificação'" (click)="openClassify(e)">{{ tagLabel(t) }}</button>
                    }
                  }
                </span>
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
    <bo-classify-transfer-dialog [open]="!!classifying()" [entry]="classifying()" [targets]="payoutTargets()" [busy]="saving()" [error]="saveError()"
      (submitted)="classify($event)" (dismissed)="closeClassify()" />
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .scroll { overflow-x: auto; margin: 0 -4px; }
    .table { min-width: 1020px; padding: 0 4px; }
    .row { display: grid; grid-template-columns: 84px 190px minmax(0, 1fr) 170px 120px 120px; gap: 12px; align-items: center; padding: 10px; border-bottom: 1px solid var(--nx-line); font-size: 13px; }
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
    .tag-cell { min-width: 0; }
    .tag { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--nx-line-strong); background: var(--nx-surface-1); color: var(--nx-text-mute); font-family: var(--nx-font-ui); font-size: 11.5px; font-weight: 600; line-height: 1.3; }
    button.tag { cursor: pointer; }
    button.tag:hover { border-color: var(--nx-text-dim); }
    .tag.todo { border-color: rgba(255, 106, 26, 0.55); background: rgba(255, 106, 26, 0.1); color: var(--nx-orange-400); }
    .tag.withdrawal { border-color: rgba(120, 160, 255, 0.4); color: var(--nx-text); }
    .tag.expense { border-color: rgba(244, 197, 67, 0.4); color: var(--nx-text); }
    .tag.payout { border-color: rgba(62, 207, 142, 0.4); color: var(--nx-text); }
    .empty { margin: 14px 10px 4px; font-size: 12.5px; color: var(--nx-text-dim); }
    .more { align-self: flex-start; margin-top: 12px; }
    @media (max-width: 1280px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) { .kpis { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class CompanyStatementComponent {
  readonly statement = input.required<CompanyFinance['statement']>();
  readonly month = input.required<string>();
  readonly payoutTargets = input<readonly PayoutTarget[]>([]);
  /** Classificou: o pai recarrega o financeiro. */
  readonly classified = output<void>();

  private readonly repo = inject(CompanyFinanceRepository);
  protected readonly classifying = signal<StatementEntry | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected readonly filters: ReadonlyArray<{ id: Filter; label: string }> = [
    { id: 'todos', label: 'Todos' },
    { id: 'entradas', label: 'Entradas' },
    { id: 'saidas', label: 'Saídas' },
    { id: 'tarifas', label: 'Tarifas' },
    { id: 'classificar', label: 'A classificar' },
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
  protected readonly tagLabel = transferTagLabel;

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
      if (f === 'classificar') return e.transfer?.state === 'unclassified';
      return true;
    });
  });
  protected readonly visible = computed(() => this.filtered().slice(0, this.limit()));

  protected setFilter(f: Filter): void {
    this.filter.set(f);
    this.limit.set(PAGE);
  }

  protected tagTitle(e: StatementEntry): string {
    const t = e.transfer;
    if (t?.state !== 'classified') return '';
    return t.note ? `${transferTagLabel(t)} — ${t.note}` : transferTagLabel(t);
  }

  protected openClassify(e: StatementEntry): void {
    this.saveError.set(null);
    this.classifying.set(e);
  }

  protected closeClassify(): void {
    if (!this.saving()) this.classifying.set(null);
  }

  protected async classify(choice: ClassifyChoice): Promise<void> {
    const entry = this.classifying();
    if (!entry?.transferId || this.saving()) return;
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await this.repo.classifyTransfer({ transferId: entry.transferId, ...choice });
      this.classifying.set(null);
      this.classified.emit();
    } catch (e) {
      this.saveError.set(callableErrorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }

  /** `2026-11-05` → `05/11`. */
  protected day(date: string): string {
    return date.length >= 10 ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : date;
  }
}
