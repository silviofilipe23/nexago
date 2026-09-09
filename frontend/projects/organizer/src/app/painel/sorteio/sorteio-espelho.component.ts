import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { groupsOf, seedOrderOf } from '../data/draw-session-selectors';
import type { DrawSession, DrawSessionEntrant } from '../data/draw-session.model';
import { SorteioDuplaRowComponent } from './sorteio-dupla-row.component';

/**
 * O espelho do telão dentro do console.
 *
 * NÃO é o telão escalado. Foi o que tentei primeiro, e não serve: a arte do
 * telão é desenhada para 1920px e, espremida na coluna central do console
 * (~800px), a tipografia cai para 9-10px e vira ilegível justamente para quem
 * precisa conferir. Aqui a mesma informação é redesenhada na escala do painel —
 * e ganha o que o telão não mostra e o organizador quer: cidade e pontuação de
 * cada dupla.
 *
 * O telão continua sendo a fonte da verdade do que vai ao ar; este é o
 * instrumento de quem conduz.
 */
@Component({
  selector: 'og-sorteio-espelho',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SorteioDuplaRowComponent],
  template: `
    @if (session().format === 'groups_knockout') {
      <div class="og-esp-grade" [style.grid-template-columns]="groupColumns()">
        @for (group of groups(); track group.groupId) {
          <section class="og-esp-grupo" [class.hot]="group.groupId === highlightGroupId()">
            <header>
              <span class="og-esp-letra" [class.hot]="group.groupId === highlightGroupId()">
                {{ group.groupId }}
              </span>
              <span class="og-esp-nome">Grupo {{ group.groupId }}</span>
              <span class="og-esp-conta">{{ group.entrants.length }}/{{ group.capacity }}</span>
            </header>
            <div class="og-esp-linhas">
              @for (entrant of group.entrants; track entrant.teamId) {
                <og-sorteio-dupla-row
                  [entrant]="entrant"
                  [num]="rankOf(entrant.teamId)"
                  [seedStyle]="entrant.potIndex === 1"
                  [tone]="isJustRevealed(entrant) ? 'hot' : 'soft'"
                />
              }
              @for (slot of emptySlotsOf(group.capacity - group.entrants.length); track slot) {
                <!-- Vaga sem número: antes do sorteio a "posição" dela não
                     significa nada, e um número ali sugere ordem que não existe. -->
                <og-sorteio-dupla-row [empty]="true" />
              }
            </div>
          </section>
        }
      </div>
    } @else {
      <div class="og-esp-de">
        @if (byeRows().length > 0) {
          <section class="og-esp-byes">
            <span class="og-esp-kicker">Entram na 2ª rodada · bye</span>
            <div class="og-esp-byes-row">
              @for (bye of byeRows(); track bye.seed) {
                <span class="og-esp-bye">
                  <b>{{ bye.seed }}</b>{{ bye.entrant?.label ?? '—' }}
                </span>
              }
            </div>
          </section>
        }
        <div class="og-esp-jogos">
          @for (match of matches(); track match.matchNumber) {
            <article class="og-esp-jogo" [class.hot]="match.hot">
              <span class="og-esp-kicker">R1 · jogo {{ match.matchNumber }}</span>
              @for (slot of match.slots; track slot.seed) {
                <og-sorteio-dupla-row
                  [entrant]="slot.entrant"
                  [empty]="!slot.entrant"
                  [num]="slot.seed"
                  [seedStyle]="slot.locked"
                  [compact]="true"
                  [tone]="slot.seed === highlightSeed() ? 'hot' : 'soft'"
                >
                  @if (slot.locked) {
                    <span class="og-esp-cab">C{{ slot.seed }}</span>
                  }
                </og-sorteio-dupla-row>
              }
            </article>
          }
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      /* flex:1 e NÃO height:100%: o card que hospeda isto tem cabeçalho, e
         100% da altura do card mais o cabeçalho estoura a linha do grid.
         min-height:0 é o elo que permite encolher e rolar. */
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: none;
    }
    .og-esp-grade {
      display: grid;
      gap: 12px;
      align-content: start;
    }
    .og-esp-grupo {
      display: flex;
      flex-direction: column;
      border-radius: 18px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      overflow: hidden;
      transition: border-color 240ms var(--nx-ease-out);
    }
    .og-esp-grupo.hot {
      border-color: rgb(255 106 26 / 45%);
    }
    .og-esp-grupo header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 11px 14px;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-esp-letra {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 9px;
      background: var(--nx-surface-2);
      color: var(--nx-text);
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 16px;
    }
    .og-esp-letra.hot {
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
    }
    .og-esp-nome {
      flex: 1;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
    }
    .og-esp-conta {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      letter-spacing: 0.14em;
      color: var(--nx-text-dim);
      font-variant-numeric: tabular-nums;
    }
    .og-esp-linhas {
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding: 8px;
    }
    .og-esp-de {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .og-esp-kicker {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-esp-byes {
      padding: 11px 13px;
      border-radius: 14px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-esp-byes-row {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      margin-top: 7px;
    }
    .og-esp-bye {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 5px 11px;
      border-radius: 999px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .og-esp-bye b {
      font-family: var(--nx-font-mono);
      color: var(--nx-orange-500);
    }
    .og-esp-jogos {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      align-content: start;
    }
    .og-esp-jogo {
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding: 9px 10px;
      border-radius: 14px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      transition: border-color 240ms var(--nx-ease-out);
    }
    .og-esp-jogo.hot {
      border-color: rgb(255 106 26 / 45%);
    }
    /* Marca explícita da cabeça travada: o número laranja sozinho não diz que
       aquela posição não foi sorteada. */
    .og-esp-cab {
      flex: none;
      padding: 2px 7px;
      border-radius: 6px;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 10px;
    }

    @media (prefers-reduced-motion: reduce) {
      .og-esp-grupo,
      .og-esp-jogo {
        transition: none;
      }
    }
  `,
})
export class SorteioEspelhoComponent {
  readonly session = input.required<DrawSession>();
  /** Quantas revelações já podem aparecer (o show pode estar à frente da grade). */
  readonly visibleCount = input<number | null>(null);

