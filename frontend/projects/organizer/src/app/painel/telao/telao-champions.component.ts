import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, input } from '@angular/core';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgIconComponent } from '../ui/icon.component';
import type { TelaoTeamDisplay } from './telao-data.service';
import { CHAMPIONS_SHOWCASE_MS, type FinalKind } from './telao-final-mode';

/** Tela de campeões da final (90 s): sobrepõe o modo GRANDE FINAL com troféu, nome completo
 *  da dupla, placar dos sets e chuva de confete. Bronze na disputa de 3º lugar. */
@Component({
  selector: 'og-telao-champions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgAvatarComponent, OgIconComponent],
  host: { class: 'og-tch', '[class.bronze]': 'kind() === "third-place"' },
  template: `
    <div class="og-tch-inner">
      <span class="og-tch-trophy"><og-icon name="trophy" [size]="52" [strokeWidth]="1.8" /></span>
      <h1 class="og-tch-title">{{ kind() === 'third-place' ? '3º LUGAR' : 'CAMPEÕES' }}</h1>
      <span class="og-tch-avatars">
        @for (p of team()?.players ?? []; track $index) {
          <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="420" />
        }
      </span>
      <p class="og-tch-names">{{ team()?.label ?? '—' }}</p>
      @if (setsLabel()) {
        <p class="og-tch-score">{{ setsLabel() }}</p>
      }
      <p class="og-tch-event">{{ eventLine() }}</p>
    </div>
    <footer class="og-tch-foot">
      Compartilhe nos stories · <strong>{{ hashtag() }}</strong> · &#64;nexago.app
    </footer>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      z-index: 5;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(6, 5, 4, 0.93);
      backdrop-filter: blur(10px);
      animation: og-tch-in 520ms var(--nx-ease-out);
      --tch-a: #f4c543;
      --tch-b: #ffe89a;
      --tch-glow: rgba(244, 197, 67, 0.3);
    }
    :host(.bronze) {
      --tch-a: #c87f4a;
      --tch-b: #e9b98d;
      --tch-glow: rgba(200, 127, 74, 0.3);
    }
    .og-tch-inner {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 18px;
      text-align: center;
      animation: og-tch-rise 640ms var(--nx-ease-out) 120ms both;
    }
    .og-tch-trophy {
      width: 104px;
      height: 104px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--tch-a);
      border: 2px solid var(--tch-a);
      background: rgba(244, 197, 67, 0.06);
      box-shadow: 0 0 60px var(--tch-glow);
    }
    .og-tch-title {
      margin: 0;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 148px;
      line-height: 0.95;
      letter-spacing: -0.02em;
      background: linear-gradient(180deg, var(--tch-b) 0%, var(--tch-a) 55%, #a97a1e 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      filter: drop-shadow(0 0 46px var(--tch-glow));
    }
    .og-tch-avatars {
      display: inline-flex;
      margin-top: 4px;
    }
    .og-tch-avatars og-avatar {
      border: 3px solid rgba(244, 197, 67, 0.5);
    }
    .og-tch-avatars og-avatar + og-avatar {
      margin-left: -20px;
    }
    .og-tch-names {
      margin: 0;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 46px;
      line-height: 1.1;
    }
    .og-tch-score {
      margin: 0;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 24px;
      letter-spacing: 0.18em;
      color: var(--tch-a);
    }
    .og-tch-event {
      margin: 0;
      font-family: var(--nx-font-mono);
      font-size: 15px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-tch-foot {
      position: absolute;
      bottom: 42px;
      font-family: var(--nx-font-mono);
      font-size: 15px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--nx-text-mute);
    }
    .og-tch-foot strong {
      color: var(--tch-a);
    }
    @keyframes og-tch-in {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    @keyframes og-tch-rise {
      from {
        opacity: 0;
        transform: translateY(26px) scale(0.94);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      :host,
      .og-tch-inner {
        animation: none;
      }
    }
  `,
})
export class TelaoChampionsComponent {
  readonly kind = input.required<FinalKind>();
  readonly team = input<TelaoTeamDisplay | null>(null);
  /** "21-15 · 21-18" — sets da partida decisiva. */
  readonly setsLabel = input('');
  /** "Liga Municipal de Beach Tennis · Open Misto". */
  readonly eventLine = input('');
  readonly hashtag = input('#GrandeFinalNexaGO');

  constructor() {
    // Chuva de confete durante a vitrine: burst dos dois cantos + queda contínua do topo.
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    effect((onCleanup) => {
      if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const gold = this.kind() === 'third-place' ? ['#C87F4A', '#E9B98D', '#FF6A1A', '#FFFFFF'] : ['#F4C543', '#FFE89A', '#FF6A1A', '#FFFFFF'];
      let cancelled = false;
      let canvas: HTMLCanvasElement | null = null;
      let drizzle: ReturnType<typeof setInterval> | null = null;
      const timers: ReturnType<typeof setTimeout>[] = [];
      void import('canvas-confetti').then(({ default: confetti }) => {
        if (cancelled) return;
        canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:6';
        host.appendChild(canvas);
        const shoot = confetti.create(canvas, { resize: true });
        const cannons = () => {
          // Ângulo mais alto e leque largo pra o confete varrer a tela toda em vez de
          // formar um bolo no canto (a TV é 1920 de largura).
          void shoot({ particleCount: 120, spread: 115, startVelocity: 78, angle: 72, origin: { x: 0.06, y: 1 }, scalar: 1.2, colors: gold, disableForReducedMotion: true });
          void shoot({ particleCount: 120, spread: 115, startVelocity: 78, angle: 108, origin: { x: 0.94, y: 1 }, scalar: 1.2, colors: gold, disableForReducedMotion: true });
        };
        cannons();
        timers.push(setTimeout(cannons, 900));
        timers.push(setTimeout(cannons, 1900));
        drizzle = setInterval(() => {
          void shoot({
            particleCount: 14,
            startVelocity: 0,
            gravity: 0.5,
            ticks: 320,
            spread: 120,
            scalar: 1.1,
            origin: { x: Math.random(), y: -0.1 },
            colors: gold,
            disableForReducedMotion: true,
          });
        }, 220);
        timers.push(setTimeout(() => drizzle && clearInterval(drizzle), CHAMPIONS_SHOWCASE_MS - 4000));
      });
      onCleanup(() => {
        cancelled = true;
        if (drizzle) clearInterval(drizzle);
        for (const t of timers) clearTimeout(t);
        canvas?.remove();
      });
    });
  }
}
