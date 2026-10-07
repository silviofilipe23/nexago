import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import type { OverlayPatroItem } from './overlay-nx';

/** Velocidade do carrossel, em px/s: constante, qualquer que seja a quantidade de logos. */
export const PATRO_FAIXA_SPEED = 60;

/** Quanto leva o carrossel pra dar uma volta, dado o comprimento de uma cópia da lista (mínimo 12 s). */
export function patroFaixaVoltaSeg(listaPx: number): number {
  return Math.max(12, Math.round(listaPx / PATRO_FAIXA_SPEED));
}

/** Faixa de patrocinadores dos overlays: cada cartão tem a LARGURA DO LOGO (altura fixa, largura
 *  pela proporção da imagem) e, quando a fila passa da largura disponível, vira carrossel —
 *  rolagem contínua, sem emenda (a lista é duplicada) e com as pontas esmaecidas. Cabendo, fica
 *  parada e centralizada.
 *
 *  Compartilhada por todas as telas pra o comportamento não divergir de uma pra outra. */
@Component({
  selector: 'og-overlay-patro-faixa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="janela" #janela [class.rola]="rola()">
      <div class="trilha" [style.animation-duration.s]="volta()">
        <div class="lista" #lista>
          @for (s of itens(); track $index) {
            <div class="logo" [class.logo--img]="!!s.logo" [class.logo--on]="highlight() === $index" [style.animation-delay]="delay() + $index * 0.08 + 's'">
              @if (s.logo) { <img [src]="s.logo" [alt]="s.nome" /> } @else { <span>{{ s.nome }}</span> }
            </div>
          }
        </div>
        @if (rola()) {
          <div class="lista" aria-hidden="true">
            @for (s of itens(); track $index) {
              <div class="logo" [class.logo--img]="!!s.logo">
                @if (s.logo) { <img [src]="s.logo" alt="" /> } @else { <span>{{ s.nome }}</span> }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      --h: 64px;
      --gap: 14px;
    }
    .janela {
      overflow: hidden;
      height: calc(var(--h) + 12px);
      padding-top: 6px;
      box-sizing: border-box;
    }
    .janela.rola {
      -webkit-mask-image: linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent);
      mask-image: linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent);
    }
    .trilha {
      display: flex;
      width: max-content;
      min-width: 100%;
      justify-content: center;
    }
    .rola .trilha {
      justify-content: flex-start;
      animation: pf-rola linear infinite;
    }
    @keyframes pf-rola {
      to {
        transform: translateX(-50%);
      }
    }
    .lista {
      flex: none;
      display: flex;
      gap: var(--gap);
    }
    /* A cópia fecha o ciclo: cada lista leva a folga final pra emenda não ter salto. */
    .rola .lista {
      padding-right: var(--gap);
    }
    .logo {
      flex: none;
      height: var(--h);
      display: grid;
      place-items: center;
      box-sizing: border-box;
      border-radius: 8px;
      border: 1.5px dashed rgba(255, 255, 255, 0.22);
      background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.045) 0 10px, transparent 10px 20px);
      animation: pf-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
      transition:
        transform 0.5s ease,
        border-color 0.5s ease,
        box-shadow 0.5s ease;
    }
    @keyframes pf-in {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
    }
    /* Com logo, a placa acompanha a largura da imagem. */
    .logo--img {
      border: 1.5px solid transparent;
      background: #fff;
      padding: 6px 12px;
    }
    .logo--on {
      transform: translateY(-4px);
      border: 1.5px solid var(--nx-orange-500, #ff6a1a);
      box-shadow: 0 0 22px rgba(255, 106, 26, 0.55);
    }
    img {
      display: block;
      height: 80px;
      width: auto;
      max-width: 320px;
      object-fit: contain;
    }
    /* Sem logo: espaço reservado com o nome. */
    .logo span {
      padding: 0 22px;
      min-width: 150px;
      text-align: center;
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      white-space: nowrap;
      color: rgba(255, 255, 255, 0.55);
    }
  `,
})
export class OverlayPatroFaixaComponent {
  readonly itens = input<OverlayPatroItem[]>([]);
  /** Índice destacado em laranja (rodízio da tela de Intervalo); `-1` = nenhum. */
  readonly highlight = input(-1);
  /** Atraso (s) da entrada do 1º logo; cada um seguinte entra 80 ms depois. */
  readonly delay = input(0);

  private readonly janela = viewChild.required<ElementRef<HTMLElement>>('janela');
  private readonly lista = viewChild.required<ElementRef<HTMLElement>>('lista');

  private readonly janelaW = signal(0);
  private readonly listaW = signal(0);

  /** A fila não cabe: vira carrossel. */
  protected readonly rola = computed(() => this.listaW() > this.janelaW() + 1);
  protected readonly volta = computed(() => patroFaixaVoltaSeg(this.listaW()));

  constructor() {
    const destroyRef = inject(DestroyRef);
    // O logo carrega depois de montar e muda a largura da lista: o ResizeObserver acompanha.
    afterNextRender(() => {
      const medir = () => {
        this.janelaW.set(this.janela().nativeElement.clientWidth);
        // Mede UMA cópia sem a folga final — é o comprimento da fila.
        this.listaW.set(this.lista().nativeElement.scrollWidth);
      };
      medir();
      const ro = new ResizeObserver(medir);
      ro.observe(this.janela().nativeElement);
      ro.observe(this.lista().nativeElement);
      destroyRef.onDestroy(() => ro.disconnect());
    });
  }
}
