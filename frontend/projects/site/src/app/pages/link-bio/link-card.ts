import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LinkGlyph } from './link-glyph';
import { trackLinkPageEvent } from './track-link-event';
import type { PublicPageLink } from '../../../lib/firestore/link-pages';

/**
 * Cartão de link da página pública. Porta de `LinkCard.tsx` — abre em nova aba e dispara a
 * métrica sem bloquear, o clique nunca espera a rede.
 */
@Component({
  selector: 'app-link-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LinkGlyph],
  host: { class: 'contents' },
  styleUrl: './link-in-bio-page.css',
  template: `
    <a
      [class]="link().featured ? 'link featured' : 'link'"
      [href]="link().url"
      target="_blank"
      rel="noopener noreferrer"
      (click)="trackLinkPageEvent(pageId(), link().id)"
    >
      <span class="ic">
        <app-link-glyph [name]="link().icon" [size]="22" />
      </span>

      <span class="tx">
        <span class="t">{{ link().title }}</span>
        @if (link().subtitle) {
          <span class="s">{{ link().subtitle }}</span>
        }
      </span>

      @if (link().live) {
        <span class="badge">Live</span>
      } @else {
        <span class="arrow">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      }
    </a>
  `,
})
export class LinkCard {
  readonly pageId = input.required<string>();
  readonly link = input.required<PublicPageLink>();

  protected readonly trackLinkPageEvent = trackLinkPageEvent;
}
