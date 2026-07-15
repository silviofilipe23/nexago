import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Linha título + descrição + switch — estado fixo (mockado), reproduz o protótipo. */
@Component({
  selector: 'og-toggle-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'og-toggle-row' },
  template: `
    <div class="og-toggle-row-text">
      <div class="og-toggle-row-title">{{ title() }}</div>
      @if (desc()) {
        <div class="og-toggle-row-desc">{{ desc() }}</div>
      }
    </div>
    <span class="og-toggle" [class.on]="on()"></span>
  `,
})
export class OgToggleRowComponent {
  readonly title = input.required<string>();
  readonly desc = input<string>('');
  readonly on = input(false);
}
