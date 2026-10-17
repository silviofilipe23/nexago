import { ChangeDetectionStrategy, Component, input, linkedSignal, output } from '@angular/core';
import { formatNumber, parseNumberText, sameNumber } from '../data/squad-rules';

type NumValue = number | [number, number];

function sameValue(a: NumValue | null, b: NumValue | null): boolean {
  return a === null || b === null ? a === b : sameNumber(a, b);
}

/**
 * Campo numérico com prefixo/sufixo ("R$", "%", "dias"). Emite a cada tecla: NaN quando o
 * texto não é número, para a validação central acusar; `null` quando `nullable` e vazio.
 * O texto digitado só é reescrito quando o valor muda por fora (descartar, restaurar) —
 * digitar "10–" não vira "".
 */
@Component({
  selector: 'bo-num-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="box" [class.invalid]="invalid()" [class.sm]="size() === 'sm'" [class.off]="disabled()">
      @if (prefix()) {
        <span class="affix">{{ prefix() }}</span>
      }
      <input
        type="text"
        inputmode="decimal"
        autocomplete="off"
        [value]="text()"
        [disabled]="disabled()"
        [attr.aria-label]="label()"
        [attr.aria-invalid]="invalid()"
        (input)="onInput($event)"
      />
      @if (suffix()) {
        <span class="affix">{{ suffix() }}</span>
      }
    </label>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .box { display: flex; align-items: center; gap: 6px; height: 40px; padding: 0 11px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); cursor: text; transition: border-color 140ms var(--nx-ease-out); }
    .box:hover:not(.off) { border-color: var(--nx-line-strong); }
    .box:focus-within { border-color: rgba(255, 106, 26, 0.5); }
    .box.invalid { border-color: rgba(255, 59, 48, 0.7); background: rgba(255, 59, 48, 0.06); }
    .box.off { opacity: 0.6; cursor: default; }
    .box.sm { height: 30px; padding: 0 8px; }
    input { flex: 1; min-width: 0; width: 100%; padding: 0; border: none; outline: none; background: none; color: var(--nx-text); font-family: var(--nx-font-mono); font-size: 13px; font-weight: 500; }
    .sm input { text-align: center; font-size: 12px; font-weight: 700; }
    .affix { flex: none; font-family: var(--nx-font-mono); font-size: 11.5px; color: var(--nx-text-dim); }
  `,
})
export class NumFieldComponent {
  readonly value = input.required<NumValue | null>();
  readonly label = input.required<string>();
  readonly prefix = input('');
  readonly suffix = input('');
  readonly allowRange = input(false);
  /** Milhar com ponto ("1.000"): pontos de nível. */
  readonly grouping = input(false);
  readonly invalid = input(false);
  readonly disabled = input(false);
  readonly size = input<'md' | 'sm'>('md');
  /** Vazio vira `null` (critério opcional) em vez de NaN. */
  readonly nullable = input(false);

  readonly valueChange = output<NumValue | null>();

  protected readonly text = linkedSignal<NumValue | null, string>({
    source: this.value,
    computation: (v, prev) =>
      prev && sameValue(this.parse(prev.value), v) ? prev.value : v === null ? '' : formatNumber(v, this.grouping()),
  });

  private parse(raw: string): NumValue | null {
    return this.nullable() && raw.trim() === '' ? null : parseNumberText(raw, this.allowRange());
  }

  protected onInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.text.set(raw);
    this.valueChange.emit(this.parse(raw));
  }
}
