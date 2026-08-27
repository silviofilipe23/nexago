import { ChangeDetectionStrategy, Component } from '@angular/core';
import { StoreButtons } from '../../../shared/ui/store-buttons';
import { ShowcasePhones } from './showcase-phones';

/**
 * Porta de `ComoFunciona` (site Next.js, `components/sections/ComoFunciona.tsx`) — seção
 * "eleve sua experiência": cabeçalho com badges de loja + vitrine 3-up (`ShowcasePhones`).
 * Conteúdo 100% estático (copy de marketing), sem dado do Firestore — nada a mockar aqui.
 *
 * Reaproveita o `app-store-buttons` já portado em `shared/ui/store-buttons.ts` (mesmo
 * componente usado pelo `StoreButtons` do source) em vez de recriar os botões de loja.
 */
@Component({
  selector: 'app-como-funciona',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StoreButtons, ShowcasePhones],
  template: `
    <section id="como-funciona" class="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-16 sm:px-6 sm:py-32">
      <!-- Cabeçalho: título + badges de loja -->
      <div class="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div class="max-w-xl">
          <p class="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Como funciona</p>
          <h2 class="font-display text-[clamp(2rem,5.5vw,3.0rem)] font-bold leading-tight tracking-tight text-fg text-balance">
            Eleve sua experiência
          </h2>
          <p class="mt-4 text-balance text-base text-text-mute sm:text-lg">
            A experiência de quem joga, organiza e recebe na areia — num só app.
          </p>
        </div>

        <div class="shrink-0">
          <p class="mb-3 font-mono text-xs font-600 uppercase tracking-[0.18em] text-text-dim">
            Disponível no iOS e Android
          </p>
          <app-store-buttons size="sm" className="flex flex-wrap gap-3" />
        </div>
      </div>

      <!-- Showcase 3-up interativo -->
      <app-showcase-phones />
    </section>
  `,
})
export class ComoFunciona {}
