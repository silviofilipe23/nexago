import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { LANCE_SOM_PLAYER, type LanceSom } from '../../publico/overlay/overlay-lances.component';

/** Um som da torcida: arquivo em `public/sons/torcida` e a duração (pra barra e pra soltar o botão). */
interface SomTorcida {
  id: string;
  nome: string;
  src: string;
  seg: number;
}

const SONS: readonly SomTorcida[] = [
  { id: 'rally', nome: 'What a Rally', src: '/sons/torcida/what-a-rally.mp3', seg: 46.3 },
  { id: 'set', nome: 'Set / Match point', src: '/sons/torcida/set-match-point.mp3', seg: 24.9 },
  { id: 'clap', nome: 'Clap your hands', src: '/sons/torcida/clap-your-hands.mp3', seg: 17.9 },
];

/** Sons pra animar a torcida, abaixo da mesa de Lances. Tocam AQUI, no computador do painel (que vai
 *  pro som da arena) — não passam pelo overlay nem pelo telão e não gravam nada. Um toque toca do
 *  começo, outro toque para; tocar um corta o que estiver tocando. */
@Component({
  selector: 'og-tx-torcida',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="og-tc">
      <div class="og-tc-label">Torcida</div>
      <div class="og-tc-sons" role="group" aria-label="Sons da torcida">
        @for (s of sons; track s.id) {
          <button
            type="button"
            class="og-tc-som"
            [class.on]="tocando()?.id === s.id"
            [attr.aria-pressed]="tocando()?.id === s.id"
            (click)="alterna(s)"
          >
            <span class="og-tc-icone" aria-hidden="true">{{ tocando()?.id === s.id ? '■' : '▶' }}</span>
            <b>{{ s.nome }}</b>
            <small>{{ s.seg.toFixed(0) }} s</small>
            @if (tocando()?.id === s.id) {
              <i class="og-tc-pg" [style.animation-duration.s]="s.seg"></i>
            }
          </button>
        }
      </div>
      <p class="og-tc-dica">Só som, no computador deste painel (ligue-o no som da arena). Não aparece na transmissão nem no telão.</p>
    </div>
  `,
  styles: `
    .og-tc {
      margin-top: 18px;
      padding-top: 14px;
      border-top: 1px solid var(--nx-line);
    }
    .og-tc-label {
      margin-bottom: 8px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-tc-sons {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }
    .og-tc-som {
      position: relative;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 2px 10px;
      padding: 10px 12px;
      overflow: hidden;
      border: 1px solid var(--nx-line-strong);
      border-radius: 8px;
      background: linear-gradient(180deg, #1a1a1e, #111114);
      color: var(--nx-text);
      text-align: left;
      cursor: pointer;
      transition: border-color 0.12s;
    }
    .og-tc-som:hover {
      border-color: var(--nx-orange-500);
    }
    .og-tc-som:focus-visible {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 2px;
    }
    .og-tc-som.on {
      border-color: var(--nx-orange-500);
      background: var(--nx-orange-tint, rgba(255, 106, 26, 0.12));
    }
    .og-tc-icone {
      grid-row: span 2;
      width: 28px;
      height: 28px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(--nx-surface-2);
      font-size: 11px;
      color: var(--nx-orange-500);
    }
    .og-tc-som.on .og-tc-icone {
      background: var(--nx-orange-500);
      color: #0a0a0a;
    }
    .og-tc-som b {
      overflow: hidden;
      font: 700 12px/1.2 var(--nx-font-display);
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .og-tc-som small {
      font: 500 10px var(--nx-font-mono);
      color: var(--nx-text-dim);
    }
    .og-tc-pg {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 3px;
      background: var(--nx-orange-500);
      transform-origin: left;
      animation: og-tc-pg linear forwards;
    }
    @keyframes og-tc-pg {
      from {
        transform: scaleX(0);
      }
      to {
        transform: scaleX(1);
      }
    }
    .og-tc-dica {
      margin: 8px 0 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--nx-text-dim);
    }
  `,
})
export class TransmissaoTorcidaComponent {
  protected readonly sons = SONS;
  protected readonly tocando = signal<SomTorcida | null>(null);

  private readonly player = inject(LANCE_SOM_PLAYER);
  /** Um player por som, criado na hora do primeiro toque e reaproveitado depois. */
  private readonly players = new Map<string, LanceSom>();
  private fim: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.para());
  }

  protected alterna(s: SomTorcida): void {
    const era = this.tocando()?.id === s.id;
    this.para();
    if (era) return;
    let p = this.players.get(s.id);
    if (!p) {
      p = this.player(s.src);
      this.players.set(s.id, p);
    }
    p.currentTime = 0;
    p.volume = 1;
    p.play().catch(() => this.tocando.set(null));
    this.tocando.set(s);
    this.fim = setTimeout(() => this.tocando.set(null), s.seg * 1000);
  }

  private para(): void {
    clearTimeout(this.fim);
    const atual = this.tocando();
    if (atual) this.players.get(atual.id)?.pause();
    this.tocando.set(null);
  }
}
