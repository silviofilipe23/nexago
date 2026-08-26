import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RevealDirective } from '../../../shared/reveal.directive';
import type { Testimonial } from './testimonial-card';
import { TestimonialsMarqueeSection } from './testimonials-marquee';

// TODO: substituir por depoimentos reais (atletas, organizadores e arenas parceiras).
const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'Inscrevi minha dupla em segundos e acompanhei a chave ao vivo da arquibancada. Mudou como a gente vive o torneio.',
    name: 'Marina Costa',
    role: 'Atleta · Beach tennis',
  },
  {
    quote: 'Larguei as planilhas. Gero as chaves automaticamente e o ranking se atualiza sozinho a cada etapa.',
    name: 'Rafael Menezes',
    role: 'Organizador · Circuito Litoral',
  },
  {
    quote: 'Minha arena passou a receber etapas da Liga e a agenda encheu. A comunidade da areia chegou junto.',
    name: 'Arena Maré Alta',
    role: 'Arena parceira · Florianópolis',
  },
  {
    quote: 'Ver meu ranking subir a cada etapa me deu um gás novo pra treinar. Virou parte da minha rotina.',
    name: 'Lucas Andrade',
    role: 'Atleta · Vôlei de praia',
  },
  {
    quote: 'As inscrições com pagamento no app reduziram meu trabalho de bastidor pela metade.',
    name: 'Juliana Prado',
    role: 'Organizadora · Open da Areia',
  },
  {
    quote: 'O perfil público trouxe atletas que nem sabiam que a gente existia. Ótimo retorno.',
    name: 'Beach Point',
    role: 'Arena parceira · Santos',
  },
];

// TODO: trocar por logos reais em assets de marca quando disponíveis (public/brand/partners no site Next.js).
const PARTNERS = ['Arena Maré Alta', 'Beach Point', 'Areia Viva', 'Praia Club', 'Costa Norte'];

/** Porta de `ProvaSocial` (site Next.js). */
@Component({
  selector: 'app-prova-social',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective, TestimonialsMarqueeSection],
  template: `
    <section class="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-32">
      <div nxReveal class="mx-auto max-w-2xl text-center">
        <p class="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Quem joga, confia</p>
        <h2 class="font-display text-[clamp(1.9rem,5vw,3.25rem)] font-700 leading-tight tracking-tight text-fg">
          A areia toda em um só lugar
        </h2>
        <p class="mx-auto mt-4 max-w-xl text-balance text-base text-text-mute sm:text-lg">
          Atletas, organizadores e arenas já fazem a temporada acontecer pelo nexaGO.
        </p>
      </div>

      <app-testimonials-marquee [testimonials]="testimonials" />

      <div nxReveal [nxRevealDelay]="100" class="mt-16">
        <p class="text-center font-mono text-xs font-600 uppercase tracking-[0.2em] text-text-dim">Arenas parceiras</p>
        <ul class="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          @for (p of partners; track p) {
            <li
              class="font-display text-base font-700 tracking-tight text-text-mute transition-[color,transform] duration-200 ease-out hover:scale-105 hover:text-fg motion-reduce:transition-none motion-reduce:hover:scale-100"
            >
              {{ p }}
            </li>
          }
        </ul>
      </div>
    </section>
  `,
})
export class ProvaSocialSection {
  protected readonly testimonials = TESTIMONIALS;
  protected readonly partners = PARTNERS;
}
