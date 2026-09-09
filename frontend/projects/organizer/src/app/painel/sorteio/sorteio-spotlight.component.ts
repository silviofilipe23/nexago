import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { seedRivalPhrase, winRateOf } from '../data/draw-session-selectors';
import type { DrawSessionEntrant, DrawSessionReveal } from '../data/draw-session.model';

/**
 * O momento full na tela: a dupla sorteada toma o telão inteiro.
 *
 * Entrada em cascata escalonada (~1,7s pra assentar), depois leitura com só
 * os avatares flutuando. A hierarquia é deliberada: nomes em escala de pôster
 * primeiro, destino em seguida, estatística como legenda, frase por último.
 *
 * Cinco estatísticas, não quinze — nível, aproveitamento, cartel, títulos e os
 * últimos cinco resultados. Todas vêm do snapshot congelado na sessão; nenhuma
 * leitura extra, que é o que mantém o telão público barato.
 */
@Component({
  selector: 'og-sorteio-spotlight',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.retrato]': 'portrait()' },
  template: `
    @let e = entrant();
    <div class="og-spot">
      <div class="og-spot-glow"></div>
      <div class="og-spot-confetti" aria-hidden="true">
        @for (piece of confetti; track $index) {
          <i
            class="og-spot-confetti-piece"
            [style.--og-cx]="piece.x"
            [style.--og-crot]="piece.rot"
            [style.--og-cdelay]="piece.delay"
            [style.--og-csize]="piece.size"
            [style.background]="piece.color"
          ></i>
        }
      </div>
      <div class="og-spot-bar"><div class="og-spot-bar-fill" [style.width.%]="progress() * 100"></div></div>

      <div class="og-spot-head">
        <span class="og-spot-live">
          <i class="og-spot-live-dot"></i>
          AO VIVO
        </span>
        <!-- <span class="og-spot-kicker">{{ kicker() }}</span> -->
      </div>

      <div class="og-spot-body">
        <div class="og-spot-names">
          @if (pairPhotos().length > 0) {
            <div class="og-spot-pair" aria-hidden="true">
              @for (photo of pairPhotos(); track reveal().index + '-' + $index) {
                <div class="og-spot-avatar" [class.is-right]="$index === 1">
                  <span class="og-spot-ring"></span>
                  <div
                    class="og-spot-photo"
                    [style.background-image]="photo ? 'url(' + photo + ')' : null"
                  >
                    @if (!photo) {
                      <span>{{ initialOf($index) }}</span>
                    }
                  </div>
                </div>
              }
            </div>
          }
          @for (name of displayNames(); track name; let i = $index) {
            <div class="og-spot-name-mask" [style.--og-name-delay]="(0.34 + i * 0.12) + 's'">
              <div class="og-spot-name">{{ name }}</div>
            </div>
          }
          <div class="og-spot-meta og-spot-cascade" style="--og-cascade-delay: 0.62s">
            @if (e.city) {
              <span class="og-spot-city">{{ e.city }}</span>
              <span class="og-spot-dot"></span>
            }
            <span>{{ e.levelLabel || 'Nível não informado' }}</span>
          </div>
        </div>

        <div class="og-spot-side">
          <div class="og-spot-dest-row">
            <span class="og-spot-dest-prefix og-spot-cascade" style="--og-cascade-delay: 0.42s"
              >{{ destPrefix() }}</span
            >
            <span class="og-spot-dest">{{ destinationLabel() }}</span>
          </div>

          <div class="og-spot-stats og-spot-cascade" style="--og-cascade-delay: 0.86s">
            @for (stat of stats(); track stat.label) {
              <div class="og-spot-stat">
                <span class="og-spot-stat-label">{{ stat.label }}</span>
                <span class="og-spot-stat-value">{{ stat.value }}</span>
              </div>
            }
          </div>

          @if (e.stats.last5.length > 0) {
            <div class="og-spot-last5 og-spot-cascade" style="--og-cascade-delay: 1s">
              <span class="og-spot-stat-label">Últimos jogos</span>
              <div class="og-spot-last5-row">
                @for (r of e.stats.last5; track $index) {
                  <span class="og-spot-chip" [class.win]="r === 'V'">{{ r }}</span>
                }
              </div>
            </div>
          }

          @if (consequence()) {
            <div class="og-spot-consequence og-spot-cascade" style="--og-cascade-delay: 1.12s">
              {{ consequence() }}
            </div>
          }
        </div>
      </div>

      @if (reveal().phrase; as phrase) {
        <div class="og-spot-phrase og-spot-cascade" style="--og-cascade-delay: 1.24s">
          {{ phrase.text }}
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      position: absolute;
      inset: 0;
      background: var(--nx-bg);
      overflow: hidden;
    }
    .og-spot {
      position: relative;
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 48px 72px 44px;
      box-sizing: border-box;
      /* Fade + scale da tela inteira — abre o momento full. */
      animation: og-spot-stage 0.34s ease-out both;
    }
    .og-spot-glow {
      position: absolute;
      inset: 0;
      background: radial-gradient(1100px 620px at 22% 8%, rgb(255 106 26 / 22%), transparent 66%);
      pointer-events: none;
    }

    /* ── Confete ───────────────────────────────────────────────── */
    .og-spot-confetti {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
    }
    .og-spot-confetti-piece {
      position: absolute;
      top: -18px;
      left: calc(var(--og-cx) * 1%);
      width: var(--og-csize);
      height: calc(var(--og-csize) * 0.55);
      border-radius: 2px;
      opacity: 0;
      animation: og-spot-confetti 2.4s ease-in var(--og-cdelay) both;
    }

    .og-spot-bar {
      position: absolute;
      inset: 0 0 auto;
      height: 6px;
      background: var(--nx-surface-2);
    }
    .og-spot-bar-fill {
      height: 100%;
      background: var(--nx-orange-500);
    }
    .og-spot-head {
      position: relative;
      flex: none;
      display: flex;
      align-items: center;
      gap: 18px;
      margin-bottom: 22px;
      animation: og-spot-cascade 0.46s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .og-spot-live {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 8px 14px;
      border-radius: 999px;
      background: rgb(255 70 70 / 14%);
      border: 1px solid rgb(255 70 70 / 40%);
      font-family: var(--nx-font-mono);
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.16em;
      color: #ff6b6b;
    }
    .og-spot-live-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #ff4d4d;
      box-shadow: 0 0 0 0 rgb(255 77 77 / 55%);
      animation: og-spot-live-bounce 0.7s cubic-bezier(0.3, 1.4, 0.4, 1) both, og-spot-live-pulse 1.6s ease-out 0.7s infinite;
    }
    .og-spot-kicker {
      font-family: var(--nx-font-mono);
      font-size: 20px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }
    .og-spot-body {
      position: relative;
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
      gap: 56px;
      align-items: center;
    }
    .og-spot-pair {
      --og-spot-avatar: 264px;
      --og-spot-overlap: 0.26;
      display: flex;
      align-items: center;
      margin-bottom: 26px;
      /* A queda começa acima do quadro — sem isso o overflow do host corta o arco. */
      padding-top: calc(var(--og-spot-avatar) * 0.35);
      margin-top: calc(var(--og-spot-avatar) * -0.35);
    }
    .og-spot-avatar {
      position: relative;
      width: var(--og-spot-avatar);
      height: var(--og-spot-avatar);
      flex: none;
    }
    .og-spot-avatar + .og-spot-avatar {
      margin-left: calc(var(--og-spot-avatar) * var(--og-spot-overlap) * -1);
    }
    .og-spot-photo {
      position: relative;
      z-index: 1;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background-color: var(--nx-surface-2);
      background-size: cover;
      background-position: center;
      border: 3px solid var(--nx-orange-500);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 92px;
      color: var(--nx-text-mute);
      will-change: transform;
      transform-origin: center bottom;
      animation:
        og-spot-drop-l 0.78s cubic-bezier(0.3, 1.25, 0.4, 1) both,
        og-spot-float 3.4s ease-in-out 0.9s infinite;
    }
    .og-spot-avatar.is-right {
      z-index: 2;
    }
    .og-spot-avatar.is-right .og-spot-photo {
      /* Anel de fundo sólido: no overlap de 26% o recorte continua legível. */
      box-shadow: 0 0 0 5px var(--nx-bg);
      animation:
        og-spot-drop-r 0.78s cubic-bezier(0.3, 1.25, 0.4, 1) 0.12s both,
        og-spot-float 3.4s ease-in-out 1.1s infinite;
    }
    .og-spot-ring {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      border: calc(var(--og-spot-avatar) * 0.022) solid var(--nx-orange-500);
      pointer-events: none;
      opacity: 0;
      animation: og-spot-ring 1.5s ease-out 0.2s forwards;
    }
    .og-spot-avatar.is-right .og-spot-ring {
      animation-delay: 0.48s;
    }

    /* Nomes: sobem um por vez de dentro da máscara, com skew. */
    .og-spot-name-mask {
      overflow: hidden;
    }
    .og-spot-name {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 92px;
      line-height: 0.96;
      letter-spacing: -0.04em;
      color: var(--nx-text);
      overflow-wrap: anywhere;
      transform-origin: left bottom;
      animation: og-spot-name-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) var(--og-name-delay, 0.34s) both;
    }
    .og-spot-meta {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-top: 22px;
      font-size: 24px;
      color: var(--nx-text-mute);
    }
    .og-spot-city {
      font-family: var(--nx-font-mono);
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .og-spot-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--nx-text-dim);
    }
    .og-spot-side {
      display: flex;
      flex-direction: column;
      gap: 22px;
      min-width: 0;
    }
    .og-spot-dest-row {
      display: flex;
      align-items: center;
      gap: 18px;
      flex-wrap: wrap;
    }
    .og-spot-dest-prefix {
      font-family: var(--nx-font-mono);
      font-size: 18px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--nx-text-mute);
    }
    /* Selo: estampa em cima da subida dos nomes — pico dramático. */
    .og-spot-dest {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 14px 32px;
      border-radius: 15px;
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 48px;
      letter-spacing: -0.02em;
      line-height: 1;
      white-space: nowrap;
      will-change: transform;
      transform-origin: center center;
      box-shadow:
        0 0 0 1px rgb(255 106 26 / 35%),
        0 12px 40px rgb(255 106 26 / 45%),
        0 0 56px rgb(255 106 26 / 28%);
      animation: og-spot-stamp 0.62s cubic-bezier(0.2, 1.35, 0.35, 1) 0.42s both;
    }

    /* Um único gesto do 0,62s em diante — delays diferentes. */
    .og-spot-cascade {
      animation: og-spot-cascade 0.46s cubic-bezier(0.22, 1, 0.36, 1) var(--og-cascade-delay, 0s) both;
    }

    .og-spot-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .og-spot-stat {
      padding: 12px 14px;
      border-radius: 14px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      min-width: 0;
    }
    .og-spot-stat-label {
      display: block;
      font-family: var(--nx-font-mono);
      font-size: 13px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-spot-stat-value {
      display: block;
      margin-top: 5px;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 27px;
      font-variant-numeric: tabular-nums;
      color: var(--nx-text);
    }
    .og-spot-last5-row {
      display: flex;
      gap: 7px;
      margin-top: 8px;
    }
    .og-spot-chip {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      border-radius: 11px;
      background: var(--nx-surface-2);
      border: 1px solid var(--nx-line-strong);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 18px;
      color: var(--nx-text-mute);
    }
    .og-spot-chip.win {
      background: rgb(43 209 126 / 16%);
      border-color: rgb(43 209 126 / 45%);
      color: var(--nx-win);
    }
    .og-spot-consequence {
      padding: 16px 18px;
      border-radius: 14px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      font-size: 22px;
      line-height: 1.45;
      color: var(--nx-text-mute);
    }
    /* ── Canvas em pé ─────────────────────────────────────────────── */
    :host(.retrato) .og-spot {
      padding: 56px 56px 48px;
    }
    :host(.retrato) .og-spot-body {
      grid-template-columns: minmax(0, 1fr);
      gap: 40px;
      align-content: center;
    }
    :host(.retrato) .og-spot-name {
      font-size: 104px;
    }
    :host(.retrato) .og-spot-photo {
      width: 150px;
      height: 150px;
    }
    :host(.retrato) .og-spot-dest {
      font-size: 60px;
    }
    :host(.retrato) .og-spot-phrase {
      font-size: 34px;
    }

    .og-spot-phrase {
      position: relative;
      flex: none;
      margin-top: 22px;
      padding: 20px 26px;
      border-radius: 18px;
      background: var(--nx-orange-tint);
      border: 1px solid rgb(255 106 26 / 35%);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 30px;
      line-height: 1.3;
      color: var(--nx-text);
      overflow: hidden;
    }
    /* Brilho passando por dentro da faixa de zoeira. */
    .og-spot-phrase::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(
        105deg,
        transparent 35%,
        rgb(255 255 255 / 28%) 50%,
        transparent 65%
      );
      transform: translateX(-120%);
      animation: og-spot-sweep 1.5s ease-in-out 1.55s both;
      pointer-events: none;
    }

    @keyframes og-spot-stage {
      from {
        opacity: 0;
        transform: scale(1.04);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
    @keyframes og-spot-drop-l {
      0% {
        transform: translateY(-130%) scale(0.7) rotate(-24deg);
      }
      55% {
        transform: translateY(6%) scale(1.06) rotate(6deg);
      }
      75% {
        transform: translateY(-4%) scale(0.98) rotate(-1deg);
      }
      100% {
        transform: translateY(0) scale(1) rotate(0deg);
      }
    }
    @keyframes og-spot-drop-r {
      0% {
        transform: translateY(-130%) scale(0.7) rotate(24deg);
      }
      55% {
        transform: translateY(6%) scale(1.06) rotate(-6deg);
      }
      75% {
        transform: translateY(-4%) scale(0.98) rotate(1deg);
      }
      100% {
        transform: translateY(0) scale(1) rotate(0deg);
      }
    }
    @keyframes og-spot-ring {
      0% {
        transform: scale(0.5);
        opacity: 0.55;
      }
      100% {
        transform: scale(1.9);
        opacity: 0;
      }
    }
    @keyframes og-spot-float {
      0%,
      100% {
        transform: translateY(0) rotate(-1.2deg);
      }
      50% {
        transform: translateY(-9px) rotate(1.2deg);
      }
    }
    @keyframes og-spot-name-rise {
      from {
        transform: translateY(110%) skewY(4deg);
        opacity: 0;
      }
      to {
        transform: translateY(0) skewY(0);
        opacity: 1;
      }
    }
    @keyframes og-spot-stamp {
      0% {
        transform: scale(2.4) rotate(-9deg);
        opacity: 0;
      }
      55% {
        transform: scale(0.9) rotate(-3deg);
        opacity: 1;
      }
      78% {
        transform: scale(1.08) rotate(-2deg);
      }
      100% {
        transform: scale(1) rotate(-1.5deg);
      }
    }
    @keyframes og-spot-cascade {
      from {
        transform: translateY(22px) scale(0.94);
        opacity: 0;
      }
      to {
        transform: translateY(0) scale(1);
        opacity: 1;
      }
    }
    @keyframes og-spot-sweep {
      from {
        transform: translateX(-120%);
      }
      to {
        transform: translateX(120%);
      }
    }
    @keyframes og-spot-confetti {
      0% {
        transform: translateY(0) rotate(0deg);
        opacity: 0;
      }
      12% {
        opacity: 1;
      }
      100% {
        transform: translateY(110vh) rotate(var(--og-crot));
        opacity: 0;
      }
    }
    @keyframes og-spot-live-bounce {
      0% {
        transform: scale(0) translateY(-18px);
        opacity: 0;
      }
      60% {
        transform: scale(1.25) translateY(2px);
        opacity: 1;
      }
      100% {
        transform: scale(1) translateY(0);
        opacity: 1;
      }
    }
    @keyframes og-spot-live-pulse {
      0% {
        box-shadow: 0 0 0 0 rgb(255 77 77 / 55%);
      }
      70%,
      100% {
        box-shadow: 0 0 0 12px rgb(255 77 77 / 0%);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .og-spot,
      .og-spot-photo,
      .og-spot-avatar.is-right .og-spot-photo,
      .og-spot-ring,
      .og-spot-name,
      .og-spot-dest,
      .og-spot-cascade,
      .og-spot-head,
      .og-spot-confetti-piece,
      .og-spot-live-dot,
      .og-spot-phrase::after {
        animation: none;
      }
      .og-spot-dest {
        transform: rotate(-1.5deg);
      }
      .og-spot-confetti {
        display: none;
      }
    }
  `,
})
export class SorteioSpotlightComponent {
  readonly entrant = input.required<DrawSessionEntrant>();
  readonly reveal = input.required<DrawSessionReveal>();
  readonly destinationLabel = input.required<string>();
  /** Ordem atual da chave — resolve "cabeça N" → nome da equipe quando já saiu. */
  readonly seedOrder = input<ReadonlyArray<DrawSessionEntrant | null>>([]);
  /** 0 a 1 — move a barra de tempo do telão. */
  readonly progress = input(0);
  /** Canvas em pé: nomes e ficha empilhados em vez de lado a lado. */
  readonly portrait = input(false);

