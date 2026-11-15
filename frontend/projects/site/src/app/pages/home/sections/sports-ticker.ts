import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Mesmos rótulos do catálogo de esportes (`sports/catalog.json`), na ordem em que mais se joga. */
const SPORTS = [
  'Vôlei de praia',
  'Futevôlei',
  'Beach tennis',
  'Tênis',
  'Padel',
  'Vôlei de quadra',
  'Futebol',
  'Basquete',
  'Corrida',
];

/**
 * Faixa de esportes no pé da abertura, como o letreiro de uma transmissão. A lista de verdade
 * (para leitor de tela e busca) é o `<ul>` escondido; as duas cópias que deslizam são decorativas.
 */
@Component({
  selector: 'app-sports-ticker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="nx-night overflow-hidden border-y border-line-strong bg-black py-4" aria-label="Esportes no nexaGO">
      <ul class="sr-only">
        @for (sport of sports; track sport) {
          <li>{{ sport }}</li>
        }
      </ul>
      <div class="track flex w-max" aria-hidden="true">
        @for (copy of copies; track copy) {
          <div class="flex shrink-0 items-center">
            @for (sport of sports; track sport; let odd = $odd) {
              <span class="nx-shout whitespace-nowrap px-5 text-[2.75rem] sm:px-7" [class.hollow]="odd">{{ sport }}</span>
              <span class="size-2.5 shrink-0 rounded-full bg-brand"></span>
            }
          </div>
        }
      </div>
    </section>
  `,
  styles: `
    .track {
      animation: slide 46s linear infinite;
    }

    section:hover .track {
      animation-play-state: paused;
    }

    .hollow {
      color: transparent;
      -webkit-text-stroke: 1px var(--color-sand);
    }

    @keyframes slide {
      to {
        transform: translateX(-50%);
      }
    }
  `,
})
export class SportsTicker {
  protected readonly sports = SPORTS;
  protected readonly copies = [0, 1];
}
