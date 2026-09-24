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
    @use 'breakpoints' as ar;

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
      /* Não deixa o bloco encolher até “uma letra por linha” quando as ações
         (busca 220px + sino + avatar) competem na mesma fileira. */
      flex: 1 1 12rem;
    }

    h1 {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 21px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0;
      overflow-wrap: break-word;
    }

    .subtitle {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      overflow-wrap: break-word;
    }

    .spacer {
      flex: 1 1 0;
      min-width: 0;
    }

    /* Tablet/celular (sidebar vira topbar): título em cima, ações embaixo —
       evita o título ser esmagado ao lado da busca. */
    @include ar.below(md) {
      .header {
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
      }

      .titles {
        flex: none;
        width: 100%;
      }

      .spacer {
        display: none;
      }
    }

    @include ar.below(sm) {
      h1 {
        font-size: 18px;
      }
    }
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
}
