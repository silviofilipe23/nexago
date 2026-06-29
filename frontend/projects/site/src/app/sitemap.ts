import type { MetadataRoute } from 'next';
import { getPublicTournaments } from '@/lib/firestore/tournaments';

const BASE = 'https://nexago.com.br';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const tournaments = await getPublicTournaments();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/torneios`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/rankings`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${BASE}/organizadores`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/arenas`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/sobre`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/privacidade`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/termos`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/contato`, changeFrequency: 'monthly', priority: 0.5 },
  ];

  const tournamentRoutes: MetadataRoute.Sitemap = tournaments.map((t) => ({
    url: `${BASE}/torneios/${t.id}`,
    lastModified: t.startAt ?? undefined,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  return [...staticRoutes, ...tournamentRoutes];
}
