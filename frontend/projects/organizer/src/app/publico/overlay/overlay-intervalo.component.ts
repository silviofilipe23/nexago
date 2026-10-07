import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { INTERVALO_BADGE, type BroadcastIntervalo } from '../../painel/data/broadcast-intervalo';
import type { OverlayTeam } from './overlay-live.gateway';
import { intervaloRestanteSeg, type IntervaloGame, type IntervaloView } from './overlay-intervalo';
import { nomeCurtoDe, nomesCurtosDe } from './overlay-nome';
import { OverlayPatroFaixaComponent } from './overlay-patro-faixa.component';
import type { OverlayPatroItem } from './overlay-nx';

/** A cortina cobre a tela em 1 s; o conteúdo troca aos 0,5 s, com tudo coberto. */
const CURTAIN_MS = 1000;
const SWAP_MS = 500;
const SPONSOR_STEP_MS = 3000;
const TICK_MS = 500;

/** Tela de Intervalo (1920×1080, fundo opaco) — momentos sem jogo na transmissão.
 *
 *  Só apresentação: o painel grava textos e contagem; o "A seguir", os 3 jogos seguintes e os
 *  resultados vêm das partidas do torneio (`intervaloViewOf`). Entrar, sair e trocar de modo passam
 *  por uma cortina laranja; edições de texto com o mesmo modo atualizam ao vivo, sem cortina. */
