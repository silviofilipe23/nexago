import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Os dois dados sendo lançados — o suspense de cada revelação.
 *
 * Dado da esquerda: os nomes ainda no pote passando. Dado da direita: os
 * destinos possíveis. Quando `landed` fica true, os dois param no resultado.
 *
 * O nome que aparece durante o rolamento é DERIVADO do relógio
 * (`floor(elapsed / 90) % nomes`), não de estado local. Isso importa: duas
 * telas com o mesmo `now` mostram o mesmo nome, e um telão que reconecta no
 * meio do rolamento entra em fase — sem timer próprio pra dessincronizar.
 */
@Component({
  selector: 'og-sorteio-dados',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="og-dados" [class.landed]="landed()">
      <div class="og-die og-die-team">
        <div class="og-die-face">{{ teamFace() }}</div>
      </div>
      <div class="og-die-x">×</div>
      <div class="og-die og-die-dest">
        <div class="og-die-face">{{ destinationFace() }}</div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .og-dados {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 28px;
    }
    .og-die {
      display: grid;
      place-items: center;
      min-width: 340px;
      height: 220px;
      padding: 0 32px;
      border-radius: 28px;
      background: var(--nx-surface-1);
      border: 2px solid var(--nx-line-strong);
      box-shadow: 0 24px 60px rgb(0 0 0 / 65%);
      animation: og-die-shake 380ms cubic-bezier(0.36, 0.07, 0.19, 0.97) infinite;
    }
    .og-die-dest {
      min-width: 260px;
    }
    .og-die-face {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 46px;
      letter-spacing: -0.02em;
      text-align: center;
      line-height: 1.05;
      color: var(--nx-text);
    }
    .og-die-x {
      font-family: var(--nx-font-mono);
      font-size: 34px;
      color: var(--nx-text-dim);
    }
    /* Travou: para de sacudir, acende laranja e cresce um toque. */
    .landed .og-die {
      animation: none;
      border-color: var(--nx-orange-500);
      background: var(--nx-orange-tint);
      transform: scale(1.04);
      transition:
        transform 220ms var(--nx-ease-out),
        background 220ms var(--nx-ease-out),
        border-color 220ms var(--nx-ease-out);
    }
    .landed .og-die-dest .og-die-face {
      color: var(--nx-orange-500);
    }

    @keyframes og-die-shake {
      0%,
      100% {
        transform: translate3d(0, 0, 0) rotate(-1.4deg);
      }
      50% {
        transform: translate3d(0, -14px, 0) rotate(1.4deg);
      }
    }

    /* O rolamento é enfeite; o resultado é o conteúdo. Sem movimento, os dados
       ficam parados e a troca de nomes segue mostrando que algo acontece. */
    @media (prefers-reduced-motion: reduce) {
      .og-die {
        animation: none;
      }
      .landed .og-die {
        transform: none;
        transition: none;
      }
    }
  `,
})
export class SorteioDadosComponent {
  /** Nomes ainda no pote, pra passarem no dado da esquerda. */
  readonly poolLabels = input.required<string[]>();
  /** Destinos possíveis, pra passarem no dado da direita. */
  readonly destinationLabels = input.required<string[]>();
  /** Milissegundos desde o início do rolamento. */
  readonly elapsedMs = input.required<number>();
  /** Resultado, mostrado quando `landed`. */
  readonly resultLabel = input<string | null>(null);
  readonly resultDestination = input<string | null>(null);
  readonly landed = input(false);

  /** Trocas por segundo diferentes nos dois dados: girar em sincronia parece
   *  um contador só, e não dois dados independentes. */
  private readonly teamIndex = computed(() => this.cycle(this.poolLabels().length, 90));
  private readonly destIndex = computed(() => this.cycle(this.destinationLabels().length, 130));

  protected readonly teamFace = computed(
    () => this.resolved(this.landed() ? this.resultLabel() : null, this.poolLabels(), this.teamIndex()),
  );

  protected readonly destinationFace = computed(() =>
    this.resolved(
      this.landed() ? this.resultDestination() : null,
      this.destinationLabels(),
      this.destIndex(),
    ),
  );

  private cycle(size: number, everyMs: number): number {
    if (size <= 0) return 0;
    return Math.floor(Math.max(0, this.elapsedMs()) / everyMs) % size;
  }

  private resolved(final: string | null, pool: string[], index: number): string {
    if (final) return final;
    return pool[index] ?? '—';
  }
}
