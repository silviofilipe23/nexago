import { renderOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const dynamic = 'force-static';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'nexaGO — a plataforma dos esportes de areia';

export default function Image() {
  return renderOg({
    eyebrow: 'Esportes de areia',
    title: 'Domine a areia, do saque ao título.',
    subtitle: 'Torneios, ranking ao vivo e a Liga nexaGO de beach tennis e vôlei de praia.',
  });
}
