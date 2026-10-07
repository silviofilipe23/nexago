import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import type { OverlayTeam } from './overlay-live.gateway';
import type { BolaoFase, BolaoView } from './overlay-bolao';
import { nomeCurtoDe } from './overlay-nome';

type Side = 'A' | 'B';

const TWEEN_MS = 700;
const FLOAT_MS = 1400;
const APP_LINK = 'linktr.ee/nexago';

const ABA: Record<BolaoFase, string> = {
  aberto: 'Palpites ao vivo · Quem leva?',
  encerrado: 'Palpites encerrados',
  resultado: 'Resultado dos palpites',
};
const ease = (x: number) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);

interface Mostrado {
  a: number;
  b: number;
  pa: number;
  pb: number;
  total: number;
}

/** Bolão ao vivo (1920×1080, fundo transparente): faixa de 1280 px centralizada embaixo com a
 *  divisão dos palpites entre as duas duplas.
 *
 *  Só apresentação — `bolaoViewOf` traz fase, contagens e percentuais. Os números CONTAM até o
 *  valor novo, cada palpite novo sobe um "+N" sobre o lado da dupla e a barra desliza. */
@Component({
  selector: 'og-overlay-bolao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view(); as v) {
      <div class="bl" [class.bl--enc]="v.fase !== 'aberto'" animate.enter="bl-in" animate.leave="bl-out">
        <div class="aba bl-aba" [class.aba--branca]="v.fase !== 'aberto'">
          <i class="ponto"></i>{{ aba(v) }}<b class="brilho" aria-hidden="true"></b>
        </div>

        <div class="faixa">
          <div class="topo">
            <div class="lado lado--a bl-slide-l" [class.lado--vence]="v.vencedor === 'A'" [class.lado--apaga]="v.vencedor === 'B'">
              <span class="pct">{{ m().pa }}<small>%</small></span>
              <div class="quem">
                @for (n of jogadores(v, 'A'); track $index) { <b>{{ n }}</b> }
                <span class="qtd" [class.qtd--pulso]="pulso() === 'A'">{{ m().a }} palpites</span>
              </div>
              @if (v.vencedor === 'A') { <span class="selo">Acertaram</span> }
              @for (f of flutuando(); track f.id) {
                @if (f.side === 'A') { <i class="mais">+{{ f.n }}</i> }
              }
            </div>

            <div class="total bl-total">
              <b [class.qtd--pulso]="pulso() !== null">{{ m().total }}</b>
              <span>Palpites</span>
            </div>

            <div class="lado lado--b bl-slide-r" [class.lado--vence]="v.vencedor === 'B'" [class.lado--apaga]="v.vencedor === 'A'">
              @if (v.vencedor === 'B') { <span class="selo">Acertaram</span> }
              <div class="quem quem--b">
                @for (n of jogadores(v, 'B'); track $index) { <b>{{ n }}</b> }
                <span class="qtd" [class.qtd--pulso]="pulso() === 'B'">{{ m().b }} palpites</span>
              </div>
              <span class="pct pct--b">{{ m().pb }}<small>%</small></span>
              @for (f of flutuando(); track f.id) {
                @if (f.side === 'B') { <i class="mais mais--b">+{{ f.n }}</i> }
              }
            </div>
          </div>

          <div class="disputa" [class.disputa--parada]="v.fase !== 'aberto'">
            <i class="a" [style.width.%]="v.a.pct"></i>
            <u class="marca" [style.left.%]="v.a.pct"></u>
            <s class="meio"></s>
          </div>

          <footer class="rodape">
            <span>{{ v.court }}@if (v.category) { <i></i>{{ v.category }} }</span>
            <span class="dir">
              @switch (v.fase) {
                @case ('aberto') {
                  @if (v.restanteSeg !== null) { Palpites fecham em <b class="laranja">{{ relogio(v.restanteSeg) }}</b><i></i> }
                  Dê seu palpite no app <b>{{ link }}</b>
                }
                @case ('encerrado') { Aguardando o fim da partida }
                @case ('resultado') {
                  @if (v.acertaram; as ac) { <b>{{ vencedora(v) }}</b> venceu<i></i><b class="laranja">{{ ac.pct }}%</b> do público acertou<i></i>{{ ac.n }} palpites certos }
                }
              }
            </span>
          </footer>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      --o5: var(--nx-orange-500, #ff6a1a);
      --mono: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      position: absolute;
      inset: 0;
      z-index: 33;
      display: block;
      pointer-events: none;
      font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif);
      color: #fff;
    }
    .bl {
      position: absolute;
      left: 50%;
      bottom: 64px;
      width: 1280px;
      margin-left: -640px;
    }
    /* Entrada: a faixa sobe 50 px; saída: desce 36 px sumindo. */
    .bl-in {
      animation: bl-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .bl-out {
      animation: bl-out 0.4s cubic-bezier(0.55, 0, 1, 0.45) both;
    }
    @keyframes bl-in {
      from {
        opacity: 0;
        transform: translateY(50px);
      }
    }
    @keyframes bl-out {
      to {
        opacity: 0;
        transform: translateY(36px);
      }
    }
    .aba {
      position: relative;
      overflow: hidden;
      width: max-content;
      margin: 0 auto -1px;
      padding: 10px 24px 12px;
      display: flex;
      align-items: center;
      gap: 12px;
      border-radius: 10px 10px 0 0;
      background: var(--o5);
      color: #120600;
      font-family: var(--mono);
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      animation: bl-aba 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both;
      transition: background 0.4s ease;
    }
    @keyframes bl-aba {
      from {
        transform: translateY(100%);
        opacity: 0;
      }
    }
    .aba--branca {
      background: #fff;
    }
    .aba .ponto {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #120600;
      animation: bl-ponto 1.2s ease-in-out infinite;
    }
    .aba--branca .ponto {
      animation: none;
    }
    @keyframes bl-ponto {
      50% {
        opacity: 0.3;
      }
    }
    .brilho {
      position: absolute;
      inset: 0 auto 0 0;
      width: 35%;
      background: linear-gradient(105deg, transparent, rgba(255, 255, 255, 0.6), transparent);
      transform: translateX(-160%) skewX(-18deg);
      animation: bl-brilho 3s ease-in-out infinite;
    }
    .aba--branca .brilho {
      display: none;
    }
    @keyframes bl-brilho {
      0%,
      70% {
        transform: translateX(-160%) skewX(-18deg);
      }
      100% {
        transform: translateX(420%) skewX(-18deg);
      }
    }

    .faixa {
      border-radius: 14px;
      background: linear-gradient(180deg, #151517, #0c0c0d);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
      overflow: hidden;
    }
    .topo {
      display: grid;
      grid-template-columns: 1fr 200px 1fr;
      align-items: center;
      padding: 22px 28px 14px;
    }
    .lado {
      position: relative;
      display: flex;
      align-items: center;
      gap: 18px;
      min-width: 0;
      transition: opacity 0.5s ease;
    }
    .lado--b {
      justify-content: flex-end;
      text-align: right;
    }
    .bl-slide-l {
      animation: bl-slide-l 0.55s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both;
    }
    .bl-slide-r {
      animation: bl-slide-r 0.55s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both;
    }
    @keyframes bl-slide-l {
      from {
        opacity: 0;
        transform: translateX(-60px);
      }
    }
    @keyframes bl-slide-r {
      from {
        opacity: 0;
        transform: translateX(60px);
      }
    }
    .pct {
      flex: none;
      font-size: 84px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.04em;
      font-variant-numeric: tabular-nums;
    }
    .pct small {
      font-size: 40px;
      color: var(--o5);
      margin-left: 2px;
    }
    .pct--b small {
      color: rgba(255, 255, 255, 0.45);
    }
    .quem {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .quem b {
      font-size: 28px;
      font-weight: 800;
      line-height: 1.05;
      letter-spacing: -0.01em;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .qtd {
      margin-top: 8px;
      display: inline-block;
      font-family: var(--mono);
      font-size: 12px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }
    .qtd--pulso {
      animation: bl-pulso 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    @keyframes bl-pulso {
      40% {
        transform: scale(1.25);
        color: var(--o5);
      }
    }
    .total {
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 4px;
      animation: bl-total 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.35s both;
    }
    @keyframes bl-total {
      from {
        opacity: 0;
        transform: scale(0.7);
      }
    }
    .total b {
      font-size: 56px;
      font-weight: 800;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .total span {
      font-family: var(--mono);
      font-size: 12px;
      letter-spacing: 0.24em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }
    /* Resultado: a vencedora brilha com o selo "Acertaram"; a outra apaga. */
    .lado--vence .pct {
      text-shadow: 0 0 36px rgba(255, 106, 26, 0.7);
    }
    .lado--apaga {
      opacity: 0.35;
    }
    .selo {
      flex: none;
      padding: 6px 14px;
      border-radius: 6px;
      background: var(--o5);
      color: #120600;
      font-family: var(--mono);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    /* "+N": cada palpite novo sobe sobre o lado da dupla. */
    .mais {
      position: absolute;
      top: -6px;
      left: 8px;
      font-style: normal;
      font-family: var(--mono);
      font-size: 22px;
      font-weight: 800;
      color: var(--o5);
      animation: bl-mais ${FLOAT_MS}ms ease-out both;
    }
    .mais--b {
      left: auto;
      right: 8px;
      color: #fff;
    }
    @keyframes bl-mais {
      from {
        opacity: 1;
        transform: translateY(14px);
      }
      to {
        opacity: 0;
        transform: translateY(-34px);
      }
    }

    .disputa {
      position: relative;
      margin: 4px 28px 16px;
      height: 16px;
      border-radius: 8px;
      background: linear-gradient(180deg, #fff, #e4e4e8);
      overflow: visible;
      animation: bl-barra 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.4s both;
    }
    @keyframes bl-barra {
      from {
        clip-path: inset(0 50% 0 50%);
      }
    }
    .disputa .a {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      border-radius: 8px 0 0 8px;
      background: repeating-linear-gradient(135deg, #ff6a1a 0 10px, #ff8a4a 10px 20px);
      background-size: 28px 28px;
      animation: bl-listras 1.2s linear infinite;
      transition: width 0.9s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .disputa--parada .a {
      animation: none;
    }
    @keyframes bl-listras {
      to {
        background-position: 28px 0;
      }
    }
    .disputa .marca {
      position: absolute;
      top: -4px;
      width: 6px;
      height: 24px;
      margin-left: -3px;
      border-radius: 3px;
      background: #0a0a0b;
      border: 2px solid #fff;
      text-decoration: none;
      transition: left 0.9s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .disputa .meio {
      position: absolute;
      left: 50%;
      top: -4px;
      bottom: -4px;
      border-left: 1.5px dashed rgba(255, 255, 255, 0.45);
      text-decoration: none;
    }

    .rodape {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 28px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(0, 0, 0, 0.35);
      font-family: var(--mono);
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.45);
      animation: bl-aba 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.5s both;
    }
    .rodape i {
      display: inline-block;
      width: 1px;
      height: 12px;
      margin: 0 12px;
      vertical-align: middle;
      background: rgba(255, 255, 255, 0.25);
    }
    .rodape b {
      color: #fff;
    }
    .rodape b.laranja {
      color: var(--o5);
    }
  `,
})
export class OverlayBolaoComponent {
  readonly view = input<BolaoView | null>(null);
  readonly teams = input<ReadonlyMap<string, OverlayTeam>>(new Map());

  protected readonly link = APP_LINK;

  /** Valores exibidos: contam até o novo valor (a barra usa o valor real, com transição CSS). */
  protected readonly m = signal<Mostrado>({ a: 0, b: 0, pa: 50, pb: 50, total: 0 });
  /** Lado do último palpite novo (pulsa a contagem). */
  protected readonly pulso = signal<Side | null>(null);
  protected readonly flutuando = signal<{ id: number; side: Side; n: number }[]>([]);

  private lastCount: { a: number; b: number } | null = null;
  private floatId = 0;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private tween: ReturnType<typeof setInterval> | undefined;

  constructor() {
    const destroyRef = inject(DestroyRef);
    effect(() => {
      const v = this.view();
      untracked(() => this.atualiza(v));
    });
    destroyRef.onDestroy(() => {
      clearInterval(this.tween);
      this.timers.forEach(clearTimeout);
    });
  }

  private later(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private atualiza(v: BolaoView | null): void {
    if (!v) {
      this.lastCount = null;
      this.m.set({ a: 0, b: 0, pa: 50, pb: 50, total: 0 });
      return;
    }
    const alvo: Mostrado = { a: v.a.count, b: v.b.count, pa: v.a.pct, pb: v.b.pct, total: v.total };
    // "+N" e pulso só pra palpite NOVO (a 1ª leitura é a linha de base: só a contagem cresce).
    if (this.lastCount) {
      for (const side of ['A', 'B'] as const) {
        const d = (side === 'A' ? v.a.count - this.lastCount.a : v.b.count - this.lastCount.b);
        if (d > 0) {
          const id = ++this.floatId;
          this.flutuando.update((l) => [...l, { id, side, n: d }]);
          this.later(() => this.flutuando.update((l) => l.filter((f) => f.id !== id)), FLOAT_MS);
          this.pulso.set(side);
          this.later(() => this.pulso.set(null), 700);
        }
      }
    }
    this.lastCount = { a: v.a.count, b: v.b.count };

    const de = this.m();
    clearInterval(this.tween);
    const t0 = Date.now();
    this.tween = setInterval(() => {
      const p = ease((Date.now() - t0) / TWEEN_MS);
      const mix = (x: number, y: number) => Math.round(x + (y - x) * p);
      this.m.set({ a: mix(de.a, alvo.a), b: mix(de.b, alvo.b), pa: mix(de.pa, alvo.pa), pb: mix(de.pb, alvo.pb), total: mix(de.total, alvo.total) });
      if (p >= 1) clearInterval(this.tween);
    }, 30);
  }

  protected aba(v: BolaoView): string {
    return ABA[v.fase];
  }

  protected relogio(seg: number): string {
    return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
  }

  /** Um nome por linha: elenco carregado, senão o rótulo da partida. */
  protected jogadores(v: BolaoView, side: Side): string[] {
    const t = side === 'A' ? v.a : v.b;
    const fromTeam = (this.teams().get(t.teamId)?.players ?? []).map(nomeCurtoDe).filter((p) => p !== '');
    const p = fromTeam.length > 0 ? fromTeam : t.label.split(/\s*\/\s*/).map(nomeCurtoDe).filter((n) => n !== '');
    return p.length > 0 ? p : ['A definir'];
  }

  protected vencedora(v: BolaoView): string {
    return this.jogadores(v, v.vencedor ?? 'A').join(' / ');
  }

}
