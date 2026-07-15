import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Linha de opção única (rádio) — estado fixo (mockado), reproduz o protótipo. */
@Component({
  selector: 'og-radio-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'og-radio-row',
    '[class.selected]': 'selected()',
  },
  template: `
    <span class="og-radio-dot">
      @if (selected()) {
        <span></span>
      }
    </span>
    <div class="og-radio-body">
      <div class="og-radio-title">{{ title() }}</div>
      @if (desc()) {
        <div class="og-radio-desc">{{ desc() }}</div>
      }
    </div>
    @if (right()) {
      <span class="og-radio-right">{{ right() }}</span>
    }
  `,
})
export class OgRadioRowComponent {
  readonly selected = input(false);
  readonly title = input.required<string>();
  readonly desc = input<string>('');
  readonly right = input<string>('');
}
