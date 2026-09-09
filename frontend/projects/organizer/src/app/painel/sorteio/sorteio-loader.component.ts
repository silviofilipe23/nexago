import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * O loader da revelação: os dados sendo lançados.
 *
 * É o tempo de suspense que o narrador usa para provocar — e o pedaço mais
 * recortável da transmissão. Três coisas acontecem juntas:
 *
 *  - **dois cubos 3D** girando, cada um com seis nomes do pote nas faces: o da
 *    esquerda com o primeiro nome de cada dupla, o da direita com o segundo;
 *  - **o pote correndo nas laterais**, em duas colunas de velocidades
 *    diferentes, para a tela dizer "ainda tem gente aqui dentro";
 *  - **a sombra respondendo ao quique** (achata no impulso, espalha na queda),
 *    que é o que faz o cubo parecer ter peso em vez de flutuar.
 *
 * Quando trava, os cubos param de frente e o resultado aparece na face da
 * frente — a animação não decide nada, só esconde a informação pelo tempo do
 * show. O resultado já veio do servidor quando o rolamento começou.
 */
@Component({
  selector: 'og-sorteio-loader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.retrato]': 'portrait()' },
  template: `
    <div class="og-ld">
      <!-- Coluna esquerda: o pote correndo. Duplicada para o laço não ter emenda. -->
      <div class="og-ld-reel og-ld-reel-esq" aria-hidden="true">
        <div class="og-ld-reel-fita" [class.correndo]="!landed()">
          @for (label of reelLoop(); track $index) {
            <span>{{ label }}</span>
          }
        </div>
      </div>

      <div class="og-ld-centro">
        <div class="og-ld-dados">
          @for (die of dice(); track $index) {
            <div class="og-ld-die">
              <div class="og-ld-hop" [class.quicando]="!landed()">
                <div class="og-ld-palco">
                  <div class="og-ld-cubo" [class.girando]="!landed()" [class.travado]="landed()">
                    @for (face of die.faces; track $index) {
                      <div class="og-ld-face" [class]="'f' + $index">
                        <span>{{ face }}</span>
                      </div>
                    }
                  </div>
                </div>
              </div>
              <div class="og-ld-sombra" [class.quicando]="!landed()"></div>
            </div>
          }
        </div>

        <div class="og-ld-texto">
          <h2 [class.tremendo]="!landed()">
            {{ landed() ? resultLabel() : 'Quem sai do pote?' }}
          </h2>
          <p>{{ landed() ? resultDestination() : subtitle() }}</p>
        </div>
      </div>

      <div class="og-ld-reel og-ld-reel-dir" aria-hidden="true">
        <div class="og-ld-reel-fita rapida" [class.correndo]="!landed()">
          @for (label of reelLoopReverse(); track $index) {
            <span>{{ label }}</span>
          }
        </div>
      </div>

      <div class="og-ld-barra"><div [style.width.%]="progress() * 100"></div></div>
      <span class="og-ld-conta">{{ poolLabels().length }} duplas no pote</span>
    </div>
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
    }
    .og-ld {
      position: relative;
      display: grid;
      grid-template-columns: 300px minmax(0, 1fr) 300px;
      align-items: center;
      gap: 40px;
      height: 100%;
      /* Faixa reservada em cima pro contador e embaixo pra barra: as colunas do
         pote ocupam a altura toda e passariam por baixo dos dois. */
      padding: 40px 0 28px;
      box-sizing: border-box;
    }

    /* ── As colunas do pote ─────────────────────────────────────
       A fita tem a lista DUPLICADA e anda -50%: no fim do ciclo ela está
       exatamente sobre a cópia, então o laço não tem emenda visível. */
    .og-ld-reel {
      overflow: hidden;
      height: 100%;
      /* Some nas bordas em vez de cortar seco na metade de um nome. */
      mask-image: linear-gradient(
        180deg,
        transparent,
        #000 18%,
        #000 82%,
        transparent
      );
    }
    .og-ld-reel-fita {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .og-ld-reel-fita.correndo {
      animation: og-ld-reel 1.9s linear infinite;
    }
    .og-ld-reel-fita.rapida.correndo {
      animation-duration: 0.95s;
    }
    .og-ld-reel span {
      display: block;
      padding: 12px 18px;
      border-radius: 12px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 22px;
      color: var(--nx-text-mute);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* ── Os dados ───────────────────────────────────────────────── */
    .og-ld-centro {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 44px;
      min-width: 0;
    }
    .og-ld-dados {
      display: flex;
      align-items: flex-end;
      gap: 58px;
      /* A perspectiva mora no pai dos cubos: é ela que dá profundidade ao giro. */
      perspective: 1100px;
    }
    .og-ld-die {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .og-ld-hop {
      transform-style: preserve-3d;
    }
    .og-ld-hop.quicando {
      animation: og-ld-hop 1.7s cubic-bezier(0.35, 0, 0.5, 1) infinite;
    }
    .og-ld-palco {
      width: 230px;
      height: 230px;
      transform-style: preserve-3d;
    }
    .og-ld-cubo {
      position: relative;
      width: 100%;
      height: 100%;
      transform-style: preserve-3d;
      transform: rotateX(-20deg);
    }
    .og-ld-cubo.girando {
      animation: og-ld-tumble 1.25s linear infinite;
    }
    .og-ld-cubo.travado {
      animation: og-ld-tumble-land 1.1s cubic-bezier(0.2, 1.4, 0.4, 1) both;
    }
    .og-ld-face {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 10px;
      box-sizing: border-box;
      border-radius: 30px;
      background: var(--nx-surface-0);
      border: 2px solid var(--nx-line-strong);
      /* Sombra interna: sem ela a face fica um retângulo chapado e o cubo
         perde volume no giro. */
      box-shadow: inset 0 0 40px rgb(0 0 0 / 45%);
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 46px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      text-align: center;
      overflow-wrap: anywhere;
      /* Sem isto, a face de trás vaza por cima da da frente no meio do giro. */
      backface-visibility: hidden;
    }
    /* Cubo de 230px: cada face empurrada metade disso para fora do centro. */
    .og-ld-face.f0 {
      transform: rotateY(0deg) translateZ(115px);
    }

    .og-ld-face.f1 {
      transform: rotateY(90deg) translateZ(115px);
    }
    .og-ld-face.f2 {
      transform: rotateY(180deg) translateZ(115px);
    }
    .og-ld-face.f3 {
      transform: rotateY(-90deg) translateZ(115px);
    }
    .og-ld-face.f4 {
      transform: rotateX(90deg) translateZ(115px);
    }
    .og-ld-face.f5 {
      transform: rotateX(-90deg) translateZ(115px);
    }
    /* Laranja só na travada: no giro todas as faces são iguais — o destaque
       aparece junto com o resultado, não vaza o mistério no meio do tumble.
       Texto escuro sobre o laranja dá 6,9:1; branco daria 2,6:1. */
    .og-ld-cubo.travado .og-ld-face.f0 {
      background: var(--nx-orange-500);
      border-color: var(--nx-orange-600);
      color: var(--nx-text-on-orange);
    }
    .og-ld-sombra {
      width: 196px;
      height: 16px;
      margin-top: 26px;
      border-radius: 50%;
      background: radial-gradient(ellipse at center, rgb(0 0 0 / 75%), transparent 70%);
      opacity: 0.5;
    }
    .og-ld-sombra.quicando {
      animation: og-ld-squish 1.7s cubic-bezier(0.35, 0, 0.5, 1) infinite;
    }

    /* ── Texto e rodapé ─────────────────────────────────────────── */
    .og-ld-texto {
      text-align: center;
    }
    .og-ld-texto h2 {
      margin: 0;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 64px;
      letter-spacing: -0.03em;
      line-height: 1.05;
      color: var(--nx-text);
    }
    .og-ld-texto h2.tremendo {
      animation: og-ld-tick 0.22s linear infinite;
    }
    .og-ld-texto p {
      margin: 14px 0 0;
      font-family: var(--nx-font-mono);
      font-size: 18px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-ld-barra {
      position: absolute;
      inset: auto 0 0;
      height: 5px;
      border-radius: 3px;
      background: var(--nx-surface-2);
      overflow: hidden;
    }
    .og-ld-barra div {
      height: 100%;
      background: var(--nx-orange-500);
    }
    .og-ld-conta {
      position: absolute;
      top: 0;
      right: 0;
      font-family: var(--nx-font-mono);
      font-size: 14px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    @keyframes og-ld-tumble {
      0% {
        transform: rotateX(-20deg) rotateY(0) rotateZ(0);
      }
      100% {
        transform: rotateX(340deg) rotateY(720deg) rotateZ(180deg);
      }
    }
    @keyframes og-ld-tumble-land {
      0% {
        transform: rotateX(340deg) rotateY(720deg) rotateZ(180deg);
      }
      70% {
        transform: rotateX(378deg) rotateY(742deg) rotateZ(368deg);
      }
      100% {
        transform: rotateX(360deg) rotateY(720deg) rotateZ(360deg);
      }
    }
    @keyframes og-ld-hop {
      0%,
      100% {
        transform: translateY(0) scale(1, 1);
      }
      18% {
        transform: translateY(-58px) scale(0.94, 1.08);
      }
      36% {
        transform: translateY(0) scale(1.1, 0.9);
      }
      54% {
        transform: translateY(-26px) scale(0.97, 1.04);
      }
      72% {
        transform: translateY(0) scale(1.06, 0.94);
      }
      86% {
        transform: translateY(-8px) scale(1, 1);
      }
    }
    @keyframes og-ld-squish {
      0%,
      100% {
        transform: scaleX(1);
        opacity: 0.5;
      }
      18% {
        transform: scaleX(0.6);
        opacity: 0.18;
      }
      36% {
        transform: scaleX(1.18);
        opacity: 0.6;
      }
      54% {
        transform: scaleX(0.8);
        opacity: 0.3;
      }
      72% {
        transform: scaleX(1.1);
        opacity: 0.55;
      }
    }
    @keyframes og-ld-reel {
      0% {
        transform: translateY(0);
      }
      100% {
        transform: translateY(-50%);
      }
    }
    @keyframes og-ld-tick {
      0%,
      100% {
        transform: translateX(0);
      }
      25% {
        transform: translateX(-3px);
      }
      75% {
        transform: translateX(3px);
      }
    }

    /* ── Canvas em pé ──────────────────────────────────────────────
       Sem as colunas do pote: em 1080px de largura elas roubariam espaço dos
       dados, que são o assunto. O contador continua dizendo quantas faltam. */
    :host(.retrato) .og-ld {
      grid-template-columns: minmax(0, 1fr);
      padding-top: 56px;
    }
    :host(.retrato) .og-ld-reel {
      display: none;
    }
    :host(.retrato) .og-ld-centro {
      gap: 64px;
    }
    :host(.retrato) .og-ld-texto h2 {
      font-size: 76px;
    }
    :host(.retrato) .og-ld-texto p {
      font-size: 22px;
    }
    :host(.retrato) .og-ld-conta {
      font-size: 18px;
    }

    /* O suspense é o conteúdo, mas o movimento é enfeite: sem ele a tela ainda
       diz o que está acontecendo pelo título e pela barra de progresso. */
    @media (prefers-reduced-motion: reduce) {
      .og-ld-cubo.girando,
      .og-ld-cubo.travado,
      .og-ld-hop.quicando,
      .og-ld-sombra.quicando,
      .og-ld-reel-fita.correndo,
      .og-ld-texto h2.tremendo {
        animation: none;
      }
    }
  `,
})
export class SorteioLoaderComponent {
  /** Rótulos das duplas ainda no pote — alimentam as faces e as colunas. */
  readonly poolLabels = input.required<string[]>();
  /** Nomes da dupla sorteada, mostrados na face da frente quando trava. */
  readonly resultNames = input<string[]>([]);
  readonly resultLabel = input('');
  readonly resultDestination = input('');
  readonly landed = input(false);
  /** 0 a 1 — barra de progresso do rolamento. */
  readonly progress = input(0);
  /**
   * Canvas em pé. As colunas do pote saem: em 1080px de largura elas roubariam
   * espaço dos dados, que são o assunto. O protótipo vertical faz o mesmo.
   */
  readonly portrait = input(false);

