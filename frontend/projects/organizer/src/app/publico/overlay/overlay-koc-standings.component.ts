import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { OverlayMarkComponent } from './overlay-mark.component';
import type { OverlayKocTeam } from './overlay-koc-bar.component';
import type { KocStandingRow, KocStandingsBoard } from './overlay-koc-standings';

/** Tempos da revelação, na especificação do dono. */
const ROW_STAGGER_MS = 130;
const ROW_FIRST_DELAY_MS = 260;
const ROW_DURATION_MS = 440;

/** Classificação da rodada KOTC encerrada.
 *
 *  A revelação vai do ÚLTIMO colocado ao primeiro, para o 1º lugar chegar por último e receber o
 *  brilho. `@for` rastreia por `teamId` de propósito: placar novo troca só o texto, sem recriar a
 *  linha — é o que faz a tabela se redesenhar SEM re-animar. Para rodar a revelação de novo é
 *  preciso `mostrar()`, que recria o card. */
@Component({
  selector: 'og-overlay-koc-standings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OverlayMarkComponent],
  template: `
    @if (visible() && board(); as b) {
      <div class="card" [class.card--out]="saindo()">
        <header class="head">
          <div class="eyebrow">
            <span>{{ phaseName() }}</span>
            @if (courtName()) {
              <span class="bar">|</span><span>{{ courtName() }}</span>
            }
          </div>
          <h1 class="title">{{ categoryName() }}</h1>
          <div class="sub">
            Classificação · Rodada {{ roundLabel() }} de {{ b.totalRounds || roundLabel() }}
          </div>
          <span class="badge"><i class="square"></i>Rodada encerrada</span>
        </header>

        <div class="cols">
          <span>Pos</span>
          <span>Dupla</span>
          <span class="right">Pontos</span>
        </div>

        <div class="rows">
          @for (row of b.rows; track row.teamId; let i = $index) {
            @if (corteAntesDe(i)) {
              <div class="cut" [style.animation-delay.ms]="atrasoDoCorte()">
                <span>{{ b.vagas }} {{ b.vagas === 1 ? 'vaga' : 'vagas' }}</span>
                @if (b.destino) {
                  <span>· {{ b.destino }}</span>
                }
              </div>
            }
            <div
              class="row"
              [attr.data-status]="row.status"
              [style.animation-delay]="atrasoDaLinhaCss(row, i)"
            >
              <span class="pos">{{ row.place }}</span>
              <div class="who">
                <span class="names">{{ nomesDe(row.teamId) }}</span>
                <span class="tag">{{ selo(row) }}</span>
              </div>
              <span class="pts">{{ row.points }}</span>
            </div>
          }
        </div>

        <footer class="foot">
          <span>King of the Court</span>
          @if (b.proxima) {
            <span>Próxima: <strong>{{ b.proxima }}</strong></span>
          }
        </footer>
      </div>
      <og-overlay-mark />
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      pointer-events: none;
      font-family: var(--nx-font, system-ui, sans-serif);
    }

    .card {
      width: 730px;
      max-width: calc(100% - 96px);
      border-radius: 18px;
      overflow: hidden;
      /* Opaco: é uma tela de leitura por cima do vídeo. */
      background: #121013;
      box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
      animation: cardIn 560ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .card--out {
      /* Saída mais curta que a entrada, pra liberar a tela logo. */
      animation: cardOut 380ms cubic-bezier(0.4, 0, 1, 1) both;
    }

    @keyframes cardIn {
      from {
        opacity: 0;
        transform: translateY(40px) scale(0.97);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @keyframes cardOut {
      from {
        opacity: 1;
        transform: none;
      }
      to {
        opacity: 0;
        transform: translateY(30px) scale(0.98);
      }
    }

    .head {
      position: relative;
      padding: 30px 34px 26px;
      background: linear-gradient(135deg, #3a1c0c 0%, #1a1216 62%);
    }
    .eyebrow {
      display: flex;
      gap: 12px;
      color: #9a9098;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }
    .bar {
      color: #5c545c;
    }
    .title {
      margin: 10px 0 8px;
      font-size: 44px;
      font-weight: 800;
      letter-spacing: -0.01em;
      color: #fff;
    }
    .sub {
      color: var(--nx-orange-500, #ff6a1a);
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .badge {
      position: absolute;
      top: 50%;
      right: 34px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 20px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.06);
      color: #d8d2d8;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .square {
      width: 9px;
      height: 9px;
      background: #9a9098;
    }

    .cols {
      display: grid;
      grid-template-columns: 62px 1fr auto;
      gap: 16px;
      padding: 14px 34px;
      border-top: 1px solid rgba(255, 255, 255, 0.07);
      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
      color: #7d757d;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }
    .right {
      text-align: right;
    }

    .rows {
      padding: 14px 24px 8px;
    }

    .row {
      display: grid;
      grid-template-columns: 62px 1fr auto;
      gap: 16px;
      align-items: center;
      margin-bottom: 12px;
      padding: 16px 14px;
      border: 1px solid transparent;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.04);
      animation: rowIn 440ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes rowIn {
      from {
        opacity: 0;
        transform: translateX(-32px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    .row[data-status='king'] {
      border-color: var(--nx-orange-500, #ff6a1a);
      background: linear-gradient(100deg, #5a2a0d 0%, #2a1a12 100%);
      /* O brilho entra depois que TODAS as linhas já apareceram — atraso vem do TS. */
      animation:
        rowIn 440ms cubic-bezier(0.22, 1, 0.36, 1) both,
        kingFlash 700ms ease-out both;
    }
    @keyframes kingFlash {
      0% {
        filter: brightness(1);
      }
      50% {
        filter: brightness(1.8);
      }
      100% {
        filter: brightness(1);
      }
    }
    .row[data-status='qualified'] {
      border-color: #2f7d4f;
      background: linear-gradient(100deg, #10301f 0%, #14201a 100%);
    }

    .pos {
      font-size: 30px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      text-align: center;
      color: #b9b1b9;
    }
    .row[data-status='king'] .pos,
    .row[data-status='qualified'] .pos {
      color: #fff;
    }

    .who {
      display: grid;
      gap: 5px;
      min-width: 0;
    }
    .names {
      font-size: 27px;
      font-weight: 800;
      color: #efeaef;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .row[data-status='king'] .names,
    .row[data-status='qualified'] .names {
      color: #fff;
    }
    .tag {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #7d757d;
    }
    .row[data-status='king'] .tag {
      color: var(--nx-orange-500, #ff6a1a);
    }
    .row[data-status='qualified'] .tag {
      color: #4fbf80;
    }

    .pts {
      font-size: 34px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: #cfc7cf;
    }
    .row[data-status='king'] .pts,
    .row[data-status='qualified'] .pts {
      color: #fff;
    }

    .cut {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      margin: 4px 0 16px;
      padding: 0 8px;
      color: #6f8f7c;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      border-top: 1px dashed rgba(120, 170, 140, 0.45);
      animation: cutIn 400ms ease both;
    }
    .cut span {
      transform: translateY(-9px);
      background: #121013;
      padding: 0 10px;
    }
    @keyframes cutIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    .foot {
      display: flex;
      justify-content: space-between;
      padding: 18px 34px;
      border-top: 1px solid rgba(255, 255, 255, 0.07);
      color: #7d757d;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    .foot strong {
      color: #efeaef;
    }

    @media (prefers-reduced-motion: reduce) {
      .card,
      .card--out,
      .row,
      .row[data-status='king'],
      .cut {
        animation: none;
      }
    }
  `,
})
export class OverlayKocStandingsComponent {
  readonly board = input<KocStandingsBoard | null>(null);
  readonly teams = input<ReadonlyMap<string, OverlayKocTeam>>(new Map<string, OverlayKocTeam>());
  readonly categoryName = input<string | null>(null);
  readonly courtName = input<string | null>(null);
  readonly phaseName = input<string | null>(null);
  readonly roundLabel = input(0);

