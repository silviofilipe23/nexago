import Image from 'next/image';
import Link from 'next/link';
import type {
  AmenityKey,
  ArenaPublicInfo,
  ArenaSiteReviews,
  ArenaSiteTournament,
  WeekSchedule,
  Weekday,
} from '@/lib/firestore/arena-site-data';
import { WEEKDAYS } from '@/lib/firestore/arena-site-data';
import type { PublicArenaSite } from '@/lib/firestore/arena-sites';
import { OpenNowBadge } from './OpenNowBadge';
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

const AMENITY_INFO: Record<AmenityKey, { label: string; hint: string }> = {
  parking: { label: 'Estacionamento', hint: 'Para clientes da arena' },
  lockerRoom: { label: 'Vestiários', hint: 'Com chuveiros' },
  coveredCourt: { label: 'Quadra coberta', hint: 'Jogo com sol ou chuva' },
  bar: { label: 'Bar & lanchonete', hint: 'Comanda na arena' },
  racketRental: { label: 'Aluguel de raquete', hint: 'É só chegar e jogar' },
  hasAccessibleCourt: { label: 'Quadra acessível', hint: 'Estrutura PCD' },
  hasAccessibleBathroom: { label: 'Banheiro acessível', hint: 'Estrutura PCD' },
  hasPcdParking: { label: 'Vaga PCD', hint: 'Estacionamento reservado' },
};

/** Dia da semana em Brasília no momento do render (ISR 5min — margem aceitável). */
function todayWeekday(): Weekday {
  const short = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(new Date());
  const map: Record<string, Weekday> = {
    Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday', Thu: 'thursday',
    Fri: 'friday', Sat: 'saturday', Sun: 'sunday',
  };
  return map[short] ?? 'monday';
}

/** Mini-site público da arena: hero com badges ao vivo, sobre + stats,
 *  estrutura (amenidades do cadastro), horários, torneios, galeria, planos,
 *  avaliações, FAQ e contato com mapa. Server Component (badge de "aberto
 *  agora" é o único pedaço client). */
