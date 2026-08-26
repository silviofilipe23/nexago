import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RevealDirective } from '../../../shared/reveal.directive';
import { ButtonDirective } from '../../../shared/ui/button.directive';

const INVITE_TITLE = 'nexaGO para arenas';
const INVITE_TEXT =
  'Conheça o nexaGO — a plataforma de torneios e ligas dos esportes de areia. Coloque sua arena no mapa e encha as quadras:';
const INVITE_URL = 'https://nexago.com.br/arenas';

/**
 * Porta de `ConviteArena` (site Next.js) — usada na página `/arenas` (fora do escopo desta
 * seção — não aparece diretamente na home). Convite viral: o atleta indica o nexaGO para a
 * arena onde joga. Web Share API nativa com fallback para WhatsApp Web no desktop. Sem
 * backend — só encaminha a mensagem de convite.
 */
@Component({
  selector: 'app-convite-arena-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective, ButtonDirective],
  template: `
    <section class="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
      <div nxReveal>
        <div class="relative overflow-hidden rounded-5 border border-brand/20 bg-surface-1 p-8 text-center sm:p-12">
          <div
            aria-hidden="true"
            class="pointer-events-none absolute inset-0"
            style="background: radial-gradient(40rem 20rem at 50% -10%, rgba(255,106,26,0.12), transparent 60%)"
          ></div>

          <div class="relative">
            <div class="mx-auto mb-6 inline-flex size-14 items-center justify-center rounded-4 border border-brand/20 bg-brand-tint text-brand">
              <svg class="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
                <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
                <path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" />
              </svg>
            </div>

            <h2 class="font-display text-[clamp(1.6rem,4.5vw,2.4rem)] font-700 leading-tight tracking-tight text-fg">
              A arena que você joga não está aqui?
            </h2>
            <p class="mx-auto mt-4 max-w-xl text-balance text-base leading-relaxed text-text-mute sm:text-lg">
              Indique o nexaGO para a sua arena e ajude a trazer a sua quadra para a comunidade da areia — com perfil
              público, torneios e mais movimento.
            </p>

            <div class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button nxButton="primary" type="button" (click)="handleInvite()">
                Convidar arena
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" /><line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
                </svg>
              </button>
              <a nxButton="secondary" href="#contato">Sou da arena, quero cadastrar</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
})
export class ConviteArenaSection {
  protected async handleInvite(): Promise<void> {
    const message = `${INVITE_TEXT} ${INVITE_URL}`;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: INVITE_TITLE, text: INVITE_TEXT, url: INVITE_URL });
      } catch {
        // Compartilhamento cancelado pelo usuário — nada a fazer.
      }
      return;
    }

    // Fallback (desktop sem Web Share): abre o WhatsApp com a mensagem pronta.
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }
}
