import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import type { BroadcastLances, LanceTipo } from '../../painel/data/broadcast-lances';
import { lanceDeveDisparar, lanceViewOf, type LanceDupla, type LanceView } from './overlay-lances';

/** A vinheta sai aos 2 s (420 ms de saída); a tarja entra aos 2,25 s. */
const VINHETA_MS = 2420;
const TARJA_IN_MS = 2250;
const TARJA_OUT_MS = 360;

interface Ch {
  c: string;
  i: number;
}
interface Layout {
  kicker: string | null;
  top: Ch[] | null;
  main: Ch[][];
  bottom: Ch[] | null;
  seal: string | null;
}

/** Quebra o texto em letras com índice global (o atraso de cada letra sai do índice). */
const letras = (...palavras: string[]): Ch[][] => {
  let i = 0;
  return palavras.map((p) => [...p].map((c) => ({ c, i: i++ })));
};
const um = (t: string): Ch[] => letras(t)[0]!;

const LAYOUT: Record<LanceTipo, Layout> = {
  block: { kicker: null, top: um('MONSTER'), main: letras('BLOCK'), bottom: null, seal: null },
  ace: { kicker: 'Saque direto', top: null, main: letras('ACE'), bottom: null, seal: null },
  fire: { kicker: 'Ataque fulminante', top: null, main: letras('FIRE', 'BALL'), bottom: null, seal: null },
  dig: { kicker: null, top: um('BIG'), main: letras('DIG'), bottom: null, seal: null },
  shark: { kicker: 'De segunda', top: null, main: letras('SHARK'), bottom: um('ATTACK'), seal: null },
  rally: { kicker: null, top: null, main: letras('RALLY'), bottom: um('MONSTRO'), seal: 'Trocas / na bola' },
  onfire: { kicker: null, top: null, main: letras('ON', 'FIRE'), bottom: null, seal: 'Pontos / seguidos' },
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

interface Run {
  key: number;
  view: LanceView;
  layout: Layout;
  streaks: { top: string; op: number; dur: string; delay: string }[];
  brasas: { x: string; y: string; s: string; dx: string; dy: string; dur: string; delay: string }[];
  graos: { x: string; s: string; dx: string; up: string; down: string; dur: string }[];
}

function runOf(key: number, view: LanceView): Run {
  const t = view.tipo;
  return {
    key,
    view,
    layout: LAYOUT[t],
    streaks:
      t === 'ace'
        ? Array.from({ length: 6 }, (_, i) => ({ top: `${380 + i * 60 + rand(0, 30)}px`, op: i === 2 || i === 3 ? 1 : 0.5, dur: `${420 + rand(0, 180)}ms`, delay: `${i * 35}ms` }))
        : [],
    brasas:
      t === 'fire' || t === 'onfire'
        ? Array.from({ length: 46 }, () => ({
            x: `${rand(360, 1560)}px`, y: `${rand(560, 820)}px`, s: `${rand(6, 22)}px`, dx: `${rand(-130, 130)}px`, dy: `${-rand(300, 700)}px`,
            dur: `${1200 + rand(0, 1000)}ms`, delay: `${200 + rand(0, 700)}ms`,
          }))
        : [],
    graos:
      t === 'dig'
        ? Array.from({ length: 54 }, () => {
            const dx = rand(-450, 450);
            return { x: `${rand(560, 1360)}px`, s: `${rand(4, 16)}px`, dx: `${dx}px`, up: `${-rand(140, 380)}px`, down: `${rand(40, 120)}px`, dur: `${900 + rand(0, 600)}ms` };
          })
        : [],
  };
}

/** Lances: vinheta de tela cheia (~2 s) + tarja do atleta no canto inferior (padrão 6 s).
 *  O painel dispara incrementando `seq`; cada `seq` novo recria a árvore e toca tudo do zero. */
@Component({
  selector: 'og-overlay-lances',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (run(); as r) {
      @for (k of [r.key]; track k) {
        @if (vinheta()) {
          <div class="sh" [class]="'sh tp-' + r.view.tipo">
            <div class="dim"></div>
            <div class="fx" aria-hidden="true">
              @switch (r.view.tipo) {
                @case ('block') {
                  <i class="barra b1"></i><i class="barra b2"></i><i class="anel a1"></i><i class="anel a2"></i>
                }
                @case ('ace') {
                  @for (s of r.streaks; track $index) {
                    <i class="streak" [style.top]="s.top" [style.opacity]="s.op" [style.animation-duration]="s.dur" [style.animation-delay]="s.delay"></i>
                  }
                }
                @case ('shark') {
                  <i class="slash"></i>
                }
                @case ('dig') {
                  <i class="chao"></i>
                  @for (g of r.graos; track $index) {
                    <i class="grao" [style.--x]="g.x" [style.--s]="g.s" [style.--dx]="g.dx" [style.--up]="g.up" [style.--down]="g.down" [style.animation-duration]="g.dur"></i>
                  }
                }
                @case ('rally') {
                  <i class="bola"></i>
                }
              }
              @if (r.view.tipo === 'fire' || r.view.tipo === 'onfire') {
                <i class="calor"></i>
                @for (b of r.brasas; track $index) {
                  <i class="brasa" [style.--x]="b.x" [style.--y]="b.y" [style.--s]="b.s" [style.--dx]="b.dx" [style.--dy]="b.dy" [style.animation-duration]="b.dur" [style.animation-delay]="b.delay"></i>
                }
              }
            </div>
            <div class="flash"></div>
            <div class="st">
              @if (r.layout.kicker; as kk) { <div class="kk"><i></i>{{ kk }}<i></i></div> }
              @if (r.layout.top; as top) {
                <div class="top">@for (ch of top; track ch.i) { <span class="l" [style.--i]="ch.i">{{ ch.c }}</span> }</div>
              }
              <div class="main">
                @for (w of r.layout.main; track $index) {
                  <span class="w">@for (ch of w; track ch.i) { <span class="l" [style.--i]="ch.i">{{ ch.c }}</span> }</span>
                }
              </div>
              @if (r.layout.bottom; as bottom) {
                <div class="bottom">@for (ch of bottom; track ch.i) { <span class="l" [style.--i]="ch.i">{{ ch.c }}</span> }</div>
              }
              @if (r.layout.seal; as seal) {
                <div class="seal"><b>{{ selo() }}</b><span>{{ seal }}</span></div>
              }
            </div>
          </div>
        }
        @if (tarja() !== 'off') {
          <div class="lt" [class.sai]="tarja() === 'out'">
            <div class="box">
              <i class="spin" aria-hidden="true"></i>
              <div class="in">
                <div class="tg" [class.fogo]="r.view.tipo === 'fire' || r.view.tipo === 'onfire'" [class.ital]="r.view.tipo === 'ace'">
                  <b class="brilho" aria-hidden="true"></b>
                  <small>Lance</small>
                  <strong>{{ r.view.rotulo }}</strong>
                </div>
                <div class="pl">
                  <strong>{{ r.view.nome }}</strong>
                  @if (r.view.sub) { <small>{{ r.view.sub }}</small> }
                </div>
                <div class="ct">
                  <strong>{{ r.view.count }}</strong>
                  <small>{{ r.view.unidade }}</small>
                </div>
              </div>
            </div>
          </div>
        }
      }
    }
  `,
  styles: `
    :host {
      --o5: var(--nx-orange-500, #ff6a1a);
      --o4: var(--nx-orange-400, #ff8a4a);
      --mono: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      --fogo: linear-gradient(180deg, #fff3c4 0%, #ffc34a 30%, #ff6a1a 62%, #c2260e 100%);
      position: absolute; inset: 0; z-index: 70; display: block; pointer-events: none; overflow: hidden;
      font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif); color: #fff;
    }
    .sh, .dim, .fx, .flash { position: absolute; inset: 0; }
    .fx > i { position: absolute; display: block; }
    .dim {
      background: radial-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.2) 70%);
      animation: ln-dim 2.3s ease-out both;
    }
    @keyframes ln-dim { 0% { opacity: 0; } 12%, 85% { opacity: 1; } 100% { opacity: 0; } }
    .flash { background: radial-gradient(rgba(255, 255, 255, 0.55), rgba(255, 106, 26, 0.25) 40%, transparent 70%); opacity: 0; animation: ln-flash 0.6s ease-out var(--fl, 0.5s) both; }
    @keyframes ln-flash { 0% { opacity: 0; } 15% { opacity: 1; } 100% { opacity: 0; } }
    .st {
      position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%);
      display: flex; flex-direction: column; align-items: center; text-align: center;
      animation: ln-sai 0.42s cubic-bezier(0.5, 0, 0.9, 0.5) 2s both;
    }
    @keyframes ln-sai { to { opacity: 0; transform: translateY(-30%) scale(0.7); filter: blur(10px); } }
    .l { display: inline-block; white-space: pre; }
    .w + .w { margin-left: 0.25em; }
    .main, .top, .bottom { text-transform: uppercase; letter-spacing: -0.05em; line-height: 0.82; font-weight: 800; white-space: nowrap; }
    .top, .bottom { color: transparent; -webkit-text-stroke: 3px #fff; letter-spacing: 0.02em; }
    .kk { display: flex; align-items: center; gap: 22px; margin-bottom: 18px; font-family: var(--mono); font-weight: 700; font-size: 22px; letter-spacing: 0.4em; text-transform: uppercase; animation: ln-kk 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.42s both; }
    .kk i { width: 60px; height: 3px; background: var(--o5); }
    @keyframes ln-kk { from { opacity: 0; letter-spacing: 1.2em; } }

    /* tremor: poucos quadros decrescentes */
    .sh { animation: ln-shake var(--shd, 0.5s) linear var(--sh0, 0.7s) both; }
    @keyframes ln-shake {
      0% { transform: translate(0, 0); } 14% { transform: translate(calc(var(--amp, 30px) * 0.5), calc(var(--amp, 30px) * -0.4)); }
      28% { transform: translate(calc(var(--amp, 30px) * -0.45), calc(var(--amp, 30px) * 0.35)); } 42% { transform: translate(calc(var(--amp, 30px) * 0.3), calc(var(--amp, 30px) * 0.25)); }
      57% { transform: translate(calc(var(--amp, 30px) * -0.2), calc(var(--amp, 30px) * -0.15)); } 72% { transform: translate(calc(var(--amp, 30px) * 0.1), calc(var(--amp, 30px) * 0.1)); }
      100% { transform: none; }
    }

    /* MONSTER BLOCK */
    .tp-block { --amp: 46px; --shd: 0.52s; --sh0: 0.7s; --fl: 0.7s; }
    .tp-block .top { font-size: 150px; letter-spacing: 0.02em; }
    .tp-block .top .l { animation: ln-b-top 0.42s cubic-bezier(0.22, 1, 0.36, 1) calc(var(--i) * 28ms) both; }
    @keyframes ln-b-top { from { opacity: 0; transform: scale(2.2); filter: blur(8px); } }
    .tp-block .main { font-size: 330px; text-shadow: 10px 10px 0 var(--o5); }
    .tp-block .main .l { animation: ln-b-drop 0.52s cubic-bezier(0.55, 0, 0.85, 0.35) calc(260ms + var(--i) * 40ms) both; }
    @keyframes ln-b-drop {
      0% { opacity: 0; transform: translateY(-700px) scaleY(1.3); } 70% { opacity: 1; transform: none; }
      82% { transform: scale(1.08, 0.86); } 100% { opacity: 1; transform: none; }
    }
    .barra { left: 0; right: 0; height: 26px; background: var(--o5); transform-origin: center; animation: ln-barra 1.5s cubic-bezier(0.22, 1, 0.36, 1) 0.7s both; }
    .b1 { top: calc(50% - 260px); } .b2 { top: calc(50% + 260px); }
    @keyframes ln-barra { 0% { transform: scaleX(0); } 35%, 80% { transform: scaleX(1); opacity: 1; } 100% { transform: scaleX(1) scaleY(0); opacity: 0; } }
    .anel { left: 50%; top: 50%; width: 400px; height: 400px; margin: -200px 0 0 -200px; border-radius: 50%; border: 10px solid #fff; animation: ln-anel 0.9s cubic-bezier(0.1, 0.7, 0.3, 1) 0.7s both; }
    .a2 { animation-delay: 0.84s; }
    @keyframes ln-anel { from { transform: scale(0.2); opacity: 1; border-width: 26px; } to { transform: scale(4.5); opacity: 0; border-width: 2px; } }

    /* ACE */
    .tp-ace { --amp: 18px; --shd: 0.26s; --sh0: 0.52s; --fl: 0.52s; }
    .tp-ace .main { font-size: 440px; font-style: italic; transform: skewX(-10deg); text-shadow: -14px 0 rgba(255, 106, 26, 0.75), -28px 0 rgba(255, 106, 26, 0.35); }
    .tp-ace .main .l { animation: ln-a-in 0.56s cubic-bezier(0.2, 0.9, 0.3, 1) calc(120ms + var(--i) * 70ms) both; }
    @keyframes ln-a-in { from { opacity: 0; transform: translateX(-900px); filter: blur(24px); } 75% { opacity: 1; transform: translateX(30px); filter: blur(0); } to { transform: none; } }
    .streak { left: 0; width: 1400px; height: 6px; border-radius: 3px; background: linear-gradient(90deg, transparent, rgba(255, 138, 74, 0.9) 70%, #fff); animation: ln-streak 0.5s cubic-bezier(0.6, 0, 0.4, 1) both; }
    @keyframes ln-streak { from { transform: translateX(-1500px); } to { transform: translateX(2100px); } }

    /* FIRE BALL / ON FIRE */
    .tp-fire { --amp: 26px; --shd: 0.42s; --sh0: 0.48s; --fl: 0.48s; }
    .tp-onfire { --amp: 24px; --shd: 0.38s; --sh0: 0.46s; --fl: 0.46s; }
    .tp-fire .kk { animation-delay: 0.25s; }
    .tp-fire .main, .tp-onfire .main { display: flex; gap: 0.25em; font-size: 270px; }
    .tp-onfire .main { font-size: 300px; }
    .tp-fire .w + .w, .tp-onfire .w + .w { margin-left: 0; }
    .tp-fire .main .l, .tp-onfire .main .l { background: var(--fogo); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .tp-fire .main { animation: ln-glow 1.6s ease-out 0.4s both; }
    @keyframes ln-glow { 0% { filter: drop-shadow(0 0 0 transparent); } 40% { filter: drop-shadow(0 0 60px rgba(255, 106, 26, 0.9)); } 100% { filter: drop-shadow(0 0 20px rgba(255, 106, 26, 0.5)); } }
    .tp-fire .main .l { animation: ln-f-in 0.64s cubic-bezier(0.22, 1, 0.36, 1) calc(var(--i) * 55ms) both; }
    @keyframes ln-f-in { from { opacity: 0; transform: scale(0.3) translateY(120px); filter: blur(16px) brightness(3); } 60% { opacity: 1; transform: scale(1.12); filter: brightness(1.8); } to { transform: none; filter: none; } }
    .tp-onfire .main .l { animation: ln-o-in 0.64s cubic-bezier(0.22, 1, 0.36, 1) calc(var(--i) * 60ms) both; }
    @keyframes ln-o-in { from { opacity: 0; transform: translateY(160px) scaleY(1.5); filter: blur(14px) brightness(3); } 60% { opacity: 1; transform: translateY(-20px); filter: brightness(1.6); } to { transform: none; filter: none; } }
    .calor { left: 50%; top: 50%; width: 1600px; height: 900px; margin: -450px 0 0 -800px; border-radius: 50%; background: radial-gradient(rgba(255, 106, 26, 0.55), rgba(194, 38, 14, 0.25) 40%, transparent 68%); animation: ln-calor 2.3s ease-in-out both; }
    @keyframes ln-calor { 0% { transform: scale(0.4); opacity: 0; } 30% { transform: scale(1.05); opacity: 1; } 60% { transform: scale(0.95); opacity: 0.85; } 80% { transform: scale(1.05); opacity: 1; } 100% { transform: scale(1.2); opacity: 0; } }
    .brasa { left: var(--x); top: var(--y); width: var(--s); height: var(--s); border-radius: 50%; background: radial-gradient(#fff3c4, var(--o5) 60%, transparent 70%); opacity: 0; animation: ln-brasa 1.5s cubic-bezier(0.2, 0.6, 0.4, 1) both; }
    @keyframes ln-brasa { 0% { opacity: 0; transform: translate(0, 0) scale(0.3); } 15% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(0.3); } }

    /* BIG DIG */
    .tp-dig { --amp: 20px; --shd: 0.3s; --sh0: 0.26s; }
    .tp-dig .top { font-size: 140px; }
    .tp-dig .top .l { animation: ln-d-top 0.42s ease-out calc(620ms + var(--i) * 50ms) both; }
    @keyframes ln-d-top { from { opacity: 0; transform: translateY(-40px); } }
    .tp-dig .main { font-size: 380px; text-shadow: 0 14px 0 rgba(232, 206, 160, 0.55); }
    .tp-dig .main .l { animation: ln-d-up 0.7s cubic-bezier(0.2, 0.8, 0.3, 1) calc(200ms + var(--i) * 70ms) both; }
    @keyframes ln-d-up { 0% { opacity: 0; transform: translateY(520px) scaleY(0.6); } 55% { opacity: 1; transform: translateY(-60px) scaleY(1.1); } 80% { transform: translateY(14px) scale(1.05, 0.92); } 100% { opacity: 1; transform: none; } }
    .chao { left: 0; right: 0; top: calc(50% + 230px); height: 4px; background: linear-gradient(90deg, transparent, #e8cea0 30%, #fff 50%, #e8cea0 70%, transparent); animation: ln-chao 1.9s cubic-bezier(0.22, 1, 0.36, 1) both; }
    @keyframes ln-chao { 0% { transform: scaleX(0); } 40% { transform: scaleX(1); opacity: 1; } 100% { transform: scaleX(1); opacity: 0; } }
    .grao { left: var(--x); top: calc(50% + 230px); width: var(--s); height: var(--s); border-radius: 50%; background: #e8cea0; opacity: 0; animation: ln-grao 1.2s cubic-bezier(0.2, 0.7, 0.5, 1) 0.26s both; }
    @keyframes ln-grao { 0% { opacity: 1; transform: translate(0, 0); } 45% { opacity: 1; transform: translate(calc(var(--dx) * 0.6), var(--up)); } 100% { opacity: 0; transform: translate(var(--dx), var(--down)); } }

    /* SHARK ATTACK */
    .tp-shark { --amp: 30px; --shd: 0.32s; --sh0: 0.56s; --fl: 0.56s; }
    .tp-shark .main { font-size: 320px; font-style: italic; transform: skewX(-14deg); text-shadow: 12px 12px 0 var(--o5); }
    .tp-shark .main .l { animation: ln-s-in 0.44s cubic-bezier(0.2, 1, 0.3, 1) calc(300ms + var(--i) * 45ms) both; }
    @keyframes ln-s-in { from { opacity: 0; transform: translate(-260px, 260px) skewX(30deg); filter: blur(14px); } }
    .tp-shark .bottom { font-size: 140px; }
    .tp-shark .bottom .l { animation: ln-s-bt 0.42s ease-out calc(620ms + var(--i) * 35ms) both; }
    @keyframes ln-s-bt { from { opacity: 0; transform: translateX(160px); } }
    .slash { left: 50%; top: 50%; width: 2600px; height: 220px; margin: -110px 0 0 -1300px; background: var(--o5); transform: rotate(-14deg) scaleX(0); animation: ln-slash 1.1s cubic-bezier(0.7, 0, 0.2, 1) both; }
    @keyframes ln-slash { 0% { transform: rotate(-14deg) scaleX(0); opacity: 1; } 35% { transform: rotate(-14deg) scaleX(1); } 60% { transform: rotate(-14deg) scaleX(1) scaleY(0.04); } 100% { transform: rotate(-14deg) scaleX(1) scaleY(0); opacity: 0; } }

    /* RALLY MONSTRO */
    .tp-rally { --amp: 16px; --shd: 0.26s; --sh0: 1.5s; --fl: 1.5s; }
    .tp-rally .main { font-size: 300px; }
    .tp-rally .main .l { animation: ln-r-in 0.52s cubic-bezier(0.22, 1, 0.36, 1) calc(var(--i) * 70ms) both; }
    .tp-rally .main .l:nth-child(even) { --dir: -1; }
    .tp-rally .main .l:nth-child(odd) { --dir: 1; }
    @keyframes ln-r-in { from { opacity: 0; transform: translateX(calc(600px * var(--dir, 1))); } }
    .tp-rally .bottom { font-size: 140px; }
    .tp-rally .bottom .l { animation: ln-r-bt 0.48s cubic-bezier(0.22, 1, 0.36, 1) calc(300ms + var(--i) * 45ms) both; }
    .tp-rally .bottom .l:nth-child(even) { --dir: 1; }
    .tp-rally .bottom .l:nth-child(odd) { --dir: -1; }
    @keyframes ln-r-bt { from { opacity: 0; transform: translateX(calc(300px * var(--dir, 1))); } }
    .bola { left: 0; top: calc(50% - 280px); width: 56px; height: 56px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #fff, #ffe3a0 60%, var(--o5)); animation: ln-bola 1.9s ease-in-out both; }
    @keyframes ln-bola {
      0% { transform: translate(240px, 0); } 16% { transform: translate(1680px, 40px); } 32% { transform: translate(240px, 0); } 48% { transform: translate(1680px, 40px); }
      64% { transform: translate(240px, 0); } 82% { transform: translate(1680px, 40px); } 100% { transform: translate(240px, 0); opacity: 0; }
    }
    .seal { display: flex; align-items: center; gap: 22px; margin-top: 30px; animation: ln-seal 0.42s cubic-bezier(0.22, 1, 0.36, 1) 0.5s both; }
    @keyframes ln-seal { from { opacity: 0; transform: scale(0.6); } }
    .seal b { display: grid; place-items: center; min-width: 150px; height: 150px; padding: 0 24px; border-radius: 75px; background: var(--o5); color: #120600; font-size: 96px; font-weight: 800; font-variant-numeric: tabular-nums; animation: ln-seal-pop 0.6s cubic-bezier(0.22, 1, 0.36, 1) 1.45s both; }
    @keyframes ln-seal-pop { 50% { transform: scale(1.25); } }
    .tp-onfire .seal b { animation: ln-seal-fire 0.56s cubic-bezier(0.22, 1, 0.36, 1) 0.62s both; }
    @keyframes ln-seal-fire { from { opacity: 0; transform: scale(0.5); } 60% { opacity: 1; transform: scale(1.15); } }
    .seal span { max-width: 190px; text-align: left; font-family: var(--mono); font-weight: 700; font-size: 26px; letter-spacing: 0.2em; text-transform: uppercase; white-space: pre-line; }

    /* TARJA */
    .lt { position: absolute; left: 96px; bottom: 72px; animation: ln-lt-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) both; }
    .lt.sai { animation: ln-lt-out 0.36s cubic-bezier(0.4, 0, 1, 1) both; }
    @keyframes ln-lt-in { from { opacity: 0; transform: translateY(60px); clip-path: inset(0 100% 0 0 round 16px); } to { opacity: 1; clip-path: inset(0 round 16px); } }
    @keyframes ln-lt-out { to { opacity: 0; transform: translateY(30px); } }
    .box { position: relative; overflow: hidden; border-radius: 16px; padding: 2px; box-shadow: 0 26px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(255, 106, 26, 0.3); background: rgba(255, 138, 74, 0.6); }
    .spin { position: absolute; inset: -150%; background: conic-gradient(transparent 0 70%, var(--o4) 82%, #fff 86%, var(--o5) 90%, transparent); animation: ln-gira 2.6s linear infinite; }
    @keyframes ln-gira { to { transform: rotate(360deg); } }
    .in { position: relative; display: flex; align-items: stretch; border-radius: 14px; overflow: hidden; background: linear-gradient(180deg, rgba(19, 19, 22, 0.97), rgba(8, 8, 10, 0.97)); }
    .in > * { animation: ln-col 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
    .tg { animation-delay: 0.2s; } .pl { animation-delay: 0.31s; } .ct { animation-delay: 0.42s; }
    @keyframes ln-col { from { opacity: 0; transform: translateX(-30px); } }
    .tg { position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: center; padding: 18px 30px; background: var(--o5); color: #120600; }
    .tg.fogo { background: linear-gradient(135deg, #ffc34a, var(--o5) 55%, #c2260e); }
    .tg.ital strong { font-style: italic; }
    .tg small, .pl small, .ct small { font-family: var(--mono); font-weight: 700; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; }
    .tg strong { font-size: 44px; font-weight: 800; line-height: 1; text-transform: uppercase; letter-spacing: -0.03em; white-space: nowrap; }
    .brilho { position: absolute; top: 0; bottom: 0; width: 40%; left: -40%; background: rgba(255, 255, 255, 0.55); transform: skewX(-18deg); animation: ln-brilho 2.4s ease-in-out 1s infinite; }
    @keyframes ln-brilho { 0% { left: -40%; } 60%, 100% { left: 130%; } }
    .pl { display: flex; flex-direction: column; justify-content: center; gap: 6px; padding: 18px 36px; }
    .pl strong { font-size: 46px; font-weight: 800; line-height: 1; white-space: nowrap; }
    .pl small { font-size: 12px; color: rgba(255, 255, 255, 0.6); }
    .ct { display: flex; flex-direction: column; justify-content: center; align-items: center; min-width: 150px; padding: 12px 30px; border-left: 1px solid rgba(255, 255, 255, 0.15); }
    .ct strong { font-size: 72px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; animation: ln-num 0.7s ease-out 0.7s both; }
    @keyframes ln-num { 40% { transform: scale(1.3); color: var(--o4); } }
    .ct small { color: rgba(255, 255, 255, 0.6); }
  `,
})
export class OverlayLancesComponent {
  /** Último disparo gravado pelo painel. */
  readonly config = input<BroadcastLances | null>(null);
  readonly duplas = input<readonly [LanceDupla, LanceDupla]>([
    { nome: 'Dupla A', atletas: [] },
    { nome: 'Dupla B', atletas: [] },
  ]);
  readonly court = input<string | null>(null);
  readonly category = input<string | null>(null);

  protected readonly run = signal<Run | null>(null);
  protected readonly vinheta = signal(false);
  protected readonly tarja = signal<'off' | 'on' | 'out'>('off');
  protected readonly selo = signal(0);

  private visto: number | null = null;
  private keySeq = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private contador: ReturnType<typeof setInterval> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.limpa());

    effect(() => {
      const c = this.config();
      if (!c) return;
      const deve = lanceDeveDisparar(this.visto, c, Date.now());
      untracked(() => {
        this.visto = c.seq;
        if (!deve) return;
        const view = lanceViewOf(c, this.duplas(), { court: this.court(), category: this.category() });
        if (view) this.dispara(view);
      });
    });
  }

  private limpa(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    clearInterval(this.contador);
  }

  private dispara(view: LanceView): void {
    this.limpa();
    this.run.set(runOf(++this.keySeq, view));
    this.vinheta.set(true);
    this.tarja.set('off');
    this.selo.set(view.tipo === 'onfire' ? view.n : 0);
    if (view.tipo === 'rally') this.conta(view.n);
    this.timers.push(setTimeout(() => this.vinheta.set(false), VINHETA_MS));
    this.timers.push(setTimeout(() => this.tarja.set('on'), TARJA_IN_MS));
    if (view.seg > 0) {
      this.timers.push(setTimeout(() => this.tarja.set('out'), TARJA_IN_MS + view.seg * 1000));
      this.timers.push(setTimeout(() => this.tarja.set('off'), TARJA_IN_MS + view.seg * 1000 + TARJA_OUT_MS));
    }
  }

  /** O selo do Rally sobe de 0 até o total em ~0,9 s, a partir de 0,56 s. */
  private conta(total: number): void {
    const t0 = Date.now() + 560;
    this.contador = setInterval(() => {
      const f = Math.min(1, Math.max(0, (Date.now() - t0) / 900));
      this.selo.set(Math.round(f * total));
      if (f >= 1) clearInterval(this.contador);
    }, 30);
  }
}
