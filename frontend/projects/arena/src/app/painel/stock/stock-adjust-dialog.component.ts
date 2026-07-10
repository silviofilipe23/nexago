import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { ModalComponent } from '../ui/modal.component';

export type StockAdjustType = 'entrada' | 'saida';

export interface StockAdjustResult {
  type: StockAdjustType;
  quantity: number;
  reason: string;
}

/** Modal "Ajustar estoque" (protótipo ArStockAdjustDialog): entrada/saída, quantidade e motivo para um produto específico. */
@Component({
  selector: 'ar-stock-adjust-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent],
  template: `
    <ar-modal (close)="cancel.emit()">
      <h2 class="title">Ajustar estoque</h2>
      <div class="subtitle">{{ productName() }} · {{ currentStock() }} {{ unit() }} em estoque</div>

      <div class="type-toggle">
        <button type="button" class="type-btn entrada" [class.active]="type() === 'entrada'" (click)="type.set('entrada')">Entrada</button>
        <button type="button" class="type-btn saida" [class.active]="type() === 'saida'" (click)="type.set('saida')">Saída</button>
      </div>

      <div class="field-label">Quantidade</div>
      <input
        type="number"
        min="0"
        class="input-box qty-input"
        [value]="quantity()"
        (input)="quantity.set($any($event.target).valueAsNumber || 0)"
      />

      <div class="field-label">Motivo</div>
      <input
        type="text"
        class="input-box reason-input"
        placeholder="Ex.: Compra · Fornecedor"
        [value]="reason()"
        (input)="reason.set($any($event.target).value)"
      />

      <div class="actions">
        <button type="button" class="ar-ghost-btn" (click)="cancel.emit()">Cancelar</button>
        <button type="button" class="ar-mini-btn ar-mini-btn-primary confirm-btn" [disabled]="!canConfirm()" (click)="confirm()">
          Confirmar ajuste
        </button>
      </div>
    </ar-modal>
  `,
  styles: `
    .title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 20px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0;
    }

    .subtitle {
      font-size: 13px;
      color: var(--nx-text-dim);
      margin-top: 4px;
      margin-bottom: 20px;
    }

    .type-toggle {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 18px;
    }

    .type-btn {
      height: 46px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      transition: all 140ms var(--nx-ease-out);
    }

    .type-btn:hover {
      background: var(--nx-surface-2);
    }

    .type-btn.entrada.active {
      background: rgba(43, 209, 126, 0.12);
      border-color: var(--nx-win);
      color: var(--nx-win);
    }

    .type-btn.saida.active {
      background: rgba(255, 59, 48, 0.1);
      border-color: var(--nx-live);
      color: var(--nx-live);
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .input-box {
      width: 100%;
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
      padding: 0 14px;
      box-sizing: border-box;
    }

    .input-box:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }

    .qty-input {
      margin-bottom: 18px;
    }

    .reason-input {
      margin-bottom: 22px;
    }

    .actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
    }

    .confirm-btn {
      height: 44px;
      padding: 0 20px;
    }
  `,
})
export class StockAdjustDialogComponent {
  readonly productName = input.required<string>();
  readonly currentStock = input.required<number>();
  readonly unit = input('un');

  readonly cancel = output<void>();
  readonly confirmed = output<StockAdjustResult>();

  protected readonly type = signal<StockAdjustType>('entrada');
  protected readonly quantity = signal(0);
  protected readonly reason = signal('');

  protected readonly canConfirm = computed(() => this.quantity() > 0 && this.reason().trim().length > 0);

  protected confirm(): void {
    if (!this.canConfirm()) {
      return;
    }
    this.confirmed.emit({ type: this.type(), quantity: this.quantity(), reason: this.reason() });
  }
}
