import Image from 'next/image';
import Link from 'next/link';
import type {
  ArenaSiteReviews,
  ArenaSiteTournament,
  WeekSchedule,
  Weekday,
} from '@/lib/firestore/arena-site-data';
import { WEEKDAYS } from '@/lib/firestore/arena-site-data';
import type { PublicArenaSite } from '@/lib/firestore/arena-sites';
import styles from './arena-site.module.css';

const WEEKDAY_LABEL: Record<Weekday, string> = {
  monday: 'Segunda',
  tuesday: 'Terça',
  wednesday: 'Quarta',
  thursday: 'Quinta',
  friday: 'Sexta',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

const SPORT_LABEL: Record<string, string> = {
  beachTennis: 'Beach tennis',
  beachVolleyball: 'Vôlei de praia',
  footvolley: 'Futevôlei',
};

/** Mini-site público da arena: hero + sobre + seções automáticas (horários,
 *  torneios, avaliações — dados ao vivo) + contato. Server Component puro. */
export function ArenaSitePage({
  site,
  schedule,
  tournaments,
  reviews,
}: {
  site: PublicArenaSite;
  schedule: WeekSchedule | null;
  tournaments: ArenaSiteTournament[];
  reviews: ArenaSiteReviews | null;
}) {
  const whatsappUrl = site.contact.whatsapp ? `https://wa.me/${withCountryCode(site.contact.whatsapp)}` : null;
  const instagramUrl = site.contact.instagram ? `https://instagram.com/${site.contact.instagram}` : null;
  const showAbout = site.about.enabled && (site.about.body || site.about.imageUrls.length > 0);
  const showContact = site.contact.enabled && (whatsappUrl || instagramUrl || site.contact.address);

  return (
    <main className={styles.page} style={{ '--arena-accent': site.theme.primaryHex } as React.CSSProperties}>
      <section className={styles.hero}>
        {site.hero.imageUrl ? (
          <Image className={styles.heroBg} src={site.hero.imageUrl} alt="" fill priority sizes="100vw" />
        ) : (
          <div className={styles.heroFallback} aria-hidden />
        )}
        <div className={styles.heroShade} aria-hidden />
        <div className={styles.heroInner}>
          <p className={styles.kicker}>{site.arenaName}</p>
          <h1 className={styles.headline}>{site.hero.headline}</h1>
          {site.hero.tagline && <p className={styles.tagline}>{site.hero.tagline}</p>}
          <div className={styles.heroActions}>
            {site.hero.ctaUrl && site.hero.ctaLabel && (
              <a className={styles.cta} href={site.hero.ctaUrl} target="_blank" rel="noopener noreferrer">
                {site.hero.ctaLabel}
              </a>
            )}
            {whatsappUrl && (
              <a className={styles.ctaGhost} href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                Chamar no WhatsApp
              </a>
            )}
          </div>
        </div>
      </section>

      {showAbout && (
        <section className={styles.section} aria-labelledby="sobre">
          <h2 id="sobre" className={styles.sectionTitle}>
            {site.about.title || 'Sobre a arena'}
          </h2>
          <div className={styles.sectionRule} aria-hidden />
          <div className={styles.aboutGrid}>
            {site.about.body && <p className={styles.aboutBody}>{site.about.body}</p>}
            {site.about.imageUrls.length > 0 && (
              <div className={styles.aboutImages}>
                {site.about.imageUrls.map((url) => (
                  <Image key={url} className={styles.aboutImg} src={url} alt="" width={640} height={420} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {schedule && (
        <section className={styles.section} aria-labelledby="horarios">
          <h2 id="horarios" className={styles.sectionTitle}>
            Horários
          </h2>
          <div className={styles.sectionRule} aria-hidden />
          <dl className={styles.scheduleList}>
            {WEEKDAYS.map((day) => (
              <div key={day} className={styles.scheduleRow}>
                <dt className={styles.scheduleDay}>{WEEKDAY_LABEL[day]}</dt>
                <dd className={schedule[day].closed ? styles.scheduleClosed : styles.scheduleHours}>
                  {schedule[day].closed ? 'Fechado' : `${schedule[day].open} – ${schedule[day].close}`}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {tournaments.length > 0 && (
        <section className={styles.section} aria-labelledby="torneios">
          <h2 id="torneios" className={styles.sectionTitle}>
            Torneios na arena
          </h2>
          <div className={styles.sectionRule} aria-hidden />
          <div className={styles.eventList}>
            {tournaments.map((t) => (
              <Link key={t.id} className={styles.eventCard} href={`/torneios/${t.id}`}>
                <div>
                  <div className={styles.eventName}>{t.name}</div>
                  <div className={styles.eventMeta}>
                    {SPORT_LABEL[t.sport] ?? t.sport}
                    {t.dateLabel ? ` · ${t.dateLabel}` : ''}
                  </div>
                </div>
                <span className={t.listingStatus === 'open' ? styles.eventBadgeOpen : styles.eventBadge}>
                  {t.listingStatus === 'open' ? 'Inscrições abertas' : 'Em breve'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {reviews && (
        <section className={styles.section} aria-labelledby="avaliacoes">
          <h2 id="avaliacoes" className={styles.sectionTitle}>
            Avaliações
          </h2>
          <div className={styles.sectionRule} aria-hidden />
          <div className={styles.reviewsSummary}>
            <span className={styles.reviewsScore}>{reviews.ratingAverage.toFixed(1)}</span>
            <Stars value={reviews.ratingAverage} />
            <span className={styles.reviewsCount}>
              {reviews.reviewsCount} {reviews.reviewsCount === 1 ? 'avaliação' : 'avaliações'} de atletas no nexaGO
            </span>
          </div>
          {reviews.comments.length > 0 && (
            <div className={styles.reviewList}>
              {reviews.comments.map((r, i) => (
                <figure key={i} className={styles.reviewCard}>
                  <Stars value={r.rating} />
                  <blockquote className={styles.reviewText}>“{r.comment}”</blockquote>
                  <figcaption className={styles.reviewAuthor}>Atleta nexaGO</figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>
      )}

      {showContact && (
        <section className={styles.section} aria-labelledby="contato">
          <h2 id="contato" className={styles.sectionTitle}>
            Contato
          </h2>
          <div className={styles.sectionRule} aria-hidden />
          <div className={styles.contactList}>
            {whatsappUrl && (
              <a className={styles.contactItem} href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <span className={styles.contactIcon} aria-hidden>
                  <PhoneGlyph />
                </span>
                WhatsApp · {formatWhatsapp(site.contact.whatsapp)}
              </a>
            )}
            {instagramUrl && (
              <a className={styles.contactItem} href={instagramUrl} target="_blank" rel="noopener noreferrer">
                <span className={styles.contactIcon} aria-hidden>
                  <InstagramGlyph />
                </span>
                @{site.contact.instagram}
              </a>
            )}
            {site.contact.address && (
              <span className={styles.contactItem}>
                <span className={styles.contactIcon} aria-hidden>
                  <PinGlyph />
                </span>
                {site.contact.address}
              </span>
            )}
          </div>
        </section>
      )}

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span>© {new Date().getFullYear()} {site.arenaName}</span>
          <a className={styles.footerBrand} href="/" rel="noopener">
            feito com nexaGO
          </a>
        </div>
      </footer>
    </main>
  );
}

/** WhatsApp já vem só dígitos do espelho; garante o 55 do wa.me. */
function withCountryCode(digits: string): string {
  return digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
}

function formatWhatsapp(digits: string): string {
  const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length < 10) return local;
  const ddd = local.slice(0, 2);
  const rest = local.slice(2);
  return `(${ddd}) ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
}

/** Estrelas cheias por arredondamento simples — sem meia estrela na v2. */
function Stars({ value }: { value: number }) {
  const filled = Math.round(Math.min(5, Math.max(0, value)));
  return (
    <span className={styles.stars} role="img" aria-label={`${value.toFixed(1)} de 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill={i < filled ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </span>
  );
}

function PhoneGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function InstagramGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function PinGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
