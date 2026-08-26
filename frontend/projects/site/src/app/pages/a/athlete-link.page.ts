import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { LinkInBioPage } from '../link-bio/link-in-bio-page';
import { getLinkPageBySlug } from '../../../lib/firestore/link-pages';
import type { PublicLinkPage } from '../../../lib/firestore/link-pages';

/**
 * Página pública de links de uma arena — `nexago.com.br/a/{slug}`. Porta de
 * `app/a/[slug]/page.tsx` (site Next.js): lá é um Server Component que resolve a página no
 * servidor e chama `notFound()`; aqui, CSR-only, o fetch roda num `effect()` reagindo ao
 * `slug` de rota (com guarda de obsolescência — mesmo padrão de `liga-detail.page.ts` e
 * `arena-detail.page.ts`), e o resultado alimenta a casca compartilhada `LinkInBioPage`.
 *
 * O nome da classe (`AthleteLinkPage`) já vinha assim na rota `a/:slug` — mantido por não
 * fazer parte do escopo desta porta mexer em `app.routes.ts`.
 */
@Component({
  selector: 'app-athlete-link-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LinkInBioPage],
  template: `
    <app-link-in-bio-page
      [page]="page()"
      [loading]="loading()"
      notFoundTitle="Arena não encontrada"
      notFoundBody="Esta página de links não existe, foi removida ou ainda não está publicada."
      backHref="/arenas"
      backLabel="Ver arenas parceiras"
    />
  `,
})
export class AthleteLinkPage {
  readonly slug = input.required<string>();

  protected readonly page = signal<PublicLinkPage | null>(null);
  protected readonly loading = signal(true);

  private readonly titleService = inject(Title);

  constructor() {
    effect(() => {
      const slug = this.slug();
      this.loading.set(true);
      this.page.set(null);

      getLinkPageBySlug(slug, 'arena').then((page) => {
        if (this.slug() !== slug) return; // resposta de uma navegação anterior, já obsoleta

        this.page.set(page);
        this.loading.set(false);
        this.titleService.setTitle(page ? `${page.title} · nexaGO` : 'Página não encontrada · nexaGO');
      });
    });
  }
}
