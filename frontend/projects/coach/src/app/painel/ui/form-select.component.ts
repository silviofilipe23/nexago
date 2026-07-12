import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** Seletor de opções em chips (protótipo TrFormSelect), com ControlValueAccessor. */
@Component({
  selector: 'co-form-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FormSelectComponent), multi: true },
  ],
  template: `
    <div class="field">
      <label>{{ label() }}</label>
      <div class="options">
        @for (o of options(); track o) {
          <button type="button" class="opt" [class.active]="o === value()" [disabled]="disabled()" (click)="choose(o)">{{ o }}</button>
        }
      </div>
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
    .options {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .opt {
      height: 30px;
      padding: 0 11px;
      border-radius: var(--nx-r-2);
      display: flex;
      align-items: center;
      font-family: var(--nx-font-ui);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      background: var(--nx-surface-1);
      color: var(--nx-text-mute);
      border: 1px solid var(--nx-line-strong);
    }
    .opt.active {
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
      border: none;
    }
  `,
})
export class FormSelectComponent implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly options = input.required<string[]>();

  protected readonly value = signal('');
  protected readonly disabled = signal(false);

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

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

  protected choose(o: string): void {
    if (this.disabled()) {
      return;
    }
    this.value.set(o);
    this.onChange(o);
    this.onTouched();
  }
}
