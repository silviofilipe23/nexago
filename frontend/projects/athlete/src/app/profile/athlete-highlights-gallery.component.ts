import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { NxPhotoLightboxComponent } from '../shared/media/nx-photo-lightbox.component';

/**
 * Fita "Destaques" somente leitura — a mesma nos dois lugares onde se vê um
 * perfil no portal (`/perfil` e `/atletas/:uid`). Cada miniatura abre o
 * visualizador em tela cheia.
 *
 * Sem fotos e sem `emptyHint` não renderiza nada: no perfil público de quem
 * nunca adicionou foto não deve sobrar uma seção vazia (mesma decisão do
 * `PublicProfileHighlightsSection` do app).
 */
@Component({
  selector: 'app-athlete-highlights-gallery',
  imports: [NxPhotoLightboxComponent],
  template: `
    @if (photos().length > 0 || emptyHint()) {
      <section class="hl">
        <div class="hl-head">
          @if (kicker(); as text) {
            <p class="hl-kicker">{{ text }}</p>
          }
          <h2 class="hl-title">{{ heading() }}</h2>
        </div>

        @if (photos().length === 0) {
          <p class="hl-empty">{{ emptyHint() }}</p>
        } @else {
          <ul class="hl-strip">
            @for (photo of photos(); track photo; let i = $index) {
              <li class="hl-item">
                <button
                  type="button"
                  class="hl-thumb"
                  [attr.aria-label]="'Ampliar foto ' + (i + 1) + ' de ' + photos().length"
                  (click)="open(i)"
                >
                  <img
                    class="hl-img"
                    [src]="photo"
                    alt=""
                    loading="lazy"
                    decoding="async"
                    (load)="markLoaded(photo)"
                    (error)="markLoaded(photo)"
                  />
                  @if (!isLoaded(photo)) {
                    <span class="hl-skeleton" aria-hidden="true"></span>
                  }
                </button>
              </li>
            }
          </ul>
        }
      </section>

      @if (viewerIndex(); as start) {
        <app-nx-photo-lightbox
          [photos]="photos()"
          [startIndex]="start.value"
          [alt]="photoAlt()"
          (closed)="closeViewer()"
        />
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .hl-head {
      margin-bottom: var(--nx-s-3);
    }

    .hl-kicker {
      margin: 0 0 2px;
      font-family: var(--nx-font-ui);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .hl-title {
      margin: 0;
      font-family: var(--nx-font-display);
      font-size: 16px;
      font-weight: 800;
      letter-spacing: -0.2px;
      color: var(--nx-text);
    }

    .hl-empty {
      margin: 0;
      font-family: var(--nx-font-ui);
      font-size: 13px;
      line-height: 1.55;
      color: var(--nx-text-mute);
    }

    .hl-strip {
      display: flex;
      gap: var(--nx-s-2);
      margin: 0;
      padding: 0 0 var(--nx-s-1);
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scroll-snap-type: x proximity;
      list-style: none;
      scrollbar-width: thin;
    }

    .hl-item {
      flex: 0 0 auto;
      scroll-snap-align: start;
    }

    .hl-thumb {
      position: relative;
      display: block;
      width: 104px;
      /* Reserva a caixa antes da imagem chegar — sem isto a fita pula (CLS). */
      aspect-ratio: 1;
      padding: 0;
      overflow: hidden;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      cursor: pointer;
      transition: transform var(--nx-d-fast) var(--nx-ease-out), border-color var(--nx-d-fast) var(--nx-ease-out);
    }

    .hl-thumb:hover {
      border-color: var(--nx-line-strong);
      transform: translateY(-2px);
    }

    .hl-thumb:focus-visible {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 2px;
    }

    .hl-img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .hl-skeleton {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        90deg,
        var(--nx-surface-1) 0%,
        var(--nx-surface-2) 50%,
        var(--nx-surface-1) 100%
      );
      background-size: 200% 100%;
      animation: hl-shimmer 1.4s linear infinite;
    }

    @keyframes hl-shimmer {
      to {
        background-position: -200% 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .hl-thumb:hover {
        transform: none;
      }

      .hl-skeleton {
        animation: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthleteHighlightsGalleryComponent {
  readonly photos = input<readonly string[]>([]);
  readonly heading = input('Destaques');
  readonly kicker = input<string | null>(null);
  /** Quando definido, a seção aparece mesmo sem fotos, com este texto. */
  readonly emptyHint = input<string | null>(null);
  readonly photoAlt = input('Foto em destaque do atleta');

  /** `null` = visualizador fechado. Objeto (e não índice) pra `@if` aceitar o 0. */
  protected readonly viewerIndex = signal<{ value: number } | null>(null);
  private readonly loaded = signal<ReadonlySet<string>>(new Set());

  /** Método (não computed) porque depende do argumento; a leitura do signal
   *  dentro do template continua sendo rastreada normalmente. */
  protected isLoaded(photo: string): boolean {
    return this.loaded().has(photo);
  }

  protected open(index: number): void {
    this.viewerIndex.set({ value: index });
  }

  protected closeViewer(): void {
    this.viewerIndex.set(null);
  }

  protected markLoaded(photo: string): void {
    this.loaded.update((set) => new Set(set).add(photo));
  }
}
