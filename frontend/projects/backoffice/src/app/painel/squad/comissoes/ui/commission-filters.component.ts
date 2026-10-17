import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import {
  ORIGIN_LABEL,
  monthKey,
  periodLabel,
  shiftMonth,
  type CommissionOrigin,
  type Filters,
  type Period,
  type Tab,
} from '../data/commission';

type Menu = 'ambassador' | 'origin' | 'period' | null;

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'pending', label: 'Aguardando' },
  { id: 'released', label: 'Liberadas' },
  { id: 'paid', label: 'Pagas' },
  { id: 'canceled', label: 'Canceladas' },
];

const ORIGINS: readonly CommissionOrigin[] = ['code', 'link', 'qr'];

/** Abas de status (com contagem) e os chips Embaixador · Origem · Período. */
@Component({
  selector: 'bo-commission-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: { '(document:click)': 'menu.set(null)', '(document:keydown.escape)': 'menu.set(null)' },
  template: `
    <div class="tabs" role="tablist" aria-label="Status da comissão">
      @for (t of tabs; track t.id) {
        <button type="button" role="tab" [attr.aria-selected]="tab() === t.id" [class.on]="tab() === t.id" (click)="tabChange.emit(t.id)">
          {{ t.label }} <span class="count">{{ counts()[t.id] }}</span>
        </button>
      }
    </div>

    <div class="chips">
      <div class="chip-wrap" (click)="$event.stopPropagation()">
        <button type="button" class="chip" [class.set]="filters().ambassadorIds.length > 0" aria-haspopup="true"
          [attr.aria-expanded]="menu() === 'ambassador'" (click)="toggle('ambassador')">
          {{ ambassadorChip() }} <bo-icon name="chevron-down" [size]="13" />
        </button>
        @if (menu() === 'ambassador') {
          <div class="pop wide">
            <input class="bo-input search" type="search" placeholder="Buscar embaixador" aria-label="Buscar embaixador"
              [value]="q()" (input)="q.set(value($event))" />
            <ul class="opts">
              @for (a of visibleAmbassadors(); track a.id) {
                <li>
                  <label>
                    <input type="checkbox" [checked]="filters().ambassadorIds.includes(a.id)" (change)="toggleAmbassador(a.id)" />
                    {{ a.name }}
                  </label>
                </li>
              } @empty {
                <li class="none">Nenhum embaixador no período</li>
              }
            </ul>
            @if (filters().ambassadorIds.length > 0) {
              <button type="button" class="clear" (click)="filtersChange.emit({ ambassadorIds: [], origins: filters().origins })">Limpar</button>
            }
          </div>
        }
      </div>

      <div class="chip-wrap" (click)="$event.stopPropagation()">
        <button type="button" class="chip" [class.set]="filters().origins.length > 0" aria-haspopup="true"
          [attr.aria-expanded]="menu() === 'origin'" (click)="toggle('origin')">
          {{ originChip() }} <bo-icon name="chevron-down" [size]="13" />
        </button>
        @if (menu() === 'origin') {
          <div class="pop">
            <ul class="opts">
              @for (o of origins; track o) {
                <li>
                  <label>
                    <input type="checkbox" [checked]="filters().origins.includes(o)" (change)="toggleOrigin(o)" />
                    {{ originLabel[o] }}
                  </label>
                </li>
              }
            </ul>
          </div>
        }
      </div>

      <div class="chip-wrap" (click)="$event.stopPropagation()">
        <button type="button" class="chip" aria-haspopup="true" [attr.aria-expanded]="menu() === 'period'" (click)="toggle('period')">
          {{ periodText() }} <bo-icon name="chevron-down" [size]="13" />
        </button>
        @if (menu() === 'period') {
          <div class="pop right">
            <ul class="opts">
              @for (p of periodOptions(); track p.label) {
                <li>
                  <button type="button" class="opt" [class.on]="p.label === periodText()" (click)="pickPeriod(p.period)">{{ p.label }}</button>
                </li>
              }
            </ul>
            <div class="custom">
              <span class="lbl">Intervalo personalizado</span>
              <div class="range">
                <input class="bo-input" type="date" aria-label="De" [value]="from()" (input)="from.set(value($event))" />
                <input class="bo-input" type="date" aria-label="Até" [value]="to()" (input)="to.set(value($event))" />
              </div>
              <button type="button" class="bo-mini-btn" [disabled]="!customOk()" (click)="pickPeriod({ kind: 'custom', from: from(), to: to() })">
                Aplicar
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--nx-line); overflow-x: auto; }
    .tabs button { position: relative; height: 42px; padding: 0 14px; border: none; background: none; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 14px; cursor: pointer; white-space: nowrap; }
    .tabs button:hover { color: var(--nx-text); }
    .tabs button.on { color: var(--nx-text); }
    .tabs button.on::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: -1px; height: 2px; border-radius: 2px; background: var(--nx-orange-500); }
    .count { margin-left: 4px; font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); }
    .on .count { color: var(--nx-orange-500); }
    .chips { display: flex; gap: 8px; flex-wrap: wrap; }
    .chip-wrap { position: relative; }
    .chip { height: 40px; display: inline-flex; align-items: center; gap: 8px; padding: 0 14px; border-radius: var(--nx-r-2); border: 1px solid var(--nx-line); background: var(--nx-surface-0); color: var(--nx-text); font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; cursor: pointer; max-width: 240px; }
    .chip:hover { border-color: var(--nx-line-strong); }
    .chip.set { border-color: rgba(255, 106, 26, 0.45); background: var(--nx-orange-tint); }
    .pop { position: absolute; z-index: 15; top: calc(100% + 6px); left: 0; min-width: 200px; padding: 8px; display: flex; flex-direction: column; gap: 8px; background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-3); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); }
    .pop.wide { min-width: 260px; }
    .pop.right { left: auto; right: 0; min-width: 260px; }
    .search { height: 36px; font-size: 13px; }
    .opts { margin: 0; padding: 0; list-style: none; max-height: 260px; overflow-y: auto; }
    .opts label, .opt { width: 100%; display: flex; align-items: center; gap: 9px; padding: 8px; border: none; border-radius: var(--nx-r-2); background: none; color: var(--nx-text); font-size: 13px; text-align: left; cursor: pointer; }
    .opts label:hover, .opt:hover, .opt.on { background: var(--nx-surface-2); }
    input[type='checkbox'] { accent-color: var(--nx-orange-500); width: 15px; height: 15px; }
    .none { padding: 8px; font-size: 12.5px; color: var(--nx-text-dim); }
    .clear { align-self: flex-start; padding: 4px 8px; border: none; background: none; color: var(--nx-orange-500); font-size: 12.5px; cursor: pointer; }
    .custom { display: flex; flex-direction: column; gap: 8px; padding: 10px 8px 4px; border-top: 1px solid var(--nx-line); }
    .lbl { font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); }
    .range { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .range .bo-input { height: 36px; padding: 0 8px; font-size: 12.5px; color-scheme: dark; }
  `,
})
export class CommissionFiltersComponent {
  readonly tab = input.required<Tab>();
  readonly counts = input.required<Record<Tab, number>>();
  readonly filters = input.required<Filters>();
  readonly period = input.required<Period>();
  /** Embaixadores que aparecem no período (as opções do chip). */
  readonly ambassadors = input.required<Array<{ id: string; name: string }>>();
  readonly now = input.required<Date>();

