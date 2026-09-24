import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { OgAvatarComponent } from '../../painel/ui/avatar.component';
import type { OverlayKocBlock } from '../overlay/overlay-koc-bar';
import type { OverlayKocView } from '../overlay/overlay-selectors';
import { ledIniciaisDe } from './led-iniciais';

export interface LedPlayer {
  name: string;
  initials: string;
  photoUrl: string | null;
}

export interface LedTeam {
  players: LedPlayer[];
}

/** Piso da tag de sequência e do anel pulsante, na especificação do dono. */
const STREAK_TAG = 2;
const STREAK_RING = 3;

const EASE_OUT = 'cubic-bezier(.22, 1, .36, 1)';
const EASE_ELASTIC = 'cubic-bezier(.34, 1.56, .64, 1)';
const PTS_BUMP_MS = 480;
const PTS_FLASH_MS = 600;
const REI_MS = 640;
const DESAFIANTE_MS = 520;
const FILA_R_MS = 480;

/** Rodada KOTC em painel de LED.
 *
 *  Tela INTEIRA e opaca, pensada pra ser lida de longe: dois blocos gigantes (trono e
 *  desafiante), fila reduzida ao essencial e relógio do tamanho do placar. Não é o overlay do OBS
 *  — ali a tela é transparente e discreta; aqui ela É o conteúdo. */
