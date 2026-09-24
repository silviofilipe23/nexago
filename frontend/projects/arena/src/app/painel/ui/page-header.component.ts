import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Cabeçalho de página do painel (protótipo BoPageHeader): título + subtítulo + ações projetadas. */
@Component({
  selector: 'ar-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="header">
      <div class="titles">
        <h1>{{ title() }}</h1>
        @if (subtitle()) {
          <div class="subtitle">{{ subtitle() }}</div>
        }
      </div>
      <div class="spacer"></div>
      <ng-content />
    </header>
  `,
  styles: `
    .header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: var(--ar-header-py) var(--ar-pad-page-x);
      border-bottom: 1px solid var(--nx-line);
      flex: none;
      flex-wrap: wrap;
    }

    .titles {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
      flex: 1;
    }

    h1 {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 21px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0;
      overflow-wrap: anywhere;
    }

    .subtitle {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      overflow-wrap: anywhere;
    }

    .spacer {
      flex: 1;
    }
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
}
