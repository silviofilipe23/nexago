import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { getPublicTournaments, getTournamentById } from '@/lib/firestore/tournaments';
import { TournamentHero } from '@/components/hub/TournamentHero';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Reveal } from '@/components/motion/Reveal';
import { ButtonLink } from '@/components/ui/Button';
import { sportLabel, genderLabel, formatCents } from '@/lib/format';
import { ensureNonEmptyParams, extractId, toSlugId } from '@/lib/slug';
import type { TournamentListingStatus } from '@/lib/firestore/types';

export const revalidate = 300;

// Gera a URL canônica (slug-id) e também o id puro — links antigos sem slug
// batem no param "id puro" e o permanentRedirect resolve pra URL canônica.
export async function generateStaticParams() {
  const tournaments = await getPublicTournaments(500);
  const params = tournaments.flatMap((t) => {
    const slug = toSlugId(t.name, t.id);
    return slug === t.id ? [{ id: t.id }] : [{ id: slug }, { id: t.id }];
  });
  return ensureNonEmptyParams(params, { id: '_' });
}

/** O bloco de ação no pé da página fala a verdade do status — nada de "Inscreva-se" em torneio
 *  cancelado ou que já aconteceu. */
const CTA_COPY: Record<TournamentListingStatus, { title: string; description: string }> = {
  open: {
    title: 'Quer jogar essa etapa?',
    description: 'Inscreva-se pelo site ou pelo app e acompanhe ao vivo.',
  },
  almost_full: {
    title: 'Últimas vagas nessa etapa',
    description: 'As vagas estão acabando — garanta a sua pelo site ou pelo app.',
  },
  closed: {
    title: 'Inscrições encerradas',
    description: 'As chaves já estão fechadas. Acompanhe os jogos ao vivo pelo app.',
  },
  live: {
    title: 'Acontecendo agora',
    description: 'Acompanhe as chaves e os resultados ao vivo pelo app.',
  },
  ended: {
    title: 'Esse torneio já aconteceu',
    description: 'Veja as etapas com inscrições abertas e não perca a próxima.',
  },
  cancelled: {
    title: 'Esse torneio foi cancelado',
    description: 'O organizador cancelou essa etapa. Veja outros torneios abertos na areia.',
  },
};

// O segmento `[id]` aceita "slug-id" (ex.: copa-de-verao-aBc123); o id real é
// extraído do final. Links antigos só com o id seguem funcionando (redirect canônico).
type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const t = await getTournamentById(extractId(id));
  if (!t) return { title: 'Torneio não encontrado' };

  const place = [t.locationName, t.city, t.state].filter(Boolean).join(', ');
  const description =
    t.description?.slice(0, 160) ||
    `${t.name} — ${sportLabel(t.sport)}${place ? ` em ${place}` : ''}. Inscrições, chaves e ranking no nexaGO.`;
  const slug = toSlugId(t.name, t.id);

  return {
    title: t.name,
    description,
    alternates: { canonical: `/torneios/${slug}` },
    openGraph: { title: `${t.name} · nexaGO`, description, url: `/torneios/${slug}` },
  };
}

export default async function TorneioDetailPage({ params }: Params) {
  const { id } = await params;
  const t = await getTournamentById(extractId(id));
  if (!t) notFound();

  const slug = toSlugId(t.name, t.id);
  if (id !== slug) permanentRedirect(`/torneios/${slug}`);

  const place = [t.locationName, t.city, t.state].filter(Boolean).join(', ');
  // O Google lê isto: torneio cancelado precisa sair como cancelado, não como agendado.
  const eventStatus =
    t.listingStatus === 'cancelled'
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled';
  // Só convida a se inscrever quando a inscrição existe de fato.
  const acceptsRegistration = t.listingStatus === 'open' || t.listingStatus === 'almost_full';
  const cta = CTA_COPY[t.listingStatus];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: t.name,
    description: t.description ?? undefined,
    sport: sportLabel(t.sport),
    startDate: t.startAt?.toISOString(),
    endDate: t.endAt?.toISOString(),
    eventStatus,
    url: `https://nexago.com.br/torneios/${slug}`,
    location: place
      ? {
          '@type': 'Place',
          name: t.locationName ?? t.city ?? place,
          address: [t.locationAddress, t.city, t.state].filter(Boolean).join(', ') || place,
        }
      : undefined,
    organizer: { '@type': 'Organization', name: 'nexaGO', url: 'https://nexago.com.br' },
  };

  return (
    <main className="pb-24">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <TournamentHero t={t} />

      <div className="mx-auto max-w-4xl px-5 sm:px-6">
        {t.description && (
          <Reveal>
            <p className="mt-10 max-w-2xl whitespace-pre-line text-base leading-relaxed text-text-mute">
              {t.description}
            </p>
          </Reveal>
        )}

        {t.categories.length > 0 && (
          <section className="mt-12">
            <Reveal>
              <h2 className="font-display text-xl font-700 tracking-tight text-fg">Categorias</h2>
            </Reveal>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {t.categories.map((c, i) => (
                <li key={i} className="h-full">
                  <Reveal delay={i * 0.05} className="h-full">
                    <SpotlightCard className="flex h-full items-center justify-between gap-4 px-5 py-4">
                      <div>
                        <p className="font-600 text-fg">
                          {c.categoryName ?? `${c.level ?? 'Categoria'} · ${genderLabel(c.genderType)}`}
                        </p>
                        {typeof c.spotsTotal === 'number' && (
                          <p className="mt-0.5 text-sm text-text-dim">{c.spotsTotal} vagas</p>
                        )}
                      </div>
                      {typeof c.entryFeeCents === 'number' && (
                        <span className="shrink-0 font-mono font-700 text-brand">
                          {formatCents(c.entryFeeCents)}
                        </span>
                      )}
                    </SpotlightCard>
                  </Reveal>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Reveal>
          <section
            className={`mt-14 flex flex-col items-start gap-4 rounded-5 border bg-surface-1 p-7 sm:flex-row sm:items-center sm:justify-between ${
              acceptsRegistration ? 'border-brand/20' : 'border-line'
            }`}
          >
            <div className="flex items-center gap-3">
              <Trophy
                className={`size-6 ${acceptsRegistration ? 'text-brand' : 'text-text-dim'}`}
                aria-hidden="true"
              />
              <div>
                <p className="font-display font-700 text-fg">{cta.title}</p>
                <p className="text-sm text-text-mute">{cta.description}</p>
              </div>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              {acceptsRegistration ? (
                <ButtonLink
                  href={`https://atleta.nexago.com.br/torneios/${t.id}/inscricao`}
                  className="w-full sm:w-auto"
                >
                  Inscreva-se
                </ButtonLink>
              ) : (
                <ButtonLink href="/torneios" className="w-full sm:w-auto">
                  Ver torneios abertos
                </ButtonLink>
              )}
              <ButtonLink href="https://linktr.ee/nexago" variant="secondary" className="w-full sm:w-auto">
                Baixar o app
              </ButtonLink>
            </div>
          </section>
        </Reveal>
      </div>
    </main>
  );
}
