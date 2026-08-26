import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';

export interface ArenaNavAnchor {
  id: string;
  label: string;
}

/**
 * Nav fixa do mini-site: transparente sobre o hero, ganha fundo/blur/borda depois de 30px de
 * scroll (mesmo comportamento do protótipo `ArenaNav.tsx`). Diferente da fonte, o
 * `backdrop-filter` vai direto na classe `.nav-scrolled` — o hack de inline style do Next
 * existia só porque o compilador de CSS Module dele descartava a propriedade (ver
 * [[site-css-module-backdrop-filter]]); o builder do Angular não tem esse problema.
 */
@Component({
  selector: 'app-arena-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents', '(window:scroll)': 'onScroll()' },
  template: `
    <nav class="nav" [class.nav-scrolled]="scrolled()">
      <div class="nav-in">
        <a class="brand" href="#top">
          @if (logoUrl(); as src) {
            <img class="brand-logo" [src]="src" alt="" width="34" height="34" />
          } @else {
            <span class="brand-mark" aria-hidden="true">{{ initials() }}</span>
          }
          <span class="brand-name">{{ arenaName() }}</span>
        </a>

        @if (anchors().length > 0) {
          <div class="nav-links">
            @for (a of anchors(); track a.id) {
              <a [href]="'#' + a.id">{{ a.label }}</a>
            }
          </div>
        }

        @if (reserveUrl(); as url) {
          <a class="btn btn-ac btn-sm nav-cta" [href]="url" target="_blank" rel="noopener noreferrer">Reservar</a>
        }
      </div>
    </nav>
  `,
  styleUrl: './arena-nav.scss',
})
export class ArenaNav {
  readonly arenaName = input.required<string>();
  readonly logoUrl = input<string | null>(null);
  readonly anchors = input<ArenaNavAnchor[]>([]);
  readonly reserveUrl = input<string | null>(null);

  protected readonly scrolled = signal(false);

  protected onScroll(): void {
    this.scrolled.set(window.scrollY > 30);
  }

  /** Até duas iniciais do nome da arena ("Arena do Silvio" → "AS"), ignorando conectivos. Uma
   *  palavra só vira as duas primeiras letras. */
  protected initials(): string {
    const name = this.arenaName();
    const words = name
      .split(/\s+/)
      .filter((w) => w.length > 0 && !['de', 'da', 'do', 'das', 'dos', 'e'].includes(w.toLowerCase()));
    if (words.length === 0) return name.slice(0, 2).toUpperCase();
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }
}
