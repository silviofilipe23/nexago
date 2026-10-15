import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** O clique traz `shift` porque a tabela usa Shift+clique para marcar um intervalo. */
export interface CheckboxToggle {
  checked: boolean;
  shift: boolean;
}

/**
 * Checkbox do painel.
 *
 * Usa um `<input type="checkbox">` nativo escondido visualmente, em vez de `role="checkbox"`:
 * sai de graça o Espaço do teclado, o foco na ordem do Tab e, no estado parcial, a propriedade
 * `indeterminate` — que é o que o leitor de tela anuncia como "parcialmente marcado".
 */
@Component({
  selector: 'bo-checkbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input
      type="checkbox"
      class="native"
      [checked]="checked()"
      [indeterminate]="indeterminate()"
      [disabled]="disabled()"
      [title]="disabled() ? reason() : ''"
      [attr.aria-label]="ariaLabel()"
      (click)="emit($event)"
    />
    <span class="box" [class.on]="checked() && !indeterminate()" [class.partial]="indeterminate()">
      @if (indeterminate()) {
        <svg viewBox="0 0 17 17" aria-hidden="true">
          <path d="M4.5 8.5h8" stroke-width="2" />
        </svg>
      } @else if (checked()) {
        <svg viewBox="0 0 17 17" aria-hidden="true">
          <path d="M4 8.7 6.9 11.6 13 5.2" stroke-width="3.2" />
        </svg>
      }
    </span>
  `,
  styles: `
    :host {
      position: relative;
      display: inline-grid;
      place-items: center;
      flex: none;
    }

    /* Cobre o host inteiro: quem define a área de clique é quem usa (na tabela, a célula). */
    .native {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      margin: 0;
      opacity: 0;
      cursor: pointer;
    }

    .native:disabled {
      cursor: not-allowed;
    }

    .box {
      width: 17px;
      height: 17px;
      border-radius: 5px;
      border: 1.5px solid var(--nx-line-strong);
      background: transparent;
      display: grid;
      place-items: center;
      pointer-events: none;
      transition:
        background 140ms var(--nx-ease-out),
        border-color 140ms var(--nx-ease-out);
    }

    .native:hover:not(:disabled) + .box {
      border-color: var(--nx-text-mute);
    }

    .box.on,
    .box.partial {
      background: var(--nx-orange-500);
      border-color: var(--nx-orange-500);
    }

    .box svg {
      width: 17px;
      height: 17px;
      display: block;
      fill: none;
      stroke: #0a0a0a;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .native:disabled + .box {
      opacity: 0.35;
    }

    .native:focus-visible + .box {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 2px;
    }
  `,
})
export class CheckboxComponent {
  readonly checked = input.required<boolean>();
  readonly indeterminate = input(false);
  readonly disabled = input(false);
  /** Mostrado como tooltip quando desabilitado: o usuário precisa saber por quê. */
  readonly reason = input('');
  readonly ariaLabel = input.required<string>();

  readonly checkedChange = output<CheckboxToggle>();

  protected emit(event: MouseEvent): void {
    const input = event.target as HTMLInputElement;
    this.checkedChange.emit({ checked: input.checked, shift: event.shiftKey });
  }
}
