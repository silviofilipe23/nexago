import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Switch on/off acessível (protótipo ArToggle): botão role="switch", teclado e foco nativos. */
@Component({
  selector: 'ar-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      role="switch"
      [attr.aria-checked]="checked()"
      [attr.aria-label]="label() || null"
      class="toggle"
      [class.on]="checked()"
      [disabled]="disabled()"
      (click)="changed.emit(!checked())"
    >
      <span class="knob"></span>
    </button>
  `,
  styles: `
    .toggle {
      width: 44px;
      height: 25px;
      flex: none;
      border-radius: var(--nx-r-pill);
      background: var(--nx-surface-2);
      border: 1px solid var(--nx-line-strong);
      cursor: pointer;
      padding: 2px;
      display: flex;
      align-items: center;
      transition: background 160ms var(--nx-ease-out), border-color 160ms var(--nx-ease-out);
    }

    .toggle.on {
      background: var(--nx-orange-500);
      border-color: var(--nx-orange-500);
    }

    .toggle:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .knob {
      width: 19px;
      height: 19px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      transition: transform 160ms var(--nx-ease-out);
    }

    .toggle.on .knob {
      transform: translateX(19px);
    }
  `,
})
export class ToggleComponent {
  readonly checked = input(false);
  readonly disabled = input(false);
  readonly label = input('');
  readonly changed = output<boolean>();
}
