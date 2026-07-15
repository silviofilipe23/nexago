import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Campo estático — reproduz o preenchimento fictício do protótipo (sem edição real). */
@Component({
  selector: 'og-display-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'og-input' },
  template: `
    <span>{{ value() }}</span>
    @if (suffix()) {
      <span class="suffix">{{ suffix() }}</span>
    }
  `,
})
export class OgDisplayInputComponent {
  readonly value = input.required<string>();
  readonly suffix = input<string>('');
}
