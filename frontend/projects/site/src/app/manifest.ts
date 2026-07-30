import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'nexaGO — esportes de areia',
    short_name: 'nexaGO',
    description:
      'Torneios, ranking e a Liga nexaGO de beach tennis e vôlei de praia.',
    start_url: '/',
    display: 'standalone',
    background_color: '#050505',
    theme_color: '#050505',
    lang: 'pt-BR',
    icons: [
      { src: '/brand/logo.png', sizes: '512x512', type: 'image/png' },
      { src: '/brand/logo.png', sizes: '192x192', type: 'image/png' },
    ],
  };
}
