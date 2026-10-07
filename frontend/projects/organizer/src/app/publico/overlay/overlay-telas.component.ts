import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { shareQrSvgDataUrl } from '../../painel/data/share-qr';
import type { BroadcastTelas } from '../../painel/data/broadcast-telas';
import type { EventoItem } from '../../painel/data/broadcast-eventos';
import { eventoDataOf, eventoDiasRestantes, eventoLocalLabel } from './overlay-eventos';
import type { IntervaloGame } from './overlay-intervalo';
import type { OverlayTeam } from './overlay-live.gateway';
import { nomeCurtoDe } from './overlay-nome';
import { OverlayPatroFaixaComponent } from './overlay-patro-faixa.component';
import type { OverlayPatroItem } from './overlay-nx';
import { telasDiaLabelOf, telasRelogioOf } from './overlay-telas';

const TICK_MS = 500;
const SPONSOR_STEP_MS = 3000;

/** Telas cheias de Início e Fim da transmissão (1920×1080, fundo opaco).
 *
 *  Só apresentação: o painel grava a tela ativa e a contagem; o "Primeiro jogo" vem das partidas
 *  públicas e o card da próxima etapa do card de "Próximos eventos" montado no painel. */
@Component({
  selector: 'og-overlay-telas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OverlayPatroFaixaComponent],
  template: `
    @if (config(); as c) {
      @for (t of [c.tela]; track t) {
        <div class="tela">
          <i class="luz" aria-hidden="true"></i>
          <header class="topo">
            <span class="selo" [class.ao-vivo]="aoVivo()"><b class="shine" aria-hidden="true"></b><i class="ponto"></i>{{ seloTexto() }}</span>
            @if (eventName()) {
              <span class="evento tl-up" style="--d: 0.1s">{{ eventName() }}</span>
            }
            <span class="marca tl-up" style="--d: 0.15s">NEXA<b>GO</b></span>
            @if (t === 'ini') {
              <div class="progresso"><i [style.transform]="'scaleX(' + (relogio()?.progresso ?? 0) + ')'"></i></div>
            }
          </header>

          @if (t === 'ini') {
            <main class="centro">
              <span class="k tl-up" style="--d: 0.2s">{{ aoVivo() ? 'Ao vivo' : 'A transmissão começa em' }}</span>
              @if (relogio(); as r) {
                @if (r.zerou) {
                  <div class="agora tl-up" style="--d: 0.3s">Começa agora</div>
                } @else {
                  <div class="relogio tl-up" style="--d: 0.3s">
                    @for (ch of r.chars; track $index) {
                      @if (ch === ':') {
                        <span class="sep">:</span>
                      } @else {
                        <span class="dig">
                          @for (v of [ch]; track v) { <b>{{ v }}</b> }
                        </span>
                      }
                    }
                    <em>min</em>
                  </div>
                }
              }
              <h1 class="nome tl-up" style="--d: 0.45s">{{ eventName() }}</h1>
              @if (diaLabel(); as d) {
                <p class="dia tl-up" style="--d: 0.55s">{{ d }}</p>
              }
            </main>

            <footer class="base">
              @if (primeiro(); as g) {
                <article class="jogo tl-up" style="--d: 0.7s">
                  <span class="jogo-k">Primeiro jogo</span>
                  <div class="duelo">
                    <div class="dupla">
                      <span class="d">Dupla A</span>
                      @for (p of jogadores(g.a); track $index) { <span class="n">{{ p }}</span> }
                    </div>
                    <div class="vs"><b>VS</b>@if (g.court) { <small>Quadra {{ g.court }}</small> }</div>
                    <div class="dupla">
                      <span class="d">Dupla B</span>
                      @for (p of jogadores(g.b); track $index) { <span class="n">{{ p }}</span> }
                    </div>
                  </div>
                </article>
              }
              @if (sponsors().length > 0) {
                <div class="patro">
                  <span class="patro-k tl-up" style="--d: 0.85s">Oferecimento</span>
                  <og-overlay-patro-faixa [itens]="sponsors()" [delay]="0.85" [highlight]="destaque() % sponsors().length" style="--h: 80px; --gap: 16px" />
                </div>
              }
            </footer>
          } @else {
            <main class="fim">
              <section class="esq">
                <h1 class="obrigado tl-up" style="--d: 0.2s">Obrigado</h1>
                <p class="ate tl-up" style="--d: 0.35s">Até a próxima etapa</p>
                <p class="resumo tl-up" style="--d: 0.5s">Valeu por acompanhar a {{ eventName() }}. Resultados, chaves e replays completos no app.</p>
                <div class="app tl-up" style="--d: 0.65s">
                  @if (qr(); as src) { <img [src]="src" alt="" /> }
                  <div>
                    <span class="app-k">Baixe o app</span>
                    <b>linktr.ee/nexago</b>
                  </div>
                </div>
              </section>
              @if (proximo(); as e) {
                <article class="prox tl-up" style="--d: 0.6s">
                  <i class="borda" aria-hidden="true"></i>
                  <div class="foto" [style.background-image]="e.coverUrl ? 'url(' + e.coverUrl + ')' : null"></div>
                  <div class="corpo">
                    <span class="prox-k">Próxima etapa</span>
                    <div class="linha">
                      <div class="data"><b>{{ data(e).dias }}</b><span>{{ data(e).mes }}</span></div>
                      <div class="info">
                        <h2>{{ e.name }}</h2>
                        <p>{{ local(e) }}</p>
                      </div>
                    </div>
                    <div class="rodape-card">
                      <span class="faltam">{{ faltam(e) }}</span>
                      
                    </div>
                  </div>
                </article>
              }
            </main>
            <footer class="siga tl-up" style="--d: 0.8s">
              <span>Siga no Instagram <b>&#64;nexagobr</b></span>
              <span>Baixe o app · <b>linktr.ee/nexago</b></span>
            </footer>
          }
        </div>
      }
    }
  `,
  styles: `
    :host {
      --o5: var(--nx-orange-500, #ff6a1a);
      --o4: var(--nx-orange-400, #ff8a4a);
      position: absolute;
      inset: 0;
      z-index: 68;
      display: block;
      pointer-events: none;
      font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif);
      color: #fff;
    }
    .tela { position: absolute; inset: 0; overflow: hidden; background: #0a0a0b; }
    .luz {
      position: absolute; top: -380px; right: -320px; width: 1100px; height: 1100px; border-radius: 50%;
      background: radial-gradient(circle, rgba(255, 106, 26, 0.55), transparent 65%);
      filter: blur(30px);
      animation: tl-respira 6s ease-in-out infinite;
    }
    @keyframes tl-respira { 50% { transform: scale(1.18); opacity: 0.65; } }
    .tl-up { animation: tl-up 0.8s cubic-bezier(0.22, 1, 0.36, 1) var(--d, 0s) both; }
    @keyframes tl-up {
      from { opacity: 0; transform: translateY(40px); filter: blur(14px); }
      to { opacity: 1; transform: none; filter: blur(0); }
    }
    .topo { position: absolute; top: 56px; left: 80px; right: 80px; display: flex; align-items: center; gap: 28px; }
    .selo {
      position: relative; overflow: hidden; display: inline-flex; align-items: center; gap: 12px;
      padding: 12px 26px; border-radius: 999px; background: var(--o5); color: #0a0a0b;
      font-weight: 800; font-size: 24px; letter-spacing: 0.12em; text-transform: uppercase;
    }
    .ponto { width: 14px; height: 14px; border-radius: 50%; background: #0a0a0b; animation: tl-pulsa 1.4s ease-in-out infinite; }
    @keyframes tl-pulsa { 50% { transform: scale(1.5); opacity: 0.5; } }
    .shine {
      position: absolute; inset: 0; width: 40%; background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.6), transparent);
      transform: translateX(-150%); animation: tl-shine 3s ease-in-out infinite;
    }
    @keyframes tl-shine { 0%, 60% { transform: translateX(-150%); } 100% { transform: translateX(400%); } }
    .evento { font-size: 28px; font-weight: 600; color: rgba(255, 255, 255, 0.75); }
    .marca { margin-left: auto; font-size: 34px; font-weight: 800; letter-spacing: 0.08em; }
    .marca b { color: var(--o5); }
    .progresso { position: absolute; left: 0; right: 0; top: 88px; height: 4px; background: rgba(255, 255, 255, 0.12); }
    .progresso i { display: block; height: 100%; background: var(--o5); transform-origin: left; transition: transform 0.5s linear; }

    .centro { position: absolute; inset: 150px 80px 330px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
    .k { color: var(--o5); font-size: 34px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; }
    .relogio { display: flex; align-items: baseline; justify-content: center; margin: 6px 0 4px; font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace); font-weight: 800; font-size: 300px; line-height: 1; }
    .dig { display: inline-block; height: 1em; overflow: hidden; width: 0.62em; text-align: center; }
    .dig b { display: block; font-weight: inherit; animation: tl-rola 0.45s cubic-bezier(0.22, 1, 0.36, 1) both; }
    @keyframes tl-rola { from { transform: translateY(100%); opacity: 0; } to { transform: none; opacity: 1; } }
    .sep { color: var(--o5); animation: tl-pisca 1s steps(1) infinite; }
    @keyframes tl-pisca { 50% { opacity: 0.2; } }
    .relogio em { margin-left: 24px; font-style: normal; font-size: 56px; font-weight: 600; color: rgba(255, 255, 255, 0.6); }
    .agora { margin: 20px 0; font-size: 190px; font-weight: 800; line-height: 1.05; color: var(--o5); }
    .nome { margin: 10px 0 0; font-size: 84px; font-weight: 800; line-height: 1.05; }
    .dia { margin: 14px 0 0; font-size: 38px; font-weight: 500; color: rgba(255, 255, 255, 0.7); }

    .base { position: absolute; left: 80px; right: 80px; bottom: 56px; display: flex; align-items: flex-end; justify-content: space-between; gap: 40px; }
    .jogo { padding: 24px 36px; border-radius: 24px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.12); }
    .jogo-k, .patro-k { display: block; margin-bottom: 14px; font-size: 22px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: var(--o5); }
    .duelo { display: flex; align-items: center; gap: 36px; }
    .dupla { display: flex; flex-direction: column; gap: 2px; min-width: 260px; }
    .dupla:last-child { text-align: right; }
    .d { font-size: 18px; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(255, 255, 255, 0.5); }
    .n { font-size: 34px; font-weight: 700; }
    .vs { display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .vs b { display: grid; place-items: center; width: 84px; height: 84px; border-radius: 50%; background: var(--o5); color: #0a0a0b; font-size: 30px; font-weight: 800; }
    .vs small { font-size: 18px; color: rgba(255, 255, 255, 0.65); }
    .patro { width: 760px; min-width: 0; overflow: hidden; }

    .fim { position: absolute; inset: 170px 80px 150px; display: flex; align-items: center; justify-content: space-between; gap: 60px; }
    .esq { flex: 1; min-width: 0; }
    .obrigado { margin: 0; font-size: 230px; font-weight: 900; line-height: 0.9; letter-spacing: -0.04em; text-transform: uppercase; }
    .ate { margin: 18px 0 0; max-width: 760px; font-size: 104px; font-weight: 900; line-height: 0.92; letter-spacing: -0.03em; text-transform: uppercase; color: var(--o5); }
    .app { display: flex; align-items: center; gap: 24px; margin-top: 34px; }
    .app img { width: 150px; height: 150px; padding: 10px; border-radius: 16px; background: #fff; }
    .app-k { display: block; font-size: 22px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255, 255, 255, 0.6); }
    .app b { font-size: 40px; font-weight: 800; color: var(--o5); }
    .resumo { margin: 28px 0 0; max-width: 820px; font-size: 32px; line-height: 1.4; color: rgba(255, 255, 255, 0.72); }
    .prox { position: relative; width: 640px; flex: none; border-radius: 28px; padding: 3px; overflow: hidden; background: #131315; }
    .borda { position: absolute; inset: -60%; background: conic-gradient(from 0deg, transparent 0 70%, var(--o5) 90%, transparent); animation: tl-gira 5s linear infinite; }
    @keyframes tl-gira { to { transform: rotate(360deg); } }
    .foto, .corpo { position: relative; }
    .foto { height: 300px; margin: 0; border-radius: 25px 25px 0 0; background: linear-gradient(135deg, #2a1a10, #0f0f10) center / cover; }
    .corpo { padding: 26px 30px 28px; background: #131315; border-radius: 0 0 25px 25px; }
    .prox-k { font-size: 22px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: var(--o5); }
    .linha { display: flex; gap: 22px; align-items: center; margin-top: 14px; }
    .data { display: flex; flex-direction: column; align-items: center; padding: 12px 20px; border-radius: 16px; background: var(--o5); color: #0a0a0b; }
    .data b { font-size: 44px; font-weight: 800; line-height: 1; }
    .data span { font-size: 22px; font-weight: 700; letter-spacing: 0.1em; }
    .info h2 { margin: 0; font-size: 38px; font-weight: 800; line-height: 1.1; }
    .info p { margin: 6px 0 0; font-size: 24px; color: rgba(255, 255, 255, 0.65); }
    .rodape-card { display: flex; justify-content: space-between; margin-top: 22px; font-size: 24px; color: rgba(255, 255, 255, 0.75); }
    .faltam { font-weight: 700; color: #fff; }
    .rodape-card b, .siga b { color: var(--o5); }
    .siga { position: absolute; left: 80px; right: 80px; bottom: 50px; display: flex; justify-content: space-between; font-size: 30px; color: rgba(255, 255, 255, 0.7); }
  `,
})
export class OverlayTelasComponent {
  /** Configuração gravada pelo painel; `null` = tela fora do ar. */
  readonly config = input<BroadcastTelas | null>(null);
  readonly primeiro = input<IntervaloGame | null>(null);
  readonly proximo = input<EventoItem | null>(null);
  readonly teams = input<ReadonlyMap<string, OverlayTeam>>(new Map());
  readonly eventName = input('');
  readonly startAt = input<Date | null>(null);
  readonly sponsors = input<OverlayPatroItem[]>([]);

