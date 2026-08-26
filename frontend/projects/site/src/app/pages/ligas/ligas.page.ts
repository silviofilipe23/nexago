import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { RevealDirective } from '../../shared/reveal.directive';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { SpotlightCard } from '../../shared/ui/spotlight-card';
import { StepsSection, type Step } from '../home/sections/steps';
import { FaqSection } from '../home/sections/faq';
import type { QA } from '../home/sections/faq-accordion';
import { DownloadSection } from '../home/sections/download';
import { LeagueBrowser } from './league-browser';
import { getPublicLeagues } from '../../../lib/firestore/leagues';
import type { LeagueSummary } from '../../../lib/firestore/types';

interface Pillar {
  icon: 'trophy' | 'trending-up' | 'medal' | 'map-pin';
  title: string;
  description: string;
}

const PILLARS: Pillar[] = [
  { icon: 'trophy', title: 'Circuito seriado', description: 'Várias etapas ao longo da temporada, em arenas parceiras pelo Brasil.' },
  { icon: 'trending-up', title: 'Pontuação acumulada', description: 'Cada etapa soma pontos — sua consistência define a classificação.' },
  { icon: 'medal', title: 'Ranking da liga', description: 'Acompanhe sua posição e dispute o topo da temporada.' },
  { icon: 'map-pin', title: 'Etapas em arenas', description: 'Jogue em quadras parceiras e viva o circuito de perto.' },
];

const STEPS: Step[] = [
  { title: 'Inscreva-se na etapa', description: 'Escolha a etapa da liga no app e inscreva sua dupla na sua categoria.' },
  { title: 'Jogue e pontue', description: 'Cada resultado vira pontos na liga, conforme sua colocação na etapa.' },
  { title: 'Suba no ranking', description: 'Os pontos se acumulam ao longo das etapas e definem o ranking da temporada.' },
];

const CATEGORIES = ['Iniciante', 'Intermediário', 'Open'];

const FAQ_ITEMS: QA[] = [
  { q: 'O que é uma Liga nexaGO?', a: 'Um circuito seriado de esportes de areia com etapas em arenas parceiras, pontuação acumulada e ranking próprio.' },
  { q: 'Posso participar de mais de uma liga?', a: 'Sim. Cada liga é um circuito independente — você pode se inscrever nas etapas das ligas que quiser, conforme as categorias disponíveis.' },
  { q: 'Como funciona a pontuação?', a: 'Cada etapa distribui pontos conforme a colocação. Os pontos se somam ao longo da temporada e formam o ranking da liga.' },
  { q: 'Como faço para participar?', a: 'Baixe o app nexaGO, crie seu perfil e inscreva-se na próxima etapa da liga que quiser disputar.' },
];

const BASE = 'https://nexago.com.br';

/**
 * Porta de `LigasPage` (site Next.js, `app/ligas/page.tsx`) — landing das Ligas nexaGO + listagem
 * pública. CSR puro: busca `leagues` no `constructor` (sem ISR/SSR nesta app, diferente da fonte
 * que usava `revalidate = 300`). O JSON-LD (`ItemList`) é montado e anexado a `document.head` só
 * depois que a lista chega (removido no destroy), replicando o `{leagues.length > 0 && <script>}`
 * condicional da fonte. `Steps`/`FAQ`/`Download` reaproveitam as seções genéricas já portadas em
 * `pages/home/sections` (a fonte as reutiliza do mesmo jeito entre `/arenas`, `/ligas` e a home).
 */
