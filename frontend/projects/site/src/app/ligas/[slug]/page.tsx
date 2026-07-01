import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/motion/Reveal';
import { ButtonLink } from '@/components/ui/Button';
import { Download } from '@/components/sections/Download';
import { LeagueHero } from '@/components/hub/LeagueHero';
import { getLeagueById } from '@/lib/firestore/leagues';
import { formatDate } from '@/lib/format';
import { extractId, toSlugId } from '@/lib/slug';

const BASE = 'https://nexago.com.br';

export const revalidate = 300;

// O segmento `[slug]` aceita "slug-id" (ex.: liga-nexago-2025-aBc123); o id real é
// extraído do final e links só com o id redirecionam para a URL canônica.
type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const league = await getLeagueById(extractId(slug));
  if (!league) return { title: 'Liga não encontrada' };

  const description =
    league.description?.slice(0, 160) ||
    `${league.name}${league.seasonLabel ? ` · ${league.seasonLabel}` : ''} — etapas, pontuação acumulada e ranking no nexaGO.`;
  const path = `/ligas/${toSlugId(league.name, league.id)}`;

  return {
    title: league.name,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${league.name} · nexaGO`, description, url: path },
  };
}

export default async function LigaDetailPage({ params }: Params) {
  const { slug } = await params;
  const league = await getLeagueById(extractId(slug));
  if (!league) notFound();

  const canonical = toSlugId(league.name, league.id);
  if (slug !== canonical) permanentRedirect(`/ligas/${canonical}`);

  const stages = league.stages;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsOrganization',
    name: league.name,
    description: league.description ?? undefined,
    url: `${BASE}/ligas/${canonical}`,
  };

  return (
    <main className="pb-24">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <LeagueHero league={league} />

      <div className="mx-auto max-w-4xl px-5 sm:px-6">
        {league.description && (
          <Reveal>
            <p className="mt-10 max-w-2xl whitespace-pre-line text-base leading-relaxed text-text-mute">
              {league.description}
            </p>
          </Reveal>
        )}

        <Reveal delay={0.05}>
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

        {/* Calendário de etapas */}
        <section id="calendario" className="mt-14 scroll-mt-24">
          <Reveal>
            <h2 className="font-display text-xl font-700 tracking-tight text-fg">
              Etapas da temporada
            </h2>
          </Reveal>

          {stages.length > 0 ? (
            <ol className="mt-6 space-y-4">
              {stages.map((s, i) => (
                <Reveal key={`${s.name}-${i}`} delay={i * 0.05}>
                  <li className="flex items-center gap-5 rounded-4 border border-line bg-surface-1 p-6">
                    <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-3 border border-brand/20 bg-brand-tint font-display text-lg font-800 text-brand">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-display text-lg font-700 tracking-tight text-fg">
                        {s.name ?? `Etapa ${i + 1}`}
                      </h3>
                      <p className="mt-0.5 text-sm text-text-mute">
                        {s.dateLabel || formatDate(s.startAt) || 'Data a definir'}
                      </p>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ol>
          ) : (
            <Reveal>
              <div className="mt-6 rounded-5 border border-line bg-surface-1 p-10 text-center">
                <p className="font-display text-lg font-700 text-fg">Calendário em breve</p>
                <p className="mx-auto mt-2 max-w-sm text-sm text-text-mute">
                  As etapas da temporada serão divulgadas aqui. Baixe o app para ser avisado da
                  abertura das inscrições.
                </p>
              </div>
            </Reveal>
          )}
        </section>
      </div>

      <div className="mt-16">
        <Download />
      </div>
    </main>
  );
}
