import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RevealDirective } from '../../../shared/reveal.directive';
import { DownloadCta } from '../../../shared/ui/download-cta';

/** CTA de download no fim das páginas de liga (a home tem o seu próprio fecho, `FinalCall`). */
@Component({
  selector: 'app-download-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective, DownloadCta],
  template: `
    <section id="download" class="relative scroll-mt-24 overflow-hidden px-5 py-16 sm:px-6 sm:py-36">
      <div
        aria-hidden="true"
        class="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[min(90vw,640px)] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style="background: radial-gradient(closest-side, rgba(255,106,26,0.16), transparent 70%)"
      ></div>

      <div nxReveal class="mx-auto max-w-2xl text-center">
        <h2 class="font-display text-[clamp(2rem,6vw,3.75rem)] font-800 leading-tight tracking-tight text-fg">
          Sua temporada começa no app.
        </h2>
        <p class="mx-auto mt-5 max-w-lg text-balance text-base text-text-mute sm:text-lg">
          Baixe o nexaGO, crie seu perfil e entre na próxima etapa da Liga. Grátis para atletas.
        </p>

        <app-download-cta align="center" class="mt-10" />
      </div>
    </section>
  `,
})
export class DownloadSection {}
