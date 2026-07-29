import type { Metadata } from 'next';
import { Trophy, TrendingUp, Medal } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Ranking de beach tennis e vôlei de praia',
  description:
    'O ranking nexaGO acompanha a evolução dos atletas a cada etapa: pontos por torneio, por categoria e por temporada.',
  alternates: { canonical: '/rankings' },
  openGraph: {
    title: 'Ranking · nexaGO',
    description: 'Pontuação por torneio, categoria e temporada — a evolução dos atletas na areia.',
    url: '/rankings',
  },
};

const HOW = [
  { icon: Trophy, title: 'Pontos por torneio', text: 'Cada etapa distribui pontos conforme a colocação na sua categoria.' },
  { icon: Medal, title: 'Por categoria', text: 'O ranking separa níveis e gêneros — você compete com quem está no seu nível.' },
  { icon: TrendingUp, title: 'Por temporada', text: 'A soma da temporada define sua posição e abre acesso às fases finais da Liga.' },
];

export default function RankingsPage() {
  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
      <header className="max-w-2xl">
        <p className="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Hub público</p>
        <h1 className="font-display text-[clamp(2rem,6vw,3.5rem)] font-800 leading-tight tracking-tight text-fg">
          Ranking nexaGO
        </h1>
        <p className="mt-4 text-balance text-base text-text-mute sm:text-lg">
          A classificação dos atletas de beach tennis e vôlei de praia, atualizada a cada etapa da
          Liga nexaGO.
        </p>
      </header>

      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {HOW.map((h, i) => (
          <div key={i} className="rounded-5 border border-line bg-surface-1 p-7">
            <div className="mb-5 inline-flex size-12 items-center justify-center rounded-3 border border-brand/20 bg-brand-tint text-brand">
              <h.icon className="size-6" aria-hidden="true" />
            </div>
            <h2 className="font-display text-lg font-700 tracking-tight text-fg">{h.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-text-mute">{h.text}</p>
          </div>
        ))}
      </div>

      <section className="mt-12 rounded-5 border border-line bg-surface-1 p-12 text-center">
        <p className="font-display text-lg font-700 text-fg">O ranking abre com a 1ª etapa</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-text-mute">
          A classificação ao vivo aparece aqui assim que a temporada começar. Baixe o app para
          competir e acompanhar sua posição.
        </p>
        <div className="mt-7 flex justify-center">
          <ButtonLink href="https://linktr.ee/nexago">Baixar o app</ButtonLink>
        </div>
      </section>
    </main>
  );
}
