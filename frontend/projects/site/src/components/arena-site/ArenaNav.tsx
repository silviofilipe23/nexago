'use client';

import { useEffect, useState } from 'react';
import styles from './arena-site.module.css';

export interface ArenaNavAnchor {
  id: string;
  label: string;
}

/** Nav fixa do mini-site: transparente sobre o hero, ganha fundo/blur/borda
 *  depois de 30px de scroll (mesmo comportamento do protótipo). */
export function ArenaNav({
  arenaName,
  logoUrl,
  anchors,
  reserveUrl,
}: {
  arenaName: string;
  logoUrl: string | null;
  anchors: ArenaNavAnchor[];
  reserveUrl: string | null;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={scrolled ? `${styles.nav} ${styles.navScrolled}` : styles.nav}
      /* Inline porque o compilador de CSS do Next remove backdrop-filter de CSS Module. */
      style={scrolled ? { backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' } : undefined}
    >
      <div className={styles.navIn}>
        <a className={styles.brand} href="#top">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.brandLogo} src={logoUrl} alt="" width={34} height={34} />
          ) : (
            <span className={styles.brandMark} aria-hidden>
              {initials(arenaName)}
            </span>
          )}
          <span className={styles.brandName}>{arenaName}</span>
        </a>
        {anchors.length > 0 && (
          <div className={styles.navLinks}>
            {anchors.map((a) => (
              <a key={a.id} href={`#${a.id}`}>
                {a.label}
              </a>
            ))}
          </div>
        )}
        {reserveUrl && (
          <a
            className={`${styles.btnAc} ${styles.btnSm} ${styles.navCta}`}
            href={reserveUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Reservar
          </a>
        )}
      </div>
    </nav>
  );
}

/** Até duas iniciais do nome da arena ("Arena do Silvio" → "AS"), ignorando
 *  conectivos. Uma palavra só vira as duas primeiras letras. */
function initials(name: string): string {
  const words = name
    .split(/\s+/)
    .filter((w) => w.length > 0 && !['de', 'da', 'do', 'das', 'dos', 'e'].includes(w.toLowerCase()));
  if (words.length === 0) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
