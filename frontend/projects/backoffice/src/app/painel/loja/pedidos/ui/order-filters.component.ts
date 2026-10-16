import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import type { OrderFilters, OrderSort, PaymentMethod } from '../data/order';

type Menu = 'entrega' | 'arena' | 'pagamento' | 'canal' | 'ordem';

const ENTREGA = [
  { id: 'todas', label: 'Todas' },
  { id: 'arena', label: 'Retirada na arena' },
  { id: 'casa', label: 'Entrega em casa' },
] as const;
const PAGAMENTO: { id: PaymentMethod; label: string }[] = [
  { id: 'pix', label: 'Pix' },
  { id: 'cartao', label: 'Cartão' },
  { id: 'saldo', label: 'Saldo' },
];
const CANAL = [
  { id: 'web', label: 'Web' },
  { id: 'app', label: 'App' },
] as const;
const ORDEM: { id: OrderSort; label: string }[] = [
  { id: 'recentes', label: 'mais recentes' },
  { id: 'antigos', label: 'mais antigos' },
  { id: 'valor', label: 'maior valor' },
];

/** Busca + chips com dropdown da tela 02. Quem guarda o estado (na URL) é a tela. */
@Component({
  selector: 'bo-order-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: { '(document:click)': 'onDocClick($event)', '(document:keydown.escape)': 'open.set(null)' },
  template: `
    <label class="search">
      <bo-icon name="search" [size]="14" />
      <input type="search" placeholder="Nº do pedido, cliente ou CPF" aria-label="Buscar por número do pedido, cliente ou CPF"
        [value]="filters().q" (input)="patch({ q: val($event) })" />
    </label>

    <div class="chip-wrap">
      <button type="button" class="chip" [class.on]="filters().entrega !== 'todas'" [attr.aria-expanded]="open() === 'entrega'" (click)="toggle('entrega')">
        Entrega: {{ entregaLabel() }} <bo-icon name="chevron-down" [size]="12" />
      </button>
      @if (open() === 'entrega') {
        <div class="menu" role="menu">
          @for (o of entrega; track o.id) {
            <button type="button" role="menuitemradio" [attr.aria-checked]="filters().entrega === o.id" (click)="patch({ entrega: o.id }); open.set(null)">
              <span class="mark">@if (filters().entrega === o.id) { <bo-icon name="check" [size]="12" /> }</span>{{ o.label }}
            </button>
          }
        </div>
      }
    </div>

    <div class="chip-wrap">
      <button type="button" class="chip" [class.on]="filters().arenas.length > 0" [attr.aria-expanded]="open() === 'arena'" (click)="toggle('arena')">
        {{ arenaLabel() }} <bo-icon name="chevron-down" [size]="12" />
      </button>
      @if (open() === 'arena') {
        <div class="menu" role="menu">
          @for (a of arenas(); track a.id) {
            <button type="button" role="menuitemcheckbox" [attr.aria-checked]="filters().arenas.includes(a.id)" (click)="toggleArena(a.id)">
              <span class="mark box" [class.checked]="filters().arenas.includes(a.id)">@if (filters().arenas.includes(a.id)) { <bo-icon name="check" [size]="11" /> }</span>{{ a.name }}
            </button>
          } @empty {
            <div class="none">Nenhuma arena com pedidos</div>
          }
          @if (filters().arenas.length > 0) {
            <button type="button" class="clear" (click)="patch({ arenas: [] }); open.set(null)">Limpar arenas</button>
          }
        </div>
      }
    </div>

    <div class="chip-wrap">
      <button type="button" class="chip" [class.on]="filters().pagamento !== null" [attr.aria-expanded]="open() === 'pagamento'" (click)="toggle('pagamento')">
        {{ pagamentoLabel() }} <bo-icon name="chevron-down" [size]="12" />
      </button>
      @if (open() === 'pagamento') {
        <div class="menu" role="menu">
          <button type="button" role="menuitemradio" [attr.aria-checked]="filters().pagamento === null" (click)="patch({ pagamento: null }); open.set(null)">
            <span class="mark">@if (filters().pagamento === null) { <bo-icon name="check" [size]="12" /> }</span>Todos
          </button>
          @for (o of pagamento; track o.id) {
            <button type="button" role="menuitemradio" [attr.aria-checked]="filters().pagamento === o.id" (click)="patch({ pagamento: o.id }); open.set(null)">
              <span class="mark">@if (filters().pagamento === o.id) { <bo-icon name="check" [size]="12" /> }</span>{{ o.label }}
            </button>
          }
        </div>
      }
    </div>

    <div class="chip-wrap">
      <button type="button" class="chip" [class.on]="filters().canal !== null" [attr.aria-expanded]="open() === 'canal'" (click)="toggle('canal')">
        {{ canalLabel() }} <bo-icon name="chevron-down" [size]="12" />
      </button>
      @if (open() === 'canal') {
        <div class="menu" role="menu">
          <button type="button" role="menuitemradio" [attr.aria-checked]="filters().canal === null" (click)="patch({ canal: null }); open.set(null)">
            <span class="mark">@if (filters().canal === null) { <bo-icon name="check" [size]="12" /> }</span>Todos
          </button>
          @for (o of canal; track o.id) {
            <button type="button" role="menuitemradio" [attr.aria-checked]="filters().canal === o.id" (click)="patch({ canal: o.id }); open.set(null)">
              <span class="mark">@if (filters().canal === o.id) { <bo-icon name="check" [size]="12" /> }</span>{{ o.label }}
            </button>
          }
        </div>
      }
    </div>

    <div class="spacer"></div>

    <div class="chip-wrap">
      <button type="button" class="sort" [attr.aria-expanded]="open() === 'ordem'" (click)="toggle('ordem')">Ordenar: {{ ordemLabel() }}</button>
      @if (open() === 'ordem') {
        <div class="menu right" role="menu">
          @for (o of ordem; track o.id) {
            <button type="button" role="menuitemradio" [attr.aria-checked]="filters().ordem === o.id" (click)="patch({ ordem: o.id }); open.set(null)">
              <span class="mark">@if (filters().ordem === o.id) { <bo-icon name="check" [size]="12" /> }</span>{{ o.label }}
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .search { display: flex; align-items: center; gap: 8px; width: 300px; max-width: 100%; height: 36px; padding: 0 12px; border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-2); background: var(--nx-surface-0); color: var(--nx-text-dim); }
    .search input { flex: 1; min-width: 0; border: none; background: none; color: var(--nx-text); font: inherit; font-size: 12.5px; outline: none; }
    .chip-wrap { position: relative; }
    .chip { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-2); background: var(--nx-surface-0); color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; white-space: nowrap; }
    .chip:hover { color: var(--nx-text); }
    .chip.on { border-color: var(--nx-orange-500); background: var(--nx-orange-tint); color: var(--nx-text); }
    .sort { height: 36px; border: none; background: none; color: var(--nx-text-mute); font-size: 12px; cursor: pointer; }
    .sort:hover { color: var(--nx-text); }
    .spacer { flex: 1; }
    .menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 20; min-width: 200px; padding: 6px; border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-3); background: var(--nx-surface-1); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45); display: flex; flex-direction: column; }
    .menu.right { left: auto; right: 0; }
    .menu button { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 8px; border: none; border-radius: 8px; background: none; color: var(--nx-text); font: inherit; font-size: 12.5px; text-align: left; cursor: pointer; white-space: nowrap; }
    .menu button:hover { background: var(--nx-surface-2); }
    .mark { width: 16px; display: inline-grid; place-items: center; color: var(--nx-orange-500); }
    .mark.box { height: 16px; border: 1px solid var(--nx-line-strong); border-radius: 4px; color: #0a0a0a; }
    .mark.box.checked { background: var(--nx-orange-500); border-color: var(--nx-orange-500); }
    .menu .clear { color: var(--nx-text-mute); border-top: 1px solid var(--nx-line); border-radius: 0; margin-top: 4px; }
    .none { padding: 8px; font-size: 12px; color: var(--nx-text-dim); }
  `,
})
export class OrderFiltersComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly filters = input.required<OrderFilters>();
  readonly arenas = input<{ id: string; name: string }[]>([]);
  readonly changed = output<Partial<OrderFilters>>();

  protected readonly entrega = ENTREGA;
  protected readonly pagamento = PAGAMENTO;
  protected readonly canal = CANAL;
  protected readonly ordem = ORDEM;
  protected readonly open = signal<Menu | null>(null);

  protected readonly entregaLabel = computed(() => ENTREGA.find((o) => o.id === this.filters().entrega)!.label.toLowerCase());
  protected readonly arenaLabel = computed(() => {
    const ids = this.filters().arenas;
    if (ids.length === 0) return 'Arena';
    const names = ids.map((id) => (this.arenas().find((a) => a.id === id)?.name ?? id).replace(/^Arena\s+/i, ''));
    return `Arena: ${names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ')}`;
  });
  protected readonly pagamentoLabel = computed(() => {
    const p = this.filters().pagamento;
    return p ? `Pagamento: ${PAGAMENTO.find((o) => o.id === p)!.label}` : 'Pagamento';
  });
  protected readonly canalLabel = computed(() => {
    const c = this.filters().canal;
    return c ? `Canal: ${CANAL.find((o) => o.id === c)!.label}` : 'Canal';
  });
  protected readonly ordemLabel = computed(() => ORDEM.find((o) => o.id === this.filters().ordem)!.label);

  protected toggle(menu: Menu): void {
    this.open.update((m) => (m === menu ? null : menu));
  }

  protected toggleArena(id: string): void {
    const cur = this.filters().arenas;
    this.patch({ arenas: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  }

  protected patch(p: Partial<OrderFilters>): void {
    this.changed.emit(p);
  }

  protected val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected onDocClick(e: MouseEvent): void {
    // `composedPath`: o item clicado pode ter saído do DOM com o re-render do menu.
    if (this.open() && !e.composedPath().includes(this.host.nativeElement)) this.open.set(null);
  }
}