@Component({
  selector: 'og-overlay-intervalo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OverlayPatroFaixaComponent],
  template: `
    @if (shown(); as c) {
      @for (m of [c.mode]; track m) {
        <div class="tela">
          <i class="luz luz--1" aria-hidden="true"></i>
          <i class="luz luz--2" aria-hidden="true"></i>
          <span class="marca iv-up" style="--d: 0.2s">NEXA<b>GO</b></span>

          <section class="esq">
            <div class="linha1 iv-up" style="--d: 0.15s">
              <span class="selo"><b class="shine" aria-hidden="true"></b>{{ badge(c) }}</span>
              @if (eventName()) {
                <span class="evento">{{ eventName() }}</span>
              }
            </div>
            <h1 [style.font-size.px]="tituloPx(c)">
              <span class="t1 iv-up" style="--d: 0.3s">{{ c.line1 }}</span>
              <span class="t2 iv-up" style="--d: 0.42s">{{ c.line2 }}</span>
            </h1>
            <p class="sub iv-up" style="--d: 0.6s">{{ c.subtitle }}</p>
            @if (restante() !== null) {
              <div class="cont iv-up" style="--d: 0.75s">
                <span class="cont-k">Retorno em</span>
                @if (restante() === 0) {
                  <span class="cont-zero">Voltando · <b>Agora</b></span>
                } @else {
                  <span class="cont-t">{{ clock() }}</span>
                }
              </div>
              <div class="barra iv-up" style="--d: 0.75s"><i [style.transform]="'scaleX(' + fracao() + ')'"></i></div>
            }
          </section>

          <section class="dir">
            @if (view()?.next; as n) {
              <article class="seguir iv-up" style="--d: 0.8s">
                <b class="shine2" aria-hidden="true"></b>
                <div class="seg-top">
                  <span class="seg-k">A seguir</span>
                  <span class="seg-ctx">{{ contexto(n) }}</span>
                </div>
                <span class="seg-d">Dupla A</span>
                <div class="seg-nomes">
                  @for (p of jogadores(n.a); track $index) { <span>{{ p }}</span> }
                </div>
                <div class="seg-vs"><i></i><span>vs</span><i></i></div>
                <span class="seg-d">Dupla B</span>
                <div class="seg-nomes">
                  @for (p of jogadores(n.b); track $index) { <span>{{ p }}</span> }
                </div>
                <div class="seg-tags">
                  @if (n.court) { <span class="tag">Quadra <b>{{ n.court }}</b></span> }
                  @if (n.time) { <span class="tag">Início <b>{{ n.time }}</b></span> }
                </div>
              </article>
            }
            @for (g of view()?.following ?? []; track g.matchId; let i = $index) {
              <div class="lin iv-up" [style.--d]="1 + i * 0.1 + 's'">
                <b class="hora">{{ g.time }}</b>
                <div class="lin-t">
                  <span class="lin-n">{{ nome(g.a) }} <i>×</i> {{ nome(g.b) }}</span>
                  <span class="lin-c">{{ contexto(g) }}</span>
                </div>
                @if (g.court) { <span class="lin-q">Quadra {{ g.court }}</span> }
              </div>
            }
          </section>

          @if ((view()?.results ?? []).length > 0) {
            <div class="resultados iv-up" style="--d: 1.1s">
              <span class="res-k">Resultados</span>
              <div class="res-janela">
                <div class="res-trilha" [style.animation-duration.s]="duracaoLetreiro()">
                  @for (copia of [0, 1]; track copia) {
                    @for (r of view()!.results; track r.matchId) {
                      <span class="res">
                        <i class="res-tag">{{ r.tag }}</i>
                        <b>{{ nome(r.winner) }}</b>
                        <em>{{ r.score }}</em>
                        <span>{{ nome(r.loser) }}</span>
                      </span>
                    }
                  }
                </div>
              </div>
            </div>
          }

          @if (logos().length > 0) {
            <div class="patro">
              <span class="patro-k iv-up" style="--d: 1.2s">Oferecimento</span>
              <og-overlay-patro-faixa [itens]="logos()" [delay]="1.2" [highlight]="destaque() % logos().length" style="--h: 100px; --gap: 18px" />
            </div>
          }
        </div>
      }
    }
    @for (k of [curtainKey()]; track k) {
      @if (k > 0) {
        <div class="cortina" aria-hidden="true"></div>
      }
    }
  `,
  styles: `
    :host {
      --o5: var(--nx-orange-500, #ff6a1a);
      --o4: var(--nx-orange-400, #ff8a4a);
      --mono: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      position: absolute;
      inset: 0;
      z-index: 66;
      display: block;
      pointer-events: none;
      font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif);
      color: #fff;
    }
    .tela {
      position: absolute;
      inset: 0;
      overflow: hidden;
      background: #0a0a0b;
    }
    .luz {
      position: absolute;
      border-radius: 50%;
      filter: blur(20px);
    }
    .luz--1 {
      left: -200px;
      top: -260px;
      width: 1000px;
      height: 760px;
      background: radial-gradient(ellipse at center, rgba(255, 106, 26, 0.22), transparent 65%);
      animation: iv-luz1 14s ease-in-out infinite alternate;
    }
    .luz--2 {
      right: -260px;
      bottom: -300px;
      width: 1100px;
      height: 800px;
      background: radial-gradient(ellipse at center, rgba(255, 106, 26, 0.16), transparent 65%);
      animation: iv-luz2 18s ease-in-out infinite alternate;
    }
    @keyframes iv-luz1 {
      to {
        transform: translate(240px, 80px);
      }
    }
    @keyframes iv-luz2 {
      to {
        transform: translate(-260px, -60px);
      }
    }
    /* Entrada: sobe 30 px saindo do transparente e de 6 px de desfoque. */
    .iv-up {
      animation: iv-up 0.75s cubic-bezier(0.22, 1, 0.36, 1) var(--d, 0s) both;
    }
    @keyframes iv-up {
      from {
        opacity: 0;
        transform: translateY(30px);
        filter: blur(6px);
      }
    }
    .marca {
      position: absolute;
      right: 54px;
      top: 34px;
      font-size: 34px;
      font-weight: 800;
    }
    .marca b {
      color: var(--o5);
    }

    .esq {
      position: absolute;
      left: 54px;
      top: 92px;
      width: 1040px;
    }
    .linha1 {
      display: flex;
      align-items: center;
      gap: 20px;
    }
    .selo {
      position: relative;
      overflow: hidden;
      padding: 12px 22px;
      border-radius: 7px;
      background: var(--o5);
      color: #120600;
      font-family: var(--mono);
      font-size: 17px;
      font-weight: 700;
      letter-spacing: 0.26em;
      text-transform: uppercase;
    }
    .shine,
    .shine2 {
      position: absolute;
      inset: 0 auto 0 0;
      width: 38%;
      background: linear-gradient(105deg, transparent, rgba(255, 255, 255, 0.5), transparent);
      transform: translateX(-160%) skewX(-18deg);
      animation: iv-shine 3.2s ease-in-out infinite;
    }
    @keyframes iv-shine {
      0%,
      70% {
        transform: translateX(-160%) skewX(-18deg);
      }
      100% {
        transform: translateX(420%) skewX(-18deg);
      }
    }
    .evento {
      font-family: var(--mono);
      font-size: 17px;
      font-weight: 700;
      letter-spacing: 0.24em;
      text-transform: uppercase;
    }
    h1 {
      margin: 26px 0 0;
      font-weight: 800;
      line-height: 0.92;
      letter-spacing: -0.03em;
      text-transform: uppercase;
    }
    h1 span {
      display: block;
      white-space: nowrap;
    }
    .t2 {
      color: var(--o5);
    }
    .sub {
      margin: 34px 0 0;
      font-size: 30px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.55);
    }
    .cont {
      margin-top: 34px;
      display: flex;
      align-items: baseline;
      gap: 26px;
    }
    .cont-k {
      font-family: var(--mono);
      font-size: 17px;
      font-weight: 700;
      letter-spacing: 0.24em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.55);
    }
    .cont-t {
      font-family: var(--mono);
      font-size: 84px;
      font-weight: 700;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .cont-zero {
      font-family: var(--mono);
      font-size: 48px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .cont-zero b {
      color: var(--o5);
      animation: iv-pisca 0.9s ease-in-out infinite;
    }
    @keyframes iv-pisca {
      50% {
        opacity: 0.25;
      }
    }
    .barra {
      margin-top: 14px;
      width: 765px;
      height: 6px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.1);
      overflow: hidden;
    }
    .barra i {
      display: block;
      height: 100%;
      background: var(--o5);
      transform-origin: 0 50%;
      transition: transform 0.5s linear;
    }

    .dir {
      position: absolute;
      left: 1260px;
      top: 118px;
      width: 603px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .seguir {
      position: relative;
      overflow: hidden;
      padding: 22px 26px 26px;
      border-radius: 12px;
      border: 1px solid rgba(255, 106, 26, 0.55);
      background: rgba(255, 255, 255, 0.015);
    }
    .seg-top {
      display: flex;
      justify-content: space-between;
      font-family: var(--mono);
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }
    .seg-k {
      color: var(--o5);
    }
    .seg-ctx {
      color: rgba(255, 255, 255, 0.6);
    }
    .seg-d {
      display: block;
      margin-top: 18px;
      font-family: var(--mono);
      font-size: 12px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }
    .seg-nomes {
      display: flex;
      flex-direction: column;
      font-size: 44px;
      font-weight: 800;
      line-height: 1.04;
      letter-spacing: -0.02em;
      text-transform: uppercase;
    }
    .seg-vs {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-top: 16px;
      font-family: var(--mono);
      font-size: 13px;
      letter-spacing: 0.24em;
      text-transform: uppercase;
      color: var(--o5);
    }
    .seg-vs i {
      flex: 1;
      height: 1px;
      background: rgba(255, 255, 255, 0.12);
    }
    .seg-tags {
      display: flex;
      gap: 10px;
      margin-top: 20px;
    }
    .tag {
      padding: 7px 14px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      font-family: var(--mono);
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.65);
    }
    .tag b {
      margin-left: 4px;
      color: #fff;
    }
    .lin {
      display: grid;
      grid-template-columns: 96px 1fr auto;
      align-items: center;
      column-gap: 14px;
      padding: 14px 20px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.07);
      background: rgba(255, 255, 255, 0.02);
    }
    .hora {
      font-family: var(--mono);
      font-size: 28px;
      font-weight: 700;
    }
    .lin-t {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }
    .lin-n {
      font-size: 21px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .lin-n i {
      font-style: normal;
      margin: 0 4px;
      color: rgba(255, 255, 255, 0.45);
    }
    .lin-c,
    .lin-q {
      font-family: var(--mono);
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }

    .resultados {
      position: absolute;
      left: 0;
      right: 0;
      top: 842px;
      height: 64px;
      display: flex;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.02);
    }
    .res-k {
      flex: none;
      width: 270px;
      display: grid;
      place-items: center;
      background: var(--o5);
      color: #120600;
      font-family: var(--mono);
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      z-index: 1;
    }
    .res-janela {
      flex: 1;
      overflow: hidden;
      -webkit-mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
      mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
    }
    .res-trilha {
      display: flex;
      align-items: center;
      width: max-content;
      height: 100%;
      animation: iv-letreiro linear infinite;
    }
    @keyframes iv-letreiro {
      to {
        transform: translateX(-50%);
      }
    }
    .res {
      flex: none;
      display: flex;
      align-items: baseline;
      gap: 14px;
      padding: 0 34px;
      white-space: nowrap;
      font-size: 21px;
      color: rgba(255, 255, 255, 0.55);
    }
    .res b {
      color: #fff;
    }
    .res em {
      font-style: normal;
      font-family: var(--mono);
      font-weight: 700;
      color: #fff;
    }
    .res-tag {
      font-style: normal;
      font-family: var(--mono);
      font-size: 11px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--o4);
      margin-right: 6px;
    }

    .patro {
      position: absolute;
      left: 54px;
      right: 54px;
      bottom: 48px;
      height: 110px;
      display: flex;
      align-items: center;
      gap: 26px;
    }
    .patro-k {
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      font-family: var(--mono);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      color: var(--o5);
    }
    .patro-grade {
      flex: 1;
      display: grid;
      gap: 18px;
      height: 100px;
    }
    .logo {
      display: grid;
      place-items: center;
      overflow: hidden;
      box-sizing: border-box;
      border-radius: 8px;
      border: 1.5px dashed rgba(255, 255, 255, 0.2);
      background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0 10px, transparent 10px 20px);
      transition:
        transform 0.5s ease,
        border-color 0.5s ease,
        box-shadow 0.5s ease;
    }
    .logo--img {
      border: 1.5px solid transparent;
      background: #fff;
      padding: 10px;
    }
    .logo--on {
      transform: translateY(-4px);
      border: 1.5px solid var(--o5);
      box-shadow: 0 0 22px rgba(255, 106, 26, 0.55);
    }
    .logo img {
      width: 80px;
      height: 100%;
      object-fit: contain;
      object-position: center;
    }
    .logo span {
      font-family: var(--mono);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.55);
    }

    /* Cortina laranja: cobre da esquerda pra direita e se recolhe pra direita, em 1 s. */
    .cortina {
      position: absolute;
      inset: 0;
      z-index: 5;
      background: var(--o5);
      transform: translateX(-101%);
      animation: iv-cortina ${CURTAIN_MS}ms cubic-bezier(0.65, 0, 0.35, 1) both;
    }
    @keyframes iv-cortina {
      0% {
        transform: translateX(-101%);
      }
      50% {
        transform: translateX(0);
      }
      100% {
        transform: translateX(101%);
      }
    }
  `,
})
export class OverlayIntervaloComponent {
  /** Configuração gravada pelo painel; `null` = tela fora do ar. */
  readonly config = input<BroadcastIntervalo | null>(null);
  readonly view = input<IntervaloView | null>(null);
  readonly teams = input<ReadonlyMap<string, OverlayTeam>>(new Map());
  readonly eventName = input('');
  readonly sponsors = input<OverlayPatroItem[]>([]);

