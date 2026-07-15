import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Card base do painel — cabeçalho opcional (kicker/título/ação) + conteúdo livre. */
@Component({
  selector: 'og-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'og-card',
    '[class.og-card-pad-sm]': 'pad() === "sm"',
    '[class.og-card-pad-0]': 'pad() === "0"',
    '[style.flex]': 'flex()',
  },
  template: `
    @if (title() || kicker()) {
      <div class="og-card-head">
        <div class="og-card-head-text">
          @if (kicker()) {
            <div class="og-card-kicker">{{ kicker() }}</div>
          }
          @if (title()) {
            <div class="og-card-title">{{ title() }}</div>
          }
        </div>
        <div class="og-card-head-spacer"></div>
        <ng-content select="[card-action]" />
      </div>
    }
    <ng-content />
  `,
})
export class OgCardComponent {
  readonly title = input<string>('');
  readonly kicker = input<string>('');
  readonly pad = input<'lg' | 'sm' | '0'>('lg');
  readonly flex = input<string>('');
}
