import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { OverlayTeam } from './overlay-live.gateway';
import { GRADE_VISIBLE_ROWS, type GradeCell, type GradeView } from './overlay-grade';
import { nomeCurtoDe, nomesCurtosDe } from './overlay-nome';
import { OverlayPatroFaixaComponent } from './overlay-patro-faixa.component';
import type { OverlayPatroItem } from './overlay-nx';

const ROW_PITCH = 83;
const ROW_H = 75;
/** Uma cor por categoria, na ordem em que o torneio as lista. */
const CAT_COLORS = ['#4da3ff', '#ff6a1a', '#ff5fa8', '#a07bff', '#3ddc84', '#f2c14e'];

/** Grade do dia (1920×1080, fundo opaco): horários × quadras com a programação do dia.
 *
 *  Só apresentação — `gradeViewOf` já monta as linhas, o "agora" e a rolagem. Mostra
 *  `GRADE_VISIBLE_ROWS` linhas e desliza a trilha pra manter o horário atual perto do topo. */
@Component({
  selector: 'og-overlay-grade',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OverlayPatroFaixaComponent],
  template: `
    @if (view(); as v) {
      <div class="tela" animate.enter="gd-fade-in" animate.leave="gd-fade-out">
        <i class="luz" aria-hidden="true"></i>

        <header class="head">
          <div class="gd-up" style="--d: 0.1s">
            <div class="linha1">
              <span class="selo"><b class="shine" aria-hidden="true"></b>Programação</span>
              @if (eventName()) {
                <span class="evento">{{ eventName() }}</span>
              }
            </div>
            <h1>Grade <em>do dia</em></h1>
          </div>
          <div class="dir gd-up" style="--d: 0.2s">
            <div class="legenda">
              @for (c of categories(); track c.id; let i = $index) {
                <span class="pil" [style.--cor]="cor(c.id)">{{ c.name }}</span>
              }
            </div>
            <span class="marca">NEXA<b>GO</b></span>
          </div>
        </header>

        <div class="cabecas gd-up" style="--d: 0.3s" [style.grid-template-columns]="cols(v)">
          <span></span>
          @for (q of v.courts; track q.id) {
            <span class="qh">Quadra <b>{{ q.number }}</b></span>
          }
        </div>

        <div class="janela" [style.height.px]="janelaH">
          <div class="trilha" [style.transform]="'translateY(' + -(v.rows[v.firstVisible]?.offset ?? 0) * pitch + 'px)'">
            @for (r of v.rows; track r.startMs; let i = $index) {
              <div class="linha" [class.linha--agora]="v.now?.row === i" [style.top.px]="r.offset * pitch" [style.height.px]="r.span * pitch - gap" [style.grid-template-columns]="cols(v)" [style.--d]="0.4 + (i < 8 ? i : 8) * 0.06 + 's'">
                <span class="hora">{{ r.label }}</span>
                @for (cell of r.cells; track $index) {
                  <div class="coluna">
                  @for (c of cell; track c.matchId) {
                    <div class="jogo" [class]="'jogo jogo--' + c.state" [class.jogo--dim]="dimmed(c)" [style.--cor]="cor(c.categoryId)">
                      <div class="topo">
                        <i class="bola"></i>
                        <span>{{ catName(c.categoryId) }}@if (c.phase) { · {{ c.phase }} }</span>
                      </div>
                      <div class="duplas">
                        <span class="d" [class.d--win]="c.winner === 'A'">{{ nome(c.a) }}</span>
                        <i class="x">×</i>
                        <span class="d" [class.d--win]="c.winner === 'B'">{{ nome(c.b) }}</span>
                      </div>
                      <div class="estado">
                        @switch (c.state) {
                          @case ('final') {
                            <b class="placar">{{ c.score }}</b>
                            <span class="et">Final</span>
                          }
                          @case ('live') {
                            <span class="et et--live"><i class="ponto"></i>Ao vivo</span>
                          }
                          @case ('next') {
                            <span class="et et--next">Próximo</span>
                          }
                        }
                      </div>
                    </div>
                  } @empty {
                    <div class="vazio"></div>
                  }
                  </div>
                }
              </div>
            }
            @if (v.now; as n) {
              <div class="agora" [style.top.px]="agoraTop(v, n)">
                <span class="agora-tag">Agora · {{ n.label }}</span>
                <i class="agora-linha"></i>
              </div>
            }
          </div>
        </div>

        @if (logos().length > 0) {
          <footer class="patro gd-up" style="--d: 0.9s">
            <span class="patro-t">Oferecimento</span>
            <og-overlay-patro-faixa [itens]="logos()" [delay]="1.2" style="--h: 100px; --gap: 18px" />
          </footer>
        }
      </div>
    }
  `,
  styles: `
    :host {
      --o5: var(--nx-orange-500, #ff6a1a);
      --o4: var(--nx-orange-400, #ff8a4a);
      --mono: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      position: absolute;
      inset: 0;
      z-index: 57;
      display: block;
      pointer-events: none;
      font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif);
      color: #fff;
    }
    .tela {
      position: absolute;
      inset: 0;
      overflow: hidden;
      background: #0b0b0c;
    }
    .gd-fade-in {
      animation: gd-fade 0.5s ease both;
    }
    .gd-fade-out {
      animation: gd-fade 0.35s ease reverse both;
    }
    @keyframes gd-fade {
      from {
        opacity: 0;
      }
    }
    .luz {
      position: absolute;
      left: -120px;
      top: -200px;
      width: 900px;
      height: 700px;
      background: radial-gradient(ellipse at center, rgba(255, 106, 26, 0.24), transparent 65%);
      animation: gd-luz 10s ease-in-out infinite alternate;
    }
    @keyframes gd-luz {
      to {
        transform: translate(180px, 30px);
      }
    }
    .gd-up,
    .linha {
      animation: gd-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) var(--d, 0s) both;
    }
    @keyframes gd-up {
      from {
        opacity: 0;
        transform: translateY(20px);
        filter: blur(6px);
      }
    }

    .head {
      position: absolute;
      left: 32px;
      right: 32px;
      top: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .linha1 {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .selo {
      position: relative;
      overflow: hidden;
      padding: 9px 16px;
      border-radius: 6px;
      background: var(--o5);
      color: #120600;
      font-family: var(--mono);
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.24em;
      text-transform: uppercase;
    }
    .shine {
      position: absolute;
      inset: 0 auto 0 0;
      width: 40%;
      background: linear-gradient(105deg, transparent, rgba(255, 255, 255, 0.55), transparent);
      transform: translateX(-150%) skewX(-18deg);
      animation: gd-shine 2.8s ease-in-out infinite;
    }
    @keyframes gd-shine {
      0%,
      60% {
        transform: translateX(-150%) skewX(-18deg);
      }
      100% {
        transform: translateX(400%) skewX(-18deg);
      }
    }
    .evento {
      font-family: var(--mono);
      font-size: 14px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.75);
    }
    h1 {
      margin: 12px 0 0;
      font-size: 76px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.02em;
      text-transform: uppercase;
    }
    h1 em {
      font-style: normal;
      color: var(--o5);
    }
    .dir {
      display: flex;
      align-items: center;
      gap: 36px;
      margin-top: 44px;
    }
    .legenda {
      display: flex;
      gap: 10px;
    }
    .pil {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      padding: 8px 16px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.03);
      font-family: var(--mono);
      font-size: 12px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.75);
    }
    .pil::before {
      content: '';
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--cor);
    }
    .marca {
      font-size: 30px;
      font-weight: 800;
    }
    .marca b {
      color: var(--o5);
    }

    .cabecas {
      position: absolute;
      left: 32px;
      right: 32px;
      top: 206px;
      display: grid;
      column-gap: 10px;
    }
    .qh {
      padding: 12px 16px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.07);
      background: #111113;
      font-family: var(--mono);
      font-size: 13px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.65);
    }
    .qh b {
      margin-left: 6px;
      color: #fff;
    }

    .janela {
      position: absolute;
      left: 32px;
      right: 32px;
      top: 262px;
      overflow: hidden;
    }
    .trilha {
      position: relative;
      transition: transform 0.9s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .linha {
      position: absolute;
      left: 0;
      right: 0;
      display: grid;
      column-gap: 10px;
      align-items: stretch;
    }
    .hora {
      align-self: center;
      font-family: var(--mono);
      font-size: 22px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.5);
    }
    .linha--agora .hora {
      color: #fff;
    }
    /* Jogos empilhados quando mais de um cai no mesmo bloco da mesma quadra. */
    .coluna {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: ${ROW_PITCH - ROW_H}px;
    }
    .coluna > .jogo {
      flex: none;
      height: ${ROW_H}px;
    }
    .coluna > .vazio {
      flex: 1;
    }
    .vazio {
      border-radius: 8px;
      border: 1.5px dashed rgba(255, 255, 255, 0.1);
      background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0 8px, transparent 8px 16px);
    }
    .jogo {
      position: relative;
      min-width: 0;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: #131315;
      display: grid;
      grid-template-columns: 1fr auto;
      grid-template-rows: auto 1fr;
      column-gap: 12px;
    }
    .topo {
      grid-column: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--mono);
      font-size: 11px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.55);
      white-space: nowrap;
      overflow: hidden;
    }
    .topo span {
      color: var(--cor);
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bola {
      flex: none;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--cor);
    }
    .duplas {
      grid-column: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      font-size: 19px;
      font-weight: 700;
      white-space: nowrap;
    }
    .d {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .x {
      flex: none;
      font-style: normal;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.4);
    }
    .estado {
      grid-column: 2;
      grid-row: 1 / span 2;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      justify-content: center;
      gap: 2px;
    }
    .et {
      font-family: var(--mono);
      font-size: 10px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.45);
    }
    .et--live {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #ff6b6b;
    }
    .ponto {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #ff3b3b;
      animation: gd-pulse 1.1s ease-in-out infinite;
    }
    @keyframes gd-pulse {
      50% {
        opacity: 0.3;
      }
    }
    .et--next {
      color: var(--o4);
    }
    .placar {
      font-family: var(--mono);
      font-size: 24px;
      font-weight: 700;
    }
    /* Final: cartão apagado, vencedor em branco. */
    .jogo--final {
      opacity: 0.62;
    }
    .jogo--final .d {
      color: rgba(255, 255, 255, 0.5);
    }
    .jogo--final .d--win {
      color: #fff;
    }
    /* Ao vivo: fundo mais forte, borda colorida com brilho. */
    .jogo--live {
      background: color-mix(in srgb, var(--cor) 16%, #131315);
      border-color: var(--cor);
      box-shadow: 0 0 18px color-mix(in srgb, var(--cor) 55%, transparent);
    }
    .jogo--next {
      border-color: rgba(255, 106, 26, 0.55);
      background: color-mix(in srgb, var(--o5) 8%, #131315);
    }
    /* Categoria filtrada: o resto fica esmaecido e cinza. */
    .jogo--dim {
      --cor: #6b6b72;
      opacity: 0.35;
      box-shadow: none;
    }

    .agora {
      position: absolute;
      left: 0;
      right: 0;
      height: 0;
      z-index: 3;
    }
    .agora-linha {
      position: absolute;
      left: 100px;
      right: 0;
      top: -1px;
      height: 2px;
      background: linear-gradient(90deg, var(--o5), rgba(255, 106, 26, 0.4));
      box-shadow: 0 0 14px var(--o5);
    }
    .agora-tag {
      position: absolute;
      left: 0;
      top: -12px;
      padding: 4px 9px;
      border-radius: 4px;
      background: var(--o5);
      color: #120600;
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .patro {
      position: absolute;
      left: 32px;
      right: 32px;
      bottom: 26px;
      display: flex;
      align-items: center;
      gap: 24px;
      padding-top: 14px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
    .patro-t {
      width: 100px;
      font-family: var(--mono);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--o5);
    }
  `,
})
export class OverlayGradeComponent {
  readonly view = input<GradeView | null>(null);
  readonly categories = input<{ id: string; name: string }[]>([]);
  readonly categoryId = input<string | null>(null);
  readonly teams = input<ReadonlyMap<string, OverlayTeam>>(new Map());
  readonly eventName = input('');
  readonly sponsors = input<OverlayPatroItem[]>([]);

