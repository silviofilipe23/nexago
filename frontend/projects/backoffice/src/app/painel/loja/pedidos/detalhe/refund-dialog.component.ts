import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { ConfirmDialogComponent } from '../../../ui/confirm-dialog.component';
import { FieldComponent } from '../../../ui/field.component';
import { paidUnitCents, refundable, refundedQty, type Order } from '../data/order';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export interface RefundRequest {
  mode: 'total' | 'itens';
  items: { index: number; qty: number }[];
  destination: 'original' | 'saldo';
  reason: string;
}

/** Reembolso total ou por item, destino e motivo. O valor por item rateia os descontos (frete fora). */
@Component({
  selector: 'bo-refund-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmDialogComponent, FieldComponent],
  template: `
    <bo-confirm-dialog [open]="open()" [title]="'Reembolsar #' + order().number" size="md" [busy]="busy()" [error]="error()"
      [confirmLabel]="'Registrar ' + money(amount())" [confirmDisabled]="amount() <= 0 || !reason().trim()"
      description="O reembolso fica registrado como pendente: o estorno no Pix/cartão ou o crédito na carteira sai pelo Financeiro."
      (confirmed)="submit()" (dismissed)="dismissed.emit()">
      <div class="radios" role="radiogroup" aria-label="Tipo de reembolso">
        <label><input type="radio" name="rf-mode" [checked]="mode() === 'total'" (change)="mode.set('total')" /> Total ({{ money(left()) }})</label>
        <label><input type="radio" name="rf-mode" [checked]="mode() === 'itens'" (change)="mode.set('itens')" /> Parcial, por item</label>
      </div>
      @if (mode() === 'itens') {
        <ul class="items">
          @for (i of order().items; track $index; let idx = $index) {
            <li>
              <span class="name">{{ i.productName }} <small>{{ i.variantLabel }}</small></span>
              <span class="dim">{{ money(unit(i.unitCents)) }} / un.</span>
              <input type="number" class="bo-input qty" min="0" [max]="remaining(idx)" [value]="qty()[idx] || 0"
                [attr.aria-label]="'Unidades de ' + i.productName" [disabled]="remaining(idx) === 0" (input)="setQty(idx, $event)" />
            </li>
          }
        </ul>
      }
      <div class="radios" role="radiogroup" aria-label="Destino">
        <label><input type="radio" name="rf-dest" [checked]="destination() === 'original'" (change)="destination.set('original')" /> Meio original</label>
        <label><input type="radio" name="rf-dest" [checked]="destination() === 'saldo'" (change)="destination.set('saldo')" /> Saldo na carteira</label>
      </div>
      <bo-field label="Motivo"><textarea class="bo-input area" [value]="reason()" (input)="reason.set(val($event))"></textarea></bo-field>
    </bo-confirm-dialog>
  `,
  styles: `
    .radios { display: flex; gap: 18px; flex-wrap: wrap; font-size: 13px; margin-bottom: 12px; }
    .radios label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
    .items { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .items li { display: grid; grid-template-columns: minmax(0, 1fr) auto 72px; gap: 10px; align-items: center; font-size: 12.5px; }
    .name small { color: var(--nx-text-dim); }
    .dim { color: var(--nx-text-dim); font-size: 12px; }
    .qty { height: 32px; padding: 0 8px; text-align: right; }
    .area { height: 72px; padding: 9px 12px; resize: vertical; }
  `,
})
export class RefundDialogComponent {
  readonly order = input.required<Order>();
  readonly open = input(false);
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly submitted = output<RefundRequest>();
  readonly dismissed = output<void>();

  protected readonly mode = signal<'total' | 'itens'>('total');
  protected readonly destination = signal<'original' | 'saldo'>('original');
  protected readonly reason = signal('');
  protected readonly qty = signal<Record<number, number>>({});

  protected readonly left = computed(() => refundable(this.order()));
  protected readonly amount = computed(() => {
    if (this.mode() === 'total') return this.left();
    const o = this.order();
    const sum = Object.entries(this.qty()).reduce((n, [idx, q]) => n + paidUnitCents(o, o.items[Number(idx)]?.unitCents ?? 0) * q, 0);
    return Math.min(sum, this.left());
  });

  constructor() {
    // Abrir de novo começa limpo.
    effect(() => {
      if (this.open()) {
        this.mode.set('total');
        this.destination.set('original');
        this.reason.set('');
        this.qty.set({});
      }
    });
  }

  protected remaining(idx: number): number {
    const o = this.order();
    return Math.max(0, (o.items[idx]?.qty ?? 0) - refundedQty(o, idx));
  }
  protected unit(c: number): number {
    return paidUnitCents(this.order(), c);
  }
  protected setQty(idx: number, e: Event): void {
    const n = Math.max(0, Math.min(this.remaining(idx), Math.floor(Number((e.target as HTMLInputElement).value) || 0)));
    this.qty.update((q) => ({ ...q, [idx]: n }));
  }
  protected submit(): void {
    const items = Object.entries(this.qty()).map(([index, qty]) => ({ index: Number(index), qty })).filter((l) => l.qty > 0);
    this.submitted.emit({ mode: this.mode(), items, destination: this.destination(), reason: this.reason().trim() });
  }
  protected money(c: number): string {
    return BRL.format(c / 100);
  }
  protected val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
