import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CenterContextService } from '../../core/center-context.service';
import { CenterStore } from '../../data/center-store.service';
import { formatDayKey, monthLabel, todayKey } from '../../domain/dates';
import { formatBRL } from '../../domain/money';
import { downloadCsv, toCsv } from '../../ui/csv';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent, PersonComponent, StatComponent } from '../../ui/kit';
import { SUB_FILTERS, countByFilter, filterSubscriptions, subscriptionRow, subscriptionStats, subscriptionsCsv, type SubFilter } from './subscription-view';

/** R2 — Assinaturas: cobrança recorrente dos planos mensais. */
@Component({
  selector: 'ct-subscriptions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, StatComponent, PersonComponent, IconComponent, RouterLink],
  template: `
    <ct-page-header title="Assinaturas" [subtitle]="subtitle()">
      <button type="button" class="ct-mini-btn" [disabled]="rows().length === 0" (click)="exportCsv()"><ct-icon name="download" [size]="14" /> Exportar</button>
      <a class="ct-mini-btn ct-mini-btn-primary" [routerLink]="['/centro', cid(), 'assinaturas', 'rodada']"><ct-icon name="repeat" [size]="14" /> Rodada de cobrança</a>
    </ct-page-header>

    <div class="page">
      <div class="ct-stats">
        <ct-stat label="Receita recorrente" [value]="formatBRL(stats().mrrCents)" [sub]="'por mês · ' + plural(stats().mrrCount, 'assinatura', 'assinaturas')" tone="green" />
        @if (stats().nextRun; as n) {
          <ct-stat [label]="'Próxima rodada · ' + formatDayKey(n.date)" [value]="formatBRL(n.cents)" [sub]="plural(n.count, 'cobrança agendada', 'cobranças agendadas')" />
        } @else {
          <ct-stat label="Próxima rodada" value="—" sub="nenhuma cobrança agendada" />
        }
        <ct-stat label="Em atraso" [value]="formatBRL(stats().overdueCents)" [sub]="plural(stats().overdueCount, 'assinatura', 'assinaturas') + ' · régua ativa'" [tone]="stats().overdueCount ? 'red' : ''" />
        <ct-stat [label]="'Cancelamentos · ' + month()" [value]="'' + stats().cancellations" [sub]="stats().atCycleEnd + ' no fim do ciclo'" />
      </div>

      <div class="ct-filter-bar">
        <button type="button" class="ct-chip" [class.active]="filter() === 'all'" (click)="filter.set('all')">Todas · {{ counts().all }}</button>
        @for (f of filters; track f.value) {
          <button type="button" class="ct-chip" [class.active]="filter() === f.value" (click)="filter.set(f.value)">{{ f.label }} · {{ counts()[f.value] }}</button>
        }
        <span class="ct-grow"></span>
        <label class="search">
          <ct-icon name="search" [size]="14" />
          <input type="search" placeholder="Buscar pagador ou aluno" aria-label="Buscar pagador ou aluno" [value]="search()" (input)="search.set(val($event))" />
        </label>
      </div>

      <div class="ct-card flush">
        <div class="ct-table" style="--cols: 1.3fr 1.4fr 100px 1fr 120px 170px; --min-w: 860px">
          <div class="ct-thead"><span>Pagador</span><span>Plano</span><span>Valor</span><span>Método</span><span>Próxima</span><span>Situação</span></div>
          @for (r of rows(); track r.sub.id) {
            <a class="ct-tr" [routerLink]="['/centro', cid(), 'assinaturas', r.sub.id]">
              <ct-person [name]="r.sub.payerName" [colorKey]="r.sub.studentId || r.sub.payerName" [size]="28" />
              <span class="two">
                <span class="ct-disp ct-ellipsis">{{ r.sub.planName }}</span>
                <span class="ct-mono ct-ellipsis">{{ r.planLine }}</span>
              </span>
              <span class="val">{{ formatBRL(r.sub.priceCents) }}</span>
              <span class="two">
                <span class="ct-ellipsis">{{ r.method }}</span>
                <span class="ct-mono">Dia {{ r.sub.billingDay }}</span>
              </span>
              <span [class]="'ct-mono next ' + r.next.tone">{{ r.next.text }}</span>
              <span><span [class]="'ct-pill ' + r.status[1]">{{ r.status[0] }}</span></span>
            </a>
          } @empty {
            <div class="ct-empty">
              @if (!store.loaded.subscriptions()) {
                <span class="ct-spinner light" aria-hidden="true"></span>
              } @else if (counts().all === 0) {
                Nenhuma assinatura ainda. Elas nascem sozinhas quando uma matrícula em plano mensal fica ativa — a partir daí o sistema gera a cobrança de cada mês 3 dias antes do vencimento.
              } @else {
                Nenhuma assinatura encontrada com esse filtro.
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .page { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .val { font-family: var(--nx-font-mono); font-size: 12.5px; font-weight: 700; color: var(--nx-text); }
    .two { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .next { font-weight: 600; }
    .next.red { color: var(--nx-live); }
    .next.yellow { color: var(--nx-pending); }
    .search { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; width: 240px; max-width: 100%; border-radius: var(--nx-r-2); background: var(--nx-surface-0); border: 1px solid var(--nx-line); color: var(--nx-text-dim); }
    .search input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: var(--nx-text); font: inherit; font-size: 13px; }
    @media (max-width: 700px) { .search { width: 100%; } }
  `,
})
export class SubscriptionsComponent {
  readonly centerId = input('');

  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);

  protected readonly filters = SUB_FILTERS;
  protected readonly formatBRL = formatBRL;
  protected readonly formatDayKey = formatDayKey;

  protected readonly cid = computed(() => this.centerId() || this.ctx.activeCenterId() || '');
  protected readonly tz = computed(() => this.ctx.center()?.timezone);
  protected readonly today = computed(() => todayKey(this.tz()));
  protected readonly month = computed(() => monthLabel(this.today().slice(0, 7)));
  protected readonly filter = signal<SubFilter>('all');
  protected readonly search = signal('');

  protected readonly counts = computed(() => countByFilter(this.store.subscriptions()));
  protected readonly stats = computed(() => subscriptionStats(this.store.subscriptions(), this.store.invoices(), this.today(), this.tz()));
  protected readonly rows = computed(() => {
    const today = this.today();
    return filterSubscriptions(this.store.subscriptions(), this.filter(), this.search()).map((s) => subscriptionRow(s, today));
  });
  protected readonly subtitle = computed(() => `Cobrança recorrente dos planos mensais · ${this.plural(this.counts().all, 'assinatura', 'assinaturas')}`);

  plural(n: number, one: string, many: string): string {
    return `${n} ${n === 1 ? one : many}`;
  }

  val(ev: Event): string {
    return (ev.target as HTMLInputElement).value;
  }

  exportCsv(): void {
    downloadCsv(`assinaturas-${this.today()}.csv`, toCsv(subscriptionsCsv(this.rows().map((r) => r.sub), this.today())));
  }
}
