import type { Metadata, Viewport } from 'next';
import { sora, inter, jetbrains } from '@/lib/fonts';
import { SiteHeader } from '@/components/sections/SiteHeader';
import { SiteFooter } from '@/components/sections/SiteFooter';
import { SiteChrome } from '@/components/sections/SiteChrome';
import { ToastHost } from '@/components/ui/Toast';
import '@/styles/globals.css';

const SITE_URL = 'https://nexago.com.br';
const SITE_NAME = 'nexaGO';
const DESCRIPTION =
  'A plataforma dos esportes de areia: torneios, ranking ao vivo e a Liga nexaGO para beach tennis e vôlei de praia. Conecta atletas, organizadores e arenas.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'nexaGO — Torneios, ranking e ligas de beach tennis e vôlei de praia',
    template: '%s · nexaGO',
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'beach tennis',
    'vôlei de praia',
    'torneios de areia',
    'ranking beach tennis',
    'Liga nexaGO',
    'arenas',
    'esportes de areia',
  ],
  authors: [{ name: SITE_NAME }],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: 'nexaGO — A plataforma dos esportes de areia',
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'nexaGO — A plataforma dos esportes de areia',
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
};

export const viewport: Viewport = {
  themeColor: '#050505',
  width: 'device-width',
  initialScale: 1,
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/brand/logo.png`,
      description: DESCRIPTION,
      sport: ['Beach Tennis', 'Beach Volleyball'],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      inLanguage: 'pt-BR',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${sora.variable} ${inter.variable} ${jetbrains.variable}`}
    >
      <body>
        {/* Antes do primeiro paint: marca JS ativo (hero visível sem JS p/ SEO) e aplica
            o tema salvo p/ evitar flash. Default = dark (marca dark-first). */}
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html:
              "document.documentElement.classList.add('js');try{var t=localStorage.getItem('theme');document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:'dark'}catch(e){document.documentElement.dataset.theme='dark'}",
          }}
        />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <SiteChrome>
          <SiteHeader />
        </SiteChrome>
        {children}
        <SiteChrome>
          <SiteFooter />
        </SiteChrome>
        <ToastHost />
      </body>
    </html>
  );
}
