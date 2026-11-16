import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DownloadCta } from '../../../shared/ui/download-cta';
import { DownloadQr } from '../../../shared/ui/download-qr';

/** Fecho da home: a bola no ar, o refletor aceso e o download. `id="download"` é a âncora que o
 *  rodapé e a barra fixa do celular usam. */
@Component({
  selector: 'app-final-call',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgOptimizedImage, DownloadCta, DownloadQr],
  host: { class: 'block' },
  template: `
    <section id="download" class="nx-night relative isolate scroll-mt-0 overflow-hidden bg-black">
      <div class="absolute inset-0 -z-10" aria-hidden="true">
        <img
          ngSrc="final"
          ngSrcset="960w, 1920w"
          [loaderParams]="{ fallback: 1920 }"
          sizes="100vw"
          fill
          alt=""
          class="object-cover object-[72%_20%]"
        />
        <div class="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.88)_0%,rgba(0,0,0,0.45)_55%,rgba(0,0,0,0.1)_100%)]"></div>
        <div class="absolute inset-0 bg-[linear-gradient(to_bottom,#000_0%,transparent_18%,transparent_70%,#000_100%)]"></div>
      </div>

      <div class="mx-auto max-w-6xl px-5 pb-24 pt-32 sm:px-6 sm:pb-36 sm:pt-48">
        <h2 class="nx-shout text-[clamp(3.6rem,13.5vw,11rem)] text-fg">
          Sua vez<br />de sacar.
        </h2>
        <p class="mt-7 max-w-[30rem] text-pretty text-lg leading-relaxed text-fg/85 sm:text-xl">
          Baixe o nexaGO, monte seu perfil e marque o primeiro jogo ainda hoje. Grátis para atletas.
        </p>

        <div class="mt-9 flex flex-col gap-8 sm:flex-row sm:items-center sm:gap-10">
          <app-download-cta class="w-full sm:w-auto" />
          <app-download-qr class="hidden lg:block" />
        </div>
      </div>
    </section>
  `,
})
export class FinalCall {}
