import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { DrawSeedPairing, DrawSessionEntrant } from '../data/draw-session.model';

interface DeSlotView {
  seed: number;
  entrant: DrawSessionEntrant | null;
  isLocked: boolean;
}

interface DeMatchView {
  matchNumber: number;
  slots: DeSlotView[];
}

/**
 * A chave de vencedores durante o sorteio de dupla eliminatória.
 *
 * Os confrontos vêm da PLANTA, resolvidos pelo servidor e gravados na sessão
 * (`bracketOutline`) — nenhuma tela conhece planta. As cabeças com bye aparecem
 * numa faixa própria, porque elas não jogam a primeira rodada e fingir que
 * jogam confunde quem assiste.
 */
@Component({
  selector: 'og-sorteio-chave-de',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="og-de">
      @if (byeEntrants().length > 0) {
        <section class="og-de-byes">
          <span class="og-de-byes-label">Entram na 2ª rodada · bye</span>
          <div class="og-de-byes-row">
            @for (bye of byeEntrants(); track bye.seed) {
              <span class="og-de-bye">
                <span class="og-de-bye-seed">{{ bye.seed }}</span>
                {{ bye.entrant?.label ?? '—' }}
              </span>
            }
          </div>
        </section>
      }

      <div class="og-de-jogos" [style.grid-template-columns]="columns()">
        @for (match of matches(); track match.matchNumber) {
          <article class="og-de-jogo" [class.hot]="isHot(match)">
            <span class="og-de-jogo-label">Jogo {{ match.matchNumber }}</span>
            @for (slot of match.slots; track slot.seed) {
              <div class="og-de-slot" [class.vazio]="!slot.entrant" [class.hot]="slot.seed === highlightSeed()">
                <span class="og-de-slot-seed">{{ slot.seed }}</span>
                @if (slot.entrant) {
                  <span class="og-de-slot-nome">{{ slot.entrant.label }}</span>
                  @if (slot.isLocked) {
                    <span class="og-de-slot-cab">C{{ slot.seed }}</span>
                  }
                } @else {
                  <span class="og-de-slot-traco"></span>
                }
              </div>
            }
          </article>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .og-de {
      display: flex;
      flex-direction: column;
      gap: 16px;
      height: 100%;
    }
    .og-de-byes {
      flex: none;
      padding: 14px 18px;
      border-radius: 16px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-de-byes-label {
      font-family: var(--nx-font-mono);
      font-size: 14px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-de-byes-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 9px;
    }
    .og-de-bye {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      padding: 8px 14px;
      border-radius: 999px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 20px;
      color: var(--nx-text);
    }
    .og-de-bye-seed {
      font-family: var(--nx-font-mono);
      font-size: 15px;
      color: var(--nx-orange-500);
    }
    .og-de-jogos {
      flex: 1;
      min-height: 0;
      display: grid;
      gap: 12px;
      /* Cards abraçam o conteúdo e a grade centraliza — mesmo motivo da grade
         de grupos: com 4 jogos, esticar até o rodapé deixa metade do telão
         vazia. */
      grid-auto-rows: minmax(0, max-content);
      align-content: center;
    }
    .og-de-jogo {
      display: flex;
      flex-direction: column;
      gap: 7px;
      padding: 12px 14px;
      border-radius: 16px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      transition: border-color 240ms var(--nx-ease-out);
    }
    .og-de-jogo.hot {
      border-color: rgb(255 106 26 / 55%);
    }
    .og-de-jogo-label {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-de-slot {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 9px 11px;
      border-radius: 11px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      min-width: 0;
    }
    .og-de-slot.vazio {
      background: transparent;
      border-style: dashed;
      border-color: var(--nx-line-strong);
    }
    .og-de-slot.hot {
      background: var(--nx-orange-tint);
      border-color: rgb(255 106 26 / 55%);
    }
    .og-de-slot-seed {
      flex: none;
      width: 26px;
      font-family: var(--nx-font-mono);
      font-size: 15px;
      font-variant-numeric: tabular-nums;
      color: var(--nx-text-dim);
    }
    .og-de-slot-nome {
      flex: 1;
      min-width: 0;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 21px;
      color: var(--nx-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-de-slot-cab {
      flex: none;
      padding: 3px 8px;
      border-radius: 7px;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
    }
    .og-de-slot-traco {
      flex: 1;
      height: 9px;
      border-radius: 999px;
      background: var(--nx-surface-2);
    }

    @media (prefers-reduced-motion: reduce) {
      .og-de-jogo {
        transition: none;
      }
    }
  `,
})
export class SorteioChaveDeComponent {
  /** Índice `i` é o seed `i + 1`. */
  readonly seedOrder = input.required<Array<DrawSessionEntrant | null>>();
  readonly pairings = input.required<DrawSeedPairing[]>();
  readonly byeSeeds = input.required<number[]>();
  readonly lockedSeedCount = input(0);
  /** Seed que acabou de ser sorteado. */
  readonly highlightSeed = input<number | null>(null);

  protected readonly matches = computed<DeMatchView[]>(() =>
    this.pairings().map((p) => ({
      matchNumber: p.matchNumber,
      slots: [p.seedA, p.seedB].map((seed) => ({
        seed,
        entrant: this.seedOrder()[seed - 1] ?? null,
        isLocked: seed <= this.lockedSeedCount(),
      })),
    })),
  );

  protected readonly byeEntrants = computed(() =>
    this.byeSeeds().map((seed) => ({ seed, entrant: this.seedOrder()[seed - 1] ?? null })),
  );

  /** Duas colunas até 8 jogos; quatro acima disso, pra caber sem afinar. */
  protected readonly columns = computed(() => {
    const count = this.matches().length;
    return `repeat(${count <= 4 ? 2 : count <= 8 ? 2 : 4}, minmax(0, 1fr))`;
  });

  protected isHot(match: DeMatchView): boolean {
    return match.slots.some((s) => s.seed === this.highlightSeed());
  }
}
