import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../shared/reveal.directive';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { DocsSearch } from './docs-search';
import { DOC_AUDIENCES, POPULAR_FLOWS, SEARCH_INDEX } from '../../../lib/docs';
import type { DocAudience, DocFeature } from '../../../lib/docs/types';

/**
 * Índice da documentação — hero + busca + os 3 cards de audiência (atletas/organizadores/
 * arenas) + fluxos mais buscados + CTA de contato. Porta de `app/docs/page.tsx`. Diferente do
 * source (Server Component com `generateMetadata`), este app é CSR-only: título via `Title` no
 * `constructor` (estático, não depende de dado assíncrono).
 */
@Component({
  selector: 'app-docs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RevealDirective, ButtonDirective, DocsSearch],
  host: { class: 'block' },
  templateUrl: './docs.page.html',
})
export class DocsPage {
  protected readonly audiences = DOC_AUDIENCES;
  protected readonly popularFlows = POPULAR_FLOWS;
  protected readonly searchIndex = SEARCH_INDEX;

  constructor() {
    inject(Title).setTitle('Documentação · nexaGO');
  }

  protected totalFeatures(audience: DocAudience): number {
    return audience.groups.reduce((n, g) => n + g.features.length, 0);
  }

  protected highlights(audience: DocAudience): DocFeature[] {
    return audience.groups.flatMap((g) => g.features).slice(0, 4);
  }

  /** `POPULAR_FLOWS[].href` é `/docs/{audience}#{id}` — `routerLink` não interpreta `#`
   *  sozinho, então o fragmento precisa ir separado no `[fragment]`. */
  protected splitHref(href: string): { path: string; fragment: string | undefined } {
    const [path, fragment] = href.split('#');
    return { path, fragment };
  }
}
