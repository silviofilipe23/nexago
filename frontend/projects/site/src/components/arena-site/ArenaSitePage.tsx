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
  const showGallery = site.gallery.enabled && site.gallery.imageUrls.length > 0;
  const showPlans = site.plans.enabled && site.plans.items.length > 0;
  const showFaq = site.faq.enabled && site.faq.items.length > 0;

  const anchors = [
    showAbout && { id: 'sobre', label: 'Sobre' },
    schedule && { id: 'horarios', label: 'Horários' },
    tournaments.length > 0 && { id: 'torneios', label: 'Torneios' },
    showGallery && { id: 'galeria', label: 'Galeria' },
    showPlans && { id: 'planos', label: 'Planos' },
    reviews && { id: 'avaliacoes', label: 'Avaliações' },
    showFaq && { id: 'faq', label: 'Dúvidas' },
    showContact && { id: 'contato', label: 'Contato' },
  ].filter((a): a is { id: string; label: string } => Boolean(a));

  return (
    <main className={styles.page} style={{ '--arena-accent': site.theme.primaryHex } as React.CSSProperties}>
      <header className={styles.nav}>
        <a className={styles.navBrand} href="#top">
          {site.theme.logoUrl ? (
            <Image className={styles.navLogo} src={site.theme.logoUrl} alt="" width={30} height={30} />
          ) : (
            <span className={styles.navLogoFallback} aria-hidden>
              {site.arenaName.charAt(0).toUpperCase()}
            </span>
          )}
          <span className={styles.navName}>{site.arenaName}</span>
        </a>
        {anchors.length > 0 && (
          <nav className={styles.navLinks} aria-label="Seções da página">
            {anchors.map((a) => (
              <a key={a.id} className={styles.navLink} href={`#${a.id}`}>
                {a.label}
              </a>
            ))}
          </nav>
        )}
      </header>

      <section className={styles.hero} id="top">
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

      {showGallery && (
        <section className={styles.section} aria-labelledby="galeria">
          <h2 id="galeria" className={styles.sectionTitle}>Galeria</h2>
          <div className={styles.sectionRule} aria-hidden />
          <div className={styles.galleryGrid}>
            {site.gallery.imageUrls.map((url, i) => (
              <Image
                key={url}
                className={i === 0 ? styles.galleryImgLead : styles.galleryImg}
                src={url}
                alt=""
                width={i === 0 ? 960 : 480}
                height={i === 0 ? 600 : 360}
              />
            ))}
          </div>
        </section>
      )}

      {showPlans && (
        <section className={styles.section} aria-labelledby="planos">
          <h2 id="planos" className={styles.sectionTitle}>Planos</h2>
          <div className={styles.sectionRule} aria-hidden />
          <div className={styles.planGrid}>
            {site.plans.items.map((plan) => (
              <div key={plan.name} className={plan.featured ? styles.planCardFeatured : styles.planCard}>
                {plan.featured && <span className={styles.planBadge}>Mais procurado</span>}
                <div className={styles.planName}>{plan.name}</div>
                <div className={styles.planPrice}>{plan.price}</div>
                {plan.features.length > 0 && (
                  <ul className={styles.planFeatures}>
                    {plan.features.map((f) => (
                      <li key={f} className={styles.planFeature}>
                        <CheckGlyph />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
                {whatsappUrl && (
                  <a className={styles.planCta} href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                    Falar com a arena
                  </a>
                )}
              </div>
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

      {showFaq && (
        <section className={styles.section} aria-labelledby="faq">
          <h2 id="faq" className={styles.sectionTitle}>
            Perguntas frequentes
          </h2>
          <div className={styles.sectionRule} aria-hidden />
          <div className={styles.faqList}>
            {site.faq.items.map((item) => (
              <details key={item.q} className={styles.faqItem}>
                <summary className={styles.faqQuestion}>{item.q}</summary>
                <p className={styles.faqAnswer}>{item.a}</p>
              </details>
            ))}
          </div>
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

function CheckGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
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
