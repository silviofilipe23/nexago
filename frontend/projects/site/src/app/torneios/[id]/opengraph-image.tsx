import { renderOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';
import { getTournamentById } from '@/lib/firestore/tournaments';
import { sportLabel } from '@/lib/format';
import { extractId } from '@/lib/slug';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Torneio no nexaGO';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTournamentById(extractId(id));

  if (!t) {
    return renderOg({ eyebrow: 'Hub público', title: 'Torneio nexaGO' });
  }

  const place = [t.locationName, t.city].filter(Boolean).join(' · ');
  const subtitle = [sportLabel(t.sport), t.dateLabel, place].filter(Boolean).join('  ·  ');

  return renderOg({
    eyebrow: t.leagueStageName ?? 'Torneio',
    title: t.name.length > 60 ? `${t.name.slice(0, 57)}…` : t.name,
    subtitle,
  });
}