  protected readonly subtitle = computed(() => 'o grupo sai em instantes');

  /**
   * Seis faces por cubo: o da esquerda leva o primeiro nome de cada dupla, o da
   * direita o segundo. Com menos de seis duplas no pote os nomes repetem — um
   * cubo com faces vazias parece defeito.
   */
  protected readonly dice = computed(() => {
    const pairs = this.poolLabels().map(splitPair);
    const result = this.resultNames();

    return [0, 1].map((side) => {
      const names = pairs.map((p) => p[side] ?? '').filter((n) => n.length > 0);
      const faces = Array.from({ length: 6 }, (_, i) =>
        names.length > 0 ? names[i % names.length]! : '—',
      );
      // A face 0 é onde o cubo para: ela carrega o resultado.
      if (this.landed() && result[side]) faces[0] = firstNameOf(result[side]!);
      return { faces };
    });
  });

  /** Lista duplicada: o laço de -50% só é contínuo com a cópia logo abaixo. */
  protected readonly reelLoop = computed(() => {
    const labels = this.poolLabels();
    return labels.length > 0 ? [...labels, ...labels] : [];
  });

  /** Coluna da direita corre ao contrário, para as duas não parecerem uma só. */
  protected readonly reelLoopReverse = computed(() => {
    const labels = [...this.poolLabels()].reverse();
    return labels.length > 0 ? [...labels, ...labels] : [];
  });
}

/** "Ana Souza / Bia Lima" → ["Ana", "Bia"]. */
function splitPair(label: string): [string, string] {
  const [a = '', b = ''] = label.split('/');
  return [firstNameOf(a), firstNameOf(b)];
}

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}
