import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../../shared/reveal.directive';
import { ButtonDirective } from '../../../shared/ui/button.directive';

interface LigaStep {
  value: string;
  label: string;
}

const STEPS: LigaStep[] = [
  { value: '1ª etapa', label: '24 de outubro' },
  { value: 'Esporte', label: 'Vôlei de praia' },
  { value: 'Todas as categorias', label: 'do iniciante ao Open' },
];

/** Porta de `Liga` (site Next.js) — bloco de destaque da Liga nexaGO na home. */
@Component({
  selector: 'app-liga',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective, ButtonDirective, RouterLink],
  template: `
    <section id="liga" class="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-16 sm:px-6 sm:py-32">
      <div nxReveal>
        <div class="relative overflow-hidden rounded-5 border border-brand/20 bg-surface-1 px-7 py-14 sm:px-14 sm:py-20">
          <div
            aria-hidden="true"
            class="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full"
            style="background: radial-gradient(closest-side, rgba(255,106,26,0.25), transparent 70%)"
          ></div>

          <div class="relative">
            <div class="inline-flex items-center gap-2 rounded-pill border border-brand/30 bg-brand-tint px-4 py-1.5">
              <svg class="size-4 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              <span class="text-xs font-600 tracking-wide text-brand">Liga nexaGO 2026</span>
            </div>

            <h2 class="mt-6 max-w-2xl font-display text-[clamp(2rem,5.5vw,3.75rem)] font-800 leading-[1.02] tracking-tight text-fg">
              A liga que move a areia do Brasil.
            </h2>
            <p class="mt-5 max-w-xl text-balance text-base leading-relaxed text-text-mute sm:text-lg">
              Etapas em arenas parceiras, ranking nacional e a emoção do circuito. A 1ª etapa abre
              a temporada — garanta sua vaga.
            </p>

            <div class="mt-10 grid max-w-2xl grid-cols-1 gap-px overflow-hidden rounded-4 border border-line bg-line sm:grid-cols-3">
              @for (s of steps; track s.value) {
                <div class="bg-surface-0 px-5 py-5">
                  <div class="font-display text-lg font-700 tracking-tight text-fg">{{ s.value }}</div>
                  <div class="mt-1 text-sm text-text-mute">{{ s.label }}</div>
                </div>
              }
            </div>

            <div class="mt-10">
              <a nxButton="primary" routerLink="/ligas">
                Conhecer as Ligas
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
})
export class LigaSection {
  protected readonly steps = STEPS;
}
