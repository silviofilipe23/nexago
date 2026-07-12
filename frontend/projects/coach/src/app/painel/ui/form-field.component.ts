import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let nextFormFieldId = 0;

/** Campo de texto de formulário do painel (protótipo TrFormField), com ControlValueAccessor. */
@Component({
  selector: 'co-form-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FormFieldComponent), multi: true },
  ],
  template: `
    <div class="field" [style.grid-column]="wide() ? '1 / -1' : 'auto'">
      <label [for]="fieldId">{{ label() }}</label>
      <input
        [id]="fieldId"
        [type]="type()"
        [value]="value()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        (input)="handleInput($event)"
        (blur)="onTouched()"
      />
    </div>
  `,
  styles: `
    label {
      display: block;
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 6px;
    }
    input {
      width: 100%;
      height: 38px;
      padding: 0 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text);
      box-sizing: border-box;
    }
    input:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }
    input::placeholder {
      color: var(--nx-text-dim);
    }
  `,
})
export class FormFieldComponent implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly type = input<'text' | 'tel' | 'number'>('text');
  readonly placeholder = input('');
  readonly wide = input(false);

  protected readonly fieldId = `co-form-field-${nextFormFieldId++}`;
  protected readonly value = signal('');
  protected readonly disabled = signal(false);

  private onChange: (value: string) => void = () => {};
  protected onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected handleInput(event: Event): void {
    const next = (event.target as HTMLInputElement).value;
    this.value.set(next);
    this.onChange(next);
  }
}
