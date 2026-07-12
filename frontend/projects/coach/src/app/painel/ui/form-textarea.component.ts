import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** Textarea de formulário do painel (protótipo TrFormTextarea), com ControlValueAccessor. */
@Component({
  selector: 'co-form-textarea',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FormTextareaComponent), multi: true },
  ],
  template: `
    <div class="field">
      <label>{{ label() }}</label>
      <textarea
        [rows]="rows()"
        [value]="value()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        (input)="handleInput($event)"
        (blur)="onTouched()"
      ></textarea>
    </div>
  `,
  styles: `
    .field {
      grid-column: 1 / -1;
    }
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
    textarea {
      width: 100%;
      padding: 10px 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--nx-text);
      box-sizing: border-box;
      resize: vertical;
    }
    textarea:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }
    textarea::placeholder {
      color: var(--nx-text-dim);
    }
  `,
})
export class FormTextareaComponent implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly placeholder = input('');
  readonly rows = input(3);

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
    const next = (event.target as HTMLTextAreaElement).value;
    this.value.set(next);
    this.onChange(next);
  }
}
