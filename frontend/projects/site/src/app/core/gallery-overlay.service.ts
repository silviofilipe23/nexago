import { Injectable, signal } from '@angular/core';

/**
 * Sinaliza galeria fullscreen (ex.: detalhe) para outros shells — ex. desfocar o mapa na disponibilidade.
 */
@Injectable({ providedIn: 'root' })
export class GalleryOverlayService {
  readonly isFullscreenGalleryOpen = signal(false);

  setOpen(open: boolean): void {
    this.isFullscreenGalleryOpen.set(open);
  }
}
