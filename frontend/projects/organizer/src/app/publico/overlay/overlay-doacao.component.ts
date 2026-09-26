import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
} from '@angular/core';
import { shareQrSvgDataUrl } from '../../painel/data/share-qr';
import { buildDonationPixBrCode } from './overlay-doacao-pix';
import type { OverlayDoacaoConfig } from './overlay-nx';

/** Card "Doe via Pix" no canto superior direito do overlay.
 *
 *  Só visual + QR: o ciclo (quando aparece) mora no overlay-page. Entrada 0,7 s,
 *  saída 0,5 s, barra de contagem no pé. */
@Component({
  selector: 'og-overlay-doacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      @for (k of [cardKey()]; track k) {
        <aside
          class="card"
          [class.card--out]="leaving()"
          [style.--doacao-visivel]="visivelCss()"
          role="complementary"
          aria-label="Doação via Pix"
        >
          <span class="shine" aria-hidden="true"></span>

          <div class="qr-wrap">
            @if (qrSrc(); as src) {
              <img class="qr" [src]="src" alt="" width="112" height="112" />
            } @else {
              <div class="qr qr--empty" aria-hidden="true"></div>
            }
          </div>

          <div class="copy">
            <span class="kicker">{{ config().kicker }}</span>
            <strong class="titulo">{{ config().titulo }}</strong>
            <p class="apoio">{{ config().apoio }}</p>
          </div>

          <span class="bar" aria-hidden="true"></span>
        </aside>
      }
    }
  `,
  styles: `
    :host {
      position: fixed;
      top: 74px;
      right: 80px;
      z-index: 20;
      display: block;
      pointer-events: none;
      font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif);
    }

    .card {
      --doacao-visivel: 20s;
      position: relative;
      display: flex;
      align-items: center;
      gap: 18px;
      width: min(420px, calc(100vw - 96px));
      padding: 16px 18px 18px;
      border-radius: 18px;
      background: #141416;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
      overflow: hidden;
      animation: doacao-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .card--out {
      animation: doacao-out 0.5s cubic-bezier(0.4, 0, 1, 1) both;
    }

    @keyframes doacao-in {
      from {
        opacity: 0;
        filter: blur(8px);
        transform: translateX(60px) scale(0.96);
      }
      to {
        opacity: 1;
        filter: none;
        transform: none;
      }
    }
    @keyframes doacao-out {
      from {
        opacity: 1;
        transform: none;
      }
      to {
        opacity: 0;
        transform: translateX(80px) scale(0.98);
      }
    }

    .shine {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: 42%;
      background: linear-gradient(
        105deg,
        transparent 0%,
        rgba(255, 106, 26, 0.1) 38%,
        rgba(255, 180, 120, 0.38) 50%,
        rgba(255, 106, 26, 0.1) 62%,
        transparent 100%
      );
      transform: translateX(280%) skewX(-18deg);
      animation: doacao-shine 1s cubic-bezier(0.4, 0, 0.2, 1) 0.35s both;
      pointer-events: none;
    }
    @keyframes doacao-shine {
      from {
        transform: translateX(280%) skewX(-18deg);
      }
      to {
        transform: translateX(-280%) skewX(-18deg);
      }
    }

    .qr-wrap {
      flex: none;
      width: 112px;
      height: 112px;
      padding: 8px;
      border-radius: 12px;
      background: #fff;
      animation: doacao-qr 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) 0.25s both;
    }
    @keyframes doacao-qr {
      from {
        opacity: 0;
        transform: rotate(-6deg) scale(0.6);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    .qr {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .qr--empty {
      background: repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 0 0 / 12px 12px;
    }

    .copy {
      display: grid;
      gap: 6px;
      min-width: 0;
    }
    .kicker {
      color: var(--nx-orange-500, #ff6a1a);
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      animation: doacao-rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) 0.35s both;
    }
    .titulo {
      color: #fff;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.02em;
      text-transform: uppercase;
      line-height: 1.1;
      animation: doacao-rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) 0.45s both;
    }
    .apoio {
      margin: 0;
      color: rgba(255, 255, 255, 0.62);
      font-family: var(--nx-font-ui, 'Inter', system-ui, sans-serif);
      font-size: 13px;
      font-weight: 500;
      line-height: 1.35;
      animation: doacao-rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) 0.55s both;
    }
    @keyframes doacao-rise {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    .bar {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 3px;
      transform-origin: left center;
      background: var(--nx-orange-500, #ff6a1a);
      animation: doacao-bar var(--doacao-visivel) linear both;
    }
    @keyframes doacao-bar {
      from {
        transform: scaleX(1);
      }
      to {
        transform: scaleX(0);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .card,
      .card--out,
      .shine,
      .qr-wrap,
      .kicker,
      .titulo,
      .apoio,
      .bar {
        animation: none;
      }
      .bar {
        transform: scaleX(0.35);
      }
    }
  `,
})
export class OverlayDoacaoComponent {
  readonly config = input.required<OverlayDoacaoConfig>();
  /** Controlado pelo ciclo do overlay-page. */
  readonly show = input(false);

  protected readonly qrSrc = signal<string | null>(null);
  /** Remonta o card a cada aparição — reinicia entrada + barra. */
  protected readonly cardKey = signal(0);
  /** Mantém o host montado durante a saída (0,5 s). */
  protected readonly visible = signal(false);
  protected readonly leaving = signal(false);

  protected readonly visivelCss = computed(() => `${Math.max(1, this.config().visivelSeg)}s`);

  constructor() {
    effect(() => {
      const cfg = this.config();
      const payload = buildDonationPixBrCode({
        key: cfg.pixKey,
        recipientName: cfg.recipientName,
        city: cfg.city,
        keyType: cfg.pixKeyType,
      });
      if (!payload) {
        this.qrSrc.set(null);
        return;
      }
      let cancelled = false;
      void shareQrSvgDataUrl(payload).then((src) => {
        if (!cancelled) this.qrSrc.set(src);
      });
      return () => {
        cancelled = true;
      };
    });

    effect((onCleanup) => {
      if (this.show()) {
        this.leaving.set(false);
        this.cardKey.update((n) => n + 1);
        this.visible.set(true);
        return;
      }
      if (!this.visible()) return;
      this.leaving.set(true);
      const t = setTimeout(() => {
        this.visible.set(false);
        this.leaving.set(false);
      }, 500);
      onCleanup(() => clearTimeout(t));
    });
  }
}
