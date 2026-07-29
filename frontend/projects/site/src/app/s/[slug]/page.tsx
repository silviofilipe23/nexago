import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArenaSitePage } from '@/components/arena-site/ArenaSitePage';
import {
  getArenaPublicInfo,
  getArenaReviews,
  getArenaUpcomingTournaments,
  getArenaWeekSchedule,
} from '@/lib/firestore/arena-site-data';
import { getArenaSiteBySlug } from '@/lib/firestore/arena-sites';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await getArenaSiteBySlug(slug);
  if (!site) return { title: 'Página não encontrada' };

  const title = `${site.arenaName} — ${site.hero.headline}`;
  const description = site.hero.tagline || site.about.body.slice(0, 160) || `Site oficial da ${site.arenaName} no nexaGO.`;
  return {
    title,
    description,
    alternates: { canonical: `/s/${site.slug}` },
    openGraph: {
      title,
      description,
      url: `/s/${site.slug}`,
      ...(site.hero.imageUrl && { images: [site.hero.imageUrl] }),
    },
  };
}

/** Mini-site público de uma arena — `nexago.com.br/s/{slug}`. As seções
 *  automáticas leem dados públicos ao vivo a cada revalidação (ISR 5 min). */
export default async function ArenaSiteRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getArenaSiteBySlug(slug);
  if (!site) notFound();

  const [schedule, tournaments, reviews, arenaInfo] = await Promise.all([
    site.schedule.enabled ? getArenaWeekSchedule(site.arenaId) : Promise.resolve(null),
    site.events.enabled ? getArenaUpcomingTournaments(site.arenaId) : Promise.resolve([]),
    site.reviews.enabled ? getArenaReviews(site.arenaId) : Promise.resolve(null),
    getArenaPublicInfo(site.arenaId),
  ]);

  return (
    <ArenaSitePage site={site} schedule={schedule} tournaments={tournaments} reviews={reviews} arenaInfo={arenaInfo} />
  );
}
