import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { type StorePhoto } from '../data/store-showcase-model';

/**
 * Galeria da página do produto (web): miniaturas à esquerda (84px), foto principal com zoom 2× no
 * hover e tela cheia no clique (setas, `Esc`). Trocar a lista (outra cor) volta para a 1ª foto.
 */
@Component({
  selector: 'app-loja-produto-gallery',
  templateUrl: './loja-produto-gallery.component.html',
  styleUrl: './loja-produto-gallery.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // A página deixa a galeria `sticky`, que vira contexto de empilhamento: aberta, a tela cheia
  // precisa do host acima da coluna de compra e do cabeçalho.
  host: { '(document:keydown)': 'onKeydown($event)', '[class.lg-lightbox-open]': 'lightbox()' },
})
export class LojaProdutoGalleryComponent {
  private readonly document = inject(DOCUMENT);

  readonly photos = input.required<StorePhoto[]>();
  readonly name = input('');
  /** Texto do fundo listrado quando não há foto ("Vestuário"). */
  readonly placeholder = input('');
  readonly tone = input<'warm' | 'cool' | 'neutral'>('neutral');

  /** Foto trocada pelo atleta (miniatura ou seta) — o `loja_foto_swipe`. */
  readonly photoChanged = output<number>();

  protected readonly index = signal(0);
  protected readonly current = computed(() => this.photos()[this.index()] ?? null);
  protected readonly zoom = signal<{ x: number; y: number } | null>(null);
  protected readonly lightbox = signal(false);

  private readonly closeBtn = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');
  private returnFocus: HTMLElement | null = null;

  constructor() {
    // Outra cor = outra lista: volta para a primeira foto dela.
    effect(() => {
      this.photos();
      untracked(() => {
        this.index.set(0);
        this.zoom.set(null);
      });
    });

    effect(() => {
      const open = this.lightbox();
      const body = this.document.body;
      if (open) {
        body.style.overflow = 'hidden';
        queueMicrotask(() => this.closeBtn()?.nativeElement.focus());
      } else {
        body.style.removeProperty('overflow');
      }
    });
    inject(DestroyRef).onDestroy(() => this.document.body.style.removeProperty('overflow'));
  }

  protected show(i: number): void {
    const total = this.photos().length;
    if (total === 0) return;
    const next = (i + total) % total;
    if (next === this.index()) return;
    this.index.set(next);
    this.photoChanged.emit(next);
  }

  protected openLightbox(): void {
    if (!this.current()) return;
    this.returnFocus = this.document.activeElement as HTMLElement | null;
    this.zoom.set(null);
    this.lightbox.set(true);
  }

  protected closeLightbox(): void {
    this.lightbox.set(false);
    this.returnFocus?.focus();
    this.returnFocus = null;
  }

  /** Zoom só com mouse: no toque o clique abre a tela cheia, que tem pinça do sistema. */
  protected onPointerMove(event: PointerEvent, frame: HTMLElement): void {
    if (event.pointerType !== 'mouse' || !this.current()) return;
    const rect = frame.getBoundingClientRect();
    this.zoom.set({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.lightbox()) return;
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.closeLightbox();
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.show(this.index() + 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.show(this.index() - 1);
        break;
    }
  }
}