  readonly tabChange = output<Tab>();
  readonly filtersChange = output<Filters>();
  readonly periodChange = output<Period>();

  protected readonly tabs = TABS;
  protected readonly origins = ORIGINS;
  protected readonly originLabel = ORIGIN_LABEL;
  protected readonly menu = signal<Menu>(null);
  protected readonly q = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');

  protected readonly periodText = computed(() => periodLabel(this.period()));
  protected readonly customOk = computed(() => !!this.from() && !!this.to() && this.from() <= this.to());

  protected readonly periodOptions = computed(() => {
    const current = monthKey(this.now());
    const options: Period[] = [
      { kind: 'month', key: current },
      { kind: 'month', key: shiftMonth(current, -1) },
      { kind: 'pilot' },
    ];
    return options.map((period) => ({ period, label: periodLabel(period) }));
  });

  protected readonly visibleAmbassadors = computed(() => {
    const q = this.q().trim().toLocaleLowerCase('pt-BR');
    return this.ambassadors().filter((a) => !q || a.name.toLocaleLowerCase('pt-BR').includes(q));
  });

  protected readonly ambassadorChip = computed(() => {
    const ids = this.filters().ambassadorIds;
    if (ids.length === 0) return 'Embaixador';
    if (ids.length === 1) return this.ambassadors().find((a) => a.id === ids[0])?.name ?? 'Embaixador · 1';
    return `Embaixador · ${ids.length}`;
  });

  protected readonly originChip = computed(() => {
    const o = this.filters().origins;
    return o.length === 0 ? 'Origem' : o.map((x) => ORIGIN_LABEL[x]).join(' · ');
  });

  protected toggle(menu: Exclude<Menu, null>): void {
    this.menu.update((m) => (m === menu ? null : menu));
  }

  protected toggleAmbassador(id: string): void {
    const ids = this.filters().ambassadorIds;
    this.filtersChange.emit({
      ...this.filters(),
      ambassadorIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    });
  }

  protected toggleOrigin(o: CommissionOrigin): void {
    const list = this.filters().origins;
    this.filtersChange.emit({ ...this.filters(), origins: list.includes(o) ? list.filter((x) => x !== o) : [...list, o] });
  }

  protected pickPeriod(period: Period): void {
    this.menu.set(null);
    this.periodChange.emit(period);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
