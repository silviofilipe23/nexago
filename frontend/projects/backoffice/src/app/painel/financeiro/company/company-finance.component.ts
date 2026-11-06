import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { callableErrorMessage } from '../../data/callable-error';
import { IconComponent } from '../../ui/icon.component';
import { CompanyFinanceRepository } from '../data/company-finance.repository';
import { currentMonthKey, monthLabel, monthOptions, type CompanyFinance } from '../data/company-finance';
import { CompanyOverviewComponent } from './company-overview.component';
import { CompanyResultComponent } from './company-result.component';
import { CompanyStatementComponent } from './company-statement.component';
import { CompanyThirdPartyComponent } from './company-third-party.component';

export type CompanyView = 'overview' | 'result' | 'thirdParty' | 'statement';

const TIME = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

/**
 * As quatro abas do financeiro da empresa sobre uma carga só de `getCompanyFinance`: trocar de aba
 * não recarrega; trocar o mês, sim.
 */
@Component({
  selector: 'bo-company-finance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, CompanyOverviewComponent, CompanyResultComponent, CompanyThirdPartyComponent, CompanyStatementComponent],
  template: `
    <div class="bar">
      <label class="month">Mês
        <select [disabled]="loading()" (change)="pick($event)">
          @for (m of months; track m) { <option [value]="m" [selected]="m === month()">{{ label(m) }}</option> }
        </select>
      </label>
      @if (data(); as d) {
        @if (d.generatedAt) { <span class="when">Atualizado às {{ time(d.generatedAt) }}</span> }
      }
      <button type="button" class="bo-mini-btn" [disabled]="loading()" (click)="load()"><bo-icon name="swap" [size]="13" /> Atualizar</button>
    </div>

    @if (error(); as message) {
      <div class="bo-alert" role="alert">
        <bo-icon name="alert" [size]="16" />
        <span>{{ message }}</span>
        <button type="button" class="bo-mini-btn push" (click)="load()">Tentar de novo</button>
      </div>
    } @else if (loading() && !data()) {
      <div class="skel-grid" aria-busy="true" aria-label="Carregando o financeiro">
        <div class="skel tall"></div>
        <div class="skel"></div>
        <div class="skel big"></div>
      </div>
    } @else if (data(); as d) {
      @for (w of d.warnings; track w) {
        <div class="warn" role="status"><bo-icon name="alert" [size]="15" /> {{ w }}</div>
      }
      <div [class.stale]="loading()">
        @switch (view()) {
          @case ('result') { <bo-company-result [months]="d.months" /> }
          @case ('thirdParty') { <bo-company-third-party [data]="d" (openWithdrawals)="openWithdrawals.emit()" /> }
          @case ('statement') { <bo-company-statement [statement]="d.statement" [month]="d.month" /> }
          @default { <bo-company-overview [data]="d" (openView)="openView.emit($event)" (openWithdrawals)="openWithdrawals.emit()" /> }
        }
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .month { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--nx-text-mute); }
    .month select { height: 34px; padding: 0 10px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); color: var(--nx-text); font-family: var(--nx-font-ui); font-size: 13px; }
    .when { font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-dim); }
    .push { margin-left: auto; flex: none; }
    .warn { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: var(--nx-r-3); background: rgba(244, 197, 67, 0.07); border: 1px solid rgba(244, 197, 67, 0.28); font-size: 12.5px; }
    .warn bo-icon { color: var(--nx-pending); flex: none; }
    .stale { opacity: 0.55; pointer-events: none; transition: opacity 140ms; }
    .skel-grid { display: flex; flex-direction: column; gap: 16px; }
    .skel { height: 110px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .skel.tall { height: 170px; }
    .skel.big { height: 320px; }
  `,
})
export class CompanyFinanceComponent {
  private readonly repo = inject(CompanyFinanceRepository);

  readonly view = input<CompanyView>('overview');
  readonly openView = output<CompanyView>();
  readonly openWithdrawals = output<void>();

  protected readonly months = monthOptions(currentMonthKey());
  protected readonly month = signal(this.months[0]);
  protected readonly data = signal<CompanyFinance | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly label = monthLabel;
  private seq = 0;

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const ticket = ++this.seq;
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.repo.load(this.month());
      // Troca de mês no meio da carga: só a última resposta vale.
      if (ticket === this.seq) this.data.set(data);
    } catch (e) {
      if (ticket === this.seq) this.error.set(callableErrorMessage(e));
    } finally {
      if (ticket === this.seq) this.loading.set(false);
    }
  }

  protected pick(event: Event): void {
    this.month.set((event.target as HTMLSelectElement).value);
    void this.load();
  }

  protected time(d: Date): string {
    return TIME.format(d);
  }
}
