import type { Metadata } from 'next';
import { getPublicTournaments } from '@/lib/firestore/tournaments';
import { TournamentBrowser } from '@/components/hub/TournamentBrowser';
import { toSlugId } from '@/lib/slug';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Torneios de beach tennis e vôlei de praia',
  description:
    'Encontre torneios e etapas de beach tennis e vôlei de praia abertos para inscrição. Chaves, resultados e ranking ao vivo no nexaGO.',
  alternates: { canonical: '/torneios' },
  openGraph: {
    title: 'Torneios · nexaGO',
    description: 'Torneios e etapas de beach tennis e vôlei de praia abertos para inscrição.',
    url: '/torneios',
  },
};

export default async function TorneiosPage() {
  const tournaments = await getPublicTournaments();

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Torneios nexaGO',
    itemListElement: tournaments.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://nexago.com.br/torneios/${toSlugId(t.name, t.id)}`,
      name: t.name,
    })),
  };

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
      {tournaments.length > 0 && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      )}

      <header className="max-w-2xl">
        <p className="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Hub público</p>
        <h1 className="font-display text-[clamp(2rem,6vw,3.5rem)] font-800 leading-tight tracking-tight text-fg">
          Torneios na areia
        </h1>
        <p className="mt-4 text-balance text-base text-text-mute sm:text-lg">
          Etapas de beach tennis e vôlei de praia abertas para inscrição. Acompanhe chaves,
          resultados e ranking em tempo real.
        </p>
      </header>

      {tournaments.length === 0 ? (
        <div className="mt-16 rounded-5 border border-line bg-surface-1 p-12 text-center">
          <p className="font-display text-lg font-700 text-fg">Nenhum torneio público no momento</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-text-mute">
            Assim que novas etapas forem publicadas, elas aparecem aqui. Baixe o app para ser
            avisado.
          </p>
        </div>
      ) : (
        <TournamentBrowser tournaments={tournaments} />
      )}
    </main>
  );
}
