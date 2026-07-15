import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { OgIconComponent } from './icon.component';

/** Botão tracejado "adicionar" — categorias, etapas, colocações extra de premiação etc. */
@Component({
  selector: 'og-add-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgIconComponent],
  template: `
    <button type="button" class="og-add-tile">
      <span class="og-add-tile-icon"><og-icon name="plus" [size]="16" /></span>
      <span>
        <div class="og-add-tile-label">{{ label() }}</div>
        @if (sub()) {
          <div class="og-add-tile-sub">{{ sub() }}</div>
        }
      </span>
    </button>
  `,
})
export class OgAddTileComponent {
  readonly label = input.required<string>();
  readonly sub = input<string>('');
}
