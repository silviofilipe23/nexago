import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Campo de formulário do painel: rótulo visível + controle projetado + texto de apoio.
 * O <label> envolve o controle, então a associação rótulo/campo não depende de id.
 */
@Component({
  selector: 'bo-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="field">
      <span class="label">{{ label() }}</span>
      <ng-content />
      @if (hint()) {
        <span class="hint">{{ hint() }}</span>
      }
    </label>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }

    .label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .hint {
      font-size: 11px;
      line-height: 1.2;
      color: var(--nx-text-dim);
    }
  `,
})
export class FieldComponent {
  readonly label = input.required<string>();
  readonly hint = input('');
}