@Component({
  selector: 'og-led-round',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgAvatarComponent],
  template: `
    @if (view(); as v) {
      <div class="tela">
        <header class="topo">
          <div>
            <h1 class="rodada">
              Rodada <span class="rodada-num">{{ rodada() }}</span
              ><span class="rodada-total">/{{ total() }}</span>
            </h1>
            <div class="contexto">{{ contexto() }}</div>
          </div>

          @if (v.bar.clock; as clock) {
            <div class="relogio" [class.relogio--urgente]="urgente()">{{ clock.label }}</div>
          }
        </header>

        @if (esgotado()) {
          <div class="esgotado">Tempo esgotado</div>
        }

        <div class="blocos">
          @if (trono(); as t) {
            <section
              class="bloco bloco--trono"
              [class.bloco--pulsando]="pulsando()"
            >
              <div class="bloco-topo">
                <span class="papel">Trono</span>
                @if (mostraSeguidas()) {
                  <span class="seguidas">{{ v.bar.streak }} seguidas</span>
                }
              </div>
              <div class="nomes">
                @for (p of atletasDe(t.teamId); track $index) {
                  <span>{{ p.name }}</span>
                }
              </div>
              <div class="rodape">
                <span class="avatares">
                  @for (p of atletasDe(t.teamId); track $index) {
                    <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="128" />
                  }
                </span>
                <span class="pontos">{{ t.points }}</span>
              </div>
            </section>
          }

          @if (desafiante(); as d) {
            <section class="bloco bloco--desafiante">
              <div class="bloco-topo"><span class="papel">Desafiante</span></div>
              <div class="nomes">
                @for (p of atletasDe(d.teamId); track $index) {
                  <span>{{ p.name }}</span>
                }
              </div>
              <div class="rodape">
                <span class="avatares">
                  @for (p of atletasDe(d.teamId); track $index) {
                    <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="128" />
                  }
                </span>
                <span class="pontos">{{ d.points }}</span>
              </div>
            </section>
          }
        </div>

        @if (fila().length > 0) {
          <footer class="fila">
            <span class="fila-titulo">Fila</span>
            @for (f of fila(); track f.teamId; let i = $index) {
              <div
                class="fila-card"
                [class.fila-card--proximo]="f.nextUp"
                [style.animation-delay.ms]="500 + i * 80"
              >
                <span class="fila-avatares">
                  @for (p of atletasDe(f.teamId); track $index) {
                    <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="64" />
                  }
                </span>
                <span class="fila-nome">{{ nomesDe(f.teamId).join(' · ') }}</span>
                <span class="fila-pontos">{{ f.points }}</span>
              </div>
            }
          </footer>
        }
      </div>
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      display: block;
      background: #000;
      color: #fff;
      font-family: var(--nx-font, system-ui, sans-serif);
    }

    /* Coluna flex, não grid de linhas fixas: o aviso de tempo esgotado entra e sai do DOM, e
       com linhas posicionais a sobra de altura ia parar na fila em vez de nos blocos. */
    .tela {
      display: flex;
      flex-direction: column;
      gap: 26px;
      height: 100%;
      padding: 40px 48px 44px;
      box-sizing: border-box;
    }

    .topo {
      flex: none;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 24px;
    }
    .rodada {
      margin: 0;
      font-size: 64px;
      font-weight: 800;
      line-height: 1;
    }
    .rodada-num {
      color: var(--nx-orange-500, #ff6a1a);
    }
    .rodada-total {
      color: var(--nx-orange-500, #ff6a1a);
    }
    .contexto {
      margin-top: 10px;
      color: #9a9a9e;
      font-size: 30px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .relogio {
      font-size: 104px;
      font-weight: 800;
      line-height: 0.9;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.02em;
    }
    /* Último minuto: vermelho piscando a cada segundo. */
    .relogio--urgente {
      color: #ff3b30;
      animation: led-piscar 1s steps(2, end) infinite;
    }
    @keyframes led-piscar {
      50% {
        opacity: 0.35;
      }
    }

    .esgotado {
      flex: none;
      padding: 14px 28px;
      border-radius: 14px;
      background: #ff3b30;
      color: #fff;
      font-size: 40px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      justify-self: start;
    }

    .blocos {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 28px;
      flex: 1;
      min-height: 0;
    }

    .bloco {
      display: grid;
      grid-template-rows: auto 1fr auto;
      padding: 28px 32px 30px;
      border-radius: 22px;
      min-width: 0;
      animation: led-sobe 480ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes led-sobe {
      from {
        opacity: 0;
        transform: translateY(40px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    .bloco--trono {
      background: var(--nx-orange-500, #ff6a1a);
      color: #000;
      animation-delay: 250ms;
    }
    .bloco--desafiante {
      background: #232326;
      color: #fff;
      animation-delay: 370ms;
    }
    /* 3+ defesas seguidas: anel pulsando, visível do fundo do ginásio. */
    .bloco--pulsando {
      animation:
        led-sobe 480ms cubic-bezier(0.22, 1, 0.36, 1) 250ms both,
        led-anel 1.4s ease-in-out 1s infinite;
    }
    @keyframes led-anel {
      0%,
      100% {
        box-shadow: 0 0 0 0 rgba(255, 106, 26, 0);
      }
      50% {
        box-shadow: 0 0 0 14px rgba(255, 106, 26, 0.45);
      }
    }

    .bloco-topo {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .papel {
      font-size: 30px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      opacity: 0.72;
    }
    .seguidas {
      padding: 7px 16px;
      border-radius: 999px;
      background: rgba(0, 0, 0, 0.28);
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .bloco--desafiante .seguidas {
      background: rgba(255, 255, 255, 0.16);
    }

    .nomes {
      display: grid;
      align-content: center;
      font-size: 92px;
      font-weight: 800;
      line-height: 1.02;
      min-width: 0;
    }
    .nomes span {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .rodape {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 20px;
    }
    .avatares {
      display: flex;
      align-items: center;
    }
    .avatares og-avatar + og-avatar {
      margin-left: -24px;
    }
    .bloco--trono .avatares og-avatar {
      background: #000;
      color: var(--nx-orange-500, #ff6a1a);
      border: none;
      box-shadow: 0 0 0 4px var(--nx-orange-500, #ff6a1a);
    }
    .bloco--desafiante .avatares og-avatar {
      background: #2e2e32;
      color: #fff;
      border: 3px solid #46464b;
      box-shadow: 0 0 0 3px #232326;
    }
    .pontos {
      display: inline-block;
      font-size: 168px;
      font-weight: 800;
      line-height: 0.85;
      font-variant-numeric: tabular-nums;
      transform-origin: 100% 50%;
    }

    .fila {
      flex: none;
      display: flex;
      align-items: center;
      gap: 18px;
      min-width: 0;
    }
    .fila-titulo {
      color: #9a9a9e;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .fila-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      flex: 1;
      min-width: 0;
      padding: 16px 22px;
      border: 2px solid transparent;
      border-radius: 14px;
      background: #1a1a1d;
      animation: led-fila 480ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes led-fila {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    .fila-card--proximo {
      border-color: #fff;
      background: #101013;
    }
    .fila-avatares {
      display: flex;
      align-items: center;
      flex: none;
    }
    .fila-avatares og-avatar + og-avatar {
      margin-left: -16px;
    }
    .fila-avatares og-avatar {
      background: #0d0d0d;
      color: #9a9a9e;
      border: 2px solid #3a3a3e;
      box-shadow: 0 0 0 2px #1a1a1d;
    }
    .fila-card--proximo .fila-avatares og-avatar {
      box-shadow: 0 0 0 2px #101013;
      color: #fff;
      border-color: #5a5a60;
    }
    .fila-nome {
      flex: 1;
      min-width: 0;
      font-size: 34px;
      font-weight: 800;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .fila-pontos {
      color: #9a9a9e;
      font-size: 30px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .fila-card--proximo .fila-pontos {
      color: #fff;
    }

    @media (prefers-reduced-motion: reduce) {
      .bloco,
      .bloco--pulsando,
      .fila-card,
      .relogio--urgente {
        animation: none;
      }
    }
  `,
})
export class LedRoundComponent {
  private readonly host = inject(ElementRef);

