import { Reveal } from '@/components/motion/Reveal';
import { FaqAccordion, type QA } from '@/components/sections/FaqAccordion';

const FAQ_ITEMS: QA[] = [
  {
    q: 'O que é a Liga nexaGO?',
    a: 'É um circuito seriado de esportes de areia com etapas em arenas parceiras, pontuação acumulada e ranking próprio. A 1ª etapa abre a temporada — você se inscreve direto pelo app.',
  },
  {
    q: 'Quais esportes posso jogar?',
    a: 'Beach tennis e vôlei de praia. Cada etapa tem categorias por gênero e nível, do iniciante ao Open.',
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

type FAQProps = {
  items?: QA[];
  eyebrow?: string;
  title?: string;
};

export function FAQ({
  items = FAQ_ITEMS,
  eyebrow = 'Perguntas frequentes',
  title = 'Tudo o que você precisa saber',
}: FAQProps) {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };

  return (
    <section id="faq" className="relative mx-auto max-w-3xl scroll-mt-24 px-5 py-24 sm:px-6 sm:py-32">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <Reveal className="text-center">
        <p className="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">
          {eyebrow}
        </p>
        <h2 className="font-display text-[clamp(1.9rem,5vw,3.25rem)] font-700 leading-tight tracking-tight text-fg">
          {title}
        </h2>
      </Reveal>

      <FaqAccordion items={items} />
    </section>
  );
}
