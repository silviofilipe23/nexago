import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DOWNLOAD_QR_PATH, DOWNLOAD_QR_SIZE } from '../../../lib/download-qr';

/** Margem em módulos em volta do código — o leitor precisa dessa área em branco para achá-lo. */
const QUIET = 2;

/**
 * QR code que leva o celular de quem está no computador até `/baixar`, e de lá à loja do
 * aparelho. Preto no branco de propósito, em qualquer tema: é o contraste que os leitores esperam.
 */
@Component({
  selector: 'app-download-qr',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Sem classe de display no host: quem usa decide quando mostrar (`hidden lg:block`) sem disputar
  // precedência com um utilitário daqui.
  template: `
    <div class="flex items-center gap-4">
      <span class="block size-[104px] shrink-0 rounded-[14px] bg-white p-1.5">
        <svg
          [attr.viewBox]="viewBox"
          class="size-full"
          shape-rendering="crispEdges"
          role="img"
          aria-label="QR code para baixar o nexaGO"
        >
          <path [attr.d]="path" fill="#050505" />
        </svg>
      </span>
      <span class="max-w-[11rem] text-sm leading-snug text-text-mute">
        <strong class="block font-athletic text-[17px] font-800 tracking-tight text-fg">Está no computador?</strong>
        Aponte a câmera do celular e baixe o app.
      </span>
    </div>
  `,
})
export class DownloadQr {
  protected readonly path = DOWNLOAD_QR_PATH;
  protected readonly viewBox = `${-QUIET} ${-QUIET} ${DOWNLOAD_QR_SIZE + QUIET * 2} ${DOWNLOAD_QR_SIZE + QUIET * 2}`;
}
