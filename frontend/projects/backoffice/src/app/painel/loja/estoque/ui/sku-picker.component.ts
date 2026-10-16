import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { searchRows, skuKey, type StockRow } from '../data/stock';

/**
 * Busca para adicionar SKU (nome, SKU ou código de barras; ⌘K foca) e o modo
 * "Ler código de barras": o leitor digita e manda Enter, e cada leitura vira um
 * `scanned` — quem usa decide somar +1.
 */
@Component({
  selector: 'bo-sku-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    <div class="bar">
      <div class="search" [class.open]="results().length > 0">
        <bo-icon name="search" [size]="14" />
        <input #search type="search" [placeholder]="placeholder()" aria-label="Buscar SKU para adicionar"
          [value]="q()" [disabled]="disabled()" (input)="q.set(val($event))" (keydown.enter)="pickFirst($event)" (keydown.escape)="q.set('')" />
        <kbd>⌘K</kbd>
        @if (results().length > 0) {
          <ul class="results" role="listbox">
            @for (r of results(); track key(r)) {
              <li role="option">
                <button type="button" (click)="pick(r)">
                  <span class="name">{{ r.productName }}</span>
                  <span class="variant">{{ r.variantLabel }} · <code>{{ r.skuCode }}</code></span>
                </button>
              </li>
            }
          </ul>
        }
      </div>
      <button type="button" class="bo-mini-btn" [class.active]="scanning()" [attr.aria-pressed]="scanning()" [disabled]="disabled()" (click)="toggleScan()">
        <bo-icon name="camera" [size]="13" /> Ler código de barras
      </button>
    </div>
    @if (scanning()) {
      <div class="scan">
        <input #scan class="bo-input" placeholder="Aponte o leitor e leia o código…" aria-label="Código lido" (keydown.enter)="onScan($event)" />
        <span class="hint">{{ scanHint() }}</span>
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .bar { display: flex; gap: 8px; align-items: center; }
    .search { position: relative; flex: 1; display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 11px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); color: var(--nx-text-dim); }
    .search:focus-within { border-color: rgba(255, 106, 26, 0.5); }
    .search input { flex: 1; min-width: 0; background: none; border: none; outline: none; color: var(--nx-text); font-family: var(--nx-font-ui); font-size: 12.5px; }
    .search input::placeholder { color: var(--nx-text-dim); }
    kbd { font-family: var(--nx-font-mono); font-size: 9.5px; color: var(--nx-text-dim); }
    .results { position: absolute; z-index: 5; top: calc(100% + 4px); left: 0; right: 0; margin: 0; padding: 4px; list-style: none; background: var(--nx-surface-0); border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-2); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45); }
    .results button { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 7px 9px; border: none; border-radius: 8px; background: none; color: var(--nx-text); cursor: pointer; text-align: left; }
    .results button:hover, .results button:focus { background: var(--nx-surface-1); outline: none; }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; }
    .variant { font-size: 11px; color: var(--nx-text-dim); }
    code { font-family: var(--nx-font-mono); font-size: 10.5px; }
    .bo-mini-btn.active { background: var(--nx-orange-tint); border-color: rgba(255, 106, 26, 0.45); }
    .scan { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
    .scan .bo-input { height: 34px; max-width: 320px; font-family: var(--nx-font-mono); }
    .hint { font-size: 11.5px; color: var(--nx-text-dim); }
  `,
})
export class SkuPickerComponent {
  readonly rows = input.required<StockRow[]>();
  readonly placeholder = input('Buscar produto, SKU ou código de barras para adicionar');
  readonly disabled = input(false);
  /** Mensagem da última leitura, vinda de quem usa ("+1 Óculos fumê", "Código não encontrado"). */
  readonly scanHint = input('Cada leitura soma +1 no SKU.');
  readonly picked = output<StockRow>();
  readonly scanned = output<string>();

  protected readonly q = signal('');
  protected readonly scanning = signal(false);
  protected readonly results = computed(() => searchRows(this.rows(), this.q()));
  private readonly searchEl = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly scanEl = viewChild<ElementRef<HTMLInputElement>>('scan');

  protected key(r: StockRow): string {
    return skuKey(r);
  }
  protected val(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected pick(r: StockRow): void {
    this.picked.emit(r);
    this.q.set('');
    this.searchEl()?.nativeElement.focus();
  }

  protected pickFirst(event: Event): void {
    event.preventDefault();
    const first = this.results()[0];
    if (first) {
      this.pick(first);
    }
  }

  protected toggleScan(): void {
    this.scanning.update((v) => !v);
    if (this.scanning()) {
      queueMicrotask(() => this.scanEl()?.nativeElement.focus());
    }
  }

  protected onScan(event: Event): void {
    event.preventDefault();
    const el = event.target as HTMLInputElement;
    const code = el.value.trim();
    el.value = '';
    if (code) {
      this.scanned.emit(code);
    }
  }

  protected onKey(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.searchEl()?.nativeElement.focus();
    }
  }
}
