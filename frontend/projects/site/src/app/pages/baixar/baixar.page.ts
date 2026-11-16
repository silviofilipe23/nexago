import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { DownloadCta } from '../../shared/ui/download-cta';
import { DownloadQr } from '../../shared/ui/download-qr';
import { APP_STORE_URL, GOOGLE_PLAY_URL } from '../../../lib/store-links';
import { HOME_IMAGE_LOADER } from '../../../lib/home-images';
import { detectPlatform } from '../../../lib/platform';

/**
 * `/baixar` — o endereço de todo "Baixar o app" do site e do QR code. No celular manda direto para
 * a loja do aparelho (`location.replace`, para o "voltar" não cair de novo aqui); no computador,
 * ou se a loja não abrir, a página mostra as duas lojas e o QR.
 */
@Component({
  selector: 'app-baixar-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgOptimizedImage, DownloadCta, DownloadQr],
  providers: [HOME_IMAGE_LOADER],
  host: { class: 'block' },
  template: `
    <section class="nx-night relative isolate flex min-h-[100svh] items-center overflow-hidden bg-black">
      <div class="absolute inset-0 -z-10" aria-hidden="true">
        <img
          ngSrc="final"
          ngSrcset="960w, 1920w"
          [loaderParams]="{ fallback: 1920 }"
          sizes="100vw"
          fill
          priority
          alt=""
          class="object-cover object-[72%_20%]"
        />
        <div class="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.88)_0%,rgba(0,0,0,0.45)_55%,rgba(0,0,0,0.1)_100%)]"></div>
      </div>

      <div class="mx-auto w-full max-w-6xl px-5 py-32 sm:px-6">
        <h1 class="nx-shout text-[clamp(3.4rem,12vw,9.5rem)] text-fg">
          Baixe<br />o app.
        </h1>
        <p class="mt-7 max-w-[30rem] text-pretty text-lg leading-relaxed text-fg/85 sm:text-xl">
          @if (redirecting) {
            Abrindo a loja do seu aparelho. Se ela não abrir sozinha, toque no botão.
          } @else {
            Reserva de quadra, torneios, placar ao vivo e ranking no mesmo app. Grátis para atletas.
          }
        </p>

        <div class="mt-9 flex flex-col gap-8 sm:flex-row sm:items-center sm:gap-10">
          <app-download-cta class="w-full sm:w-auto" />
          <app-download-qr class="hidden lg:block" />
        </div>
      </div>
    </section>
  `,
})
export class BaixarPage {
  private readonly platform = detectPlatform();
  protected readonly redirecting = this.platform !== 'desktop';

  constructor() {
    inject(Title).setTitle('Baixar o nexaGO — iPhone e Android');
    if (this.platform === 'ios') window.location.replace(APP_STORE_URL);
    if (this.platform === 'android') window.location.replace(GOOGLE_PLAY_URL);
  }
}
