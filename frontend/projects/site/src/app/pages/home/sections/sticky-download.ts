import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, inject, signal } from '@angular/core';
import { APP_STORE_URL, GOOGLE_PLAY_URL } from '../../../../lib/store-links';
import { detectPlatform } from '../../../../lib/platform';

/**
 * Barra de download presa ao pé da tela, só em celular: aparece depois que a abertura saiu de
 * vista e some quando o fecho da página (que já tem o botão grande) entra. O botão vai direto
 * para a loja do aparelho. Em computador o componente não renderiza nada.
 */
@Component({
  selector: 'app-sticky-download',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (storeUrl) {
      <div
        class="nx-night fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none md:hidden"
        [class]="visible() ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-[130%] opacity-0'"
        [attr.aria-hidden]="!visible()"
      >
        <div class="flex items-center gap-3 rounded-[20px] border border-line-strong bg-surface-0 p-2.5 pl-3 shadow-elev-3">
          <img src="brand/logo.png" alt="" width="40" height="40" class="size-10 rounded-[11px]" />
          <p class="min-w-0 flex-1 leading-tight">
            <span class="block font-athletic text-[16px] font-800 tracking-tight text-fg">nexaGO</span>
            <span class="block truncate text-[13px] text-text-mute">Grátis para atletas</span>
          </p>
          <a
            [href]="storeUrl"
            target="_blank"
            rel="noopener noreferrer"
            [attr.tabindex]="visible() ? null : -1"
            class="inline-flex h-11 items-center rounded-pill bg-brand px-5 font-athletic text-[15px] font-800 tracking-tight text-on-brand transition-colors hover:bg-brand-light active:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Baixar o app
          </a>
        </div>
      </div>
    }
  `,
})
export class StickyDownload {
  private readonly platform = detectPlatform();
  protected readonly storeUrl =
    this.platform === 'ios' ? APP_STORE_URL : this.platform === 'android' ? GOOGLE_PLAY_URL : null;

  protected readonly visible = signal(false);

  constructor() {
    if (!this.storeUrl) return;
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const opening = document.querySelector('app-opening');
      const closing = document.querySelector('app-final-call');
      if (!opening || !closing) return;

      const onScreen = new Map<Element, boolean>();
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) onScreen.set(entry.target, entry.isIntersecting);
        this.visible.set(!onScreen.get(opening) && !onScreen.get(closing));
      });
      observer.observe(opening);
      observer.observe(closing);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