  protected readonly pitch = ROW_PITCH;
  protected readonly roww = ROW_H;
  protected readonly gap = ROW_PITCH - ROW_H;
  /** Altura da janela: `GRADE_VISIBLE_ROWS` linhas (a última sem o espaço de respiro). */
  protected readonly janelaH = GRADE_VISIBLE_ROWS * ROW_PITCH - (ROW_PITCH - ROW_H);
  protected readonly logos = computed(() => this.sponsors());

  /** Posição do "agora": dentro da linha atual, proporcional ao horário. */
  protected agoraTop(v: GradeView, n: { row: number; frac: number }): number {
    const r = v.rows[n.row];
    if (!r) return 0;
    return r.offset * ROW_PITCH + n.frac * (r.span * ROW_PITCH - (ROW_PITCH - ROW_H));
  }

  protected cols(v: GradeView): string {
    return `100px repeat(${v.courts.length}, minmax(0, 1fr))`;
  }

  protected cor(categoryId: string | null): string {
    const i = this.categories().findIndex((c) => c.id === categoryId);
    return CAT_COLORS[(i < 0 ? 0 : i) % CAT_COLORS.length]!;
  }

  protected catName(categoryId: string | null): string {
    return this.categories().find((c) => c.id === categoryId)?.name ?? '';
  }

  /** Com uma categoria em destaque, o resto fica esmaecido. */
  protected dimmed(c: GradeCell): boolean {
    const f = this.categoryId();
    return f !== null && c.categoryId !== f;
  }

  protected nome(t: { teamId: string; label: string }): string {
    const players = (this.teams().get(t.teamId)?.players ?? []).map(nomeCurtoDe).filter((p) => p !== '');
    return players.length > 0 ? players.join(' / ') : nomesCurtosDe(t.label);
  }
}
