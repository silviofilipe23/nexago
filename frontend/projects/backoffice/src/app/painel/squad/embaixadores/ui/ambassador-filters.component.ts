import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { SQUAD_TIERS, TIER_LABELS } from '../../niveis-regras/data/squad-rules';
import {
  DEFAULT_STATUS_FILTER,
  PERIOD_LABELS,
  SORT_LABELS,
  STATUS_FILTERS,
  statusLabel,
  type AmbPeriod,
  type Filters,
  type SortKey,
  type StatusFilter,
  type Tab,
} from '../data/ambassador';

type Menu = 'city' | 'status' | 'sort' | 'period' | null;

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'all', label: 'Todos' },
  ...SQUAD_TIERS.map((t) => ({ id: t as Tab, label: TIER_LABELS[t] })),
];
const SORTS = Object.keys(SORT_LABELS) as SortKey[];
const PERIODS = Object.keys(PERIOD_LABELS) as AmbPeriod[];

/** Abas por nível (com contagem), busca com debounce e os selects Cidade · Status · Ordenação · Período. */
@Component({
  selector: 'bo-ambassador-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: { '(document:click)': 'menu.set(null)', '(document:keydown.escape)': 'menu.set(null)' },
  template: `
    <div class="tabs" role="tablist" aria-label="Nível">
      @for (t of tabs; track t.id) {
        <button type="button" role="tab" [attr.aria-selected]="filters().tab === t.id" [class.on]="filters().tab === t.id"
          (click)="emit({ tab: t.id })">
          {{ t.label }} <span class="count">{{ counts()[t.id] }}</span>
        </button>
      }
    </div>

    <div class="bar">
      <label class="search">
        <bo-icon name="search" [size]="15" />
        <input type="search" placeholder="Buscar por nome, código ou arena..." aria-label="Buscar embaixador"
          [value]="term()" (input)="onSearch($event)" />
      </label>

      <div class="chip-wrap" (click)="$event.stopPropagation()">
        <button type="button" class="chip" [class.set]="filters().cities.length > 0" aria-haspopup="true"
          [attr.aria-expanded]="menu() === 'city'" (click)="toggle('city')">
          {{ cityChip() }} <bo-icon name="chevron-down" [size]="13" />
        </button>
        @if (menu() === 'city') {
          <div class="pop">
            <ul class="opts">
              @for (c of cities(); track c) {
                <li><label><input type="checkbox" [checked]="filters().cities.includes(c)" (change)="toggleCity(c)" /> {{ c }}</label></li>
              } @empty {
                <li class="none">Nenhuma cidade cadastrada</li>
              }
            </ul>
            @if (filters().cities.length > 0) {
              <button type="button" class="clear" (click)="emit({ cities: [] })">Limpar</button>
            }
          </div>
        }
      </div>

      <div class="chip-wrap" (click)="$event.stopPropagation()">
        <button type="button" class="chip" [class.set]="statusChanged()" aria-haspopup="true"
          [attr.aria-expanded]="menu() === 'status'" (click)="toggle('status')">
          {{ statusChip() }} <bo-icon name="chevron-down" [size]="13" />
        </button>
        @if (menu() === 'status') {
          <div class="pop">
            <ul class="opts">
              @for (s of statuses; track s) {
                <li><label><input type="checkbox" [checked]="filters().statuses.includes(s)" (change)="toggleStatus(s)" /> {{ label(s) }}</label></li>
              }
            </ul>
            @if (statusChanged()) {
              <button type="button" class="clear" (click)="resetStatuses()">Padrão</button>
            }
          </div>
        }
      </div>

      <div class="chip-wrap" (click)="$event.stopPropagation()">
        <button type="button" class="chip set" aria-haspopup="true" [attr.aria-expanded]="menu() === 'sort'" (click)="toggle('sort')">
          {{ sortLabels[filters().sort] }} <bo-icon name="chevron-down" [size]="13" />
        </button>
        @if (menu() === 'sort') {
          <div class="pop">
            <ul class="opts">
              @for (s of sorts; track s) {
                <li><button type="button" class="opt" [class.on]="filters().sort === s" (click)="pick({ sort: s })">{{ sortLabels[s] }}</button></li>
              }
            </ul>
          </div>
        }
      </div>

      <div class="spacer"></div>

      <div class="chip-wrap" (click)="$event.stopPropagation()">
        <button type="button" class="period" aria-haspopup="true" [attr.aria-expanded]="menu() === 'period'" (click)="toggle('period')"
          title="Afeta conversões, receita, custo e ROI. O Score é sempre do ciclo.">
          Período: <strong>{{ periodLabels[period()] }}</strong>
        </button>
        @if (menu() === 'period') {
          <div class="pop right">
            <ul class="opts">
              @for (p of periods; track p) {
                <li><button type="button" class="opt" [class.on]="period() === p" (click)="pickPeriod(p)">{{ periodLabels[p] }}</button></li>
              }
            </ul>
            <span class="hint">O Score não muda com o período.</span>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 18px; }
    .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--nx-line); overflow-x: auto; }
    .tabs button { position: relative; height: 44px; padding: 0 14px; border: none; background: none; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 15px; cursor: pointer; white-space: nowrap; }
    .tabs button:hover, .tabs button.on { color: var(--nx-text); }
    .tabs button.on::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: -1px; height: 2px; border-radius: 2px; background: var(--nx-orange-500); }
    .count { margin-left: 4px; font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); }
    .on .count { color: var(--nx-orange-500); }
    .bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .search { flex: 0 1 470px; min-width: 220px; height: 44px; display: flex; align-items: center; gap: 9px; padding: 0 14px; border-radius: var(--nx-r-2); border: 1px solid var(--nx-line); background: var(--nx-surface-0); color: var(--nx-text-dim); }
    .search:focus-within { border-color: var(--nx-line-strong); }
    .search input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; color: var(--nx-text); font-size: 14px; }
    .chip-wrap { position: relative; }
    .chip { height: 44px; display: inline-flex; align-items: center; gap: 8px; padding: 0 14px; border-radius: var(--nx-r-2); border: 1px solid var(--nx-line); background: var(--nx-surface-0); color: var(--nx-text); font-family: var(--nx-font-display); font-weight: 600; font-size: 14px; cursor: pointer; white-space: nowrap; }
    .chip:hover { border-color: var(--nx-line-strong); }
    .chip.set { border-color: rgba(255, 106, 26, 0.45); background: var(--nx-orange-tint); }
    .spacer { flex: 1; }
    .period { height: 44px; border: none; background: none; color: var(--nx-text-mute); font-size: 14px; cursor: pointer; }
    .period strong { color: var(--nx-text); font-family: var(--nx-font-display); }
    .pop { position: absolute; z-index: 15; top: calc(100% + 6px); left: 0; min-width: 220px; padding: 8px; display: flex; flex-direction: column; gap: 8px; background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-3); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); }
    .pop.right { left: auto; right: 0; }
    .opts { margin: 0; padding: 0; list-style: none; max-height: 280px; overflow-y: auto; }
    .opts label, .opt { width: 100%; display: flex; align-items: center; gap: 9px; padding: 8px; border: none; border-radius: var(--nx-r-2); background: none; color: var(--nx-text); font-size: 13px; text-align: left; cursor: pointer; white-space: nowrap; }
    .opts label:hover, .opt:hover, .opt.on { background: var(--nx-surface-2); }
    input[type='checkbox'] { accent-color: var(--nx-orange-500); width: 15px; height: 15px; }
    .none, .hint { padding: 4px 8px; font-size: 12px; color: var(--nx-text-dim); }
    .clear { align-self: flex-start; padding: 4px 8px; border: none; background: none; color: var(--nx-orange-500); font-size: 12.5px; cursor: pointer; }
    @media (max-width: 760px) { .spacer { display: none; } }
  `,
})
export class AmbassadorFiltersComponent {
  readonly filters = input.required<Filters>();
  readonly counts = input.required<Record<Tab, number>>();
  readonly cities = input.required<string[]>();
  readonly period = input.required<AmbPeriod>();

