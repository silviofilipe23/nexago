import type { Metadata } from 'next';
import { ArrowRight, Trophy, TrendingUp, MapPin, Medal, type LucideIcon } from 'lucide-react';
import { Reveal } from '@/components/motion/Reveal';
import { ButtonLink } from '@/components/ui/Button';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Steps, type Step } from '@/components/sections/Steps';
import { FAQ } from '@/components/sections/FAQ';
import { Download } from '@/components/sections/Download';
import { LeagueBrowser } from '@/components/hub/LeagueBrowser';
import { getPublicLeagues } from '@/lib/firestore/leagues';
import type { QA } from '@/components/sections/FaqAccordion';

const BASE = 'https://nexago.com.br';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Ligas nexaGO',
  description:
    'As Ligas nexaGO são circuitos de esportes de areia com etapas em arenas parceiras, pontuação acumulada e ranking. Conheça as ligas em andamento e garanta sua vaga.',
  alternates: { canonical: '/ligas' },
  openGraph: {
    title: 'Ligas nexaGO',
    description: 'Circuitos de beach tennis e vôlei de praia: etapas, pontuação acumulada e ranking.',
    url: '/ligas',
  },
};

const PILLARS: { icon: LucideIcon; title: string; description: string }[] = [
  { icon: Trophy, title: 'Circuito seriado', description: 'Várias etapas ao longo da temporada, em arenas parceiras pelo Brasil.' },
  { icon: TrendingUp, title: 'Pontuação acumulada', description: 'Cada etapa soma pontos — sua consistência define a classificação.' },
  { icon: Medal, title: 'Ranking da liga', description: 'Acompanhe sua posição e dispute o topo da temporada.' },
  { icon: MapPin, title: 'Etapas em arenas', description: 'Jogue em quadras parceiras e viva o circuito de perto.' },
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

export default async function LigasPage() {
  const leagues = await getPublicLeagues();

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Ligas nexaGO',
    itemListElement: leagues.map((l, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${BASE}/ligas/${l.id}`,
      name: l.name,
    })),
  };

  return (
    <main className="overflow-x-hidden">
      {leagues.length > 0 && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      )}

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-5 pb-12 pt-28 sm:px-6 sm:pt-36">
        <Reveal className="max-w-2xl">
          <p className="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">
            Ligas nexaGO
          </p>
          <h1 className="font-display text-[clamp(2.2rem,6.5vw,4rem)] font-800 leading-[1.03] tracking-tight text-fg">
            As ligas que movem a areia do Brasil.
          </h1>
          <p className="mt-6 max-w-xl text-balance text-lg leading-relaxed text-text-mute">
            Circuitos seriados em arenas parceiras, com pontuação acumulada e ranking próprio.
            Conheça as ligas e garanta sua vaga na próxima etapa.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/#download">
              Garantir minha vaga
              <ArrowRight className="size-4" aria-hidden="true" />
            </ButtonLink>
            <ButtonLink href="/torneios" variant="secondary">
              Ver torneios
            </ButtonLink>
          </div>
        </Reveal>
      </section>

      {/* Ligas cadastradas */}
      <section className="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Circuitos</p>
          <h2 className="font-display text-[clamp(1.9rem,5vw,3rem)] font-700 leading-tight tracking-tight text-fg">
            Ligas em andamento
          </h2>
        </Reveal>

        {leagues.length > 0 ? (
          <LeagueBrowser leagues={leagues} />
        ) : (
          <Reveal>
            <div className="mx-auto mt-12 max-w-xl rounded-5 border border-line bg-surface-1 p-10 text-center">
              <p className="font-display text-lg font-700 text-fg">Ligas em breve</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-text-mute">
                As ligas da temporada serão divulgadas aqui. Baixe o app para ser avisado da abertura
                das inscrições.
              </p>
            </div>
          </Reveal>
        )}
      </section>

      {/* O que é */}
      <section className="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.06} className="h-full">
              <SpotlightCard className="h-full p-7">
                <div className="mb-5 inline-flex size-12 items-center justify-center rounded-3 border border-brand/20 bg-brand-tint text-brand transition-transform duration-300 ease-out group-hover/spot:scale-105 motion-reduce:transition-none">
                  <p.icon className="size-6" aria-hidden="true" />
                </div>
                <h3 className="font-display text-lg font-700 tracking-tight text-fg">{p.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-text-mute">{p.description}</p>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </section>

      <Steps eyebrow="Como funciona" title="Pontuou, subiu: a temporada em 3 passos" steps={STEPS} />

      {/* Categorias */}
      <section className="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-[clamp(1.9rem,5vw,3rem)] font-700 leading-tight tracking-tight text-fg">
            Do iniciante ao Open
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-balance text-base text-text-mute">
            As ligas têm categorias para todos os níveis — você compete com quem está no seu nível.
          </p>
        </Reveal>
        <div className="mx-auto mt-10 flex max-w-2xl flex-wrap justify-center gap-3">
          {CATEGORIES.map((c) => (
            <span
              key={c}
              className="rounded-pill border border-line-strong bg-surface-1 px-5 py-2.5 font-display text-sm font-700 tracking-tight text-fg"
            >
              {c}
            </span>
          ))}
        </div>
      </section>

      <FAQ items={FAQ_ITEMS} eyebrow="Dúvidas das ligas" title="Como funcionam as ligas" />

      <Download />
    </main>
  );
}
