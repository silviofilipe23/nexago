import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MapPin, CalendarDays, ArrowLeft, Users, Trophy } from 'lucide-react';
import { getTournamentById } from '@/lib/firestore/tournaments';
import { StatusBadge } from '@/components/hub/StatusBadge';
import { ButtonLink } from '@/components/ui/Button';
import { sportLabel, genderLabel, formatCents, formatDate } from '@/lib/format';

export const revalidate = 300;

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const t = await getTournamentById(id);
  if (!t) return { title: 'Torneio não encontrado' };

  const place = [t.locationName, t.city, t.state].filter(Boolean).join(', ');
  const description =
    t.description?.slice(0, 160) ||
    `${t.name} — ${sportLabel(t.sport)}${place ? ` em ${place}` : ''}. Inscrições, chaves e ranking no nexaGO.`;

  return {
    title: t.name,
    description,
    alternates: { canonical: `/torneios/${t.id}` },
    openGraph: { title: `${t.name} · nexaGO`, description, url: `/torneios/${t.id}` },
  };
}

export default async function TorneioDetailPage({ params }: Params) {
  const { id } = await params;
  const t = await getTournamentById(id);
  if (!t) notFound();

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
    url: `https://nexago.com.br/torneios/${t.id}`,
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
    <main className="mx-auto max-w-4xl px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Link
        href="/torneios"
        className="inline-flex items-center gap-1.5 text-sm text-text-mute transition-colors hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Todos os torneios
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs font-600 uppercase tracking-wider text-text-dim">
          {sportLabel(t.sport)}
        </span>
        <StatusBadge status={t.listingStatus} />
        {t.leagueStageName && (
          <span className="text-xs text-text-mute">· {t.leagueStageName}</span>
        )}
      </div>

      <h1 className="mt-4 font-display text-[clamp(2rem,6vw,3.25rem)] font-800 leading-tight tracking-tight text-fg">
        {t.name}
      </h1>

      <div className="mt-6 flex flex-col gap-3 text-text-mute sm:flex-row sm:flex-wrap sm:gap-6">
        {place && (
          <span className="flex items-center gap-2">
            <MapPin className="size-4 text-text-dim" aria-hidden="true" />
            {place}
          </span>
        )}
        {(t.dateLabel || t.startAt) && (
          <span className="flex items-center gap-2">
            <CalendarDays className="size-4 text-text-dim" aria-hidden="true" />
            {t.dateLabel ?? formatDate(t.startAt)}
          </span>
        )}
        <span className="flex items-center gap-2">
          <Users className="size-4 text-text-dim" aria-hidden="true" />
          {t.enrolledCount} inscritos
        </span>
      </div>

      {t.description && (
        <p className="mt-8 max-w-2xl whitespace-pre-line text-base leading-relaxed text-text-mute">
          {t.description}
        </p>
      )}

      {t.categories.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-xl font-700 tracking-tight text-fg">Categorias</h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {t.categories.map((c, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-4 rounded-4 border border-line bg-surface-1 px-5 py-4"
              >
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
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-14 flex flex-col items-start gap-4 rounded-5 border border-brand/20 bg-surface-1 p-7 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Trophy className="size-6 text-brand" aria-hidden="true" />
          <div>
            <p className="font-display font-700 text-fg">Quer jogar essa etapa?</p>
            <p className="text-sm text-text-mute">Inscreva-se pelo app e acompanhe ao vivo.</p>
          </div>
        </div>
        <ButtonLink href="/#download" className="w-full sm:w-auto">
          Baixar o app
        </ButtonLink>
      </section>
    </main>
  );
}
