import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OgBellComponent } from '../shell/og-bell.component';
import { PanelContextService } from '../shell/panel-context.service';

/** Cabeçalho de página do painel — título/subtítulo à esquerda, ações projetadas à direita.
 *  Em contexto de torneio/categoria (cascata), mostra o breadcrumb dos níveis acima
 *  automaticamente, lendo o `PanelContextService` — as telas não precisam passar nada.
 *
 *  É também onde o sino de notificações vive no desktop: esta é a faixa do topo de toda
 *  tela do painel, e a sidebar não é lugar de aviso (fica fora do caminho do olho).
 *  Abaixo de 1024px ele sai daqui — a linha já divide o espaço com o botão de ação — e
 *  quem assume é a topbar do shell, que só existe nessa faixa. */
@Component({
  selector: 'og-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgBellComponent],
  host: { class: 'og-page-header' },
  template: `
    <div class="og-card-head-text">
      @if (ctx.crumbs().length > 0) {
        <div class="og-page-header-crumbs">
          @for (c of ctx.crumbs(); track c.link) {
            <a [routerLink]="c.link">{{ c.label }}</a>
            <span class="sep">›</span>
          }
        </div>
      }
      <h1 class="og-page-header-title">{{ title() }}</h1>
      @if (subtitle()) {
        <div class="og-page-header-subtitle">{{ subtitle() }}</div>
      }
    </div>
    <div class="og-page-header-spacer"></div>
    <div class="og-page-header-actions">
      <ng-content />
    </div>
    <og-bell />
  `,
  styles: `
    /* Só no desktop — a topbar do shell cobre o resto. A regra base vem ANTES da media
       query de propósito: invertido, o \`@media\` seria descartado. */
    og-bell {
      display: none;
      flex: none;
    }

    @media (min-width: 1024px) {
      og-bell {
        display: block;
      }
    }
  `,
})
export class OgPageHeaderComponent {
  protected readonly ctx = inject(PanelContextService);

  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
}
