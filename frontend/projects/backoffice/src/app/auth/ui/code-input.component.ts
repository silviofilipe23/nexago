import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  viewChildren,
} from '@angular/core';

/** Input de código de 6 dígitos (protótipo BoCodeInput), com avanço automático e colagem. */
@Component({
  selector: 'bo-code-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row" role="group" aria-label="Código de verificação de 6 dígitos">
      @for (char of chars(); track $index) {
        <input
          #box
          [value]="char"
          [class.filled]="char !== ''"
          [class.error]="error()"
          inputmode="numeric"
          maxlength="2"
          [attr.aria-label]="'Dígito ' + ($index + 1)"
          (input)="handleInput($index, $event)"
          (keydown)="handleKeydown($index, $event)"
          (paste)="handlePaste($event)"
        />
      }
    </div>
  `,
  styles: `
    .row {
      display: flex;
      gap: 10px;
      justify-content: space-between;
    }

    input {
      width: 54px;
      height: 64px;
      text-align: center;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      font-family: var(--nx-font-mono);
      font-size: 26px;
      font-weight: 700;
      color: var(--nx-text);
      outline: none;
      caret-color: var(--nx-orange-500);
      transition: all 140ms var(--nx-ease-out);
      min-width: 0;
    }

    input.filled {
      background: var(--nx-surface-1);
      border-color: var(--nx-orange-500);
    }

    input.error {
      border-color: var(--nx-live);
    }

    input:focus {
      border-color: var(--nx-orange-500);
      box-shadow: 0 0 0 4px rgba(255, 106, 26, 0.1);
    }

    @media (max-width: 420px) {
      input {
        width: 44px;
        height: 54px;
        font-size: 22px;
      }
    }
  `,
})
export class CodeInputComponent {
  readonly length = input(6);
  readonly value = input('');
  readonly error = input(false);
  readonly valueChange = output<string>();

  private readonly boxes = viewChildren<ElementRef<HTMLInputElement>>('box');

  protected readonly chars = computed(() => {
    const v = this.value();
    return Array.from({ length: this.length() }, (_, i) => v[i] ?? '');
  });

  protected handleInput(index: number, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const clean = raw.replace(/\D/g, '').slice(-1);
    const next = this.chars().slice();
    next[index] = clean;
    this.valueChange.emit(next.join(''));
    if (clean && index < this.length() - 1) {
      this.boxes()[index + 1]?.nativeElement.focus();
    } else if (!clean) {
      // Mantém o box sincronizado quando o browser deixa caractere não numérico.
      (event.target as HTMLInputElement).value = '';
    }
  }

  protected handleKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.chars()[index] && index > 0) {
      this.boxes()[index - 1]?.nativeElement.focus();
    }
  }

  protected handlePaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    const digits = text.replace(/\D/g, '').slice(0, this.length());
    if (digits.length === 0) {
      return;
    }
    event.preventDefault();
    this.valueChange.emit(digits);
    const focusIndex = Math.min(digits.length, this.length() - 1);
    this.boxes()[focusIndex]?.nativeElement.focus();
  }
}
