import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ClipboardList, CreditCard, LayoutDashboard, Trophy, type LucideIcon } from 'lucide-react';
import { Reveal } from '@/components/motion/Reveal';
import { ButtonLink } from '@/components/ui/Button';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Steps, type Step } from '@/components/sections/Steps';
import { FAQ } from '@/components/sections/FAQ';
import { LeadForm } from '@/components/sections/LeadForm';
import { TestimonialsMarquee } from '@/components/sections/TestimonialsMarquee';
import type { Testimonial } from '@/components/ui/testimonial-card';
import type { QA } from '@/components/sections/FaqAccordion';

export const metadata: Metadata = {
  title: 'Para organizadores de torneios',
  description:
    'Gerencie torneios de beach tennis e vôlei de praia sem planilha: chaveamento automático, inscrições com pagamento e ranking integrado num painel só.',
  alternates: { canonical: '/organizadores' },
  openGraph: {
    title: 'nexaGO para organizadores',
    description: 'Torneios sem planilha: chaves automáticas, inscrições, pagamentos e ranking integrado.',
    url: '/organizadores',
  },
};

const BENEFITS: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: ClipboardList,
    title: 'Chaveamento automático',
    description: 'Eliminatória simples, dupla ou grupos gerados ao fechar as inscrições. Sem papel, sem erro de planilha.',
  },
  {
    icon: CreditCard,
    title: 'Inscrições e pagamentos',
    description: 'Atletas se inscrevem e pagam pelo app. Você acompanha vagas e caixa em tempo real.',
  },
  {
    icon: Trophy,
    title: 'Resultados e ranking',
    description: 'Registre o placar e o ranking se atualiza sozinho. A etapa fica viva para todo mundo acompanhar.',
  },
  {
    icon: LayoutDashboard,
    title: 'Tudo num painel só',
    description: 'Categorias, chaves, quadras e comunicação com atletas centralizados no painel do organizador.',
  },
];

const STEPS: Step[] = [
  { title: 'Crie a etapa', description: 'Defina esporte, categorias, vagas e taxas em minutos pelo painel.' },
  { title: 'Abra as inscrições', description: 'Atletas se inscrevem e pagam pelo app; você acompanha tudo em tempo real.' },
  { title: 'Rode o torneio', description: 'Chaves automáticas, resultados ao vivo e ranking atualizado sem trabalho manual.' },
];

const TESTIMONIALS: Testimonial[] = [
  {
    quote: 'Larguei as planilhas. Gero as chaves automaticamente e o ranking se atualiza sozinho a cada etapa.',
    name: 'Rafael Menezes',
    role: 'Organizador · Circuito Litoral',
  },
  {
    quote: 'As inscrições com pagamento no app reduziram meu trabalho de bastidor pela metade.',
    name: 'Juliana Prado',
    role: 'Organizadora · Open da Areia',
  },
  {
    quote: 'No dia do torneio é só registrar o placar. A chave e o ranking cuidam de si mesmos.',
    name: 'Diego Tavares',
    role: 'Organizador · Beach League Sul',
  },
  {
    quote: 'Gerar grupos e eliminatórias em segundos mudou o ritmo das minhas etapas.',
    name: 'Camila Rocha',
    role: 'Organizadora · Areia Tour',
  },
  {
    quote: 'Acompanhar inscrições e caixa em tempo real me deu previsibilidade que eu não tinha.',
    name: 'Pedro Vasconcelos',
    role: 'Organizador · Copa Litorânea',
  },
  {
    quote: 'Os atletas adoram ver a chave ao vivo — diminuiu muito a fila de dúvidas na mesa.',
    name: 'Marcos Lemes',
    role: 'Organizador · Circuito Dunas',
  },
];

const FAQ_ITEMS: QA[] = [
  {
    q: 'Preciso pagar para usar o nexaGO como organizador?',
    a: 'Fale com a gente pelo formulário abaixo e montamos o modelo ideal para o seu circuito.',
  },
  {
    q: 'Quais formatos de chave são suportados?',
    a: 'Eliminatória simples, dupla e fase de grupos — geradas automaticamente quando as inscrições fecham.',
  },
  {
    q: 'Os atletas pagam a inscrição pelo app?',
    a: 'Sim. A inscrição e o pagamento acontecem no app; você acompanha vagas e caixa em tempo real no painel.',
  },
  {
    q: 'Consigo vincular meu torneio a uma liga?',
    a: 'Sim. Etapas podem compor uma liga com pontuação acumulada e ranking próprio.',
  },
];

export default function OrganizadoresPage() {
  return (
    <main className="overflow-x-hidden">
      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-5 pb-12 pt-28 sm:px-6 sm:pt-36">
        <Reveal className="max-w-2xl">
          <p className="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">
            Para organizadores
          </p>
          <h1 className="font-display text-[clamp(2.2rem,6.5vw,4rem)] font-800 leading-[1.03] tracking-tight text-fg">
            Torneios sem planilha.
          </h1>
          <p className="mt-6 max-w-xl text-balance text-lg leading-relaxed text-text-mute">
            Crie etapas, gere chaves automáticas e gerencie inscrições, pagamentos e ranking — tudo
            de um painel só. Você foca no jogo; o nexaGO cuida da operação.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="#contato">
              Quero começar
              <ArrowRight className="size-4" aria-hidden="true" />
            </ButtonLink>
            <ButtonLink href="/torneios" variant="secondary">
              Ver torneios na plataforma
            </ButtonLink>
          </div>
        </Reveal>
      </section>

      {/* Benefícios */}
      <section className="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
        <div className="grid gap-5 sm:grid-cols-2">
          {BENEFITS.map((b, i) => (
            <Reveal key={b.title} delay={i * 0.06} className="h-full">
              <SpotlightCard className="h-full p-7">
                <div className="mb-5 inline-flex size-12 items-center justify-center rounded-3 border border-brand/20 bg-brand-tint text-brand transition-transform duration-300 ease-out group-hover/spot:scale-105 motion-reduce:transition-none">
                  <b.icon className="size-6" aria-hidden="true" />
                </div>
                <h2 className="font-display text-lg font-700 tracking-tight text-fg">{b.title}</h2>
                <p className="mt-2.5 text-sm leading-relaxed text-text-mute">{b.description}</p>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </section>

      <Steps eyebrow="Como funciona" title="Do cadastro ao título em 3 passos" steps={STEPS} />

      {/* Prova social */}
      <section className="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-[clamp(1.9rem,5vw,3rem)] font-700 leading-tight tracking-tight text-fg">
            Organizadores que largaram a planilha
          </h2>
        </Reveal>
        <TestimonialsMarquee testimonials={TESTIMONIALS} />
      </section>

      <FAQ items={FAQ_ITEMS} eyebrow="Dúvidas de organizador" title="Como funciona para você" />

      <LeadForm persona="organizador" />
    </main>
  );
}