  /**
   * Peças de confete fixas — sem Math.random no template, senão a animação
   * reinicia a cada CD. Atrasos de 0 a 0,9s conforme o spec.
   */
  protected readonly confetti = [
    { x: 8, delay: '0s', size: '10px', rot: '220deg', color: 'var(--nx-orange-500)' },
    { x: 18, delay: '0.12s', size: '8px', rot: '-160deg', color: '#ffd166' },
    { x: 28, delay: '0.28s', size: '12px', rot: '280deg', color: '#fff' },
    { x: 40, delay: '0.05s', size: '9px', rot: '-200deg', color: 'var(--nx-orange-600)' },
    { x: 52, delay: '0.42s', size: '11px', rot: '150deg', color: '#ff6b6b' },
    { x: 61, delay: '0.18s', size: '7px', rot: '-90deg', color: '#ffd166' },
    { x: 70, delay: '0.55s', size: '10px', rot: '310deg', color: 'var(--nx-orange-500)' },
    { x: 78, delay: '0.33s', size: '8px', rot: '-240deg', color: '#fff' },
    { x: 86, delay: '0.7s', size: '12px', rot: '180deg', color: '#ff6b6b' },
    { x: 94, delay: '0.9s', size: '9px', rot: '-130deg', color: 'var(--nx-orange-600)' },
    { x: 14, delay: '0.62s', size: '7px', rot: '95deg', color: '#fff' },
    { x: 46, delay: '0.8s', size: '10px', rot: '-175deg', color: '#ffd166' },
  ] as const;

