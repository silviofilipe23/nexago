import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Seletor de múltiplas opções em chips — estado fixo (mockado), reproduz o protótipo. */
@Component({
  selector: 'og-chips-multi',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'og-select-chips' },
  template: `
    @for (o of options(); track o) {
      <span class="og-select-chip" [class.active]="selected().includes(o)">{{ o }}</span>
    }
  `,
})
export class OgChipsMultiComponent {
  readonly options = input.required<string[]>();
  readonly selected = input<string[]>([]);
}
