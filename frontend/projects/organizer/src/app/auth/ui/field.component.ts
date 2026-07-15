import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let nextFieldId = 0;

/**
 * Campo de texto do fluxo de auth (protótipo CoField/BoField). Integra com
 * Reactive Forms via ControlValueAccessor; senha ganha o toggle mostrar/ocultar.
 */
@Component({
  selector: 'og-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FieldComponent), multi: true },
  ],
  template: `
    <div class="field">
      <label
        [for]="fieldId"
        [class.focused]="focused()"
      >{{ label() }}</label>

      <div
        class="box"
        [class.focused]="focused()"
        [class.error]="error() != null"
        [class.disabled]="disabled()"
      >
        <input
          [id]="fieldId"
          [type]="inputType()"
          [value]="value()"
          [placeholder]="placeholder()"
          [attr.autocomplete]="autocomplete() || null"
          [attr.aria-invalid]="error() != null"
          [attr.aria-describedby]="error() != null ? fieldId + '-error' : null"
          [disabled]="disabled()"
          (input)="handleInput($event)"
          (focus)="focused.set(true)"
          (blur)="handleBlur()"
        />
        @if (type() === 'password') {
          <button
            type="button"
            class="eye"
            [attr.aria-label]="shown() ? 'Ocultar senha' : 'Mostrar senha'"
            (click)="shown.set(!shown())"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
              <circle cx="12" cy="12" r="3" />
              @if (shown()) {
                <line x1="3" y1="3" x2="21" y2="21" />
              }
            </svg>
          </button>
        }
      </div>

      @if (error(); as err) {
        <div class="error-line" [id]="fieldId + '-error'" role="alert">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          {{ err }}
        </div>
      } @else if (hint()) {
        <div class="hint-line">{{ hint() }}</div>
      }
    </div>
  `,
  styles: `
    .field {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    label {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: var(--nx-text-mute);
      transition: color 140ms var(--nx-ease-out);
    }

    label.focused {
      color: var(--nx-orange-500);
    }

    .box {
      height: 50px;
      padding: 0 14px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all 160ms var(--nx-ease-out);
      cursor: text;
    }

    .box.focused {
      background: var(--nx-surface-1);
      border-color: var(--nx-orange-500);
      box-shadow: 0 0 0 4px rgba(255, 106, 26, 0.1);
    }

    .box.error {
      border-color: var(--nx-live);
      box-shadow: none;
    }

    .box.disabled {
      opacity: 0.6;
      cursor: default;
    }

    input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      font-family: var(--nx-font-ui);
      font-size: 15px;
      font-weight: 500;
      color: var(--nx-text);
      letter-spacing: -0.005em;
      caret-color: var(--nx-orange-500);
      min-width: 0;
    }

    .eye {
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--nx-text-mute);
      padding: 6px;
      display: grid;
      place-items: center;
      border-radius: 8px;
    }

    .eye:hover {
      color: var(--nx-text);
    }

    .error-line {
      font-size: 12px;
      color: var(--nx-live);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .error-line svg {
      flex: none;
    }

    .hint-line {
      font-size: 12px;
      color: var(--nx-text-dim);
    }
  `,
})
export class FieldComponent implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly type = input<'text' | 'email' | 'password' | 'tel'>('text');
  readonly placeholder = input('');
  readonly autocomplete = input('');
  readonly hint = input('');
  readonly error = input<string | null>(null);

  protected readonly fieldId = `og-field-${nextFieldId++}`;
  protected readonly value = signal('');
  protected readonly focused = signal(false);
  protected readonly shown = signal(false);
  protected readonly disabled = signal(false);

  protected readonly inputType = computed(() =>
    this.type() === 'password' && this.shown() ? 'text' : this.type(),
  );

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

  protected handleInput(event: Event): void {
    const next = (event.target as HTMLInputElement).value;
    this.value.set(next);
    this.onChange(next);
  }

  protected handleBlur(): void {
    this.focused.set(false);
    this.onTouched();
  }
}
