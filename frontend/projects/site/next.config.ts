import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: __dirname,
  },
  images: {
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
