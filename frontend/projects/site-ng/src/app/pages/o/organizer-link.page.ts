import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { LinkInBioPage } from '../link-bio/link-in-bio-page';
import { getLinkPageBySlug } from '../../../lib/firestore/link-pages';
import type { PublicLinkPage } from '../../../lib/firestore/link-pages';

/**
 * Página pública de links de um organizador — `nexago.com.br/o/{slug}`. Porta de
 * `app/o/[slug]/page.tsx` (site Next.js) — mesmo componente de `AthleteLinkPage`
 * (`../a/athlete-link.page.ts`), só trocando `ownerType` para `'organizer'` e a cópia da
 * página "não encontrada" (o source também é quase idêntico entre `/a` e `/o`, só variando
 * `ownerType` e o texto). Ver comentário daquele arquivo para o raciocínio do fetch em CSR.
 */
@Component({
  selector: 'app-organizer-link-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LinkInBioPage],
  template: `
    <app-link-in-bio-page
      [page]="page()"
      [loading]="loading()"
      notFoundTitle="Organizador não encontrado"
      notFoundBody="Esta página de links não existe, foi removida ou ainda não está publicada."
      backHref="/"
      backLabel="Voltar para o início"
    />
  `,
})
export class OrganizerLinkPage {
  readonly slug = input.required<string>();

  protected readonly page = signal<PublicLinkPage | null>(null);
  protected readonly loading = signal(true);

  private readonly titleService = inject(Title);

  constructor() {
    effect(() => {
      const slug = this.slug();
      this.loading.set(true);
      this.page.set(null);

      getLinkPageBySlug(slug, 'organizer').then((page) => {
        if (this.slug() !== slug) return; // resposta de uma navegação anterior, já obsoleta

        this.page.set(page);
        this.loading.set(false);
        this.titleService.setTitle(page ? `${page.title} · nexaGO` : 'Página não encontrada · nexaGO');
      });
    });
  }
}
