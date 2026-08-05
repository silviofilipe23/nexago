import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Switch de permissão (protótipo BoToggle). Área de toque estendida além do trilho de 38×22. */
@Component({
  selector: 'bo-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      role="switch"
      class="hit"
      [attr.aria-checked]="checked()"
      [attr.aria-label]="ariaLabel()"
      [disabled]="disabled()"
      (click)="checkedChange.emit(!checked())"
    >
      <span class="track" [class.on]="checked()">
        <span class="knob"></span>
      </span>
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }

    .hit {
      padding: 11px 8px;
      margin: -11px -8px;
      background: transparent;
      border: none;
      cursor: pointer;
      display: grid;
      place-items: center;
      border-radius: var(--nx-r-2);
    }

    .hit:disabled {
      cursor: default;
      opacity: 0.5;
    }

    .track {
      width: 38px;
      height: 22px;
      border-radius: var(--nx-r-pill);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      display: block;
      position: relative;
      transition: background 160ms var(--nx-ease-out), border-color 160ms var(--nx-ease-out);
    }

    .track.on {
      background: var(--nx-orange-500);
      border-color: var(--nx-orange-500);
    }

    .knob {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: rgba(244, 244, 245, 0.55);
      transition: transform 160ms var(--nx-ease-out), background 160ms var(--nx-ease-out);
    }

    .track.on .knob {
      background: #fff;
      transform: translateX(16px);
    }
  `,
})
export class ToggleComponent {
  readonly checked = input.required<boolean>();
  readonly disabled = input(false);
  readonly ariaLabel = input.required<string>();

  readonly checkedChange = output<boolean>();
}
