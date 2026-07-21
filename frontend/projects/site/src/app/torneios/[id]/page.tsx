import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { getTournamentById } from '@/lib/firestore/tournaments';
import { TournamentHero } from '@/components/hub/TournamentHero';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Reveal } from '@/components/motion/Reveal';
import { ButtonLink } from '@/components/ui/Button';
import { sportLabel, genderLabel, formatCents } from '@/lib/format';
import { extractId, toSlugId } from '@/lib/slug';

export const revalidate = 300;

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
  const statusMap: Record<string, string> = {
    open: 'https://schema.org/EventScheduled',
    almost_full: 'https://schema.org/EventScheduled',
    live: 'https://schema.org/EventScheduled',
    ended: 'https://schema.org/EventScheduled',
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: t.name,
    description: t.description ?? undefined,
    sport: sportLabel(t.sport),
    startDate: t.startAt?.toISOString(),
    endDate: t.endAt?.toISOString(),
    eventStatus: statusMap[t.listingStatus],
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
                          {c.level ?? 'Categoria'} · {genderLabel(c.genderType)}
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
          <section className="mt-14 flex flex-col items-start gap-4 rounded-5 border border-brand/20 bg-surface-1 p-7 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Trophy className="size-6 text-brand" aria-hidden="true" />
              <div>
                <p className="font-display font-700 text-fg">Quer jogar essa etapa?</p>
                <p className="text-sm text-text-mute">Inscreva-se pelo app e acompanhe ao vivo.</p>
              </div>
            </div>
            <ButtonLink href="https://linktr.ee/nexago" className="w-full sm:w-auto">
              Baixar o app
            </ButtonLink>
          </section>
        </Reveal>
      </div>
    </main>
  );
}
