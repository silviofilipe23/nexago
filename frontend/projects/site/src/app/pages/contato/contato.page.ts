import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RevealDirective } from '../../shared/reveal.directive';
import { ContactForm } from './contact-form';

const CONTACT_EMAIL = 'contato@nexago.com.br';
const ADDRESS = 'Rua Pais Leme, 215, Conj 1713, Pinheiros, São Paulo, SP, 05424-150';
const COMPANY = 'nexaGO - NRS Desenvolvimento De Programas De Computador Sob Encomenda Ltda';

/** Porta de `contato/page.tsx` (site Next.js): hero + formulário + canais diretos. */
@Component({
  selector: 'app-contato-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective, ContactForm],
  host: { class: 'contents' },
  template: `
    <main class="mx-auto max-w-5xl px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
      <div nxReveal class="max-w-2xl">
        <p class="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Contato</p>
        <h1 class="font-display text-[clamp(2rem,6vw,3.5rem)] font-800 leading-tight tracking-tight text-fg">
          Vamos conversar
        </h1>
        <p class="mt-4 text-balance text-base leading-relaxed text-text-mute sm:text-lg">
          Dúvidas, parcerias ou suporte? Escreva pelo formulário ou fale direto pelos nossos canais —
          a gente responde o quanto antes.
        </p>
      </div>

      <div class="mt-14 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <!-- Formulário -->
        <div nxReveal>
          <div class="rounded-5 border border-line bg-surface-1 p-6 sm:p-8">
            <h2 class="font-display text-xl font-700 tracking-tight text-fg">Envie uma mensagem</h2>
            <p class="mt-2 text-sm text-text-mute">Respondemos no e-mail informado.</p>
            <div class="mt-7">
              <app-contact-form />
            </div>
          </div>
        </div>

        <!-- Canais diretos -->
        <div nxReveal [nxRevealDelay]="80">
          <div class="flex flex-col gap-4">
            <a
              href="mailto:{{ contactEmail }}"
              class="group flex items-start gap-4 rounded-5 border border-line bg-surface-1 p-6 transition-[transform,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-brand/40 motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              <span class="inline-flex size-11 shrink-0 items-center justify-center rounded-3 border border-brand/20 bg-brand-tint text-brand">
                <svg
                  class="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
              </span>
              <span>
                <span class="block font-display text-base font-700 tracking-tight text-fg">E-mail</span>
                <span class="mt-0.5 block text-sm text-text-mute transition-colors group-hover:text-fg">
                  {{ contactEmail }}
                </span>
              </span>
            </a>

            <a
              href="https://www.instagram.com/nexagobr"
              target="_blank"
              rel="noopener noreferrer"
              class="group flex items-start gap-4 rounded-5 border border-line bg-surface-1 p-6 transition-[transform,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-brand/40 motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              <span class="inline-flex size-11 shrink-0 items-center justify-center rounded-3 border border-brand/20 bg-brand-tint text-brand">
                <svg class="size-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="2" y="2" width="20" height="20" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <span>
                <span class="block font-display text-base font-700 tracking-tight text-fg">Instagram</span>
                <span class="mt-0.5 block text-sm text-text-mute transition-colors group-hover:text-fg">
                  @nexagobr
                </span>
              </span>
            </a>

            <div class="flex items-start gap-4 rounded-5 border border-line bg-surface-1 p-6">
              <span class="inline-flex size-11 shrink-0 items-center justify-center rounded-3 border border-brand/20 bg-brand-tint text-brand">
                <svg
                  class="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </span>
              <span>
                <span class="block font-display text-base font-700 tracking-tight text-fg">Endereço</span>
                <address class="mt-0.5 block text-sm not-italic leading-relaxed text-text-mute">{{ address }}</address>
              </span>
            </div>

            <div class="flex items-start gap-4 rounded-5 border border-line bg-surface-1 p-6">
              <span class="inline-flex size-11 shrink-0 items-center justify-center rounded-3 border border-brand/20 bg-brand-tint text-brand">
                <svg
                  class="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
                  <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                  <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
                  <path d="M10 6h4" />
                  <path d="M10 10h4" />
                  <path d="M10 14h4" />
                  <path d="M10 18h4" />
                </svg>
              </span>
              <span>
                <span class="block font-display text-base font-700 tracking-tight text-fg">Empresa</span>
                <span class="mt-0.5 block text-sm leading-relaxed text-text-mute">{{ company }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </main>
  `,
})
export class ContatoPage {
  protected readonly contactEmail = CONTACT_EMAIL;
  protected readonly address = ADDRESS;
  protected readonly company = COMPANY;

  constructor() {
    inject(Title).setTitle('Contato · nexaGO');
  }
}
