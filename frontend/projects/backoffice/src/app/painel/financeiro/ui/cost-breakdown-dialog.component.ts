import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { IconComponent } from '../../ui/icon.component';
import { FieldComponent } from '../../ui/field.component';
import type { CostCategory, PlatformCostItem } from '../data/finance-overview.repository';

export interface NewCostInput {
  name: string;
  amountCents: number;
  notes: string;
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Lista + cadastro de custos de uma categoria (fixo ou variável) — mesmo padrão de `<dialog>` do confirm-dialog. */
@Component({
  selector: 'bo-cost-breakdown-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, FieldComponent],
  template: `
    <dialog
      #dialog
      (cancel)="onEscape($event)"
      (keydown.escape)="dismiss()"
      (click)="onBackdropClick($event)"
    >
      <div class="inner">
        <h2>{{ title() }}</h2>
        <p class="desc">{{ totalCents() != null ? ('Total mensal: ' + money(totalCents()!)) : '' }}</p>

        <div class="cost-list">
          @for (item of items(); track item.id) {
            <div class="cost-row">
              <div class="cost-name">
                <div class="name">{{ item.name }}</div>
                @if (item.notes) {
                  <div class="notes">{{ item.notes }}</div>
                }
              </div>
              <div class="cost-amount">{{ money(item.amountCents) }}</div>
              <button
                type="button"
                class="bo-ghost-btn danger"
                [disabled]="removingId() === item.id"
                (click)="remove.emit(item.id)"
                aria-label="Remover custo"
              >
                <bo-icon name="trash" [size]="14" />
              </button>
            </div>
          } @empty {
            <p class="status">Nenhum custo cadastrado ainda.</p>
          }
        </div>

        <form class="add-form" (submit)="onSubmit($event)">
          <div class="add-grid">
            <bo-field label="Nome do custo">
              <input
                class="bo-input"
                type="text"
                [value]="name()"
                (input)="name.set(inputValue($event))"
                placeholder="Ex.: Aluguel do escritório"
              />
            </bo-field>
            <bo-field label="Valor mensal (R$)">
              <input
                class="bo-input"
                type="number"
                min="0.01"
                step="0.01"
                [value]="amount()"
                (input)="amount.set(inputValue($event))"
                placeholder="0,00"
              />
            </bo-field>
          </div>
          <bo-field label="Observação (opcional)">
            <input
              class="bo-input"
              type="text"
              [value]="notes()"
              (input)="notes.set(inputValue($event))"
              placeholder="Contexto rápido — fornecedor, contrato…"
            />
          </bo-field>

          @if (error()) {
            <div class="bo-alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ error() }}</span>
            </div>
          }

          <button type="submit" class="bo-mini-btn bo-mini-btn-primary add-btn" [disabled]="saving()">
            @if (saving()) {
              <span class="bo-spinner small" aria-hidden="true"></span>
            }
            Adicionar custo {{ category() === 'fixed' ? 'fixo' : 'variável' }}
          </button>
        </form>
      </div>

      <div class="actions">
        <button type="button" class="bo-mini-btn" (click)="dismiss()">Fechar</button>
      </div>
    </dialog>
  `,
  styles: `
    dialog {
      width: min(520px, calc(100vw - 32px));
      max-height: min(680px, calc(100vh - 48px));
      padding: 0;
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-4);
      background: var(--nx-surface-0);
      color: var(--nx-text);
    }

    dialog::backdrop {
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(2px);
    }

    dialog[open] {
      display: flex;
      flex-direction: column;
    }

    .inner {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    h2 {
      margin: 0;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      letter-spacing: -0.01em;
    }

    .desc {
      margin: -8px 0 0;
      font-size: 12.5px;
      font-family: var(--nx-font-mono);
      color: var(--nx-text-dim);
    }

    .cost-list {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      overflow: hidden;
    }

    .cost-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--nx-line);
    }

    .cost-row:last-child {
      border-bottom: none;
    }

    .cost-name {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .cost-name .name {
      font-size: 13px;
      font-weight: 600;
      color: var(--nx-text);
    }

    .cost-name .notes {
      font-size: 11px;
      color: var(--nx-text-dim);
    }

    .cost-amount {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
      white-space: nowrap;
    }

    .status {
      margin: 0;
      padding: 16px 12px;
      font-size: 12.5px;
      color: var(--nx-text-dim);
      text-align: center;
    }

    .add-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-top: 4px;
      border-top: 1px solid var(--nx-line);
    }

    .add-form :first-child {
      margin-top: 12px;
    }

    .add-grid {
      display: grid;
      grid-template-columns: 1.6fr 1fr;
      gap: 12px;
    }

    .add-btn {
      align-self: flex-start;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 4px 22px 22px;
    }

    .bo-spinner.small {
      width: 13px;
      height: 13px;
      border-width: 2px;
      border-color: rgba(244, 244, 245, 0.3);
      border-top-color: currentColor;
    }
  `,
})
export class CostBreakdownDialogComponent {
  readonly open = input(false);
  readonly title = input.required<string>();
  readonly category = input.required<CostCategory>();
  readonly items = input<readonly PlatformCostItem[]>([]);
  readonly totalCents = input<number | null>(null);
  readonly saving = input(false);
  readonly removingId = input<string | null>(null);
  readonly error = input<string | null>(null);

  readonly dismissed = output<void>();
  readonly add = output<NewCostInput>();
  readonly remove = output<string>();

  protected readonly name = signal('');
  protected readonly amount = signal('');
  protected readonly notes = signal('');

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.open() && !el.open) {
        el.showModal();
      } else if (!this.open() && el.open) {
        el.close();
      }
    });
  }

  protected money(cents: number): string {
    return BRL.format(cents / 100);
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    const trimmedName = this.name().trim();
    const parsedAmount = Number(this.amount().replace(',', '.'));
    if (!trimmedName || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return;
    }
    this.add.emit({
      name: trimmedName,
      amountCents: Math.round(parsedAmount * 100),
      notes: this.notes().trim(),
    });
    // Limpa otimista: se a chamada falhar, o erro aparece e o valor some — é
    // aceitável aqui porque os campos são poucos e rápidos de redigitar.
    this.name.set('');
    this.amount.set('');
    this.notes.set('');
  }

  protected dismiss(): void {
    this.dismissed.emit();
  }

  protected onEscape(event: Event): void {
    event.preventDefault();
    this.dismiss();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) {
      this.dismiss();
    }
  }
}
