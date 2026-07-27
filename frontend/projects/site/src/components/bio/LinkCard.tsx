'use client';

import type { PublicPageLink } from '@/lib/firestore/link-pages';
import { trackLinkPageEvent } from '@/lib/track-link-event';
import { LinkGlyph } from './LinkGlyph';

/** Cartão de link da página pública. Abre em nova aba e dispara a métrica sem bloquear —
 *  o clique nunca espera a rede. */
export function LinkCard({ pageId, link }: { pageId: string; link: PublicPageLink }) {
  const featured = link.featured;

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackLinkPageEvent(pageId, link.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '15px 16px',
        borderRadius: 18,
        textDecoration: 'none',
        background: featured
          ? 'linear-gradient(135deg, #FF8A3D 0%, #FF6A1A 60%, #F05500 100%)'
          : 'rgba(255,255,255,0.035)',
        border: featured ? '1px solid rgba(255,255,255,0.25)' : '1px solid rgba(255,255,255,0.08)',
        boxShadow: featured ? '0 12px 32px rgba(255,106,26,0.28)' : 'none',
      }}
    >
      <span
        style={{
          width: 42,
          height: 42,
          borderRadius: 13,
          flex: 'none',
          display: 'grid',
          placeItems: 'center',
          background: featured ? 'rgba(0,0,0,0.18)' : 'rgba(255,106,26,0.12)',
          color: featured ? '#140a04' : '#FF6A1A',
        }}
      >
        <LinkGlyph name={link.icon} />
      </span>

      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontFamily: 'var(--font-sora), system-ui',
            fontWeight: 700,
            fontSize: 15,
            color: featured ? '#140a04' : '#F4F4F5',
          }}
        >
          {link.title}
        </span>
        {link.subtitle && (
          <span
            style={{
              display: 'block',
              fontSize: 12,
              marginTop: 2,
              color: featured ? 'rgba(20,10,4,0.7)' : 'rgba(244,244,245,0.55)',
            }}
          >
            {link.subtitle}
          </span>
        )}
      </span>

      {link.live ? (
        <span
          style={{
            padding: '4px 9px',
            borderRadius: 7,
            background: 'rgba(255,59,72,0.14)',
            fontFamily: 'var(--font-jetbrains), monospace',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.16em',
            color: '#FF3B30',
            flex: 'none',
          }}
        >
          LIVE
        </span>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={featured ? '#140a04' : 'rgba(244,244,245,0.35)'}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ flex: 'none' }}
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      )}
    </a>
  );
}
