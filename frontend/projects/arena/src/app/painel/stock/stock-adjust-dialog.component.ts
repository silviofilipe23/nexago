import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { ModalComponent } from '../ui/modal.component';

export type StockAdjustMovementType = 'purchase' | 'adjustment' | 'loss';

export interface StockAdjustResult {
  type: StockAdjustMovementType;
  /** Compra/perda: sempre positivo (a direção vem do tipo). Ajuste: já com o sinal escolhido. */
  quantity: number;
  note: string;
}

/** Modal "Ajustar estoque" (protótipo ArStockAdjustDialog): compra/ajuste/perda, quantidade e motivo
 *  para um produto específico — espelha `ArenaStockMovementType` (sem `sale`, que só nasce de uma venda). */
@Component({
  selector: 'ar-stock-adjust-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent],
  template: `
    <ar-modal (close)="cancel.emit()">
      <h2 class="title">Ajustar estoque</h2>
      <div class="subtitle">{{ productName() }} · {{ currentStock() }} un em estoque</div>

      <div class="type-toggle">
        <button type="button" class="type-btn purchase" [class.active]="type() === 'purchase'" (click)="type.set('purchase')">Compra</button>
        <button type="button" class="type-btn adjustment" [class.active]="type() === 'adjustment'" (click)="type.set('adjustment')">Ajuste</button>
        <button type="button" class="type-btn loss" [class.active]="type() === 'loss'" (click)="type.set('loss')">Perda</button>
      </div>

      @if (type() === 'adjustment') {
        <div class="sign-toggle">
          <button type="button" class="sign-btn" [class.active]="sign() === 1" (click)="sign.set(1)">+ Adicionar</button>
          <button type="button" class="sign-btn" [class.active]="sign() === -1" (click)="sign.set(-1)">− Remover</button>
        </div>
      }

      <div class="field-label">Quantidade</div>
      <input
        type="number"
        min="0"
        class="input-box qty-input"
        [value]="magnitude()"
        (input)="magnitude.set(Math.abs($any($event.target).valueAsNumber || 0))"
      />

      <div class="field-label">Motivo</div>
      <input
        type="text"
        class="input-box reason-input"
        placeholder="Ex.: Compra · Fornecedor"
        [value]="note()"
        (input)="note.set($any($event.target).value)"
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
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px;
      margin-bottom: 14px;
    }

    .sign-toggle {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 18px;
    }

    .type-btn,
    .sign-btn {
      height: 46px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      cursor: pointer;
      transition: all 140ms var(--nx-ease-out);
    }

    .type-btn:hover,
    .sign-btn:hover {
      background: var(--nx-surface-2);
    }

    .type-btn.purchase.active,
    .sign-btn.active {
      background: rgba(43, 209, 126, 0.12);
      border-color: var(--nx-win);
      color: var(--nx-win);
    }

    .type-btn.adjustment.active {
      background: rgba(255, 149, 0, 0.12);
      border-color: var(--nx-orange-500);
      color: var(--nx-orange-500);
    }

    .type-btn.loss.active {
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

  readonly cancel = output<void>();
  readonly confirmed = output<StockAdjustResult>();

  protected readonly Math = Math;
  protected readonly type = signal<StockAdjustMovementType>('purchase');
  protected readonly sign = signal<1 | -1>(1);
  protected readonly magnitude = signal(0);
  protected readonly note = signal('');

  protected readonly canConfirm = computed(() => this.magnitude() > 0 && this.note().trim().length > 0);

  protected confirm(): void {
    if (!this.canConfirm()) {
      return;
    }
    const quantity = this.type() === 'adjustment' ? this.magnitude() * this.sign() : this.magnitude();
    this.confirmed.emit({ type: this.type(), quantity, note: this.note().trim() });
  }
}