  readonly filtersChange = output<Filters>();
  readonly periodChange = output<AmbPeriod>();

  protected readonly tabs = TABS;
  protected readonly statuses = STATUS_FILTERS;
  protected readonly sorts = SORTS;
  protected readonly sortLabels = SORT_LABELS;
  protected readonly periods = PERIODS;
  protected readonly periodLabels = PERIOD_LABELS;
  protected readonly menu = signal<Menu>(null);
  protected readonly term = signal('');
  private debounce: ReturnType<typeof setTimeout> | undefined;

  protected readonly cityChip = computed(() => {
    const c = this.filters().cities;
    return c.length === 0 ? 'Cidade' : c.length === 1 ? c[0] : `Cidade · ${c.length}`;
  });
  protected readonly statusChanged = computed(() => {
    const s = this.filters().statuses;
    return s.length !== DEFAULT_STATUS_FILTER.length || DEFAULT_STATUS_FILTER.some((x) => !s.includes(x));
  });
  protected readonly statusChip = computed(() => {
    const s = this.filters().statuses;
    if (!this.statusChanged()) return 'Status';
    return s.length === 1 ? statusLabel(s[0]!) : `Status · ${s.length}`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.debounce));
  }

  protected label(s: StatusFilter): string {
    return statusLabel(s);
  }

  protected toggle(menu: Exclude<Menu, null>): void {
    this.menu.update((m) => (m === menu ? null : menu));
  }

  protected emit(patch: Partial<Filters>): void {
    this.filtersChange.emit({ ...this.filters(), ...patch });
  }

  protected pick(patch: Partial<Filters>): void {
    this.menu.set(null);
    this.emit(patch);
  }

  protected pickPeriod(p: AmbPeriod): void {
    this.menu.set(null);
    this.periodChange.emit(p);
  }

  protected resetStatuses(): void {
    this.emit({ statuses: [...DEFAULT_STATUS_FILTER] });
  }

  protected toggleCity(c: string): void {
    const list = this.filters().cities;
    this.emit({ cities: list.includes(c) ? list.filter((x) => x !== c) : [...list, c] });
  }

  protected toggleStatus(s: StatusFilter): void {
    const list = this.filters().statuses;
    this.emit({ statuses: list.includes(s) ? list.filter((x) => x !== s) : [...list, s] });
  }

  /** Aplica a partir de 2 caracteres, 300 ms depois da última tecla. */
  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.term.set(value);
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.emit({ search: value.trim().length >= 2 ? value : '' }), 300);
  }
}
