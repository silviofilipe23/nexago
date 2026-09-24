import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { KocPreRound, PreRoundRow } from '../overlay/overlay-koc-preround';
import { OgAvatarComponent } from '../../painel/ui/avatar.component';
import { ledIniciaisDe } from './led-iniciais';
import type { LedPlayer, LedTeam } from './led-round.component';

/** Rótulos do painel: mais explícitos que os do overlay, porque aqui quem lê é quem vai jogar. */
const PAPEL: Record<PreRoundRow['papel'], string> = {
  trono: 'No trono',
  desafia: 'Desafiante · Em quadra',
  sequencia: 'Próxima a desafiar',
  aguardando: 'Aguardando',
};

/** Elenco da rodada KOTC antes do apito, em painel de LED.
 *
 *  Mesma fonte do card do overlay (`kocPreRoundOf`): a ordem de ENTRADA, que existe antes de o
 *  servidor definir rei e desafiante. A numeração aqui é a da ordem INTEIRA — o trono é o 1 e a
 *  fila segue do 2 em diante, que é como o atleta conta a própria vez olhando o painel. */
@Component({
  selector: 'og-led-preround',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgAvatarComponent],
  template: `
    @if (preRound(); as pre) {
      <div class="tela">
        <header class="topo">
          <h1 class="titulo">Próximos em quadra</h1>
          <div class="contexto">{{ contexto() }}</div>
        </header>

        <section class="trono">
          <span class="iniciais iniciais--trono">
            @for (p of atletasDe(pre.tronoTeamId); track $index) {
              <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="128" />
            }
          </span>
          <div class="trono-corpo">
            <span class="papel papel--trono">No trono</span>
            <div class="nomes nomes--trono">
              @for (p of atletasDe(pre.tronoTeamId); track $index) {
                <span>{{ p.name }}</span>
              }
            </div>
          </div>
          <span class="ordem ordem--trono">1</span>
        </section>

        <div class="fila">
          @for (row of fila(); track row.teamId) {
            <article class="card" [class.card--emquadra]="row.papel === 'desafia'">
              <div class="card-topo">
                <span class="iniciais">
                  @for (p of atletasDe(row.teamId); track $index) {
                    <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="62" />
                  }
                </span>
                <span class="ordem">{{ row.posicao }}</span>
              </div>
              <div class="card-corpo">
                <span class="papel">{{ papelDe(row) }}</span>
                <div class="nomes">
                  @for (p of atletasDe(row.teamId); track $index) {
                    <span>{{ p.name }}</span>
                  }
                </div>
              </div>
            </article>
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
      display: flex;
      flex-direction: column;
      gap: 26px;
      height: 100%;
      padding: 40px 48px 44px;
      box-sizing: border-box;
    }

    .topo {
      flex: none;
    }
    .titulo {
      margin: 0;
      font-size: 62px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: 0.01em;
    }
    .contexto {
      margin-top: 12px;
      color: #9a9a9e;
      font-size: 30px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .trono {
      flex: 1;
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 36px;
      min-height: 0;
      padding: 26px 40px;
      border-radius: 22px;
      background: var(--nx-orange-500, #ff6a1a);
      color: #000;
    }
    .trono-corpo {
      min-width: 0;
    }

    .fila {
      flex: none;
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
      gap: 18px;
    }

    .card {
      display: grid;
      gap: 20px;
      padding: 20px 22px 24px;
      border: 3px solid transparent;
      border-radius: 18px;
      background: #141416;
      min-width: 0;
    }
    /* Quem já entra em quadra com o trono: moldura branca, visível do fundo do ginásio. */
    .card--emquadra {
      border-color: #fff;
      background: #0b0b0c;
    }

    .card-topo {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
    }

    .iniciais {
      display: flex;
      flex: none;
    }
    .iniciais og-avatar {
      display: grid;
      place-items: center;
      border-radius: 50%;
      overflow: hidden;
      box-sizing: border-box;
      background: #0b0b0c;
      border: 2px solid #3a3a40;
      color: #cfcfd4;
      font-weight: 800;
    }
    .iniciais og-avatar + og-avatar {
      margin-left: -14px;
    }
    .iniciais--trono og-avatar {
      border: 0;
      background: #000;
      color: var(--nx-orange-500, #ff6a1a);
    }
    .iniciais--trono og-avatar + og-avatar {
      margin-left: -28px;
    }

    .ordem {
      font-size: 46px;
      font-weight: 800;
      line-height: 1;
      color: #6f6f76;
      font-variant-numeric: tabular-nums;
    }
    .card--emquadra .ordem {
      color: #fff;
    }

    .papel {
      display: block;
      margin-bottom: 8px;
      font-size: 19px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #8f8f96;
    }
    .card--emquadra .papel {
      color: #fff;
    }

    .nomes {
      display: grid;
      font-size: 34px;
      font-weight: 800;
      line-height: 1.08;
      min-width: 0;
    }
    .nomes span {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Modificadores do trono vêm DEPOIS das regras base de propósito: mesma especificidade, quem
       vem por último ganha. Escritos antes, o "1" saía cinza e o rótulo sumia no laranja. */
    .papel--trono {
      color: #000;
      font-size: 32px;
      letter-spacing: 0.12em;
      opacity: 0.72;
      margin-bottom: 14px;
    }
    .nomes--trono {
      font-size: 84px;
      line-height: 1.02;
    }
    .ordem--trono {
      font-size: 132px;
      color: #000;
    }
  `,
})
export class LedPreRoundComponent {
  readonly preRound = input<KocPreRound | null>(null);
  readonly teams = input<ReadonlyMap<string, LedTeam>>(new Map<string, LedTeam>());
  readonly categoryName = input<string | null>(null);
  readonly courtName = input<string | null>(null);
  readonly roundTitle = input('');

  protected readonly contexto = computed(() =>
    [this.categoryName(), this.courtName(), this.roundTitle()].filter((p) => !!p).join(' · '),
  );

  /** O trono já tem seção própria no topo — a grade só lista quem vem depois. */
  protected readonly fila = computed(() =>
    (this.preRound()?.rows ?? []).filter((r) => r.papel !== 'trono'),
  );

  protected papelDe(row: PreRoundRow): string {
    return PAPEL[row.papel];
  }

  /** Mesma normalização da tela do jogo: descarta slot vazio e completa a inicial quando o
   *  servidor não mandou. */
  protected atletasDe(teamId: string): LedPlayer[] {
    return (this.teams().get(teamId)?.players ?? [])
      .filter((p) => p.name.trim() !== '')
      .map((p) => ({ ...p, initials: p.initials || ledIniciaisDe(p.name) }));
  }
}
