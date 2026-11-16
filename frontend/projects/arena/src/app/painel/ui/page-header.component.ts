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
      <div class="actions">
        <ng-content />
      </div>
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

    /* No desktop o invólucro some do layout: as ações projetadas continuam
       sendo itens flex do .header, exatamente como antes do invólucro existir. */
    .actions {
      display: contents;
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

      /* Ações viram uma fileira que quebra: antes cada botão projetado virava
         uma linha de largura total (coluna + stretch), e três botões comiam
         ~130px de altura antes do conteúdo. Botão/link/pill mantém o tamanho
         natural; invólucro, busca ou formulário projetado ocupa o que sobra
         da linha, como já ocupava. min-width: 0 + max-width deixa o filho
         encolher em vez de estourar a largura da tela. */
      .actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .actions:empty {
        display: none;
      }

      .actions ::ng-deep > * {
        flex: 0 1 auto;
        min-width: 0;
        max-width: 100%;
      }

      .actions ::ng-deep > :not(button):not(a):not(ar-pill) {
        flex-grow: 1;
      }
    }

    @include ar.below(sm) {
      h1 {
        font-size: 18px;
      }

      .subtitle {
        font-size: 10.5px;
        letter-spacing: 0.1em;
      }
    }
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
}
