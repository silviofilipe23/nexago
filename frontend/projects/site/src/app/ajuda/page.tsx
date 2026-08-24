import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal } from '@/components/motion/Reveal';
import { ButtonLink } from '@/components/ui/Button';
import { FaqAccordion, type QA } from '@/components/sections/FaqAccordion';

export const metadata: Metadata = {
  title: 'Central de ajuda',
  description:
    'Dúvidas frequentes do nexaGO para atletas, organizadores e arenas: inscrições, pagamentos, Liga, torneios e mais.',
  alternates: { canonical: '/ajuda' },
  openGraph: {
    title: 'Central de ajuda · nexaGO',
    description: 'Respostas para as dúvidas mais comuns de atletas, organizadores e arenas.',
    url: '/ajuda',
  },
};

const GROUPS: { title: string; items: QA[] }[] = [
  {
    title: 'Geral',
    items: [
      { q: 'O que é o nexaGO?', a: 'Uma plataforma de gestão e participação em torneios e ligas de esportes de areia (beach tennis e vôlei de praia), conectando atletas, organizadores e arenas.' },
      { q: 'O app é gratuito?', a: 'Sim. Baixar o app e criar seu perfil é gratuito. Você paga apenas a inscrição das etapas em que decidir competir.' },
      { q: 'Em quais plataformas o app está disponível?', a: 'O nexaGO está disponível para iOS e Android.' },
    ],
  },
  {
    title: 'Atletas',
    items: [
      { q: 'Como me inscrevo em um torneio?', a: 'Baixe o app, crie seu perfil e escolha a etapa. A inscrição leva poucos toques e o pagamento é feito no app.' },
      { q: 'Em qual categoria devo jogar?', a: 'Você joga na sua categoria ou acima dela. Cada torneio lista as categorias disponíveis com gênero, nível e vagas.' },
      { q: 'Como acompanho meu ranking?', a: 'Seu ranking e histórico ficam no seu perfil do app, atualizados conforme você participa das etapas.' },
    ],
  },
  {
    title: 'Organizadores',
    items: [
      { q: 'Como crio um torneio?', a: 'Pelo painel do organizador você define esporte, categorias, vagas e taxas, e abre as inscrições em minutos.' },
      { q: 'O chaveamento é automático?', a: 'Sim. Eliminatória simples, dupla e grupos são gerados automaticamente quando as inscrições fecham.' },
      { q: 'Como vinculo meu torneio à Liga?', a: 'Etapas podem compor uma liga com pontuação acumulada e ranking próprio. Fale com a gente para configurar.' },
    ],
  },
  {
    title: 'Arenas',
    items: [
      { q: 'Como coloco minha arena no nexaGO?', a: 'Cadastre o perfil público da arena com fotos, esportes e localização. Veja a página de arenas para começar.' },
      { q: 'Preciso organizar torneios?', a: 'Não. Você pode apenas manter o perfil e a agenda e receber etapas de organizadores quando quiser.' },
    ],
  },
  {
    title: 'Pagamentos',
    items: [
      { q: 'Como pago a inscrição?', a: 'O pagamento é feito diretamente no app, de forma segura, por meio dos provedores de pagamento.' },
      { q: 'Posso pedir reembolso?', a: 'As políticas de cancelamento e reembolso seguem as regras divulgadas em cada etapa pelo organizador e a legislação aplicável.' },
    ],
  },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: GROUPS.flatMap((g) =>
    g.items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  ),
};

export default function AjudaPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <Reveal className="max-w-2xl">
        <p className="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Central de ajuda</p>
        <h1 className="font-display text-[clamp(2rem,6vw,3.5rem)] font-800 leading-tight tracking-tight text-fg">
          Como podemos ajudar?
        </h1>
        <p className="mt-4 text-balance text-base leading-relaxed text-text-mute sm:text-lg">
          Respostas para as dúvidas mais comuns. Não achou o que procurava? Fale com a gente.
        </p>
        <p className="mt-5 text-sm text-text-mute">
          Quer o passo a passo completo de cada funcionalidade?{' '}
          <Link href="/docs" className="font-semibold text-brand transition-colors hover:text-brand-light">
            Veja a documentação →
          </Link>
        </p>
      </Reveal>

      <div className="mt-14 space-y-12">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="font-display text-xl font-700 tracking-tight text-fg sm:text-2xl">{g.title}</h2>
            <FaqAccordion items={g.items} className="mt-5" />
          </section>
        ))}
      </div>

      <Reveal delay={0.1}>
        <div className="mt-16 rounded-5 border border-brand/20 bg-surface-1 p-8 text-center">
          <h2 className="font-display text-xl font-700 tracking-tight text-fg">Ainda com dúvidas?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-mute">
            Nossa equipe responde pelo formulário de contato ou pelos canais diretos.
          </p>
          <div className="mt-6 flex justify-center">
            <ButtonLink href="/contato">Falar com a gente</ButtonLink>
          </div>
        </div>
      </Reveal>
    </main>
  );
}
