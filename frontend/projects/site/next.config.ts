import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: __dirname,
  },
  images: {
    // O otimizador /_next/image do Firebase Hosting (web frameworks) não respeita
    // os remotePatterns no deploy e retorna 400 ("url parameter is not allowed"),
    // sumindo com as imagens remotas (arenas/torneios). Servimos a URL original
    // direto (Firebase Storage já é CDN). Reativar se migrar p/ App Hosting.
    unoptimized: true,
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: '*.firebasestorage.app' },
    ],
  },
  // /liga (singular) virou /ligas (listagem). Mantém links antigos válidos.
  async redirects() {
    return [
      { source: '/liga', destination: '/ligas', permanent: true },
      { source: '/liga/:slug', destination: '/ligas/:slug', permanent: true },
    ];
  },
};

export default nextConfig;
