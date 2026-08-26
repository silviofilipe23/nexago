import Image from 'next/image';
import Link from 'next/link';
import type { PublicLinkPage } from '@/lib/firestore/link-pages';
import { HighlightValue } from './HighlightValue';
import { LinkCard } from './LinkCard';
import { TrackPageView } from './TrackPageView';
import styles from './LinkInBioPage.module.css';

/**
 * Página pública estilo link-in-bio (`/a/{slug}` e `/o/{slug}`).
 *
 * Os estilos vivem num CSS Module, não no tema do site: é a página de marca do dono,
 * sempre escura, e não deve herdar o claro/escuro nem o chrome institucional. A mesma
 * composição é espelhada na prévia dos painéis (`nx-link-page-preview`).
 */
export function LinkInBioPage({ page }: { page: PublicLinkPage }) {
  // Sem handle preenchido, o slug é a identidade pública da página — sempre existe.
  const handle = `@${(page.handle || page.slug).replace(/^@/, '')}`;

  return (
    <main className={styles.page}>
      <TrackPageView pageId={page.id} />

      <div className={styles.bg} aria-hidden>
        <div className={styles.glow} />
        <div className={styles.court} />
        <div className={`${styles.streak} ${styles.s1}`} />
        <div className={`${styles.streak} ${styles.s2}`} />
        <div className={`${styles.streak} ${styles.s3}`} />
      </div>

      <div className={styles.wrap}>
        <header className={styles.head}>
          <div className={styles.avatarRing}>
            <div className={styles.avatar}>
              {page.avatarUrl ? (
                <Image
                  className={styles.avatarImg}
                  src={page.avatarUrl}
                  alt={page.title}
                  width={100}
                  height={100}
                />
              ) : (
                <span className={styles.avatarInitials}>{initialsOf(page.title)}</span>
              )}
            </div>
          </div>

          <h1 className={styles.brandName}>{page.title}</h1>

          <div className={styles.handle}>
            <span className={styles.liveDot} aria-hidden />
            {handle}
          </div>

          {page.bio && <p className={styles.tagline}>{page.bio}</p>}

          {page.highlights.length > 0 && (
            <div className={styles.stats}>
              {page.highlights.map((h) => (
                <div className={styles.stat} key={`${h.label}-${h.value}`}>
                  <div className={styles.statValue}>
                    <HighlightValue value={h.value} />
                  </div>
                  <div className={styles.statLabel}>{h.label}</div>
                </div>
              ))}
            </div>
          )}
        </header>

        {page.links.length > 0 ? (
          <nav className={styles.links} aria-label="Links">
            {page.links.map((link) => (
              <LinkCard key={link.id} pageId={page.id} link={link} />
            ))}
          </nav>
        ) : (
          <p className={styles.empty}>Esta página ainda não tem links publicados.</p>
        )}

        <footer className={styles.foot}>
          <Link className={styles.footLink} href="/">
            Feito com <b>nexaGO</b>
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
