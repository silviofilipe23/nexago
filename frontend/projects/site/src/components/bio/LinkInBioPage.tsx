import Image from 'next/image';
import Link from 'next/link';
import type { PublicLinkPage } from '@/lib/firestore/link-pages';
import { LinkCard } from './LinkCard';
import { TrackPageView } from './TrackPageView';

/**
 * Página pública estilo link-in-bio (`/a/{slug}` e `/o/{slug}`).
 *
 * Estilos inline de propósito: é uma página de marca do dono, sempre escura, e não deve
 * herdar o tema claro/escuro nem o chrome institucional do site. A mesma composição é
 * espelhada na prévia dos painéis (`nx-link-page-preview`).
 */
export function LinkInBioPage({ page }: { page: PublicLinkPage }) {
  const initials = initialsOf(page.title);
  const handle = page.handle ? `@${page.handle.replace(/^@/, '')} · NEXAGO` : 'NEXAGO';

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: '#050505',
        color: '#F4F4F5',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <TrackPageView pageId={page.id} />

      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(120% 40% at 50% -5%, rgba(255,106,26,0.22) 0%, rgba(255,106,26,0.05) 45%, transparent 70%)',
        }}
      />

      <div style={{ position: 'relative', maxWidth: 430, margin: '0 auto', padding: '0 20px' }}>
        <header
          style={{
            padding: '44px 2px 28px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          {page.avatarUrl ? (
            <Image
              src={page.avatarUrl}
              alt={page.title}
              width={88}
              height={88}
              style={{
                width: 88,
                height: 88,
                borderRadius: 26,
                objectFit: 'cover',
                boxShadow: '0 0 0 3px #050505, 0 0 0 5px rgba(255,106,26,0.6), 0 18px 40px rgba(0,0,0,0.5)',
              }}
            />
          ) : (
            <div
              style={{
                width: 88,
                height: 88,
                borderRadius: 26,
                display: 'grid',
                placeItems: 'center',
                background: 'linear-gradient(135deg, #F0A830 0%, #2260B8 100%)',
                fontFamily: 'var(--font-sora), system-ui',
                fontWeight: 800,
                fontSize: 24,
                color: '#fff',
                boxShadow: '0 0 0 3px #050505, 0 0 0 5px rgba(255,106,26,0.6), 0 18px 40px rgba(0,0,0,0.5)',
              }}
            >
              {initials}
            </div>
          )}

          <h1
            style={{
              fontFamily: 'var(--font-sora), system-ui',
              fontWeight: 800,
              fontSize: 24,
              letterSpacing: '-0.02em',
              margin: '18px 0 0',
            }}
          >
            {page.title}
          </h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7 }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: '#2BD17E' }} />
            <span
              style={{
                fontFamily: 'var(--font-jetbrains), monospace',
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: '0.22em',
                color: 'rgba(244,244,245,0.55)',
                textTransform: 'uppercase',
              }}
            >
              {handle}
            </span>
          </div>

          {page.bio && (
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.55,
                color: 'rgba(244,244,245,0.72)',
                margin: '12px 0 0',
                maxWidth: 300,
              }}
            >
              {page.bio}
            </p>
          )}

          {page.highlights.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
              {page.highlights.map((h) => (
                <div
                  key={`${h.label}-${h.value}`}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 13,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    minWidth: 78,
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--font-jetbrains), monospace',
                      fontWeight: 700,
                      fontSize: 16,
                      color: '#FF6A1A',
                    }}
                  >
                    {h.value}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-jetbrains), monospace',
                      fontSize: 7.5,
                      fontWeight: 600,
                      letterSpacing: '0.18em',
                      color: 'rgba(244,244,245,0.55)',
                      marginTop: 3,
                    }}
                  >
                    {h.label}
                  </div>
                </div>
              ))}
            </div>
          )}
        </header>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 26 }}>
          {page.links.map((link) => (
            <LinkCard key={link.id} pageId={page.id} link={link} />
          ))}
          {page.links.length === 0 && (
            <p style={{ textAlign: 'center', fontSize: 13, color: 'rgba(244,244,245,0.55)' }}>
              Esta página ainda não tem links publicados.
            </p>
          )}
        </div>

        <footer
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '4px 0 36px',
          }}
        >
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              textDecoration: 'none',
              color: '#FF6A1A',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 4 L5 20 M19 4 L19 20 M5 4 L19 20"
                stroke="currentColor"
                strokeWidth="3.4"
                strokeLinecap="square"
              />
            </svg>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains), monospace',
                fontSize: 9.5,
                fontWeight: 600,
                letterSpacing: '0.2em',
                color: 'rgba(244,244,245,0.55)',
              }}
            >
              FEITO COM NEXAGO
            </span>
          </Link>
        </footer>
      </div>
    </main>
  );
}

function initialsOf(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