  private readonly shown = computed(() => this.visibleCount() ?? this.session().reveals.length);

  protected readonly groups = computed(() => groupsOf(this.session(), this.shown()));

  private readonly lastVisible = computed(() => {
    const reveals = this.session().reveals.slice(0, this.shown());
    return reveals.length > 0 ? reveals[reveals.length - 1]! : null;
  });

  protected readonly highlightGroupId = computed(() => {
    const destination = this.lastVisible()?.destination;
    return destination?.type === 'group' ? destination.groupId : null;
  });

  protected readonly highlightSeed = computed(() => {
    const destination = this.lastVisible()?.destination;
    return destination?.type === 'seed' ? destination.seed : null;
  });

  private readonly seedOrder = computed(() => seedOrderOf(this.session(), this.shown()));

  protected readonly matches = computed(() => {
    const order = this.seedOrder();
    const locked = this.session().config.lockedSeedCount;
    return (this.session().bracketOutline?.pairings ?? []).map((p) => {
      const slots = [p.seedA, p.seedB].map((seed) => ({
        seed,
        entrant: order[seed - 1] ?? null,
        locked: seed <= locked,
      }));
      return {
        matchNumber: p.matchNumber,
        slots,
        hot: slots.some((s) => s.seed === this.highlightSeed()),
      };
    });
  });

  protected readonly byeRows = computed(() => {
    const order = this.seedOrder();
    return (this.session().bracketOutline?.byeSeeds ?? []).map((seed) => ({
      seed,
      entrant: order[seed - 1] ?? null,
    }));
  });

  /** Duas colunas até 4 grupos, três acima — a linha não pode ficar estreita. */
  protected readonly groupColumns = computed(() => {
    const count = this.groups().length;
    return `repeat(${Math.min(count <= 4 ? 2 : 3, Math.max(1, count))}, minmax(0, 1fr))`;
  });

  /** Posição da dupla no ranking que montou os potes — é o número do protótipo,
   *  e diz de imediato a força de quem caiu naquele grupo. */
  protected rankOf(teamId: string): number {
    return this.session().pots.flatMap((p) => p.teamIds).indexOf(teamId) + 1;
  }

  protected emptySlotsOf(count: number): number[] {
    return Array.from({ length: Math.max(0, count) }, (_, i) => i);
  }

  protected isJustRevealed(entrant: DrawSessionEntrant): boolean {
    return this.lastVisible()?.teamId === entrant.teamId;
  }
}