@Component({
  selector: 'app-ligas-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective, ButtonDirective, RouterLink, SpotlightCard, StepsSection, FaqSection, DownloadSection, LeagueBrowser],
  host: { class: 'block overflow-x-hidden' },
  template: `
    <!-- Hero -->
    <section class="relative mx-auto max-w-6xl px-5 pb-12 pt-28 sm:px-6 sm:pt-36">
      <div nxReveal class="max-w-2xl">
        <p class="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Ligas nexaGO</p>
        <h1 class="font-display text-[clamp(2.2rem,6.5vw,4rem)] font-800 leading-[1.03] tracking-tight text-fg">
          As ligas que movem a areia do Brasil.
        </h1>
        <p class="mt-6 max-w-xl text-balance text-lg leading-relaxed text-text-mute">
          Circuitos seriados em arenas parceiras, com pontuação acumulada e ranking próprio. Conheça as ligas e
          garanta sua vaga na próxima etapa.
        </p>
        <div class="mt-9 flex flex-col gap-3 sm:flex-row">
          <a nxButton="primary" routerLink="/torneios">
            Garantir minha vaga
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
          </a>
          <a nxButton="secondary" routerLink="/torneios">Ver torneios</a>
        </div>
      </div>
    </section>

    <!-- Ligas cadastradas -->
    <section class="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
      <div nxReveal class="mx-auto max-w-2xl text-center">
        <p class="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Circuitos</p>
        <h2 class="font-display text-[clamp(1.9rem,5vw,3rem)] font-700 leading-tight tracking-tight text-fg">
          Ligas em andamento
        </h2>
      </div>

      @if (loading()) {
        <div class="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          @for (i of skeletonSlots; track i) {
            <div class="h-[360px] animate-pulse rounded-4 bg-surface-1"></div>
          }
        </div>
      } @else if (leagues().length > 0) {
        <app-league-browser [leagues]="leagues()" />
      } @else {
        <div nxReveal>
          <div class="mx-auto mt-12 max-w-xl rounded-5 border border-line bg-surface-1 p-10 text-center">
            <p class="font-display text-lg font-700 text-fg">Ligas em breve</p>
            <p class="mx-auto mt-2 max-w-sm text-sm text-text-mute">
              As ligas da temporada serão divulgadas aqui. Baixe o app para ser avisado da abertura das
              inscrições.
            </p>
          </div>
        </div>
      }
    </section>

    <!-- O que é -->
    <section class="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
      <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        @for (p of pillars; track p.title; let i = $index) {
          <div nxReveal [nxRevealDelay]="i * 60" class="h-full">
            <app-spotlight-card className="h-full p-7">
              <div class="mb-5 inline-flex size-12 items-center justify-center rounded-3 border border-brand/20 bg-brand-tint text-brand transition-transform duration-300 ease-out group-hover/spot:scale-105 motion-reduce:transition-none">
                @switch (p.icon) {
                  @case ('trophy') {
                    <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                      <path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                    </svg>
                  }
                  @case ('trending-up') {
                    <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M16 7h6v6" /><path d="m22 7-8.5 8.5-5-5L2 17" />
                    </svg>
                  }
                  @case ('medal') {
                    <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15" />
                      <path d="M11 12 5.12 2.2" /><path d="m13 12 5.88-9.8" />
                      <circle cx="12" cy="17" r="5" /><path d="M12 18v-2h-.5" />
                    </svg>
                  }
                  @case ('map-pin') {
                    <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  }
                }
              </div>
              <h3 class="font-display text-lg font-700 tracking-tight text-fg">{{ p.title }}</h3>
              <p class="mt-2.5 text-sm leading-relaxed text-text-mute">{{ p.description }}</p>
            </app-spotlight-card>
          </div>
        }
      </div>
    </section>

    <app-steps-section eyebrow="Como funciona" title="Pontuou, subiu: a temporada em 3 passos" [steps]="steps" />

    <!-- Categorias -->
    <section class="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
      <div nxReveal class="mx-auto max-w-2xl text-center">
        <h2 class="font-display text-[clamp(1.9rem,5vw,3rem)] font-700 leading-tight tracking-tight text-fg">
          Do iniciante ao Open
        </h2>
        <p class="mx-auto mt-4 max-w-xl text-balance text-base text-text-mute">
          As ligas têm categorias para todos os níveis — você compete com quem está no seu nível.
        </p>
      </div>
      <div class="mx-auto mt-10 flex max-w-2xl flex-wrap justify-center gap-3">
        @for (c of categories; track c) {
          <span class="rounded-pill border border-line-strong bg-surface-1 px-5 py-2.5 font-display text-sm font-700 tracking-tight text-fg">
            {{ c }}
          </span>
        }
      </div>
    </section>

    <app-faq eyebrow="Dúvidas das ligas" title="Como funcionam as ligas" [items]="faqItems" />

    <app-download-section />
  `,
})
export class LigasPage {
  protected readonly pillars = PILLARS;
  protected readonly steps = STEPS;
  protected readonly categories = CATEGORIES;
  protected readonly faqItems = FAQ_ITEMS;
  protected readonly skeletonSlots = [0, 1, 2];

  protected readonly leagues = signal<LeagueSummary[]>([]);
  protected readonly loading = signal(true);

  constructor() {
    inject(Title).setTitle('Ligas nexaGO');
    const destroyRef = inject(DestroyRef);

    getPublicLeagues().then((leagues) => {
      this.leagues.set(leagues);
      this.loading.set(false);

      if (leagues.length > 0) {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.text = JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'Ligas nexaGO',
          itemListElement: leagues.map((l, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: `${BASE}/ligas/${l.id}`,
            name: l.name,
          })),
        });
        document.head.appendChild(script);
        destroyRef.onDestroy(() => script.remove());
      }
    });
  }
}
