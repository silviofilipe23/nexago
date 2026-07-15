import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Seletor de opção única em chips — estado fixo (mockado), reproduz o protótipo. */
@Component({
  selector: 'og-select-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'og-select-chips' },
  template: `
    @for (o of options(); track o) {
      <span class="og-select-chip" [class.active]="o === active()">{{ o }}</span>
    }
  `,
})
export class OgSelectChipsComponent {
  readonly options = input.required<string[]>();
  readonly active = input<string>('');
}
