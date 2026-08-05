import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Hospedagem compartilhada da Hostinger (estática/PHP, sem Node.js) —
  // temporário enquanto o Firebase Hosting do dev está bloqueado. `next build`
  // gera HTML/assets 100% estáticos em `out/`. Isso implica: sem SSR/ISR real
  // (conteúdo congela no momento do build; rebuild manual pra atualizar) e sem
  // Route Handlers dinâmicos (ver public/.htaccess pros redirects de /liga).
  output: 'export',
  // Cada rota vira uma pasta com index.html — o próprio Apache resolve
  // /torneios/ pra /torneios/index.html sem precisar de rewrite.
  trailingSlash: true,
  reactStrictMode: true,
  turbopack: {
    root: __dirname,
  },
  images: {
    // O otimizador /_next/image não existe em export estático de qualquer forma —
    // precisa ficar unoptimized. Servimos a URL original direto (Firebase Storage
    // já é CDN). Reativar otimização se migrar de volta p/ App Hosting/Node.
    unoptimized: true,
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: '*.firebasestorage.app' },
    ],
  },
};

export default nextConfig;