  readonly view = input<OverlayKocView | null>(null);
  readonly teams = input<ReadonlyMap<string, LedTeam>>(new Map<string, LedTeam>());
  readonly categoryName = input<string | null>(null);
  readonly courtName = input<string | null>(null);
  /** Cronômetro zerado e rodada ainda aberta — a mesa é quem encerra. */
  readonly esgotado = input(false);

  private readonly blocos = computed<OverlayKocBlock[]>(() => this.view()?.bar.blocks ?? []);

  protected readonly trono = computed(() => this.blocos().find((b) => b.role === 'king') ?? null);
  protected readonly desafiante = computed(
    () => this.blocos().find((b) => b.role === 'challenger') ?? null,
  );
  protected readonly fila = computed(() => this.blocos().filter((b) => b.role === 'queue'));

  private readonly streak = computed(() => this.view()?.bar.streak ?? 0);
  protected readonly mostraSeguidas = computed(() => this.streak() >= STREAK_TAG);
  protected readonly pulsando = computed(() => this.streak() >= STREAK_RING);

  /** Só papéis/pontos — o relógio muda a cada tick e não deve re-disparar P/R. */
  private readonly motionKey = computed(() => {
    const v = this.view();
    if (!v) return '';
    return this.blocos()
      .map((b) => `${b.teamId}:${b.role}:${b.points}:${b.nextUp ? 1 : 0}`)
      .join('|');
  });

  private primed = false;
  private lastMotionKey = '';
  private prevKingId: string | null = null;
  private prevKingPts: number | null = null;

  /** "Classificatória · Rodada 3/7" → 3 e 7, pro topo gigante do painel. */
  private readonly numeros = computed(() => {
    const m = /(\d+)\s*\/\s*(\d+)/.exec(this.view()?.roundTitle ?? '');
    if (m) return { rodada: m[1], total: m[2] };
    const so = /(\d+)/.exec(this.view()?.roundTitle ?? '');
    return { rodada: so ? so[1] : '', total: '' };
  });
  protected readonly rodada = computed(() => this.numeros().rodada);
  protected readonly total = computed(() => this.numeros().total);

  protected readonly contexto = computed(() =>
    [this.categoryName(), this.courtName()].filter((p) => !!p).join(' · '),
  );

  /** Um minuto ou menos. O rótulo vem pronto do servidor ("2:05"), então a conta é no texto. */
  protected readonly urgente = computed(() => {
    const label = this.view()?.bar.clock?.label ?? '';
    const [min, seg] = label.split(':').map((n) => Number.parseInt(n, 10));
    if (!Number.isFinite(min) || !Number.isFinite(seg)) return false;
    return min * 60 + seg <= 60;
  });