  protected readonly visible = signal(true);
  protected readonly saindo = signal(false);

  private readonly total = computed(() => this.board()?.rows.length ?? 0);

  /** Revelação do último colocado para o primeiro. */
  protected atrasoDaLinha(index: number): number {
    return ROW_FIRST_DELAY_MS + (this.total() - 1 - index) * ROW_STAGGER_MS;
  }

  /** A linha do campeão tem DUAS animações (entrada + brilho) e cada uma tem seu atraso — um
   *  valor só faria o brilho disparar junto com a entrada. */
  protected atrasoDaLinhaCss(row: KocStandingRow, index: number): string {
    const entrada = this.atrasoDaLinha(index) + 'ms';
    return row.status === 'king' ? `${entrada}, ${this.atrasoDoBrilho()}ms` : entrada;
  }

  /** O corte entra logo antes das classificadas, que são as últimas a aparecer. */
  protected atrasoDoCorte(): number {
    const vagas = this.board()?.vagas ?? 0;
    return ROW_FIRST_DELAY_MS + Math.max(0, this.total() - vagas - 1) * ROW_STAGGER_MS;
  }

  /** O brilho do campeão só faz sentido com a tabela inteira na tela. */
  protected atrasoDoBrilho(): number {
    return ROW_FIRST_DELAY_MS + this.total() * ROW_STAGGER_MS + ROW_DURATION_MS;
  }

  protected corteAntesDe(index: number): boolean {
    const rows = this.board()?.rows ?? [];
    return rows[index]?.status === 'out' && rows[index - 1]?.status !== 'out';
  }

  protected nomesDe(teamId: string): string {
    return (this.teams().get(teamId)?.players ?? []).filter((n) => n !== '').join(' · ');
  }

  protected selo(row: KocStandingRow): string {
    const destino = this.board()?.destino;
    if (row.status === 'out') return 'Eliminada';
    const base = row.status === 'king' ? '1º lugar' : 'Classificada';
    return destino ? `${base} · ${destino}` : base;
  }

  /** Roda a revelação de novo: recria o card, que é o que reinicia as animações CSS. */
  mostrar(): void {
    this.saindo.set(false);
    this.visible.set(false);
    queueMicrotask(() => this.visible.set(true));
  }

  entrar(): void {
    this.saindo.set(false);
    this.visible.set(true);
  }

  sair(): void {
    this.saindo.set(true);
  }
}
