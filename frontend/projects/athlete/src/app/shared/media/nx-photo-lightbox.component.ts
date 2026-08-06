import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

const FOCUSABLE =
  'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Deslocamento horizontal mínimo pra contar como swipe, em px. */
const SWIPE_THRESHOLD = 48;

let nextId = 0;

/**
 * Visualizador de fotos em tela cheia — equivalente web do
 * `_HighlightPhotoViewer` do app: navega entre as fotos, fecha no Esc e
 * mostra a imagem inteira (`contain`), sem o corte do thumbnail.
 *
 * Declarativo: quem chama renderiza dentro de um `@if` e controla o estado.
 */
@Component({
  selector: 'app-nx-photo-lightbox',
  template: `
    <div class="viewer" role="dialog" aria-modal="true" [attr.aria-labelledby]="titleId">
      <header class="bar">
        <p class="counter" [id]="titleId">
          @if (total() > 1) {
            Foto {{ index() + 1 }} de {{ total() }}
          } @else {
            Foto em destaque
          }
        </p>
        <button type="button" class="icon-btn" aria-label="Fechar visualizador" (click)="close()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </header>

      <div
        class="stage"
        (pointerdown)="onPointerDown($event)"
        (pointerup)="onPointerUp($event)"
        (pointercancel)="onPointerCancel()"
      >
        @if (current(); as src) {
          <img class="photo" [src]="src" [alt]="alt()" />
        }

        @if (total() > 1) {
          <button type="button" class="nav nav--prev" aria-label="Foto anterior" (click)="previous()">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
          </button>
          <button type="button" class="nav nav--next" aria-label="Próxima foto" (click)="next()">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        }
      </div>

      @if (total() > 1) {
        <div class="dots" aria-hidden="true">
          @for (photo of photos(); track photo; let i = $index) {
            <span class="dot" [class.dot--on]="i === index()"></span>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 1100;
      display: block;
      background: rgba(0, 0, 0, 0.94);
      animation: scrim-in var(--nx-d-fast) var(--nx-ease-out) both;
    }

    .viewer {
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      padding: max(8px, env(safe-area-inset-top, 0px)) max(8px, env(safe-area-inset-right, 0px))
        max(8px, env(safe-area-inset-bottom, 0px)) max(8px, env(safe-area-inset-left, 0px));
    }

    .bar {
      display: flex;
      align-items: center;
      gap: var(--nx-s-3);
      flex-shrink: 0;
    }

    .counter {
      flex: 1;
      margin: 0;
      padding-left: var(--nx-s-3);
      font-family: var(--nx-font-ui);
      font-size: 13px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.72);
    }

    .icon-btn,
    .nav {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 44px;
      height: 44px;
      background: rgba(255, 255, 255, 0.08);
      border: 0;
      border-radius: var(--nx-r-pill);
      color: #fff;
      cursor: pointer;
      transition: background var(--nx-d-fast) var(--nx-ease-out);
    }

    .icon-btn:hover,
    .nav:hover {
      background: rgba(255, 255, 255, 0.18);
    }

    .stage {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 1;
      min-height: 0;
      touch-action: pan-y;
    }

    .photo {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      animation: photo-in var(--nx-d-base) var(--nx-ease-out) both;
    }

    .nav {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
    }

    .nav--prev {
      left: var(--nx-s-2);
    }

    .nav--next {
      right: var(--nx-s-2);
    }

    .dots {
      display: flex;
      justify-content: center;
      gap: var(--nx-s-2);
      flex-shrink: 0;
      padding: var(--nx-s-4) 0 var(--nx-s-2);
    }

    .dot {
      width: 6px;
      height: 6px;
      border-radius: var(--nx-r-pill);
      background: rgba(255, 255, 255, 0.28);
      transition: background var(--nx-d-fast) var(--nx-ease-out);
    }

    .dot--on {
      background: var(--nx-orange-500);
    }

    @keyframes scrim-in {
      from {
        opacity: 0;
      }
    }

    @keyframes photo-in {
      from {
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host,
      .photo {
        animation: none;
      }
    }
  `,
  host: {
    '(keydown)': 'onKeydown($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxPhotoLightboxComponent implements OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly previouslyFocused = document.activeElement as HTMLElement | null;

  readonly photos = input.required<readonly string[]>();
  readonly startIndex = input(0);
  /** Texto alternativo — quem chama sabe de quem é a foto. */
  readonly alt = input('Foto em destaque do atleta');

  readonly closed = output<void>();

  protected readonly titleId = `nx-lightbox-title-${nextId++}`;

  private readonly cursor = signal<number | null>(null);
  private swipeStart: { id: number; x: number } | null = null;

  protected readonly total = computed(() => this.photos().length);
  protected readonly index = computed(() => {
    const total = this.total();
    if (total === 0) {
      return 0;
    }
    // `startIndex` só vale enquanto ninguém navegou; depois manda o cursor.
    const raw = this.cursor() ?? this.startIndex();
    return Math.min(total - 1, Math.max(0, raw));
  });
  protected readonly current = computed(() => this.photos()[this.index()] ?? null);

  constructor() {
    document.body.style.overflow = 'hidden';
    afterNextRender(() => this.focusable()[0]?.focus());
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
    this.previouslyFocused?.focus();
  }

  protected close(): void {
    this.closed.emit();
  }

  protected previous(): void {
    const total = this.total();
    if (total > 1) {
      this.cursor.set((this.index() - 1 + total) % total);
    }
  }

  protected next(): void {
    const total = this.total();
    if (total > 1) {
      this.cursor.set((this.index() + 1) % total);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.close();
        return;
      case 'ArrowLeft':
        event.preventDefault();
        this.previous();
        return;
      case 'ArrowRight':
        event.preventDefault();
        this.next();
        return;
      case 'Tab':
        break;
      default:
        return;
    }

    // Prende o Tab no visualizador — a tela de fundo continua alcançável sem isso.
    const items = this.focusable();
    if (items.length === 0) {
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  protected onPointerDown(event: PointerEvent): void {
    this.swipeStart = { id: event.pointerId, x: event.clientX };
  }

  protected onPointerUp(event: PointerEvent): void {
    const start = this.swipeStart;
    this.swipeStart = null;
    if (!start || start.id !== event.pointerId) {
      return;
    }
    const delta = event.clientX - start.x;
    if (Math.abs(delta) < SWIPE_THRESHOLD) {
      return;
    }
    if (delta > 0) {
      this.previous();
    } else {
      this.next();
    }
  }

  protected onPointerCancel(): void {
    this.swipeStart = null;
  }

  private focusable(): HTMLElement[] {
    return Array.from(this.el.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE));
  }
}
