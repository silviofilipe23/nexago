import type { Metadata } from 'next';
import { ArrowRight, CalendarCheck, Eye, Sparkles, Users, type LucideIcon } from 'lucide-react';
import { Reveal } from '@/components/motion/Reveal';
import { ButtonLink } from '@/components/ui/Button';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Steps, type Step } from '@/components/sections/Steps';
import { ArenaPlanos } from '@/components/sections/ArenaPlanos';
import { FAQ } from '@/components/sections/FAQ';
import { LeadForm } from '@/components/sections/LeadForm';
import { TestimonialsMarquee } from '@/components/sections/TestimonialsMarquee';
import type { Testimonial } from '@/components/ui/testimonial-card';
import type { QA } from '@/components/sections/FaqAccordion';

export const metadata: Metadata = {
  title: 'Para arenas e gestores de quadra',
  description:
    'Coloque sua arena no mapa do nexaGO: perfil público, agenda, mais visibilidade e etapas de torneios para encher suas quadras de beach tennis e vôlei de praia.',
  alternates: { canonical: '/arenas' },
  openGraph: {
    title: 'nexaGO para arenas',
    description: 'Sua quadra sempre cheia: visibilidade, perfil público, agenda e etapas da comunidade da areia.',
    url: '/arenas',
  },
};

const BENEFITS: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Eye,
    title: 'Visibilidade para atletas',
    description: 'Apareça para a comunidade da areia que busca onde jogar, treinar e competir na sua região.',
  },
  {
    icon: CalendarCheck,
    title: 'Receba etapas e torneios',
    description: 'Conecte sua arena a organizadores e à Liga nexaGO. Mais eventos, mais movimento nas quadras.',
  },
  {
    icon: Sparkles,
    title: 'Perfil público da arena',
    description: 'Fotos, esportes, comodidades e localização num perfil que valoriza a sua estrutura.',
  },
  {
    icon: Users,
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
    a: 'Beach tennis e vôlei de praia, com suporte a diferentes tipos de quadra e superfícies.',
  },
  {
    q: 'Como os atletas encontram minha arena?',
    a: 'Pelo perfil público e pela busca de arenas no app, com localização, esportes e comodidades.',
  },
];

export default function ArenasPage() {
  return (
    <main className="overflow-x-hidden">
      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-5 pb-12 pt-28 sm:px-6 sm:pt-36">
        <Reveal className="max-w-2xl">
          <p className="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">
            Para arenas
          </p>
          <h1 className="font-display text-[clamp(2.2rem,6.5vw,4rem)] font-800 leading-[1.03] tracking-tight text-fg">
            Sua quadra, sempre cheia.
          </h1>
          <p className="mt-6 max-w-xl text-balance text-lg leading-relaxed text-text-mute">
            Divulgue sua arena, receba torneios e conecte sua estrutura à comunidade da areia.
            Mais visibilidade, mais eventos, menos horário ocioso.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="#contato">
              Cadastrar minha arena
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

      <Steps eyebrow="Como funciona" title="Da estrutura à quadra lotada em 3 passos" steps={STEPS} />

      <ArenaPlanos />

      {/* Prova social */}
      <section className="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-[clamp(1.9rem,5vw,3rem)] font-700 leading-tight tracking-tight text-fg">
            Arenas que entraram para a areia
          </h2>
        </Reveal>
        <TestimonialsMarquee testimonials={TESTIMONIALS} />
      </section>

      <FAQ items={FAQ_ITEMS} eyebrow="Dúvidas de arena" title="Como funciona para você" />

      <LeadForm persona="arena" />
    </main>
  );
}
