import { renderOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Torneios de beach tennis e vôlei de praia no nexaGO';

export default function Image() {
  return renderOg({
    eyebrow: 'Hub público',
    title: 'Torneios na areia',
    subtitle: 'Etapas de beach tennis e vôlei de praia abertas para inscrição.',
  });
}
