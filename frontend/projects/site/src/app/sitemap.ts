import type { MetadataRoute } from 'next';
import { getPublicTournaments } from '@/lib/firestore/tournaments';
import { getPublicLeagues } from '@/lib/firestore/leagues';
import { getAllPosts } from '@/lib/blog/posts';
import { toSlugId } from '@/lib/slug';

const BASE = 'https://nexago.com.br';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [tournaments, leagues] = await Promise.all([getPublicTournaments(), getPublicLeagues()]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/ligas`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE}/torneios`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/rankings`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${BASE}/organizadores`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/arenas`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/blog`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE}/docs`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/docs/atletas`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/docs/organizadores`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/docs/arenas`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/ajuda`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/sobre`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/privacidade`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/termos`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/contato`, changeFrequency: 'monthly', priority: 0.5 },
  ];

  const tournamentRoutes: MetadataRoute.Sitemap = tournaments.map((t) => ({
    url: `${BASE}/torneios/${toSlugId(t.name, t.id)}`,
    lastModified: t.startAt ?? undefined,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  const leagueRoutes: MetadataRoute.Sitemap = leagues.map((l) => ({
    url: `${BASE}/ligas/${toSlugId(l.name, l.id)}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  const postRoutes: MetadataRoute.Sitemap = getAllPosts().map((p) => ({
    url: `${BASE}/blog/${p.slug}`,
    lastModified: new Date(p.date),
    changeFrequency: 'monthly',
    priority: 0.5,
  }));

  return [...staticRoutes, ...tournamentRoutes, ...leagueRoutes, ...postRoutes];
}
