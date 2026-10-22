import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { CenterStore } from '../../data/center-store.service';
import { addMonths, formatDayKey, monthKey, monthLabel, todayKey } from '../../domain/dates';
import { awaitingTooLong, invoiceDisplayStatus } from '../../domain/enrollment';
import { moneySplit } from '../../domain/metrics';
import { formatBRL } from '../../domain/money';
import { INVOICE_STATUS, type InvoiceStatus } from '../../domain/models';
import { IconComponent } from '../../ui/icon.component';
import { BannerComponent, PageHeaderComponent, PersonComponent, StatComponent } from '../../ui/kit';
import { downloadCsv, toCsv } from '../../ui/csv';
import { InvoiceDrawerComponent } from './invoice-drawer.component';
import { countByDisplayStatus, invoiceDetail, invoicesCsv, invoicesOfMonth, type InvoiceFilter } from './invoice-view';
import { NewInvoiceComponent } from './new-invoice.component';

const FILTERS: (InvoiceStatus | 'late')[] = ['approved', 'pending', 'late', 'disputed', 'failed', 'refunded', 'cancelled'];

/** W21 — Cobranças do centro aos alunos. "Recebido" é só o que foi aprovado. */
@Component({
  selector: 'ct-finance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, StatComponent, BannerComponent, PersonComponent, IconComponent, InvoiceDrawerComponent, NewInvoiceComponent],
  templateUrl: './finance.component.html',
  styles: `
    .page { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .month { display: flex; align-items: center; gap: 4px; }
    .month b { min-width: 120px; text-align: center; font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; color: var(--nx-text); }
    .val { font-family: var(--nx-font-mono); font-size: 12.5px; font-weight: 700; color: var(--nx-text); }
    .warn { color: var(--nx-pending); }
  `,
})
export class FinanceComponent {
  readonly centerId = input('');

  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);

  protected readonly STATUS = INVOICE_STATUS;
  protected readonly filters = FILTERS;
  protected readonly formatBRL = formatBRL;
  protected readonly formatDayKey = formatDayKey;

  protected readonly today = computed(() => todayKey(this.ctx.center()?.timezone));
  private readonly pickedMonth = signal<string | null>(null);
  protected readonly month = computed(() => this.pickedMonth() ?? monthKey(this.today()));
  protected readonly monthTitle = computed(() => monthLabel(this.month(), true));
  protected readonly filter = signal<InvoiceFilter>('all');
  protected readonly selectedId = signal<string | null>(null);
  protected readonly showNew = signal(false);

  /** Escrita no financeiro é só de owner/admin. */
  protected readonly canWrite = computed(() => this.ctx.isManager() && this.ctx.canWrite());

  protected readonly split = computed(() => moneySplit(this.store.invoices(), this.month(), this.today()));
  private readonly monthList = computed(() => invoicesOfMonth(this.store.invoices(), this.month()));
  protected readonly counts = computed(() => countByDisplayStatus(this.monthList(), this.today()));
  /** Pendentes sem confirmação há mais de 2h — de qualquer mês. */
  protected readonly awaiting = computed(() => this.store.invoices().filter((i) => awaitingTooLong(i)));
  protected readonly awaitingInMonth = computed(() => this.monthList().filter((i) => awaitingTooLong(i)).length);

  protected readonly rows = computed(() => {
    const f = this.filter();
    const today = this.today();
    const now = new Date();
    return this.monthList()
      .map((inv) => ({ inv, st: invoiceDisplayStatus(inv, today), detail: invoiceDetail(inv, today, now) }))
      .filter((r) => f === 'all' || r.st === f);
  });

  protected readonly selected = computed(() => {
    const id = this.selectedId();
    return id ? (this.store.invoices().find((i) => i.id === id) ?? null) : null;
  });

  shiftMonth(delta: number): void {
    this.pickedMonth.set(addMonths(this.month(), delta));
    this.selectedId.set(null);
  }

  exportCsv(): void {
    downloadCsv(`financeiro-${this.month()}.csv`, toCsv(invoicesCsv(this.rows().map((r) => r.inv), this.today())));
  }
}
