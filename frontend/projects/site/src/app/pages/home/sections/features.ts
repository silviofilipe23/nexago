import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../../shared/reveal.directive';

type FeatureIcon = 'trophy' | 'clipboard-list' | 'map-pin';

interface Feature {
  icon: FeatureIcon;
  audience: string;
  title: string;
  description: string;
  points: string[];
  href: string;
  cta: string;
  external: boolean;
}

const FEATURES: Feature[] = [
  {
    icon: 'trophy',
    audience: 'Atletas',
    title: 'Jogue, ranqueie, evolua.',
    description: 'Inscrição em poucos toques e seu progresso na areia em tempo real.',
    points: ['Inscrição nas etapas', 'Chaves e resultados ao vivo', 'Ranking e histórico por categoria'],
    href: 'https://linktr.ee/nexago',
    cta: 'Baixar o app',
    external: true,
  },
  {
    icon: 'clipboard-list',
    audience: 'Organizadores',
    title: 'Torneios sem planilha.',
    description: 'Crie etapas, gere chaves automáticas e gerencie tudo de um painel só.',
    points: ['Chaves geradas automaticamente', 'Inscrições e pagamentos', 'Resultados e ranking integrados'],
    href: '/organizadores',
    cta: 'Saiba mais',
    external: false,
  },
  {
    icon: 'map-pin',
    audience: 'Arenas',
    title: 'Sua quadra, sempre cheia.',
    description: 'Divulgue, receba torneios e conecte sua arena à comunidade da areia.',
    points: ['Perfil público da arena', 'Agenda e disponibilidade', 'Visibilidade para atletas'],
    href: '/arenas',
    cta: 'Saiba mais',
    external: false,
  },
];

/** Porta de `Features` (site Next.js). Ícones lucide-react recriados como SVG inline (sem lib de ícones em site — mesma convenção de `store-buttons.ts`). */
@Component({
  selector: 'app-features',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RevealDirective],
  template: `
    <section class="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-32">
      <div nxReveal class="mx-auto max-w-2xl text-center">
        <p class="mb-3 text-sm font-600 uppercase tracking-[0.2em] text-brand">O ecossistema</p>
        <h2 class="font-display text-[clamp(1.9rem,5vw,3.25rem)] font-700 leading-tight tracking-tight text-fg">
          Tudo pra jogar, organizar e evoluir
        </h2>
        <p class="mx-auto mt-4 max-w-xl text-balance text-base text-text-mute sm:text-lg">
          Um app que conecta os três lados do esporte de areia — do primeiro saque ao título.
        </p>
      </div>

      <div class="mt-16 grid gap-5 md:grid-cols-3">
        @for (f of features; track f.audience; let i = $index) {
          <div nxReveal [nxRevealDelay]="i * 80" class="h-full">
            <a
              [routerLink]="f.external ? null : f.href"
              [href]="f.external ? f.href : null"
              [attr.target]="f.external ? '_blank' : null"
              [attr.rel]="f.external ? 'noopener noreferrer' : null"
              class="group flex h-full flex-col rounded-5 border border-line bg-surface-1 p-7 transition-[transform,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-brand/40 motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              <div class="mb-6 inline-flex size-12 items-center justify-center rounded-3 border border-brand/20 bg-brand-tint text-brand transition-transform duration-300 ease-out group-hover:scale-105 motion-reduce:transition-none">
                @switch (f.icon) {
                  @case ('trophy') {
                    <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                      <path d="M4 22h16" />
                      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                    </svg>
                  }
                  @case ('clipboard-list') {
                    <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
                      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                      <path d="M12 11h4" />
                      <path d="M12 16h4" />
                      <path d="M8 11h.01" />
                      <path d="M8 16h.01" />
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
              <p class="text-xs font-600 uppercase tracking-wider text-text-dim">{{ f.audience }}</p>
              <h3 class="mt-1.5 font-display text-xl font-700 tracking-tight text-fg">{{ f.title }}</h3>
              <p class="mt-2.5 text-sm leading-relaxed text-text-mute">{{ f.description }}</p>
              <ul class="mt-6 space-y-2.5 border-t border-line pt-6">
                @for (p of f.points; track p) {
                  <li class="flex items-start gap-2.5 text-sm text-fg">
                    <span class="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true"></span>
                    {{ p }}
                  </li>
                }
              </ul>
              <span class="mt-6 inline-flex items-center gap-1.5 text-sm font-600 text-brand">
                {{ f.cta }}
                <svg class="size-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </span>
            </a>
          </div>
        }
      </div>
    </section>
  `,
})
export class FeaturesSection {
  protected readonly features = FEATURES;
}
