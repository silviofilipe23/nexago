import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../shared/reveal.directive';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { SpotlightCard } from '../../shared/ui/spotlight-card';
import { ArenasCarouselSection } from '../home/sections/arenas-carousel';
import { ConviteArenaSection } from '../home/sections/convite-arena';
import { StepsSection, type Step } from '../home/sections/steps';
import { ArenaPlanosSection } from '../home/sections/arena-planos';
import { TestimonialsMarqueeSection } from '../home/sections/testimonials-marquee';
import type { Testimonial } from '../home/sections/testimonial-card';
import { FaqSection } from '../home/sections/faq';
import type { QA } from '../home/sections/faq-accordion';
import { LeadFormSection } from '../home/sections/lead-form';

type BenefitIcon = 'eye' | 'calendar-check' | 'sparkles' | 'users';

interface Benefit {
  icon: BenefitIcon;
  title: string;
  description: string;
}

const BENEFITS: Benefit[] = [
  {
    icon: 'eye',
    title: 'Visibilidade para atletas',
    description: 'Apareça para a comunidade da areia que busca onde jogar, treinar e competir na sua região.',
  },
  {
    icon: 'calendar-check',
    title: 'Receba etapas e torneios',
    description: 'Conecte sua arena a organizadores e à Liga nexaGO. Mais eventos, mais movimento nas quadras.',
  },
  {
    icon: 'sparkles',
    title: 'Perfil público da arena',
    description: 'Fotos, esportes, comodidades e localização num perfil que valoriza a sua estrutura.',
  },
  {
    icon: 'users',
    title: 'Comunidade e agenda',
    description: 'Mostre disponibilidade e aproxime os atletas — sua quadra deixa de ter horário vazio.',
  },
];

const STEPS: Step[] = [
  { title: 'Cadastre sua arena', description: 'Monte o perfil público com fotos, esportes, comodidades e localização.' },
  { title: 'Conecte-se a torneios', description: 'Passe a receber etapas de organizadores e da Liga nexaGO na sua quadra.' },
  { title: 'Encha as quadras', description: 'Ganhe visibilidade na comunidade da areia e reduza os horários ociosos.' },
];

const TESTIMONIALS: Testimonial[] = [
  {
    quote: 'Minha arena passou a receber etapas da Liga e a agenda encheu. A comunidade da areia chegou junto.',
    name: 'Arena Maré Alta',
    role: 'Arena parceira · Florianópolis',
  },
  {
    quote: 'O perfil público trouxe atletas que nem sabiam que a gente existia. Ótimo retorno.',
    name: 'Beach Point',
    role: 'Arena parceira · Santos',
  },
  {
    quote: 'Sediar torneios pelo app virou rotina e os horários ociosos diminuíram bastante.',
    name: 'Areia Viva',
    role: 'Arena parceira · Natal',
  },
  {
    quote: 'A agenda no app aproximou os atletas e nossas quadras passaram a girar muito mais.',
    name: 'Praia Club',
    role: 'Arena parceira · Recife',
  },
  {
    quote: 'Entrar para a Liga deu credibilidade à nossa estrutura e atraiu público novo.',
    name: 'Costa Norte',
    role: 'Arena parceira · Fortaleza',
  },
  {
    quote: 'Gerenciar várias quadras num lugar só simplificou demais a operação do dia a dia.',
    name: 'Duna Beach',
    role: 'Arena parceira · Salvador',
  },
];

const FAQ_ITEMS: QA[] = [
  {
    q: 'Quanto custa colocar minha arena no nexaGO?',
    a: 'Há um plano gratuito para começar e planos pagos conforme sua arena cresce — veja a seção de planos acima. Os valores oficiais serão confirmados em breve; fale com a gente para desenhar a melhor parceria.',
  },
  {
    q: 'Preciso organizar torneios para participar?',
    a: 'Não. Você pode apenas manter o perfil público e a agenda, e receber etapas de organizadores quando quiser.',
  },
  {
    q: 'Quais esportes a plataforma atende?',
    a: 'Vôlei de praia, com suporte a diferentes tipos de quadra e superfícies.',
  },
  {
    q: 'Como os atletas encontram minha arena?',
    a: 'Pelo perfil público e pela busca de arenas no app, com localização, esportes e comodidades.',
  },
];