  /** O que está na tela; só troca aos 0,5 s da cortina (modo novo, entrada e saída). */
  protected readonly shown = signal<BroadcastIntervalo | null>(null);
  protected readonly curtainKey = signal(0);
  protected readonly destaque = signal(0);
  private readonly now = signal(Date.now());

  private targetMode: string | null = null;
  private swapTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly logos = computed(() => this.sponsors());

  protected readonly restante = computed(() => {
    const c = this.shown();
    return c ? intervaloRestanteSeg(c.startedAt, c.durationSec, this.now()) : null;
  });
  protected readonly clock = computed(() => {
    const s = this.restante() ?? 0;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });
  protected readonly fracao = computed(() => {
    const c = this.shown();
    const r = this.restante();
    return c && r !== null && c.durationSec > 0 ? Math.min(1, r / c.durationSec) : 0;
  });
  /** ~12 s por resultado, no mínimo 30 s: velocidade constante, sem emenda (a trilha é duplicada). */
  protected readonly duracaoLetreiro = computed(() => Math.max(30, (this.view()?.results.length ?? 0) * 12));

  constructor() {
    const destroyRef = inject(DestroyRef);

    effect(() => {
      const c = this.config();
      const target = c ? c.mode : null;
      untracked(() => {
        if (target === this.targetMode) {
          // Mesmo modo: texto e contagem atualizam ao vivo, sem cortina.
          if (c && this.shown()) this.shown.set(c);
          return;
        }
        this.targetMode = target;
        this.curtainKey.update((k) => k + 1);
        clearTimeout(this.swapTimer);
        this.swapTimer = setTimeout(() => this.shown.set(this.config()), SWAP_MS);
      });
    });

    // Relógio de 0,5 s e rodízio dos patrocinadores a cada 3 s, só com a tela no ar.
    effect((onCleanup) => {
      if (!this.shown()) return;
      this.now.set(Date.now());
      const tick = setInterval(() => this.now.set(Date.now()), TICK_MS);
      const step = setInterval(() => this.destaque.update((i) => i + 1), SPONSOR_STEP_MS);
      onCleanup(() => {
        clearInterval(tick);
        clearInterval(step);
      });
    });
    destroyRef.onDestroy(() => clearTimeout(this.swapTimer));
  }