  constructor() {
    afterRenderEffect(() => {
      const v = this.view();
      const key = this.motionKey();
      if (!v) {
        this.resetMotion();
        return;
      }
      if (key === this.lastMotionKey) return;
      this.lastMotionKey = key;
      this.runMotion();
    });
  }

  protected atletasDe(teamId: string): LedPlayer[] {
    const raw = this.teams().get(teamId)?.players ?? [];
    return raw
      .filter((p) => p.name.trim() !== '')
      .map((p) => ({
        name: p.name,
        initials: p.initials || ledIniciaisDe(p.name),
        photoUrl: p.photoUrl,
      }));
  }

  protected nomesDe(teamId: string): string[] {
    return this.atletasDe(teamId).map((p) => p.name);
  }

  private resetMotion(): void {
    this.primed = false;
    this.lastMotionKey = '';
    this.prevKingId = null;
    this.prevKingPts = null;
  }

  private prefersReducedMotion(): boolean {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Cancela só WAAPI — o anel CSS `led-anel` e a entrada CSS precisam continuar. */
  private cancelWaapi(el: HTMLElement): void {
    for (const a of el.getAnimations()) {
      if (a instanceof CSSAnimation || a instanceof CSSTransition) continue;
      a.cancel();
    }
  }

  private runMotion(): void {
    const root = this.host.nativeElement as HTMLElement;
    const king = this.trono();
    const kingEl = root.querySelector('.bloco--trono') as HTMLElement | null;
    const challEl = root.querySelector('.bloco--desafiante') as HTMLElement | null;
    const ptsEl = kingEl?.querySelector('.pontos') as HTMLElement | null;
    const filaCards = Array.from(root.querySelectorAll('.fila-card')) as HTMLElement[];

    const kingId = king?.teamId ?? null;
    const kingPts = king?.points ?? null;
    const motionOk = this.primed && !this.prefersReducedMotion();

    if (motionOk && kingEl && kingId != null && kingPts != null) {
      const virouRei = this.prevKingId != null && kingId !== this.prevKingId;
      const pontuou =
        !virouRei && this.prevKingId === kingId && this.prevKingPts != null && kingPts !== this.prevKingPts;

      if (pontuou && ptsEl) {
        // P — salto do placar + flash no bloco laranja.
        this.cancelWaapi(ptsEl);
        ptsEl.animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(1.25)', offset: 0.4 },
            { transform: 'scale(1)' },
          ],
          { duration: PTS_BUMP_MS, easing: EASE_ELASTIC },
        );
        this.cancelWaapi(kingEl);
        kingEl.animate([{ filter: 'brightness(1.5)' }, { filter: 'brightness(1)' }], {
          duration: PTS_FLASH_MS,
          easing: EASE_OUT,
        });
      }

      if (virouRei) {
        // R — novo trono vem da direita (lado do desafiante); desafiante sobe; fila entra da esquerda.
        this.cancelWaapi(kingEl);
        kingEl.animate(
          [
            { transform: 'translateX(42%)', filter: 'brightness(1.8)', opacity: 0.7 },
            { transform: 'translateX(0)', filter: 'brightness(1)', opacity: 1 },
          ],
          { duration: REI_MS, easing: EASE_OUT },
        );
        if (challEl) {
          this.cancelWaapi(challEl);
          challEl.animate(
            [
              { opacity: 0, transform: 'translateY(60px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ],
            { duration: DESAFIANTE_MS, delay: 200, easing: EASE_OUT, fill: 'both' },
          );
        }
        filaCards.forEach((card, i) => {
          this.cancelWaapi(card);
          card.animate(
            [
              { opacity: 0, transform: 'translateX(-120px)' },
              { opacity: 1, transform: 'translateX(0)' },
            ],
            { duration: FILA_R_MS, delay: 300 + i * 70, easing: EASE_OUT, fill: 'both' },
          );
        });
      }
    }

    this.prevKingId = kingId;
    this.prevKingPts = kingPts;
    this.primed = true;
  }
}
