import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Cabeçalho de página do painel (protótipo BoPageHeader): título + subtítulo + ações projetadas. */
@Component({
  selector: 'bo-page-header',
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
      padding: 20px 32px;
      border-bottom: 1px solid var(--nx-line);
      flex: none;
    }

    .titles {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }

    h1 {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 21px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0;
      white-space: nowrap;
    }

    .subtitle {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      white-space: nowrap;
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
