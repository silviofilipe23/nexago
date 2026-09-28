import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import type { OverlayPatroItem } from './overlay-nx';

/** Card rotativo "Oferecimento" no canto inferior direito, logo acima da marca nexaGO.
 *
 *  Só visual: QUANDO aparece é do ciclo no overlay-page. Aqui mora a rotação dentro da
 *  aparição — os `visivelSeg` se dividem entre os logos: o atual sobe e sai com desfoque, o
 *  próximo entra por baixo com um brilho, e a barra do pé mostra quanto falta pro card sumir. */
@Component({
  selector: 'og-overlay-patro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show() && itens().length > 0) {
      <aside
        class="card"
        animate.enter="patro-card-in"
        animate.leave="patro-card-out"
        [style.--patro-visivel]="visivelCss()"
        role="complementary"
        [attr.aria-label]="'Oferecimento: ' + atual().nome"
      >
        <span class="shine" aria-hidden="true"></span>
        <span class="rail" aria-hidden="true">Oferecimento</span>

        <div class="stage">
          @for (i of [indice()]; track i) {
            <div class="slot" [class.has-logo]="!!itens()[i]!.logo" animate.enter="patro-logo-in" animate.leave="patro-logo-out">
              @if (itens()[i]!.logo; as src) {
                <img [src]="src" [alt]="itens()[i]!.nome" />
              } @else {
                <span class="nome">{{ itens()[i]!.nome }}</span>
              }
              <span class="glint" aria-hidden="true"></span>
            </div>
          }
        </div>

        @if (itens().length > 1) {
          <ol class="dots" aria-hidden="true">
            @for (item of itens(); track $index) {
              <li [class.on]="$index === indice()"></li>
            }
          </ol>
        }

        <span class="bar" aria-hidden="true"></span>
      </aside>
    }
  `,
  styles: `
    :host {
      position: fixed;
      right: 80px;
      /* Acima da marca nexaGO (bottom 74 + 72 de logo), com respiro. */
      bottom: 166px;
      z-index: 20;
      display: block;
      pointer-events: none;
      font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif);
    }

    .card {
      --patro-visivel: 15s;
      position: relative;
      display: flex;
      align-items: stretch;
      gap: 14px;
      width: 420px;
      height: 156px;
      box-sizing: border-box;
      padding: 16px 14px 18px 12px;
      border-radius: 16px;
      border: 1px solid rgba(255, 106, 26, 0.55);
      background: #151517;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
      overflow: hidden;
    }
    .patro-card-in {
      animation: patro-card-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .patro-card-out {
      animation: patro-card-out 0.5s cubic-bezier(0.4, 0, 1, 1) both;
    }
    @keyframes patro-card-in {
      from {
        opacity: 0;
        filter: blur(8px);
        transform: translateX(80px);
      }
    }
    @keyframes patro-card-out {
      to {
        opacity: 0;
        transform: translateX(90px);
      }
    }

    /* Brilho que atravessa o card na entrada. */
    .shine {
      position: absolute;
      inset: 0 auto 0 0;
      width: 40%;
      background: linear-gradient(105deg, transparent, rgba(255, 180, 120, 0.3) 50%, transparent);
      transform: translateX(300%) skewX(-18deg);
      animation: patro-shine 1s cubic-bezier(0.4, 0, 0.2, 1) 0.35s both;
    }
    @keyframes patro-shine {
      from {
        transform: translateX(300%) skewX(-18deg);
      }
      to {
        transform: translateX(-280%) skewX(-18deg);
      }
    }

    /* "OFERECIMENTO" lido de baixo pra cima, como no protótipo. */
    .rail {
      flex: none;
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      align-self: center;
      color: var(--nx-orange-500, #ff6a1a);
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
    }

    .stage {
      position: relative;
      flex: 1;
      min-width: 0;
    }
    /* Os dois slots se sobrepõem durante a troca: sai um por cima, entra o outro por baixo. */
    .slot {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      overflow: hidden;
      border-radius: 10px;
      border: 1.5px dashed rgba(255, 255, 255, 0.22);
      background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.045) 0 10px, transparent 10px 20px);
    }
    /* Com logo: placa clara e a imagem inteira, sem cortar — os logos sobem como JPEG. */
    .slot.has-logo {
      border: 0;
      background: #fff;
      padding: 10px 14px;
    }
    .slot img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .nome {
      padding: 0 12px;
      color: rgba(255, 255, 255, 0.72);
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 17px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-align: center;
      text-transform: uppercase;
    }
    .patro-logo-in {
      animation: patro-logo-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .patro-logo-out {
      animation: patro-logo-out 0.45s cubic-bezier(0.4, 0, 1, 1) both;
    }
    @keyframes patro-logo-in {
      from {
        opacity: 0;
        transform: translateY(46px);
      }
    }
    @keyframes patro-logo-out {
      to {
        opacity: 0;
        filter: blur(6px);
        transform: translateY(-40px);
      }
    }
    .glint {
      position: absolute;
      inset: 0;
      background: linear-gradient(100deg, transparent 30%, rgba(255, 255, 255, 0.35) 50%, transparent 70%);
      transform: translateX(-120%);
      animation: patro-glint 0.8s ease-out 0.3s both;
    }
    @keyframes patro-glint {
      to {
        transform: translateX(120%);
      }
    }

    .dots {
      flex: none;
      align-self: center;
      display: flex;
      flex-direction: column;
      gap: 9px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .dots li {
      width: 4px;
      height: 14px;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.2);
      transition: background 0.3s;
    }
    .dots li.on {
      background: var(--nx-orange-500, #ff6a1a);
    }

    .bar {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 4px;
      transform-origin: left center;
      background: var(--nx-orange-500, #ff6a1a);
      animation: patro-bar var(--patro-visivel) linear both;
    }
    @keyframes patro-bar {
      from {
        transform: scaleX(1);
      }
      to {
        transform: scaleX(0);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .patro-card-in,
      .patro-card-out,
      .patro-logo-in,
      .patro-logo-out,
      .shine,
      .glint,
      .bar {
        animation: none;
      }
    }
  `,
})
export class OverlayPatroComponent {
  readonly itens = input<readonly OverlayPatroItem[]>([]);
  /** Controlado pelo ciclo do overlay-page. */
  readonly show = input(false);
  readonly visivelSeg = input(15);

  protected readonly indice = signal(0);
  /** Número, não a lista: cada snapshot do torneio traz um array novo, e depender dele
   *  reiniciaria a rotação no meio da aparição. */
  private readonly count = computed(() => this.itens().length);
  protected readonly atual = computed(() => this.itens()[this.indice()] ?? { nome: '', logo: '' });
  protected readonly visivelCss = computed(() => `${Math.max(1, this.visivelSeg())}s`);

  constructor() {
    // Cada aparição recomeça do 1º logo e divide o tempo no ar igualmente entre eles.
    effect((onCleanup) => {
      const n = this.count();
      this.indice.set(0);
      if (!this.show() || n <= 1) return;
      const slotMs = (Math.max(1, this.visivelSeg()) * 1000) / n;
      const timer = setInterval(() => this.indice.update((i) => (i + 1) % n), slotMs);
      onCleanup(() => clearInterval(timer));
    });
  }
}
