import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import type { BroadcastCabine, CabinePessoa } from '../../painel/data/broadcast-cabine';
import { ledIniciaisDe } from '../led/led-iniciais';
import { cabineApoioOf, cabineComandoDe, cabineViewOf, type CabineView } from './overlay-cabine';

const SAIDA_MS = 400;

/** Comentaristas (lower third, canto inferior esquerdo, 1920×1080): quem está no microfone.
 *  Uma pessoa ("Mostrar") ou as duas primeiras lado a lado ("Cabine"). As pessoas vêm cadastradas
 *  no doc de controle; cada `seq` novo entra de novo e some sozinho após `seg` (0 = fixo). */
@Component({
  selector: 'og-overlay-cabine',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view(); as v) {
      @for (k of [chave()]; track k) {
        <div class="bloco" [class.cabine]="v.modo === 'cabine'" [class.sai]="saindo()">
          @if (v.modo === 'cabine') {
            <div class="tag">
              <b>Na cabine</b>
              @if (eventName()) { <span>{{ eventName() }}</span> }
              @if (court()) { <i></i><span>Quadra {{ court() }}</span> }
            </div>
          }
          <div class="cards">
            @for (p of v.pessoas; track p.id; let i = $index) {
              <article class="card" [style.--c]="i">
                <i class="faixa"></i>
                <div class="foto">
                  @if (p.photoUrl) { <img [src]="p.photoUrl" alt="" /> } @else { <span>{{ iniciais(p) }}</span> }
                </div>
                <div class="txt">
                  <div class="func s" style="--j: 0"><i class="mic" [class.off]="!p.mic"></i>{{ p.role }}</div>
                  <div class="nome s" style="--j: 1">{{ p.name }}</div>
                  @if (apoio(p); as a) {
                    @if (a.handle || a.desc) {
                      <div class="apoio s" style="--j: 2">
                        @if (a.handle) { <b>{{ a.handle }}</b> }
                        @if (a.handle && a.desc) { <i>•</i> }
                        @if (a.desc) { <span>{{ a.desc }}</span> }
                      </div>
                    }
                  }
                </div>
                @if (seg() > 0) { <i class="tempo" [style.animation-duration.s]="seg()"></i> }
              </article>
            }
          </div>
        </div>
      }
    }
  `,
  styles: `
    :host {
      --o5: var(--nx-orange-500, #ff6a1a);
      --mono: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      position: absolute; inset: 0; z-index: 71; display: block; pointer-events: none;
      font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif); color: #fff;
    }
    .bloco { position: absolute; left: 80px; bottom: 80px; }
    .bloco.sai { animation: cb-out 0.4s ease-in both; }
    @keyframes cb-out { to { opacity: 0; transform: translateY(24px); } }
    .tag { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; font-family: var(--mono); font-size: 14px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(255, 255, 255, 0.85); animation: cb-tag 0.5s ease-out both; text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5); }
    @keyframes cb-tag { from { opacity: 0; transform: translateY(12px); } }
    .tag b { padding: 7px 14px; border-radius: 4px; background: var(--o5); color: #120600; }
    .tag i { width: 1px; height: 14px; background: rgba(255, 255, 255, 0.4); }
    .cards { display: flex; gap: 14px; }
    .card {
      position: relative; display: flex; align-items: center; gap: 22px; overflow: hidden; min-width: 420px; padding: 18px 40px 18px 24px;
      border-radius: 10px; background: linear-gradient(180deg, rgba(22, 22, 25, 0.97), rgba(10, 10, 12, 0.97));
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);
      animation: cb-card 0.62s cubic-bezier(0.2, 1, 0.3, 1) calc(var(--c) * 140ms) both;
    }
    @keyframes cb-card { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0); } }
    .faixa { position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: var(--o5); }
    .foto { flex: none; display: grid; place-items: center; width: 84px; height: 84px; overflow: hidden; border-radius: 50%; background: repeating-linear-gradient(135deg, #1b1b1e 0 6px, #232327 6px 12px); border: 1px dashed rgba(255, 255, 255, 0.18); animation: cb-foto 0.5s cubic-bezier(0.22, 1, 0.36, 1) calc(0.15s + var(--c) * 140ms) both; }
    @keyframes cb-foto { from { transform: scale(0.6); opacity: 0; } }
    .foto img { width: 100%; height: 100%; object-fit: cover; }
    .foto span { font-family: var(--mono); font-size: 22px; font-weight: 700; color: rgba(255, 255, 255, 0.4); }
    .txt { min-width: 0; }
    .s { animation: cb-s 0.5s cubic-bezier(0.22, 1, 0.36, 1) calc(0.3s + var(--j) * 70ms + var(--c, 0) * 140ms) both; }
    @keyframes cb-s { from { opacity: 0; transform: translateX(-24px); filter: blur(6px); } }
    .func { display: flex; align-items: center; gap: 10px; font-family: var(--mono); font-size: 14px; font-weight: 700; letter-spacing: 0.24em; text-transform: uppercase; color: var(--o5); }
    .mic { width: 11px; height: 11px; border-radius: 50%; background: #ff3b30; box-shadow: 0 0 10px rgba(255, 59, 48, 0.8); animation: cb-mic 1.6s ease-in-out infinite; }
    .mic.off { background: #6a6a70; box-shadow: none; animation: none; }
    @keyframes cb-mic { 50% { transform: scale(1.5); opacity: 0.5; } }
    .nome { margin-top: 4px; font-size: 44px; font-weight: 800; line-height: 1; letter-spacing: -0.03em; text-transform: uppercase; white-space: nowrap; }
    .cabine .nome { font-size: 36px; }
    .apoio { display: flex; align-items: center; gap: 10px; margin-top: 8px; font-size: 15px; font-weight: 600; color: rgba(255, 255, 255, 0.55); }
    .apoio b { color: #fff; }
    .apoio i { font-style: normal; opacity: 0.6; }
    .tempo { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--o5); transform-origin: left; animation: cb-tempo linear both; }
    @keyframes cb-tempo { from { transform: scaleX(1); } to { transform: scaleX(0); } }
  `,
})
export class OverlayCabineComponent {
  readonly config = input<BroadcastCabine | null>(null);
  readonly eventName = input('');
  readonly court = input<string | null>(null);
  /** Lower third no ar: a página tira o placar (mesmo canto) enquanto durar e o devolve depois. */
  readonly noAr = output<boolean>();

  protected readonly view = signal<CabineView | null>(null);
  protected readonly chave = signal(0);
  protected readonly saindo = signal(false);
  protected readonly seg = signal(0);

  protected readonly apoio = cabineApoioOf;

  private visto: number | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    inject(DestroyRef).onDestroy(() => this.limpa());

    effect(() => {
      const c = this.config();
      if (!c) return;
      const cmd = cabineComandoDe(this.visto, c, Date.now());
      untracked(() => {
        this.visto = c.seq;
        const v = cabineViewOf(c);
        if (cmd === 'mostrar' && v) this.mostra(v, c.seg);
        else if (cmd === 'sair') this.sai();
      });
    });

    effect(() => {
      const no = this.view() !== null;
      untracked(() => this.noAr.emit(no));
    });
  }

  private limpa(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private mostra(v: CabineView, seg: number): void {
    this.limpa();
    this.saindo.set(false);
    this.seg.set(seg);
    this.view.set(v);
    this.chave.update((k) => k + 1);
    if (seg > 0) this.timers.push(setTimeout(() => this.sai(), seg * 1000));
  }

  private sai(): void {
    this.limpa();
    if (this.view() === null) return;
    this.saindo.set(true);
    this.timers.push(
      setTimeout(() => {
        this.view.set(null);
        this.saindo.set(false);
      }, SAIDA_MS),
    );
  }

  protected iniciais(p: CabinePessoa): string {
    return ledIniciaisDe(p.name);
  }
}