  /** "CAIU NO" / "CAIU NA" conforme o destino (grupo vs posição). */
  protected readonly destPrefix = computed(() =>
    this.destinationLabel().startsWith('POSIÇÃO') ? 'CAIU NA' : 'CAIU NO',
  );

  protected readonly kicker = computed(() => {
    const e = this.entrant();
    if (e.lockedSeed != null) return `Cabeça de chave ${e.lockedSeed}`;
    return e.potIndex === 1 ? 'Pote 1 · cabeça de chave' : `Pote ${e.potIndex} · acabou de sair`;
  });

  /** Nomes dos atletas quando existem; senão o rótulo da equipe. */
  protected readonly displayNames = computed(() => {
    const e = this.entrant();
    return e.playerNames.length > 0 ? e.playerNames : [e.label];
  });

  protected readonly stats = computed(() => {
    const e = this.entrant();
    const rate = winRateOf(e);
    return [
      { label: 'pontos', value: e.points == null ? '—' : String(e.points) },
      { label: 'aprov.', value: rate == null ? '—' : `${rate}%` },
      { label: 'cartel', value: `${e.stats.wins}–${e.stats.losses}` },
      { label: 'títulos', value: String(e.stats.titles) },
    ];
  });

  /** Até 2 fotos — o par do telão (queda + anéis + flutuação). */
  protected readonly pairPhotos = computed(() => this.entrant().photoUrls.slice(0, 2));

  /**
   * A "consequência imediata" da dupla eliminatória — o que dá a dramaturgia
   * do formato. Já vem resolvida do servidor: nenhuma tela conhece planta.
   * Quando a cabeça já foi sorteada/travada, cita o nome da equipe.
   */
  protected readonly consequence = computed(() => {
    const placement = this.reveal().dePlacement;
    if (!placement) return null;
    const rival = (seed: number) => seedRivalPhrase(this.seedOrder(), seed);

    if (placement.hasBye) return 'Entra direto na segunda rodada — tem bye.';
    if (placement.opponentSeed != null) return `Estreia contra ${rival(placement.opponentSeed)}.`;
    if (placement.opponentFromMatch != null) {
      return `Estreia contra o vencedor do jogo ${placement.opponentFromMatch}.`;
    }
    return null;
  });

  protected initialOf(index: number): string {
    const names = this.entrant().playerNames;
    return (names[index] ?? this.entrant().label).trim().charAt(0).toUpperCase() || '?';
  }
}