/**
 * Porta de `arenas/page.tsx` (site Next.js) — landing B2B para arenas e gestores de quadra
 * (não é uma listagem/diretório de arenas para atletas; a vitrine de arenas reais fica dentro
 * de `ArenasCarouselSection`, reaproveitada tal qual já roda na home). Todas as seções
 * "genéricas" (Steps, ArenaPlanos, ConviteArena, TestimonialsMarquee, FAQ, LeadForm) já tinham
 * sido portadas antecipando esta rota — aqui só a composição da página, hero e grid de
 * benefícios (específicos desta página) mudam.
 */
@Component({
  selector: 'app-arenas-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RevealDirective,
    ButtonDirective,
    SpotlightCard,
    ArenasCarouselSection,
    ConviteArenaSection,
    StepsSection,
    ArenaPlanosSection,
    TestimonialsMarqueeSection,
    FaqSection,
    LeadFormSection,
  ],
  host: { class: 'contents' },
  template: `
    <main class="overflow-x-hidden">
      <!-- Hero -->
      <section class="relative mx-auto max-w-6xl px-5 pb-12 pt-28 sm:px-6 sm:pt-36">
        <div nxReveal class="max-w-2xl">
          <p class="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Para arenas</p>
          <h1 class="font-display text-[clamp(2.2rem,6.5vw,4rem)] font-800 leading-[1.03] tracking-tight text-fg">
            Sua quadra, sempre cheia.
          </h1>
          <p class="mt-6 max-w-xl text-balance text-lg leading-relaxed text-text-mute">
            Divulgue sua arena, receba torneios e conecte sua estrutura à comunidade da areia. Mais visibilidade,
            mais eventos, menos horário ocioso.
          </p>
          <div class="mt-9 flex flex-col gap-3 sm:flex-row">
            <a nxButton="primary" href="#contato">
              Cadastrar minha arena
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </a>
            <a nxButton="secondary" routerLink="/torneios">Ver torneios na plataforma</a>
          </div>
        </div>
      </section>

      <!-- Benefícios -->
      <section class="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
        <div class="grid gap-5 sm:grid-cols-2">
          @for (b of benefits; track b.title; let i = $index) {
            <div nxReveal [nxRevealDelay]="i * 60" class="h-full">
              <app-spotlight-card className="h-full p-7">
                <div class="mb-5 inline-flex size-12 items-center justify-center rounded-3 border border-brand/20 bg-brand-tint text-brand transition-transform duration-300 ease-out group-hover/spot:scale-105 motion-reduce:transition-none">
                  @switch (b.icon) {
                    @case ('eye') {
                      <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    }
                    @case ('calendar-check') {
                      <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M8 2v4" /><path d="M16 2v4" />
                        <rect width="18" height="18" x="3" y="4" rx="2" />
                        <path d="M3 10h18" /><path d="m9 16 2 2 4-4" />
                      </svg>
                    }
                    @case ('sparkles') {
                      <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                        <path d="M20 3v4" /><path d="M22 5h-4" /><path d="M4 17v2" /><path d="M5 18H3" />
                      </svg>
                    }
                    @case ('users') {
                      <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    }
                  }
                </div>
                <h2 class="font-display text-lg font-700 tracking-tight text-fg">{{ b.title }}</h2>
                <p class="mt-2.5 text-sm leading-relaxed text-text-mute">{{ b.description }}</p>
              </app-spotlight-card>
            </div>
          }
        </div>
      </section>

      <app-arenas-carousel-section />

      <app-convite-arena-section />

      <app-steps-section eyebrow="Como funciona" title="Da estrutura à quadra lotada em 3 passos" [steps]="steps" />

      <app-arena-planos-section />

      <!-- Prova social -->
      <section class="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
        <div nxReveal class="mx-auto max-w-2xl text-center">
          <h2 class="font-display text-[clamp(1.9rem,5vw,3rem)] font-700 leading-tight tracking-tight text-fg">
            Arenas que entraram para a areia
          </h2>
        </div>
        <app-testimonials-marquee [testimonials]="testimonials" />
      </section>

      <app-faq [items]="faqItems" eyebrow="Dúvidas de arena" title="Como funciona para você" />

      <app-lead-form-section persona="arena" />
    </main>
  `,
})
export class ArenasPage {
  protected readonly benefits = BENEFITS;
  protected readonly steps = STEPS;
  protected readonly testimonials = TESTIMONIALS;
  protected readonly faqItems = FAQ_ITEMS;

  constructor() {
    inject(Title).setTitle('Para arenas e gestores de quadra · nexaGO');
  }
}