export function ArenaSitePage({
  site,
  schedule,
  tournaments,
  reviews,
  arenaInfo,
}: {
  site: PublicArenaSite;
  schedule: WeekSchedule | null;
  tournaments: ArenaSiteTournament[];
  reviews: ArenaSiteReviews | null;
  arenaInfo: ArenaPublicInfo | null;
}) {
  const whatsappUrl = site.contact.whatsapp ? `https://wa.me/${withCountryCode(site.contact.whatsapp)}` : null;
  const instagramUrl = site.contact.instagram ? `https://instagram.com/${site.contact.instagram}` : null;
  const showAbout = site.about.enabled && (site.about.body || site.about.imageUrls.length > 0);
  const showContact = site.contact.enabled && (whatsappUrl || instagramUrl || site.contact.address);
  const showGallery = site.gallery.enabled && site.gallery.imageUrls.length > 0;
  const showPlans = site.plans.enabled && site.plans.items.length > 0;
  const showFaq = site.faq.enabled && site.faq.items.length > 0;
  const amenities = arenaInfo?.amenities ?? [];
  const showStructure = amenities.length > 0 || (arenaInfo?.courtsCount ?? 0) > 0;
  const today = todayWeekday();

  const cityLine = [arenaInfo?.city, arenaInfo?.state].filter(Boolean).join(' — ');
  const reserveUrl = site.hero.ctaUrl || whatsappUrl;
  const mapSrc =
    arenaInfo?.lat != null && arenaInfo?.lng != null
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${arenaInfo.lng - 0.006}%2C${arenaInfo.lat - 0.004}%2C${arenaInfo.lng + 0.006}%2C${arenaInfo.lat + 0.004}&layer=mapnik&marker=${arenaInfo.lat}%2C${arenaInfo.lng}`
      : null;
  const address = site.contact.address || arenaInfo?.address || '';
  const directionsUrl =
    arenaInfo?.lat != null && arenaInfo?.lng != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${arenaInfo.lat},${arenaInfo.lng}`
      : address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([address, cityLine].filter(Boolean).join(', '))}`
        : null;

  const anchors = [
    showAbout && { id: 'sobre', label: 'Sobre' },
    showStructure && { id: 'estrutura', label: 'Estrutura' },
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
        {reserveUrl && (
          <a className={styles.navCta} href={reserveUrl} target="_blank" rel="noopener noreferrer">
            Reservar
          </a>
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
          <p className={styles.kicker}>{[site.arenaName, arenaInfo?.city].filter(Boolean).join(' · ')}</p>
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
          <div className={styles.heroBadges}>
            {schedule && <OpenNowBadge schedule={schedule} />}
            {(arenaInfo?.courtsCount ?? 0) > 0 && (
              <span className={styles.heroBadge}>
                <CourtGlyph />
                {arenaInfo!.courtsCount} {arenaInfo!.courtsCount === 1 ? 'quadra' : 'quadras'}
                {arenaInfo!.courtTypes.length > 0 ? ` · ${arenaInfo!.courtTypes.slice(0, 2).join(', ')}` : ''}
              </span>
            )}
            {cityLine && (
              <span className={styles.heroBadge}>
                <PinGlyph />
                {cityLine}
              </span>
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
            <div>
              {site.about.body && <p className={styles.aboutBody}>{site.about.body}</p>}
              {site.about.stats.length > 0 && (
                <div className={styles.statsRow}>
                  {site.about.stats.map((s) => (
                    <div key={`${s.value}-${s.label}`} className={styles.statItem}>
                      <div className={styles.statValue}>{s.value}</div>
                      <div className={styles.statLabel}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
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

      {showStructure && (
        <section className={styles.section} aria-labelledby="estrutura">
          <h2 id="estrutura" className={styles.sectionTitle}>
            Estrutura
          </h2>
          <div className={styles.sectionRule} aria-hidden />
          <div className={styles.amenityGrid}>
            {(arenaInfo?.courtsCount ?? 0) > 0 && (
              <div className={styles.amenityCard}>
                <span className={styles.amenityIcon} aria-hidden>
                  <CourtGlyph />
                </span>
                <div>
                  <div className={styles.amenityLabel}>
                    {arenaInfo!.courtsCount} {arenaInfo!.courtsCount === 1 ? 'quadra' : 'quadras'}
                  </div>
                  <div className={styles.amenityHint}>
                    {arenaInfo!.courtTypes.length > 0 ? arenaInfo!.courtTypes.join(' · ') : 'Areia oficial'}
                  </div>
                </div>
              </div>
            )}
            {amenities.map((key) => (
              <div key={key} className={styles.amenityCard}>
                <span className={styles.amenityIcon} aria-hidden>
                  <AmenityGlyph amenity={key} />
                </span>
                <div>
                  <div className={styles.amenityLabel}>{AMENITY_INFO[key].label}</div>
                  <div className={styles.amenityHint}>{AMENITY_INFO[key].hint}</div>
                </div>
              </div>
            ))}
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
              <div key={day} className={day === today ? styles.scheduleRowToday : styles.scheduleRow}>
                <dt className={styles.scheduleDay}>
                  {WEEKDAY_LABEL[day]}
                  {day === today && <span className={styles.todayTag}>hoje</span>}
                </dt>
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
          <div className={styles.contactGrid}>
            {whatsappUrl && (
              <a className={styles.contactItem} href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <span className={styles.contactIcon} aria-hidden>
                  <PhoneGlyph />
                </span>
                <span>
                  <span className={styles.contactLabel}>WhatsApp</span>
                  {formatWhatsapp(site.contact.whatsapp)}
                </span>
              </a>
            )}
            {instagramUrl && (
              <a className={styles.contactItem} href={instagramUrl} target="_blank" rel="noopener noreferrer">
                <span className={styles.contactIcon} aria-hidden>
                  <InstagramGlyph />
                </span>
                <span>
                  <span className={styles.contactLabel}>Instagram</span>@{site.contact.instagram}
                </span>
              </a>
            )}
            {address &&
              (directionsUrl ? (
                <a className={styles.contactItem} href={directionsUrl} target="_blank" rel="noopener noreferrer">
                  <span className={styles.contactIcon} aria-hidden>
                    <PinGlyph />
                  </span>
                  <span>
                    <span className={styles.contactLabel}>Endereço · como chegar</span>
                    {address}
                    {cityLine ? ` — ${cityLine}` : ''}
                  </span>
                </a>
              ) : (
                <span className={styles.contactItem}>
                  <span className={styles.contactIcon} aria-hidden>
                    <PinGlyph />
                  </span>
                  <span>
                    <span className={styles.contactLabel}>Endereço</span>
                    {address}
                  </span>
                </span>
              ))}
            {schedule && !schedule[today].closed && (
              <span className={styles.contactItem}>
                <span className={styles.contactIcon} aria-hidden>
                  <ClockGlyph />
                </span>
                <span>
                  <span className={styles.contactLabel}>Hoje</span>
                  {schedule[today].open} – {schedule[today].close}
                </span>
              </span>
            )}
          </div>
          {mapSrc && (
            <div className={styles.mapWrap}>
              <iframe
                className={styles.mapFrame}
                src={mapSrc}
                title={`Mapa — ${site.arenaName}`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              {directionsUrl && (
                <a className={styles.mapDirections} href={directionsUrl} target="_blank" rel="noopener noreferrer">
                  Como chegar
                </a>
              )}
            </div>
          )}
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

function CourtGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="12" y1="5" x2="12" y2="19" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

function ClockGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}

/** Ícones de amenidade — traço 1.8, mesmo estilo dos demais glyphs da página. */
function AmenityGlyph({ amenity }: { amenity: AmenityKey }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (amenity) {
    case 'parking':
      return (
        <svg {...common} aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M9 17V7h4a3 3 0 0 1 0 6H9" />
        </svg>
      );
    case 'lockerRoom':
      return (
        <svg {...common} aria-hidden>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <line x1="12" y1="3" x2="12" y2="21" />
          <line x1="8" y1="9" x2="8" y2="12" />
          <line x1="16" y1="9" x2="16" y2="12" />
        </svg>
      );
    case 'coveredCourt':
      return (
        <svg {...common} aria-hidden>
          <path d="M3 12a9 9 0 0 1 18 0" />
          <line x1="12" y1="3" x2="12" y2="21" />
          <line x1="3" y1="21" x2="21" y2="21" />
        </svg>
      );
    case 'bar':
      return (
        <svg {...common} aria-hidden>
          <path d="M8 3h8l-1 9a3 3 0 0 1-6 0L8 3z" />
          <line x1="12" y1="15" x2="12" y2="21" />
          <line x1="8" y1="21" x2="16" y2="21" />
        </svg>
      );
    case 'racketRental':
      return (
        <svg {...common} aria-hidden>
          <ellipse cx="13.5" cy="8.5" rx="6" ry="7" transform="rotate(-20 13.5 8.5)" />
          <line x1="9" y1="15" x2="5" y2="21" />
        </svg>
      );
    case 'hasAccessibleCourt':
    case 'hasAccessibleBathroom':
    case 'hasPcdParking':
      return (
        <svg {...common} aria-hidden>
          <circle cx="12" cy="5" r="2" />
          <path d="M12 8v5l4 2" />
          <path d="M8 12a5 5 0 1 0 7 6" />
        </svg>
      );
  }
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
