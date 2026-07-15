import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Cabeçalho de página do painel — título/subtítulo à esquerda, ações projetadas à direita. */
@Component({
  selector: 'og-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'og-page-header' },
  template: `
    <div class="og-card-head-text">
      <h1 class="og-page-header-title">{{ title() }}</h1>
      @if (subtitle()) {
        <div class="og-page-header-subtitle">{{ subtitle() }}</div>
      }
    </div>
    <div class="og-page-header-spacer"></div>
    <div class="og-page-header-actions">
      <ng-content />
    </div>
  `,
})
export class OgPageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
}
