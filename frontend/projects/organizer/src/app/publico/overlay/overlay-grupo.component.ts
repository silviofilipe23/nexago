import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { GrupoMode } from '../../painel/data/broadcast-grupo';
import { ledIniciaisDe } from '../led/led-iniciais';
import type { OverlayTeam } from './overlay-live.gateway';
import type { GrupoGame, GrupoRow, GrupoView } from './overlay-grupo';
import { nomeCurtoDe, nomesCurtosDe } from './overlay-nome';

/** Tabela do grupo (1920×1080, fundo transparente): card central com a classificação.
 *
 *  Modo `um`: cabeçalho, tabela (corte de vagas tracejado, 1ª em laranja, classificadas em verde) e
 *  os jogos do grupo. Modo `todos`: grade com os grupos compactos. Só apresentação — `gruposViewOf`
 *  já calcula classificação, andamento e jogos. */
@Component({
  selector: 'og-overlay-grupo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (grupo(); as g) {
      @if (mode() === 'um') {
        <article class="card" animate.enter="gp-in" animate.leave="gp-out">
          <header class="head">
            <div>
              <div class="ctx">Fase de grupos @if (categoryName()) { <i></i> {{ categoryName() }} }</div>
              <h1><b class="letra">{{ g.key }}</b>{{ g.title }}</h1>
            </div>
            <div class="selos">
              <span class="selo" [class.selo--live]="g.progress === 'live'"><i class="ponto"></i>{{ g.progressText }}</span>
              <span class="selo selo--vagas">{{ g.vagas }}</span>
            </div>
          </header>

          <div class="cols">
            <span>Pos</span><span>Dupla</span><span>J</span><span>V</span><span>D</span><span>Sets</span><span>Saldo</span>
          </div>
          <div class="linhas">
            @for (r of g.rows; track r.teamId; let i = $index) {
              @if (i === g.qualifiers && g.qualifiers > 0 && i < g.rows.length) {
                <div class="corte gp-row" [style.--d]="0.5 + i * 0.1 + 's'"><i></i><span>Classificam para {{ g.nextPhase }}</span><i></i></div>
              }
              <div class="lin gp-row" [class]="'lin gp-row lin--' + r.zone" [style.--d]="0.4 + i * 0.1 + 's'">
                <b class="pos">{{ r.pos }}</b>
                <div class="dupla">
                  <div class="fotos">
                    @for (p of fotos(r); track $index) {
                      <span class="foto" [class.foto--vazia]="!p.url">@if (p.url) { <img [src]="p.url" alt="" /> } @else { {{ p.ini }} }</span>
                    }
                  </div>
                  <div class="nomes">
                    <span class="nome">{{ nome(r) }}</span>
                    <span class="status">{{ r.status }}</span>
                  </div>
                </div>
                <span class="n">{{ r.j }}</span>
                <b class="n n--v">{{ r.v }}</b>
                <span class="n">{{ r.d }}</span>
                <span class="n n--sets">{{ r.sets }}</span>
                <b class="n n--saldo" [class.pos-n]="r.saldo > 0" [class.neg-n]="r.saldo < 0">{{ r.saldo > 0 ? '+' + r.saldo : r.saldo }}</b>
              </div>
            }
          </div>

          <div class="jogos-t gp-row" style="--d: 0.9s">Jogos do grupo</div>
          <div class="jogos">
            @for (j of g.games; track j.matchId; let i = $index) {
              <div class="jogo gp-row" [class.jogo--live]="j.state === 'live'" [style.--d]="1 + i * 0.07 + 's'">
                <span class="jn" [class.jn--win]="j.winner === 'A'">{{ nomeJogo(j.a) }}</span>
                <div class="jc">
                  @if (j.state === 'scheduled') {
                    <b class="jc-vs">VS</b>
                  } @else {
                    <b class="jc-placar">{{ j.score }}</b>
                  }
                  <span class="jc-d" [class.jc-d--live]="j.state === 'live'">{{ j.detail }}</span>
                </div>
                <span class="jn jn--r" [class.jn--win]="j.winner === 'B'">{{ nomeJogo(j.b) }}</span>
              </div>
            }
          </div>

          <footer class="rodape">
            <span>{{ eventName() }}</span>
            <span>Critério: <b>Vitórias</b> · <b>Saldo de pontos</b> · <b>Confronto direto</b></span>
          </footer>
        </article>
      } @else {
        <article class="card card--todos" animate.enter="gp-in" animate.leave="gp-out">
          <header class="head head--todos">
            <div>
              <div class="ctx">{{ eventName() }} @if (eventName()) { <i></i> } Fase de grupos</div>
              <h1 class="h1-cat">{{ categoryName() }}</h1>
            </div>
            <span class="selo selo--vagas">{{ g.qualifiers }} por grupo · {{ g.nextPhase }}</span>
          </header>
          <div class="grade" [style.grid-template-columns]="'repeat(' + colunas() + ', 1fr)'">
            @for (gr of todos(); track gr.key; let gi = $index) {
              <section class="gcard gp-row" [class.gcard--on]="gr.key === destaque()" [style.--d]="0.3 + gi * 0.12 + 's'">
                <header class="g-head">
                  <span class="g-t"><b class="letra letra--s">{{ gr.key }}</b>{{ gr.title }}</span>
                  <span class="g-p">{{ gr.progress === 'live' ? 'Ao vivo' : gr.progressText.replace('Jogos ', '').replace(' de ', '/') + (gr.progress === 'andamento' ? ' jogos' : '') }}</span>
                </header>
                <div class="g-cols"><span>#</span><span>Dupla</span><span>V</span><span>Sets</span><span>Saldo</span></div>
                @for (r of gr.rows; track r.teamId; let i = $index) {
                  <div class="g-lin" [class]="'g-lin lin--' + r.zone">
                    <span class="g-pos">{{ r.pos }}</span>
                    <div class="g-dupla">
                      <div class="fotos fotos--s">
                        @for (p of fotos(r); track $index) {
                          <span class="foto foto--s" [class.foto--vazia]="!p.url">@if (p.url) { <img [src]="p.url" alt="" /> } @else { {{ p.ini }} }</span>
                        }
                      </div>
                      <span class="g-nome">{{ nome(r) }}</span>
                    </div>
                    <b class="g-n">{{ r.v }}</b>
                    <span class="g-n g-sets">{{ r.sets }}</span>
                    <b class="g-n" [class.pos-n]="r.saldo > 0" [class.neg-n]="r.saldo < 0">{{ r.saldo > 0 ? '+' + r.saldo : r.saldo }}</b>
                  </div>
                }
              </section>
            }
          </div>
        </article>
      }
    }
  `,
  styles: `
    :host {
      --o5: var(--nx-orange-500, #ff6a1a);
      --o4: var(--nx-orange-400, #ff8a4a);
      --verde: #3ddc84;
      --verm: #ff6b6b;
      --mono: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      position: absolute;
      inset: 0;
      z-index: 35;
      display: block;
      pointer-events: none;
      font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif);
      color: #fff;
    }
    .card {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 1260px;
      margin-left: -630px;
      transform: translateY(-50%);
      box-sizing: border-box;
      overflow: hidden;
      border-radius: 18px;
      background: #0e0e10;
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 40px 100px rgba(0, 0, 0, 0.6);
    }
    .card--todos {
      width: 1740px;
      margin-left: -870px;
    }
    .gp-in {
      animation: gp-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .gp-out {
      animation: gp-out 0.45s ease-in both;
    }
    @keyframes gp-in {
      from {
        opacity: 0;
        transform: translateY(calc(-50% + 40px));
      }
    }
    @keyframes gp-out {
      to {
        opacity: 0;
        transform: translateY(calc(-50% + 40px));
      }
    }
    /* Linhas entram da esquerda em sequência. */
    .gp-row {
      animation: gp-row 0.6s cubic-bezier(0.22, 1, 0.36, 1) var(--d, 0.3s) both;
    }
    @keyframes gp-row {
      from {
        opacity: 0;
        transform: translateX(-30px);
      }
    }

    .head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 30px 34px 22px;
      background: linear-gradient(180deg, rgba(255, 106, 26, 0.16), transparent);
    }
    .ctx {
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: var(--mono);
      font-size: 14px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }
    .ctx i {
      width: 1px;
      height: 14px;
      background: rgba(255, 255, 255, 0.25);
    }
    h1 {
      display: flex;
      align-items: center;
      gap: 16px;
      margin: 10px 0 0;
      font-size: 60px;
      font-weight: 800;
      letter-spacing: -0.02em;
      text-transform: uppercase;
    }
    .h1-cat {
      font-size: 56px;
    }
    .letra {
      display: grid;
      place-items: center;
      width: 64px;
      height: 64px;
      border-radius: 10px;
      background: var(--o5);
      color: #120600;
      font-size: 44px;
    }
    .letra--s {
      width: 36px;
      height: 36px;
      border-radius: 7px;
      font-size: 22px;
    }
    .selos {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 12px;
    }
    .selo {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 9px 18px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.04);
      font-family: var(--mono);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }
    .selo--live .ponto {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--verde);
      box-shadow: 0 0 10px var(--verde);
    }
    .selo:not(.selo--live) .ponto {
      display: none;
    }
    .selo--vagas {
      color: var(--verde);
      border-color: rgba(61, 220, 132, 0.4);
      background: rgba(61, 220, 132, 0.08);
    }

    .cols,
    .lin {
      display: grid;
      grid-template-columns: 70px 1fr 70px 70px 70px 110px 110px;
      align-items: center;
    }
    .cols {
      padding: 12px 34px;
      border-top: 1px solid rgba(255, 255, 255, 0.07);
      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
      font-family: var(--mono);
      font-size: 12px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.45);
      text-align: center;
    }
    .cols span:nth-child(2) {
      text-align: left;
    }
    .linhas {
      padding: 8px 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .lin {
      padding: 10px 20px;
      border-radius: 10px;
      border: 1px solid transparent;
      background: rgba(255, 255, 255, 0.02);
    }
    .lin--lider {
      background: linear-gradient(90deg, rgba(255, 106, 26, 0.22), rgba(255, 106, 26, 0.08));
      border-color: rgba(255, 106, 26, 0.6);
    }
    .lin--classifica {
      background: rgba(61, 220, 132, 0.08);
      border-color: rgba(61, 220, 132, 0.4);
    }
    .lin--fora {
      opacity: 0.6;
    }
    .pos {
      font-size: 34px;
      font-weight: 800;
      text-align: center;
    }
    .dupla {
      display: flex;
      align-items: center;
      gap: 16px;
      min-width: 0;
    }
    .fotos {
      display: flex;
      flex: none;
    }
    .foto {
      display: grid;
      place-items: center;
      overflow: hidden;
      width: 46px;
      height: 46px;
      box-sizing: border-box;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.3);
      background: #1a1a1d;
      font-size: 14px;
      font-weight: 800;
      color: rgba(255, 255, 255, 0.8);
    }
    .foto + .foto {
      margin-left: -14px;
    }
    .foto img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .foto--vazia {
      border: 1.5px dashed rgba(255, 255, 255, 0.28);
      background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0 6px, transparent 6px 12px), #151517;
    }
    .lin--lider .foto {
      border-color: var(--o5);
    }
    .nomes {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }
    .nome {
      font-size: 28px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: -0.01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .status {
      font-family: var(--mono);
      font-size: 11px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.45);
    }
    .lin--lider .status {
      color: var(--o4);
    }
    .lin--classifica .status {
      color: var(--verde);
    }
    .n {
      text-align: center;
      font-family: var(--mono);
      font-size: 30px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.55);
    }
    .n--v {
      color: #fff;
    }
    .n--sets {
      font-size: 26px;
    }
    .pos-n {
      color: var(--verde);
    }
    .neg-n {
      color: var(--verm);
    }
    .corte {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 2px 6px;
      font-family: var(--mono);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--verde);
    }
    .corte i {
      flex: 1;
      border-top: 1.5px dashed rgba(61, 220, 132, 0.55);
    }

    .jogos-t {
      padding: 18px 34px 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.07);
      font-family: var(--mono);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--o5);
    }
    .jogos {
      padding: 4px 24px 18px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .jogo {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      column-gap: 12px;
      padding: 12px 16px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.07);
      background: rgba(255, 255, 255, 0.025);
    }
    .jogo--live {
      border-color: var(--o5);
      background: rgba(255, 106, 26, 0.1);
    }
    .jn {
      font-size: 17px;
      font-weight: 800;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.6);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .jn--r {
      text-align: right;
    }
    .jn--win {
      color: #fff;
    }
    .jc {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      min-width: 150px;
    }
    .jc-placar {
      font-family: var(--mono);
      font-size: 22px;
    }
    .jc-vs {
      font-family: var(--mono);
      font-size: 14px;
      letter-spacing: 0.2em;
      color: rgba(255, 255, 255, 0.5);
    }
    .jc-d {
      font-family: var(--mono);
      font-size: 11px;
      letter-spacing: 0.08em;
      color: rgba(255, 255, 255, 0.45);
    }
    .jc-d--live {
      color: var(--o4);
    }
    .rodape {
      display: flex;
      justify-content: space-between;
      padding: 16px 34px;
      border-top: 1px solid rgba(255, 255, 255, 0.07);
      background: rgba(0, 0, 0, 0.3);
      font-family: var(--mono);
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.45);
    }
    .rodape b {
      color: #fff;
    }

    /* Todos os grupos. */
    .head--todos {
      padding-bottom: 24px;
    }
    .grade {
      padding: 6px 24px 28px;
      display: grid;
      gap: 18px;
    }
    .gcard {
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.02);
      padding: 14px 14px 12px;
    }
    .gcard--on {
      border-color: var(--o5);
    }
    .g-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 6px 10px;
    }
    .g-t {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 26px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .g-p {
      font-family: var(--mono);
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }
    .g-cols,
    .g-lin {
      display: grid;
      grid-template-columns: 40px 1fr 50px 70px 70px;
      align-items: center;
    }
    .g-cols {
      padding: 6px 10px;
      font-family: var(--mono);
      font-size: 11px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.4);
      text-align: center;
    }
    .g-cols span:nth-child(2) {
      text-align: left;
    }
    .g-lin {
      margin-top: 5px;
      padding: 6px 10px;
      border-radius: 8px;
      border: 1px solid transparent;
      background: rgba(255, 255, 255, 0.02);
    }
    .g-pos {
      text-align: center;
      font-size: 20px;
      font-weight: 800;
    }
    .g-dupla {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .fotos--s .foto + .foto {
      margin-left: -12px;
    }
    .foto--s {
      width: 34px;
      height: 34px;
      font-size: 11px;
    }
    .g-nome {
      font-size: 20px;
      font-weight: 800;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .g-n {
      text-align: center;
      font-family: var(--mono);
      font-size: 20px;
      font-weight: 700;
    }
    .g-sets {
      color: rgba(255, 255, 255, 0.55);
    }
  `,
})
export class OverlayGrupoComponent {
  /** Grupo do modo `um` (já escolhido pela página). */
  readonly grupo = input<GrupoView | null>(null);
  /** Todos os grupos da categoria (modo `todos`). */
  readonly todos = input<GrupoView[]>([]);
  readonly mode = input<GrupoMode>('um');
  /** Letra do grupo em destaque no modo `todos`. */
  readonly destaque = input<string | null>(null);
  readonly categoryName = input('');
  readonly eventName = input('');
  readonly teams = input<ReadonlyMap<string, OverlayTeam>>(new Map());

  protected readonly colunas = computed(() => (this.todos().length <= 4 ? 2 : 3));

  private players(t: { teamId: string; label: string }): string[] {
    const fromTeam = (this.teams().get(t.teamId)?.players ?? []).map(nomeCurtoDe).filter((p) => p !== '');
    return fromTeam.length > 0 ? fromTeam : t.label.split(/\s*\/\s*/).map(nomeCurtoDe).filter((p) => p !== '');
  }

  protected nome(r: GrupoRow): string {
    const p = this.players({ teamId: r.teamId, label: r.label });
    return p.length > 0 ? p.join(' / ') : nomesCurtosDe(r.label);
  }

  /** Nomes nos jogos do grupo: só o último termo de cada atleta cabe ("BERGER / NILSSON"). */
  protected nomeJogo(t: { teamId: string; label: string }): string {
    const p = this.players(t);
    return p.length > 0 ? p.map((n) => n.split(/\s+/).at(-1) ?? n).join(' / ') : 'A definir';
  }

  /** Foto de cada atleta da dupla, ou as iniciais do nome. */
  protected fotos(r: GrupoRow): { url: string | null; ini: string }[] {
    const team = this.teams().get(r.teamId);
    const names = this.players({ teamId: r.teamId, label: r.label });
    return [0, 1].map((i) => ({ url: team?.photos[i] ?? null, ini: ledIniciaisDe(names[i] ?? '') || '?' }));
  }
}
