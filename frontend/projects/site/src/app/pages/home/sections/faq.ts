import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input } from '@angular/core';
import { RevealDirective } from '../../../shared/reveal.directive';
import { FaqAccordionComponent, type QA } from './faq-accordion';

const FAQ_ITEMS: QA[] = [
  {
    q: 'O que é a Liga nexaGO?',
    a: 'É um circuito seriado de esportes de areia com etapas em arenas parceiras, pontuação acumulada e ranking próprio. A 1ª etapa abre a temporada — você se inscreve direto pelo app.',
  },
  {
    q: 'Quais esportes posso jogar?',
    a: 'Vôlei de praia. Cada etapa tem categorias por gênero e nível, do iniciante ao Open.',
  },
  {
    q: 'Como faço para me inscrever em um torneio?',
    a: 'Baixe o app nexaGO, crie seu perfil e escolha a etapa. A inscrição leva poucos toques e o pagamento é feito direto no app.',
  },
  {
    q: 'Em qual categoria devo jogar?',
    a: 'Você joga na sua categoria ou acima dela. Cada torneio lista as categorias disponíveis com gênero, nível e número de vagas.',
  },
  {
    q: 'O app é gratuito?',
    a: 'Sim. Baixar o app e criar seu perfil de atleta é gratuito. Você paga apenas a inscrição de cada etapa em que decidir competir.',
  },
  {
    q: 'Sou organizador ou tenho uma arena. Como participo?',
    a: 'Organizadores criam etapas e geram chaves automáticas pelo painel; arenas ganham perfil público e passam a receber torneios da comunidade. Fale com a gente para começar.',
  },
];

/**
 * Porta de `FAQ` (site Next.js). O JSON-LD (`schema.org/FAQPage`) do original era um
 * `<script>` inline no JSX — Angular não permite `<script>` estático em templates, então
 * o mesmo script é montado e anexado a `document.head` imperativamente (removido no destroy).
 */
@Component({
  selector: 'app-faq',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective, FaqAccordionComponent],
  template: `
    <section id="faq" class="relative mx-auto max-w-3xl scroll-mt-24 px-5 py-16 sm:px-6 sm:py-32">
      <div nxReveal class="text-center">
        <p class="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">
          {{ eyebrow() }}
        </p>
        <h2 class="font-display text-[clamp(1.9rem,5vw,3.25rem)] font-700 leading-tight tracking-tight text-fg">
          {{ title() }}
        </h2>
      </div>

      <app-faq-accordion [items]="items()" />
    </section>
  `,
})
export class FaqSection {
  readonly items = input<QA[]>(FAQ_ITEMS);
  readonly eyebrow = input('Perguntas frequentes');
  readonly title = input('Tudo o que você precisa saber');

  private readonly faqJsonLd = computed(() => ({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: this.items().map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }));

  constructor() {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(this.faqJsonLd());
    document.head.appendChild(script);
    inject(DestroyRef).onDestroy(() => script.remove());
  }
}
