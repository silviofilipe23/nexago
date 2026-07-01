import { renderOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Ranking de beach tennis e vôlei de praia no nexaGO';

export default function Image() {
  return renderOg({
    eyebrow: 'Hub público',
    title: 'Ranking nexaGO',
    subtitle: 'A evolução dos atletas a cada etapa da Liga.',
  });
}
