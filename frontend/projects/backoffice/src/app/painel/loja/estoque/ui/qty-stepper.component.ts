import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** − valor + da 06a/06b. Inteiro; `min`/`max` travam os botões e o campo marca vermelho fora deles. */
@Component({
  selector: 'bo-qty-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="stepper" [class.invalid]="invalid()">
      <button type="button" aria-label="Diminuir" [disabled]="disabled() || value() <= min()" (click)="emit(value() - 1)">−</button>
      <input type="number" [attr.aria-label]="ariaLabel()" [value]="value()" [disabled]="disabled()"
        (change)="emit(toInt($event))" (keydown.enter)="emit(toInt($event))" />
      <button type="button" aria-label="Aumentar" [disabled]="disabled() || (max() !== null && value() >= max()!)" (click)="emit(value() + 1)">+</button>
    </span>
    @if (invalid() && max() !== null) { <span class="max">máx. {{ max() }}</span> }
  `,
  styles: `
    :host { display: inline-flex; flex-direction: column; align-items: center; gap: 2px; }
    .stepper { display: inline-flex; align-items: center; height: 30px; border: 1px solid var(--nx-line-strong); border-radius: 8px; background: var(--nx-surface-1); overflow: hidden; }
    .stepper.invalid { border-color: var(--nx-live); }
    button { width: 24px; height: 100%; background: none; border: none; color: var(--nx-text-mute); cursor: pointer; font-size: 13px; }
    button:disabled { opacity: 0.35; cursor: default; }
    input { width: 40px; height: 100%; text-align: center; background: none; border: none; outline: none; color: var(--nx-text); font-family: var(--nx-font-display); font-weight: 700; font-size: 12.5px; -moz-appearance: textfield; }
    input::-webkit-inner-spin-button, input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    .max { font-size: 10px; color: var(--nx-live); }
  `,
})
export class QtyStepperComponent {
  readonly value = input.required<number>();
  readonly min = input(1);
  readonly max = input<number | null>(null);
  readonly disabled = input(false);
  readonly ariaLabel = input('Quantidade');
  readonly valueChange = output<number>();

  protected invalid(): boolean {
    const max = this.max();
    return this.value() < this.min() || (max !== null && this.value() > max);
  }

  protected toInt(event: Event): number {
    const n = Math.trunc(Number((event.target as HTMLInputElement).value));
    return Number.isFinite(n) ? n : this.min();
  }

  protected emit(n: number): void {
    // Não trava no máximo aqui: o vermelho + "máx. N" é o aviso que a spec pede.
    this.valueChange.emit(Math.max(this.min(), n));
  }
}
