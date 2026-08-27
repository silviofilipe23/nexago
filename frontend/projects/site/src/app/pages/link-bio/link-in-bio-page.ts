import { ChangeDetectionStrategy, Component, computed, effect, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HighlightValue } from './highlight-value';
import { LinkCard } from './link-card';
import { trackLinkPageEvent } from './track-link-event';
import type { PublicLinkPage } from '../../../lib/firestore/link-pages';

function initialsOf(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Página pública estilo link-in-bio (`/a/{slug}` e `/o/{slug}`) — casca compartilhada usada
 * pelos dois wrappers finos (`AthleteLinkPage` para arenas, `OrganizerLinkPage` para
 * organizadores). Porta de `LinkInBioPage.tsx` (site Next.js).
 *
 * Os estilos vivem num CSS próprio deste componente (`link-in-bio-page.css`), não no tema do
 * site: é a página de marca do dono, sempre escura, e não deve herdar o claro/escuro nem o
 * chrome institucional (já suprimido em `app.ts` para `/a` e `/o`).
 *
 * Diferente do source, que só renderiza a página resolvida (o Next resolve no servidor e
 * chama `notFound()` antes de pintar), aqui o fetch acontece no navegador — então este
 * componente também assume os estados de carregamento e "não encontrada" que no Next eram
 * responsabilidade do framework (404 global). `notFoundTitle`/`notFoundBody`/`backHref`/
 * `backLabel` deixam esses dois últimos textos a cargo do wrapper (arena vs. organizador),
 * já que o source não tinha equivalente para copiar.
 */
@Component({
  selector: 'app-link-in-bio-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HighlightValue, LinkCard],
  styleUrl: './link-in-bio-page.css',
  template: `
    <main class="page">
      <div class="bg" aria-hidden="true">
        <div class="glow"></div>
        <div class="court"></div>
        <div class="streak s1"></div>
        <div class="streak s2"></div>
        <div class="streak s3"></div>
      </div>

      <div class="wrap">
        @if (loading()) {
          <div class="loadingRing"></div>
          <div class="loadingLine" style="width: 180px; margin-top: 20px;"></div>
          <div class="loadingLine" style="width: 120px; margin-top: 10px;"></div>
        } @else if (page(); as p) {
          <header class="head">
            <div class="avatarRing">
              <div class="avatar">
                @if (p.avatarUrl; as avatarUrl) {
                  <img class="avatarImg" [src]="avatarUrl" [alt]="p.title" width="100" height="100" />
                } @else {
                  <span class="avatarInitials">{{ initialsOf(p.title) }}</span>
                }
              </div>
            </div>

            <h1 class="brandName">{{ p.title }}</h1>

            <div class="handle">
              <span class="liveDot" aria-hidden="true"></span>
              {{ handle() }}
            </div>

            @if (p.bio) {
              <p class="tagline">{{ p.bio }}</p>
            }

            @if (p.highlights.length > 0) {
              <div class="stats">
                @for (h of p.highlights; track h.label + h.value) {
                  <div class="stat">
                    <div class="statValue">
                      <app-highlight-value [value]="h.value" />
                    </div>
                    <div class="statLabel">{{ h.label }}</div>
                  </div>
                }
              </div>
            }
          </header>

          @if (p.links.length > 0) {
            <nav class="links" aria-label="Links">
              @for (link of p.links; track link.id) {
                <app-link-card [pageId]="p.id" [link]="link" />
              }
            </nav>
          } @else {
            <p class="empty">Esta página ainda não tem links publicados.</p>
          }

          <footer class="foot">
            <a class="footLink" routerLink="/">Feito com <b>nexaGO</b></a>
          </footer>
        } @else {
          <div class="notFound">
            <p class="notFoundTitle">{{ notFoundTitle() }}</p>
            <p class="notFoundBody">{{ notFoundBody() }}</p>
            <a class="notFoundLink" [routerLink]="backHref()">{{ backLabel() }}</a>
          </div>
        }
      </div>
    </main>
  `,
})
export class LinkInBioPage {
  readonly page = input<PublicLinkPage | null>(null);
  readonly loading = input<boolean>(false);
  readonly notFoundTitle = input.required<string>();
  readonly notFoundBody = input.required<string>();
  readonly backHref = input.required<string>();
  readonly backLabel = input.required<string>();

  // Sem handle preenchido, o slug é a identidade pública da página — sempre existe.
  protected readonly handle = computed(() => {
    const p = this.page();
    if (!p) return '';
    return `@${(p.handle || p.slug).replace(/^@/, '')}`;
  });

  protected readonly initialsOf = initialsOf;

  private readonly pageId = computed(() => this.page()?.id ?? null);

  constructor() {
    // Porta de `TrackPageView.tsx`: conta uma visita por página resolvida. O `computed` acima
    // dedupa por id (não por referência do objeto `page`), então isto dispara uma vez quando
    // a página resolve e de novo só se o `slug` mudar para outra página — igual ao
    // `useEffect(..., [pageId])` do source.
    effect(() => {
      const id = this.pageId();
      if (id) trackLinkPageEvent(id);
    });
  }
}