  protected badge(c: BroadcastIntervalo): string {
    return INTERVALO_BADGE[c.mode];
  }

  /** O título diminui sozinho se não couber nos ~1040 px da coluna (≈ 0,53 em por letra). */
  protected tituloPx(c: BroadcastIntervalo): number {
    const longest = Math.max(c.line1.length, c.line2.length, 1);
    return Math.max(70, Math.min(190, Math.floor(1040 / (longest * 0.53))));
  }

  protected contexto(g: IntervaloGame): string {
    return [g.category, g.phase].filter((p) => p !== '').join(' · ');
  }

  private players(t: { teamId: string; label: string }): string[] {
    const fromTeam = (this.teams().get(t.teamId)?.players ?? []).map(nomeCurtoDe).filter((p) => p !== '');
    if (fromTeam.length > 0) return fromTeam;
    return t.label.split(/\s*\/\s*/).map(nomeCurtoDe).filter((p) => p !== '');
  }

  /** Um atleta por linha, como no card "A seguir". */
  protected jogadores(t: { teamId: string; label: string }): string[] {
    const p = this.players(t);
    return p.length > 0 ? p : ['A definir'];
  }

  /** "Duarte / Sales" nas listas. */
  protected nome(t: { teamId: string; label: string }): string {
    const p = this.players(t);
    return p.length > 0 ? p.join(' / ') : nomesCurtosDe(t.label) || 'A definir';
  }
}
