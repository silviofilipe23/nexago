'use client';

import type { PublicPageLink } from '@/lib/firestore/link-pages';
import { trackLinkPageEvent } from '@/lib/track-link-event';
import { LinkGlyph } from './LinkGlyph';
import styles from './LinkInBioPage.module.css';

/** Cartão de link da página pública. Abre em nova aba e dispara a métrica sem bloquear —
 *  o clique nunca espera a rede. */
export function LinkCard({ pageId, link }: { pageId: string; link: PublicPageLink }) {
  return (
    <a
      className={link.featured ? `${styles.link} ${styles.featured}` : styles.link}
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackLinkPageEvent(pageId, link.id)}
    >
      <span className={styles.ic}>
        <LinkGlyph name={link.icon} size={22} />
      </span>

      <span className={styles.tx}>
        <span className={styles.t}>{link.title}</span>
        {link.subtitle && <span className={styles.s}>{link.subtitle}</span>}
      </span>

      {link.live ? (
        <span className={styles.badge}>Live</span>
      ) : (
        <span className={styles.arrow}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      )}
    </a>
  );
}
