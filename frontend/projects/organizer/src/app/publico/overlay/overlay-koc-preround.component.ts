import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { OverlayMarkComponent } from './overlay-mark.component';
import { ledIniciaisDe } from '../led/led-iniciais';
import type { OverlayKocTeam } from './overlay-koc-bar.component';
import type { KocPreRound, PreRoundRow } from './overlay-koc-preround';
import type { OverlayCorner } from './overlay-selectors';

const PAPEL: Record<PreRoundRow['papel'], string> = {
  desafia: 'Entra agora · Desafia o trono',
  sequencia: 'Na sequência',
  aguardando: 'Aguardando',
};

/** Elenco da rodada KOTC que ainda não começou.
 *
 *  Preenche um buraco real da transmissão: antes do apito não existe rei nem desafiante, então o
 *  placar não tem o que desenhar e a tela ficava vazia. Aqui o que há de verdade é a ORDEM DE
 *  ENTRADA — quem começa no trono e quem desafia primeiro. */
@Component({
  selector: 'og-overlay-koc-preround',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OverlayMarkComponent],
  template: `
    @if (preRound(); as pre) {
      <div class="card" [attr.data-pos]="corner()">
        <header class="head">
          <div class="eyebrow">
            @if (courtName()) {
              <span>{{ courtName() }}</span><span class="bar">|</span>
            }
            @if (categoryName()) {
              <span>{{ categoryName() }}</span><span class="bar">|</span>
            }
            <span>{{ roundTitle() }}</span>
          </div>
          <h1 class="titulo"><span class="destaque">Próximos</span> em quadra</h1>
        </header>

        <div class="linhas">
          @for (row of pre.rows; track row.teamId) {
            <div class="linha" [class.linha--agora]="row.papel === 'desafia'">
              <span class="pos">{{ row.posicao }}</span>
              <span class="iniciais">
                @for (nome of nomesDe(row.teamId); track $index) {
                  <span class="inicial">{{ inicial(nome) }}</span>
                }
              </span>
              <span class="quem">
                <span class="nomes">{{ nomesDe(row.teamId).join(' · ') }}</span>
                <span class="papel">{{ papelDe(row) }}</span>
              </span>
            </div>
          }
        </div>

        <footer class="trono">
          No trono: <strong>{{ nomesDe(pre.tronoTeamId).join(' · ') }}</strong>
        </footer>
      </div>
      <og-overlay-mark [corner]="marcaCorner()" />
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      display: block;
      pointer-events: none;
      font-family: var(--nx-font, system-ui, sans-serif);
    }

    .card {
      position: absolute;
      width: 470px;
      max-width: calc(100% - 96px);
      border-radius: 14px;
      overflow: hidden;
      /* Opaco: é leitura por cima da câmera. */
      background: #0b0b0c;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
      --gap: 48px;
    }
    .card[data-pos='tl'] {
      top: var(--gap);
      left: var(--gap);
    }
    .card[data-pos='tr'] {
      top: var(--gap);
      right: var(--gap);
    }
    .card[data-pos='bl'] {
      bottom: var(--gap);
      left: var(--gap);
    }
    .card[data-pos='br'] {
      bottom: var(--gap);
      right: var(--gap);
    }

    .head {
      padding: 18px 20px 14px;
      background: linear-gradient(135deg, #3a1c0c 0%, #141116 68%);
    }
    .eyebrow {
      display: flex;
      gap: 9px;
      color: #8f878f;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .bar {
      color: #56505a;
    }
    .titulo {
      margin: 8px 0 0;
      font-size: 27px;
      font-weight: 800;
      color: #fff;
      letter-spacing: -0.01em;
    }
    .destaque {
      color: var(--nx-orange-500, #ff6a1a);
    }

    .linhas {
      display: grid;
      gap: 6px;
      padding: 12px;
    }

    .linha {
      display: grid;
      grid-template-columns: 26px auto 1fr;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border: 1px solid transparent;
      border-radius: 10px;
      background: #17171a;
    }
    .linha--agora {
      border-color: var(--nx-orange-500, #ff6a1a);
      background: linear-gradient(100deg, #4a2409 0%, #1e1512 100%);
    }

    .pos {
      text-align: center;
      color: #8f878f;
      font-size: 18px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .linha--agora .pos {
      color: #fff;
    }

    .iniciais {
      display: flex;
    }
    .inicial {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      border-radius: 50%;
      box-sizing: border-box;
      background: #0b0b0c;
      border: 2px solid #3a3a40;
      color: #cfc7cf;
      font-size: 13px;
      font-weight: 800;
    }
    .inicial + .inicial {
      margin-left: -10px;
    }
    .linha--agora .inicial {
      border-color: var(--nx-orange-500, #ff6a1a);
      color: var(--nx-orange-500, #ff6a1a);
    }

    .quem {
      display: grid;
      gap: 3px;
      min-width: 0;
    }
    .nomes {
      font-size: 19px;
      font-weight: 800;
      color: #e9e4e9;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .linha--agora .nomes {
      color: #fff;
    }
    .papel {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #8f878f;
    }
    .linha--agora .papel {
      color: var(--nx-orange-500, #ff6a1a);
    }

    .trono {
      padding: 13px 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      color: #8f878f;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .trono strong {
      color: #efeaef;
    }
  `,
})
export class OverlayKocPreRoundComponent {
  readonly preRound = input<KocPreRound | null>(null);
  readonly teams = input<ReadonlyMap<string, OverlayKocTeam>>(new Map<string, OverlayKocTeam>());
  readonly categoryName = input<string | null>(null);
  readonly courtName = input<string | null>(null);
  readonly roundTitle = input('');
  readonly corner = input<OverlayCorner>('tr');

  protected readonly vazio = computed(() => this.preRound() == null);

  protected nomesDe(teamId: string): string[] {
    return (this.teams().get(teamId)?.players ?? []).filter((n) => n !== '');
  }

  protected inicial(nome: string): string {
    return ledIniciaisDe(nome);
  }

  protected papelDe(row: PreRoundRow): string {
    return PAPEL[row.papel];
  }

  /** A marca vive no canto direito; sobe pro topo quando o próprio conteúdo ocupa o inferior
   *  direito, senão uma taparia a outra. */
  protected readonly marcaCorner = computed<'tr' | 'br'>(() =>
    this.corner() === 'br' ? 'tr' : 'br',
  );
}
