import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RevealDirective } from '../../../shared/reveal.directive';

interface Stat {
  value: string;
  label: string;
}

// TODO: substituir por números reais quando consolidados (mesmo placeholder do site Next.js).
const STATS: Stat[] = [
  { value: '12k+', label: 'atletas na areia' },
  { value: '480+', label: 'torneios realizados' },
  { value: '90+', label: 'arenas parceiras' },
  { value: '1ª', label: 'etapa da Liga em out' },
];

/** Porta de `Stats` (site Next.js). */
@Component({
  selector: 'app-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective],
  template: `
    <section class="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
      <dl nxReveal class="grid grid-cols-2 gap-px overflow-hidden rounded-5 border border-line bg-line md:grid-cols-4">
        @for (s of stats; track s.label) {
          <div class="flex flex-col items-center bg-surface-1 px-6 py-8 text-center">
            <dt class="order-2 mt-2 text-sm text-text-mute">{{ s.label }}</dt>
            <dd class="order-1 font-display text-4xl font-800 tracking-tight text-brand sm:text-5xl [font-variant-numeric:tabular-nums]">
              {{ s.value }}
            </dd>
          </div>
        }
      </dl>
    </section>
  `,
})
export class StatsSection {
  protected readonly stats = STATS;
}
