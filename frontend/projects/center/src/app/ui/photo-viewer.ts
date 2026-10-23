import { ChangeDetectionStrategy, Component, Injectable, effect, inject, signal } from '@angular/core';
import { IconComponent } from './icon.component';

export interface OpenPhoto {
  url: string;
  name: string;
  /** Kicker acima do nome ("Atleta"). */
  role: string;
}

/** Foto ampliada aberta no portal (uma por vez). */
@Injectable({ providedIn: 'root' })
export class PhotoViewerService {
  readonly current = signal<OpenPhoto | null>(null);

  open(photo: OpenPhoto): void {
    this.current.set(photo);
  }

  close(): void {
    this.current.set(null);
  }
}

/**
 * Visualizador da foto inteira (`object-fit: contain` — o círculo do avatar já mostra o recorte).
 * Montado UMA vez no shell, fora das listas: evita stacking context de card/`position: fixed`.
 * Fecha no X, no fundo ou no Esc.
 */
@Component({
  selector: 'ct-photo-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: { '(document:keydown.escape)': 'viewer.close()' },
  template: `
    @if (viewer.current(); as p) {
      <div class="backdrop" (click)="viewer.close()"></div>
      <figure class="box" role="dialog" aria-modal="true" [attr.aria-label]="'Foto de ' + p.name">
        <button type="button" class="x" aria-label="Fechar" (click)="viewer.close()"><ct-icon name="x" [size]="16" /></button>
        <div class="frame">
          @if (failed()) {
            <div class="ct-dim fail">Não foi possível carregar a foto.</div>
          } @else {
            <img [src]="p.url" [alt]="'Foto de ' + p.name" (error)="failed.set(true)" />
          }
        </div>
        <figcaption>
          <span class="ct-kick">{{ p.role }}</span>
          <span class="nm">{{ p.name }}</span>
        </figcaption>
      </figure>
    }
  `,
  styles: `
    .backdrop { position: fixed; inset: 0; z-index: 70; background: rgba(0, 0, 0, 0.78); }
    .box { position: fixed; z-index: 71; left: 50%; top: 50%; transform: translate(-50%, -50%); margin: 0;
      width: min(520px, calc(100vw - 32px)); background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-5); box-shadow: var(--nx-elev-3); overflow: hidden; display: flex; flex-direction: column; }
    .frame { position: relative; width: 100%; aspect-ratio: 1; max-height: calc(100vh - 160px); background: #000; }
    .frame img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
    .fail { position: absolute; inset: 0; display: grid; place-items: center; font-size: 13px; }
    figcaption { padding: 12px 16px 14px; display: flex; flex-direction: column; gap: 2px; }
    .nm { font-family: var(--nx-font-display); font-weight: 700; font-size: 15px; color: var(--nx-text); }
    .x { position: absolute; top: 10px; right: 10px; z-index: 1; width: 32px; height: 32px; border-radius: 10px; border: none;
      background: rgba(0, 0, 0, 0.55); color: #fff; cursor: pointer; display: grid; place-items: center; }
  `,
})
export class PhotoViewerComponent {
  protected readonly viewer = inject(PhotoViewerService);
  protected readonly failed = signal(false);

  constructor() {
    // Foto nova = tenta carregar de novo.
    effect(() => {
      this.viewer.current();
      this.failed.set(false);
    });
  }
}
