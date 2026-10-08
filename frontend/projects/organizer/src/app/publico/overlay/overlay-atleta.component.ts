import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import type { AtletaCard, BroadcastAtleta } from '../../painel/data/broadcast-atleta';
import { ledIniciaisDe } from '../led/led-iniciais';
import { atletaColunasOf, atletaComandoDe, atletaH2hLabel, atletaSequenciaLabel } from './overlay-atleta';
import { nomeCurtoDe } from './overlay-nome';

const SAIDA_MS = 400;

/** Card do Atleta (canto inferior esquerdo, 1920×1080): perfil, temporada e jogos do torneio.
 *  O painel monta o card; aqui só desenha. Cada `seq` novo com card entra de novo; sem card, sai.
 *  Some sozinho após `seg` segundos (0 = fica até "sair"). */
@Component({
  selector: 'og-overlay-atleta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (card(); as c) {
      @for (k of [chave()]; track k) {
        <article class="card" [class.sai]="saindo()">
          <div class="foto">
            @if (c.photoUrl) {
              <img [src]="c.photoUrl" alt="" />
            } @else {
              <span class="ini">{{ iniciais(c) }}</span>
            }
            @if (c.rankPos !== null) {
              <div class="rank"><i>#</i>{{ c.rankPos }}<small>Ranking</small></div>
            }
          </div>
          <div class="corpo">
            <div class="topo s" style="--i: 0">
              <span>{{ ctx(c) }}</span>
            </div>
            <h2 class="nome s" style="--i: 1">{{ nome(c) }}</h2>
            @if (c.partner) {
              <div class="dupla s" style="--i: 1">Dupla com <b>{{ c.partner }}</b></div>
            }

            @if (colunas(c); as cols) {
              @if (cols.length > 0) {
                <div class="perfil s" style="--i: 2">
                  @for (col of cols; track col.label) {
                    <div class="col">
                      <small>{{ col.label }}</small>
                      <strong [class.o]="col.laranja">{{ col.valor }}</strong>
                      @if (col.sub) { <em>{{ col.sub }}</em> }
                    </div>
                  }
                </div>
              }
            }

            @if (c.season; as t) {
              <div class="sec s" style="--i: 3"><span>Temporada {{ t.year }}</span><hr /></div>
              <div class="perfil s" style="--i: 4">
                <div class="col"><small>Vitórias</small><strong class="o">{{ t.winPct }}%</strong><em>{{ t.wins }}V · {{ t.losses }}D</em></div>
                @if (t.streak; as sq) {
                  <div class="col"><small>Sequência</small><strong>{{ seq(sq) }}</strong><em>seguidas</em></div>
                }
                <div class="col">
                  <small>Últimos jogos</small>
                  <div class="quad">
                    @for (r of t.last; track $index) { <b [class.v]="r === 'V'" [style.--q]="$index">{{ r }}</b> }
                  </div>
                </div>
              </div>
            }

            @if (c.games.length > 0) {
              <div class="sec s" style="--i: 5"><span>Neste torneio</span><hr /><em>Sets {{ c.setsWon }}-{{ c.setsLost }}</em></div>
              @for (g of c.games; track $index) {
                <div class="jogo s" [style.--i]="6 + $index">
                  <small>{{ g.phase }}</small>
                  <span class="adv">{{ g.opponent }}</span>
                  <span class="parc">{{ g.partials }}</span>
                  <b [class.o]="g.won">{{ g.score }}</b>
                </div>
              }
            }
          </div>
          @if (c.h2h; as h) {
            <footer class="rod s" style="--i: 9">
              <span>A dupla</span>
              <span class="vs">Confronto direto vs <b>{{ h.vs }}</b></span>
              <strong>{{ h2h(h) }}</strong>
            </footer>
          }
          @if (seg() > 0) {
            <i class="tempo" [style.animation-duration.s]="seg()"></i>
          }
        </article>
      }
    }
  `,
  styles: `
    :host {
      --o5: var(--nx-orange-500, #ff6a1a);
      --mono: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      position: absolute; inset: 0; z-index: 69; display: block; pointer-events: none;
      font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif); color: #fff;
    }
    .card {
      position: absolute; left: 96px; bottom: 84px; width: 1360px; overflow: hidden; border-radius: 14px;
      display: grid; grid-template-columns: 300px 1fr; background: linear-gradient(180deg, #131316, #09090b);
      border: 1px solid rgba(255, 255, 255, 0.12); box-shadow: 0 40px 90px rgba(0, 0, 0, 0.65);
      animation: at-in 0.6s cubic-bezier(0.2, 1, 0.3, 1) both;
    }
    .card.sai { animation: at-out 0.4s ease-in both; }
    @keyframes at-in { from { opacity: 0; transform: translateX(-60px); } }
    @keyframes at-out { to { opacity: 0; transform: translateX(-40px); } }
    .foto { position: relative; overflow: hidden; background: repeating-linear-gradient(135deg, #17171a 0 10px, #1d1d21 10px 20px); animation: at-foto 0.62s ease-out 0.12s both; }
    @keyframes at-foto { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0); } }
    .foto img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .foto::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent 40%, #0e0e10); }
    .ini { position: absolute; inset: 0; display: grid; place-items: center; font-size: 110px; font-weight: 800; color: rgba(255, 255, 255, 0.28); }
    .rank { position: absolute; left: 24px; bottom: 18px; z-index: 1; font-size: 96px; font-weight: 800; line-height: 1; text-shadow: 0 4px 24px rgba(0, 0, 0, 0.8); animation: at-up 0.5s ease-out 0.5s both; }
    .rank i { font-style: normal; color: var(--o5); font-size: 0.6em; margin-right: 4px; }
    .rank small { display: block; margin-top: 6px; font-family: var(--mono); font-size: 13px; letter-spacing: 0.28em; text-transform: uppercase; }
    @keyframes at-up { from { opacity: 0; transform: translateY(20px); } }
    .corpo { padding: 22px 36px 22px 24px; min-width: 0; }
    .s { animation: at-s 0.48s cubic-bezier(0.22, 1, 0.36, 1) calc(260ms + var(--i, 0) * 45ms) both; }
    @keyframes at-s { from { opacity: 0; transform: translateY(16px); filter: blur(5px); } }
    .topo { font-family: var(--mono); font-size: 13px; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(255, 255, 255, 0.5); }
    .nome { margin: 6px 0 0; font-size: 64px; font-weight: 800; line-height: 1; letter-spacing: -0.03em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dupla { margin-top: 6px; font-family: var(--mono); font-size: 13px; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(255, 255, 255, 0.5); }
    .dupla b { color: #fff; }
    .perfil { display: flex; margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.1); }
    .col { flex: 1; min-width: 0; padding: 0 20px; border-left: 1px solid rgba(255, 255, 255, 0.1); }
    .col:first-child { padding-left: 0; border-left: 0; }
    .col small, .jogo small { display: block; font-family: var(--mono); font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(255, 255, 255, 0.5); }
    .col strong { display: block; margin-top: 4px; font-size: 40px; font-weight: 800; line-height: 1; letter-spacing: -0.03em; }
    .col em { display: block; margin-top: 6px; font-style: normal; font-family: var(--mono); font-size: 12px; color: rgba(255, 255, 255, 0.45); }
    .o { color: var(--o5); }
    .sec { display: flex; align-items: center; gap: 14px; margin-top: 16px; font-family: var(--mono); font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--o5); }
    .sec hr { flex: 1; height: 1px; margin: 0; border: 0; background: rgba(255, 255, 255, 0.12); }
    .sec em { font-style: normal; color: rgba(255, 255, 255, 0.6); }
    .quad { display: flex; gap: 8px; margin-top: 8px; }
    .quad b { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 6px; background: #2a2a2e; font-family: var(--mono); font-size: 12px; color: rgba(255, 255, 255, 0.6); animation: at-q 0.32s ease-out calc(800ms + var(--q) * 60ms) both; }
    .quad b.v { background: var(--o5); color: #120600; }
    @keyframes at-q { from { transform: scale(0.5); opacity: 0; } }
    .jogo { display: grid; grid-template-columns: 110px 1fr auto 80px; align-items: center; gap: 16px; margin-top: 10px; }
    .jogo .adv { font-size: 22px; font-weight: 700; }
    .jogo .parc { font-family: var(--mono); font-size: 14px; color: rgba(255, 255, 255, 0.55); }
    .jogo b { text-align: right; font-size: 26px; font-weight: 800; }
    .rod { grid-column: 1 / -1; display: flex; align-items: center; gap: 28px; padding: 14px 36px; background: #07070a; border-top: 1px solid rgba(255, 255, 255, 0.08); font-family: var(--mono); font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255, 255, 255, 0.5); }
    .rod .vs { flex: 1; }
    .rod b { color: #fff; }
    .rod strong { font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif); font-size: 26px; letter-spacing: -0.02em; color: var(--o5); }
    .tempo { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--o5); transform-origin: left; animation: at-tempo linear both; }
    @keyframes at-tempo { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  `,
})
export class OverlayAtletaComponent {
  readonly config = input<BroadcastAtleta | null>(null);
  /** Card no ar: a página tira o placar enquanto durar e o devolve depois. */
  readonly noAr = output<boolean>();

  protected readonly card = signal<AtletaCard | null>(null);
  protected readonly chave = signal(0);
  protected readonly saindo = signal(false);
  protected readonly seg = signal(0);

  protected readonly colunas = (c: AtletaCard) => atletaColunasOf(c);
  protected readonly seq = atletaSequenciaLabel;
  protected readonly h2h = atletaH2hLabel;

  private visto: number | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    inject(DestroyRef).onDestroy(() => this.limpa());

    effect(() => {
      const c = this.config();
      if (!c) return;
      const cmd = atletaComandoDe(this.visto, c, Date.now());
      untracked(() => {
        this.visto = c.seq;
        if (cmd === 'mostrar' && c.card) this.mostra(c.card, c.seg);
        else if (cmd === 'sair') this.sai();
      });
    });

    effect(() => {
      const no = this.card() !== null;
      untracked(() => this.noAr.emit(no));
    });
  }

  private limpa(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private mostra(card: AtletaCard, seg: number): void {
    this.limpa();
    this.saindo.set(false);
    this.seg.set(seg);
    this.card.set(card);
    this.chave.update((k) => k + 1);
    if (seg > 0) this.timers.push(setTimeout(() => this.sai(), seg * 1000));
  }

  private sai(): void {
    this.limpa();
    if (this.card() === null) return;
    this.saindo.set(true);
    this.timers.push(
      setTimeout(() => {
        this.card.set(null);
        this.saindo.set(false);
      }, SAIDA_MS),
    );
  }

  protected nome(c: AtletaCard): string {
    return nomeCurtoDe(c.name);
  }
  protected iniciais(c: AtletaCard): string {
    return ledIniciaisDe(c.name);
  }
  protected ctx(c: AtletaCard): string {
    return [c.court ? `Quadra ${c.court}` : null, c.category].filter((p): p is string => !!p).join('  |  ');
  }
}
