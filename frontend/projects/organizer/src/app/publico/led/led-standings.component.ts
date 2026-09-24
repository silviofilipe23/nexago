import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { OverlayMarkComponent } from '../overlay/overlay-mark.component';
import { OgAvatarComponent } from '../../painel/ui/avatar.component';
import type { KocStandingRow, KocStandingsBoard } from '../overlay/overlay-koc-standings';
import { ledIniciaisDe } from './led-iniciais';
import type { LedPlayer, LedTeam } from './led-round.component';

/** Tempos da revelação, na especificação do dono. */
const LINHA_PRIMEIRA_MS = 350;
const LINHA_INTERVALO_MS = 200;

/** Classificação da rodada KOTC em painel de LED.
 *
 *  A revelação sobe do último colocado até o 1º, pra tabela "montar" na frente de quem assiste e
 *  o campeão chegar por último. O verde sai da COTA real da rodada, não da posição 1: numa
 *  categoria com duas vagas, duas linhas acendem sozinhas. */
@Component({
  selector: 'og-led-standings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgAvatarComponent, OverlayMarkComponent],
  template: `
    @if (board(); as b) {
      <div class="tela">
        <header class="topo">
          <div class="topo-textos">
          <h1 class="titulo">
            Rodada <span class="num">{{ roundLabel() }}</span> encerrada
          </h1>
          <div class="contexto">{{ contexto() }}</div>
          </div>
          <og-overlay-mark [flow]="true" />
        </header>

        <div class="linhas">
          @for (row of b.rows; track row.teamId; let i = $index) {
            <div
              class="linha"
              [class.linha--classificada]="classificada(row)"
              [style.animation-delay]="atrasoCss(row, i)"
            >
              <span class="pos">{{ row.place }}</span>
              <span class="avatares">
                @for (p of atletasDe(row.teamId); track $index) {
                  <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="78" />
                }
              </span>
              <span class="nomes">{{ nomesDe(row.teamId).join(' · ') }}</span>
              @if (classificada(row)) {
                <span class="tag">Classificada</span>
              }
              <span class="pontos">{{ row.points }}</span>
            </div>
          }
        </div>
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

    .tela {
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 26px;
      height: 100%;
      padding: 40px 48px 44px;
      box-sizing: border-box;
    }

    .topo {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 32px;
    }
    .topo-textos {
      min-width: 0;
    }

    .titulo {
      margin: 0;
      font-size: 64px;
      font-weight: 800;
      line-height: 1;
    }
    .num {
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

    .linhas {
      display: grid;
      align-content: start;
      gap: 16px;
      min-height: 0;
    }

    .linha {
      display: grid;
      grid-template-columns: 100px auto 1fr auto auto;
      align-items: center;
      gap: 26px;
      padding: 16px 30px;
      border-radius: 18px;
      background: #191919;
      color: #8e8e93;
      animation: led-linha 480ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes led-linha {
      from {
        opacity: 0;
        transform: translateX(-60px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    .linha--classificada {
      background: #2fd97a;
      color: #000;
      animation:
        led-linha 480ms cubic-bezier(0.22, 1, 0.36, 1) both,
        led-brilho 800ms ease-out both;
    }
    @keyframes led-brilho {
      0% {
        filter: brightness(1);
      }
      50% {
        filter: brightness(1.7);
      }
      100% {
        filter: brightness(1);
      }
    }

    .pos {
      font-size: 76px;
      font-weight: 800;
      line-height: 1;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .avatares {
      display: flex;
      align-items: center;
    }
    .avatares og-avatar + og-avatar {
      margin-left: -16px;
    }
    .avatares og-avatar {
      background: #0d0d0d;
      color: #8e8e93;
      border: 2px solid #3a3a3e;
      box-shadow: 0 0 0 2px #191919;
      box-sizing: border-box;
    }
    .linha--classificada .avatares og-avatar {
      background: #000;
      color: #fff;
      border-color: #000;
      box-shadow: 0 0 0 2px #2fd97a;
    }
    .nomes {
      font-size: 60px;
      font-weight: 800;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tag {
      padding: 10px 20px;
      border-radius: 12px;
      background: #000;
      color: #fff;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .pontos {
      font-size: 76px;
      font-weight: 800;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      text-align: right;
      min-width: 130px;
    }

    @media (prefers-reduced-motion: reduce) {
      .linha,
      .linha--classificada {
        animation: none;
      }
    }
  `,
})
export class LedStandingsComponent {
  readonly board = input<KocStandingsBoard | null>(null);
  readonly teams = input<ReadonlyMap<string, LedTeam>>(new Map<string, LedTeam>());
  readonly categoryName = input<string | null>(null);
  readonly roundLabel = input(0);

  private readonly total = computed(() => this.board()?.rows.length ?? 0);

  protected readonly contexto = computed(() => {
    const b = this.board();
    if (!b) return '';
    const vagas = `${b.vagas} ${b.vagas === 1 ? 'vaga' : 'vagas'}`;
    return [this.categoryName(), vagas, b.destino].filter((p) => !!p).join(' · ');
  });

  protected classificada(row: KocStandingRow): boolean {
    return row.place <= (this.board()?.vagas ?? 0);
  }

  /** Último colocado primeiro: o 1º é o último a entrar. */
  private atrasoDaLinha(index: number): number {
    return LINHA_PRIMEIRA_MS + (this.total() - 1 - index) * LINHA_INTERVALO_MS;
  }

  /** O brilho espera a tabela inteira. Deriva do número REAL de duplas — fixar no caso de 5
   *  faria o brilho cair no meio da entrada numa rodada de 3 ou 4. */
  private atrasoDoBrilho(): number {
    return LINHA_PRIMEIRA_MS + this.total() * LINHA_INTERVALO_MS;
  }

  protected atrasoCss(row: KocStandingRow, index: number): string {
    const entrada = `${this.atrasoDaLinha(index)}ms`;
    return this.classificada(row) ? `${entrada}, ${this.atrasoDoBrilho()}ms` : entrada;
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
}