  protected readonly destaque = signal(0);
  protected readonly qr = signal<string | null>(null);
  private readonly now = signal(Date.now());

  protected readonly relogio = computed(() => {
    const c = this.config();
    return c ? telasRelogioOf(c.startedAt, c.durationSec, this.now()) : null;
  });
  /** Contagem zerada: o texto vira "Ao vivo". */
  protected readonly aoVivo = computed(() => this.config()?.tela === 'ini' && this.relogio()?.zerou === true);
  protected readonly seloTexto = computed(() => {
    if (this.config()?.tela === 'fim') return 'Fim da transmissão';
    return this.aoVivo() ? 'Ao vivo' : 'Em instantes';
  });
  protected readonly diaLabel = computed(() => telasDiaLabelOf(this.startAt(), this.primeiro()?.phase ?? null, this.now()));

  constructor() {
    void shareQrSvgDataUrl('https://linktr.ee/nexago').then((src) => this.qr.set(src));
    effect((onCleanup) => {
      if (!this.config()) return;
      this.now.set(Date.now());
      const tick = setInterval(() => this.now.set(Date.now()), TICK_MS);
      const step = setInterval(() => this.destaque.update((i) => i + 1), SPONSOR_STEP_MS);
      onCleanup(() => {
        clearInterval(tick);
        clearInterval(step);
      });
    });
  }

  protected jogadores(t: { teamId: string; label: string }): string[] {
    const fromTeam = (this.teams().get(t.teamId)?.players ?? []).map(nomeCurtoDe).filter((p) => p !== '');
    const nomes = fromTeam.length > 0 ? fromTeam : t.label.split(/\s*\/\s*/).map(nomeCurtoDe).filter((p) => p !== '');
    return nomes.length > 0 ? nomes : ['A definir'];
  }

  protected data(e: EventoItem) {
    return eventoDataOf(e);
  }
  protected local(e: EventoItem): string {
    return eventoLocalLabel(e);
  }
  protected faltam(e: EventoItem): string {
    const n = eventoDiasRestantes(e, this.now());
    return n === 0 ? 'Começa hoje' : n === 1 ? 'Falta 1 dia' : `Faltam ${n} dias`;
  }
}

