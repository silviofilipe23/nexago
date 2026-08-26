import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RevealDirective } from '../../../shared/reveal.directive';

export type Step = { title: string; description: string };

/**
 * Porta de `Steps` (site Next.js, `components/sections/Steps.tsx`) — seção genérica "como
 * funciona" com passos numerados (1→N) e reveal em stagger. NOTA: no site Next.js este
 * componente não aparece na home (`app/page.tsx`); é reutilizado nas landings de `/arenas`,
 * `/ligas` e `/organizadores`, cada uma passando seu próprio `eyebrow`/`title`/`steps`. Portado
 * aqui porque estava no escopo pedido — fica disponível pra quando essas rotas forem migradas.
 */
@Component({
  selector: 'app-steps-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective],
  template: `
    <section class="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-32">
      <div nxReveal class="mx-auto max-w-2xl text-center">
        @if (eyebrow()) {
          <p class="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">{{ eyebrow() }}</p>
        }
        <h2 class="font-display text-[clamp(1.9rem,5vw,3.25rem)] font-700 leading-tight tracking-tight text-fg">
          {{ title() }}
        </h2>
      </div>

      <ol class="mt-16 grid gap-5 md:grid-cols-3">
        @for (s of steps(); track s.title; let i = $index) {
          <li nxReveal [nxRevealDelay]="i * 80" class="h-full rounded-5 border border-line bg-surface-1 p-7">
            <span
              aria-hidden="true"
              class="inline-flex size-11 items-center justify-center rounded-3 border border-brand/20 bg-brand-tint font-display text-lg font-800 text-brand"
            >
              {{ i + 1 }}
            </span>
            <h3 class="mt-5 font-display text-lg font-700 tracking-tight text-fg">{{ s.title }}</h3>
            <p class="mt-2.5 text-sm leading-relaxed text-text-mute">{{ s.description }}</p>
          </li>
        }
      </ol>
    </section>
  `,
})
export class StepsSection {
  readonly eyebrow = input('');
  readonly title = input.required<string>();
  readonly steps = input.required<Step[]>();
}
