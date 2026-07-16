import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PanelContextService } from '../shell/panel-context.service';

/** Cabeçalho de página do painel — título/subtítulo à esquerda, ações projetadas à direita.
 *  Em contexto de torneio/categoria (cascata), mostra o breadcrumb dos níveis acima
 *  automaticamente, lendo o `PanelContextService` — as telas não precisam passar nada. */
@Component({
  selector: 'og-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
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
  `,
})
export class OgPageHeaderComponent {
  protected readonly ctx = inject(PanelContextService);

  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
}
