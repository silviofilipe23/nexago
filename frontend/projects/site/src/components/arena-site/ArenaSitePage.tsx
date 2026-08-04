import Image from 'next/image';
import Link from 'next/link';
import {
  Accessibility,
  ArrowUpRight,
  Beer,
  CalendarCheck,
  CalendarDays,
  Camera,
  Check,
  Clock,
  MapPin,
  MessageSquareText,
  ParkingCircle,
  Plus,
  Shirt,
  SquareParking,
  Star,
  Toilet,
  Trophy,
  Umbrella,
  Users,
  Volleyball,
} from 'lucide-react';
import type {
  AmenityKey,
  ArenaPublicInfo,
  ArenaSiteReviews,
  ArenaSiteTournament,
  WeekSchedule,
  Weekday,
} from '@/lib/firestore/arena-site-data';
import type { PublicArenaSite } from '@/lib/firestore/arena-sites';
import { Reveal } from '@/components/motion/Reveal';
import { ArenaMap } from './ArenaMap';
import { ArenaNav } from './ArenaNav';
import { HeroOpenNow, HoursCard, OpenNowPill } from './ArenaSchedule';
import styles from './arena-site.module.css';

const SPORT_LABEL: Record<string, string> = {
  beachTennis: 'Beach tennis',
  beachVolleyball: 'Vôlei de praia',
  footvolley: 'Futevôlei',
};

/** Ícones do Lucide + os desenhados aqui (o set não cobre tudo). */
type Glyph = React.ComponentType<{ size?: number }>;

const AMENITY_INFO: Record<AmenityKey, { label: string; hint: string; Icon: Glyph }> = {
  parking: { label: 'Estacionamento', hint: 'Para clientes da arena', Icon: SquareParking },
  lockerRoom: { label: 'Vestiários', hint: 'Com chuveiros', Icon: Shirt },
  coveredCourt: { label: 'Quadra coberta', hint: 'Jogo com sol ou chuva', Icon: Umbrella },
  bar: { label: 'Bar & lanchonete', hint: 'Comanda na arena', Icon: Beer },
  racketRental: { label: 'Aluguel de raquete', hint: 'É só chegar e jogar', Icon: RacketGlyph },
  hasAccessibleCourt: { label: 'Quadra acessível', hint: 'Estrutura PCD', Icon: Accessibility },
  hasAccessibleBathroom: { label: 'Banheiro acessível', hint: 'Estrutura PCD', Icon: Toilet },
  hasPcdParking: { label: 'Vaga PCD', hint: 'Estacionamento reservado', Icon: ParkingCircle },
};

/** Raquete não existe no Lucide — desenhada no mesmo traço (1.8 / viewBox 24)
 *  para não destoar do resto do set. */
function RacketGlyph({ size = 24 }: { size?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <ellipse cx="13.5" cy="8.5" rx="6" ry="7" transform="rotate(-20 13.5 8.5)" />
      <line x1="9" y1="15" x2="5" y2="21" />
    </svg>
  );
}

/** Dia da semana em Brasília no momento do render. A página é ISR (5 min), então
 *  isso é só o valor inicial — o cliente corrige assim que monta. */
function todayWeekday(): Weekday {
  const short = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(new Date());
  const map: Record<string, Weekday> = {
    Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday', Thu: 'thursday',
    Fri: 'friday', Sat: 'saturday', Sun: 'sunday',
  };
  return map[short] ?? 'monday';
}

/** Mini-site público da arena — template "premium": hero de tela cheia, sobre +
 *  números, estrutura, horários, galeria, planos, torneios, avaliações, FAQ e
 *  contato com mapa. Server Component; só nav, horários e mapa são client. */
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
  const courtsCount = arenaInfo?.courtsCount ?? 0;
  const showStructure = amenities.length > 0 || courtsCount > 0;
  const today = todayWeekday();

  const cityLine = [arenaInfo?.city, arenaInfo?.state].filter(Boolean).join(' — ');
  const reserveUrl = site.hero.ctaUrl || whatsappUrl;
  const address = site.contact.address || arenaInfo?.address || '';
  const hasCoords = arenaInfo?.lat != null && arenaInfo?.lng != null;
  const directionsUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${arenaInfo!.lat},${arenaInfo!.lng}`
    : address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([address, cityLine].filter(Boolean).join(', '))}`
      : null;
  const [aboutLead, ...aboutRest] = splitParagraphs(site.about.body);

  const anchors = [
    showAbout && { id: 'sobre', label: 'Sobre' },
    showStructure && { id: 'estrutura', label: 'Estrutura' },
    schedule && { id: 'horarios', label: 'Horários' },
    showGallery && { id: 'galeria', label: 'Galeria' },
    showPlans && { id: 'planos', label: 'Planos' },
    tournaments.length > 0 && { id: 'torneios', label: 'Torneios' },
    reviews && { id: 'avaliacoes', label: 'Avaliações' },
    showFaq && { id: 'duvidas', label: 'Dúvidas' },
    showContact && { id: 'contato', label: 'Contato' },
  ].filter((a): a is { id: string; label: string } => Boolean(a));

  return (
    <main className={styles.page} style={{ '--arena-accent': site.theme.primaryHex } as React.CSSProperties}>
      <ArenaNav
        arenaName={site.arenaName}
        logoUrl={site.theme.logoUrl}
        anchors={anchors}
        reserveUrl={reserveUrl}
      />

      <header className={styles.hero} id="top">
        {site.hero.imageUrl ? (
          <Image className={styles.heroBg} src={site.hero.imageUrl} alt="" fill priority sizes="100vw" />
        ) : (
          <div className={styles.heroFallback} aria-hidden />
        )}
        <div className={styles.heroScrim} aria-hidden />
        <div className={styles.heroGlow} aria-hidden />
        <div className={`${styles.wrap} ${styles.heroIn}`}>
          <p className={styles.kicker}>{[site.arenaName, arenaInfo?.city].filter(Boolean).join(' · ')}</p>
          <h1 className={styles.headline}>{site.hero.headline}</h1>
          {site.hero.tagline && <p className={styles.heroSub}>{site.hero.tagline}</p>}
          <div className={styles.heroCta}>
            {reserveUrl && (
              <a className={styles.btnAc} href={reserveUrl} target="_blank" rel="noopener noreferrer">
                <CalendarCheck size={19} aria-hidden />
                {site.hero.ctaLabel || 'Reservar um horário'}
              </a>
            )}
            {whatsappUrl && (
              <a className={styles.btnGhost} href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <MessageSquareText size={19} aria-hidden />
                Chamar no WhatsApp
              </a>
            )}
          </div>
          {(schedule || courtsCount > 0 || cityLine) && (
            <div className={styles.heroStrip}>
              {schedule && <HeroOpenNow schedule={schedule} today={today} />}
              {courtsCount > 0 && (
                <div>
                  <Volleyball size={19} aria-hidden />
                  <span>
                    <b>
                      {courtsCount} {courtsCount === 1 ? 'quadra' : 'quadras'}
                    </b>
                    &nbsp;{arenaInfo!.courtTypes.length > 0 ? arenaInfo!.courtTypes.slice(0, 2).join(', ') : 'oficiais'}
                  </span>
                </div>
              )}
              {cityLine && (
                <div>
                  <MapPin size={19} aria-hidden />
                  <span>
                    <b>{cityLine}</b>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {showAbout && (
        <section className={styles.block} id="sobre" aria-labelledby="sobre-title">
          <div className={styles.wrap}>
            <Reveal className={styles.kicker}>Sobre a arena</Reveal>
            <div className={site.about.imageUrls.length > 0 ? styles.sobreGrid : styles.sobreGridSolo}>
              <Reveal className={styles.sobreCopy}>
                <h2 id="sobre-title" className={styles.secTitle}>
                  {site.about.title || 'Sobre a arena'}
                </h2>
                {aboutLead && (
                  <p className={styles.secSub} style={{ marginBottom: 18 }}>
                    {aboutLead}
                  </p>
                )}
                {aboutRest.map((paragraph) => (
                  <p key={paragraph} className={styles.sobreBody}>
                    {paragraph}
                  </p>
                ))}
                {site.about.stats.length > 0 && (
                  <div className={styles.sobreFacts}>
                    {site.about.stats.map((s) => (
                      <div key={`${s.value}-${s.label}`}>
                        <b>{s.value}</b>
                        <span>{s.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Reveal>
              {site.about.imageUrls.length > 0 && (
                <Reveal className={styles.sobreMedia} delay={0.08}>
                  {site.about.imageUrls.map((url) => (
                    <div key={url} className={styles.ph}>
                      <Image src={url} alt="" width={640} height={440} />
                    </div>
                  ))}
                </Reveal>
              )}
            </div>
          </div>
        </section>
      )}

      {showStructure && (
        <section className={styles.block} id="estrutura" aria-labelledby="estrutura-title">
          <div className={styles.wrap}>
            <Reveal className={styles.kicker}>Estrutura</Reveal>
            <Reveal>
              <h2 id="estrutura-title" className={styles.secTitle}>
                Tudo o que você precisa para jogar
              </h2>
            </Reveal>
            <Reveal className={styles.amenGrid} delay={0.06}>
              {courtsCount > 0 && (
                <div className={styles.amen}>
                  <span className={styles.amenIcon} aria-hidden>
                    <Volleyball size={26} />
                  </span>
                  <b>
                    {courtsCount} {courtsCount === 1 ? 'quadra oficial' : 'quadras oficiais'}
                  </b>
                  <span>{arenaInfo!.courtTypes.length > 0 ? arenaInfo!.courtTypes.join(' · ') : 'Areia tratada'}</span>
                </div>
              )}
              {amenities.map((key) => {
                const { label, hint, Icon } = AMENITY_INFO[key];
                return (
                  <div key={key} className={styles.amen}>
                    <span className={styles.amenIcon} aria-hidden>
                      <Icon size={26} />
                    </span>
                    <b>{label}</b>
                    <span>{hint}</span>
                  </div>
                );
              })}
            </Reveal>
          </div>
        </section>
      )}

      {schedule && (
        <section className={styles.block} id="horarios" aria-labelledby="horarios-title">
          <div className={styles.wrap}>
            <div className={styles.hoursWrap}>
              <Reveal>
                <div className={styles.kicker}>Horários</div>
                <h2 id="horarios-title" className={styles.secTitle}>
                  Nossos horários
                </h2>
                <p className={styles.hoursNote}>
                  Da primeira aula da manhã ao último jogo da noite. Reserve seu horário pelo site
                  {whatsappUrl ? ' ou chame no WhatsApp' : ''}.
                </p>
                <OpenNowPill schedule={schedule} today={today} />
              </Reveal>
              <Reveal delay={0.08}>
                <HoursCard schedule={schedule} today={today} />
              </Reveal>
            </div>
          </div>
        </section>
      )}

      {showGallery && (
        <section className={styles.block} id="galeria" aria-labelledby="galeria-title">
          <div className={styles.wrap}>
            <Reveal className={styles.kicker}>Galeria</Reveal>
            <Reveal>
              <h2 id="galeria-title" className={styles.secTitle}>
                A arena em jogo
              </h2>
            </Reveal>
            <Reveal className={styles.galGrid} delay={0.06}>
              {site.gallery.imageUrls.map((url, i) => (
                <div key={url} className={`${styles.ph} ${galleryCell(i, site.gallery.imageUrls.length, styles)}`}>
                  <Image src={url} alt="" width={i === 0 ? 960 : 480} height={i === 0 ? 640 : 400} />
                </div>
              ))}
            </Reveal>
          </div>
        </section>
      )}

      {showPlans && (
        <section className={styles.block} id="planos" aria-labelledby="planos-title">
          <div className={styles.wrap}>
            <Reveal className={styles.kicker}>Planos</Reveal>
            <Reveal>
              <h2 id="planos-title" className={styles.secTitle}>
                Jogue do seu jeito
              </h2>
            </Reveal>
            <Reveal
              className={styles.plans}
              delay={0.06}
              /* 3 colunas é o desenho do template; com menos planos a grade
                 encolhe para não deixar coluna vazia (4 viram 2×2). */
              style={{ '--plan-cols': site.plans.items.length === 4 ? 2 : Math.min(site.plans.items.length, 3) } as React.CSSProperties}
            >
              {site.plans.items.map((plan) => {
                const [amount, unit] = splitPrice(plan.price);
                return (
                  <div key={plan.name} className={plan.featured ? styles.planFeat : styles.plan}>
                    {plan.featured && <div className={styles.planFlag}>MAIS PROCURADO</div>}
                    <div className={styles.planName}>{plan.name}</div>
                    <div className={styles.planPrice}>
                      {amount}
                      {unit && <span className={styles.planPriceUnit}> / {unit}</span>}
                    </div>
                    {plan.features.length > 0 && (
                      <ul className={styles.planList}>
                        {plan.features.map((f) => (
                          <li key={f} className={styles.planItem}>
                            <Check size={17} strokeWidth={2.6} aria-hidden />
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                    {whatsappUrl && (
                      <a
                        className={plan.featured ? styles.btnAc : styles.btnGhost}
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Falar com a arena
                      </a>
                    )}
                  </div>
                );
              })}
            </Reveal>
          </div>
        </section>
      )}

      {tournaments.length > 0 && (
        <section className={styles.block} id="torneios" aria-labelledby="torneios-title">
          <div className={styles.wrap}>
            <Reveal className={styles.kicker}>Torneios</Reveal>
            <Reveal>
              <h2 id="torneios-title" className={styles.secTitle}>
                A casa também compete
              </h2>
            </Reveal>
            <Reveal className={styles.copaList} delay={0.06}>
              {tournaments.map((t) => (
                <Link
                  key={t.id}
                  className={t.coverUrl ? styles.copa : styles.copaNoCover}
                  href={`/torneios/${t.id}`}
                >
                  {t.coverUrl && (
                    <div className={styles.copaPh}>
                      <Image src={t.coverUrl} alt="" width={720} height={720} />
                    </div>
                  )}
                  <div className={styles.copaBody}>
                    <div className={styles.kicker} style={{ fontSize: 11 }}>
                      {t.listingStatus === 'open' ? 'Inscrições abertas' : 'Em breve'}
                    </div>
                    <h3 className={styles.copaTitle}>{t.name}</h3>
                    <p>
                      {t.description ||
                        'Etapa oficial da casa, com chaveamento, placar ao vivo e ranking dos atletas direto no nexaGO.'}
                    </p>
                    <div className={styles.copaMeta}>
                      {(t.dateLabel || t.startAt) && (
                        <div>
                          <CalendarDays size={17} aria-hidden />
                          {t.dateLabel || formatDate(t.startAt!)}
                        </div>
                      )}
                      {(t.categoriesLabel || t.sport) && (
                        <div>
                          <Users size={17} aria-hidden />
                          {[SPORT_LABEL[t.sport] ?? t.sport, t.categoriesLabel].filter(Boolean).join(' · ')}
                        </div>
                      )}
                      {t.prizeLabel && (
                        <div>
                          <Trophy size={17} aria-hidden />
                          {t.prizeLabel}
                        </div>
                      )}
                    </div>
                    <span className={styles.btnAc}>
                      {t.listingStatus === 'open' ? 'Quero me inscrever' : 'Ver o torneio'}
                    </span>
                  </div>
                </Link>
              ))}
            </Reveal>
          </div>
        </section>
      )}

      {reviews && (
        <section className={styles.block} id="avaliacoes" aria-labelledby="avaliacoes-title">
          <div className={styles.wrap}>
            <Reveal className={styles.kicker}>Avaliações</Reveal>
            <Reveal>
              <h2 id="avaliacoes-title" className={styles.secTitle}>
                Quem joga aqui recomenda
              </h2>
              <div className={styles.reviewsSummary}>
                <span className={styles.reviewsScore}>{reviews.ratingAverage.toFixed(1)}</span>
                <Stars value={reviews.ratingAverage} />
                <span className={styles.reviewsCount}>
                  {reviews.reviewsCount} {reviews.reviewsCount === 1 ? 'avaliação' : 'avaliações'} de atletas no nexaGO
                </span>
              </div>
            </Reveal>
            {reviews.comments.length > 0 && (
              <Reveal className={styles.reviewList} delay={0.06}>
                {reviews.comments.map((r, i) => (
                  <figure key={i} className={styles.reviewCard}>
                    <Stars value={r.rating} />
                    <blockquote className={styles.reviewText}>“{r.comment}”</blockquote>
                    <figcaption className={styles.reviewAuthor}>Atleta nexaGO</figcaption>
                  </figure>
                ))}
              </Reveal>
            )}
          </div>
        </section>
      )}

      {showFaq && (
        <section className={styles.block} id="duvidas" aria-labelledby="duvidas-title">
          <div className={styles.wrap}>
            <div style={{ textAlign: 'center' }}>
              <Reveal className={styles.kickerCenter}>Perguntas frequentes</Reveal>
              <Reveal>
                <h2 id="duvidas-title" className={styles.secTitle}>
                  Ficou alguma dúvida?
                </h2>
              </Reveal>
            </div>
            <Reveal className={styles.faq} delay={0.06}>
              {site.faq.items.map((item) => (
                <details key={item.q} className={styles.faqItem}>
                  <summary className={styles.faqSummary}>
                    {item.q}
                    <Plus size={22} aria-hidden />
                  </summary>
                  <p className={styles.faqAnswer}>{item.a}</p>
                </details>
              ))}
            </Reveal>
          </div>
        </section>
      )}

      {showContact && (
        <section className={styles.block} id="contato" aria-labelledby="contato-title">
          <div className={styles.wrap}>
            <Reveal className={styles.kicker}>Contato</Reveal>
            <Reveal>
              <h2 id="contato-title" className={styles.secTitle}>
                Bora marcar um jogo?
              </h2>
            </Reveal>
            <Reveal className={styles.contactGrid} delay={0.06}>
              <div className={styles.cCards}>
                {whatsappUrl && (
                  <a className={styles.cCard} href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                    <span className={styles.cIcon} aria-hidden>
                      <MessageSquareText size={22} />
                    </span>
                    <div>
                      <b>WhatsApp</b>
                      <span>{formatWhatsapp(site.contact.whatsapp)}</span>
                    </div>
                    <span className={styles.cGo} aria-hidden>
                      <ArrowUpRight size={20} />
                    </span>
                  </a>
                )}
                {instagramUrl && (
                  <a className={styles.cCard} href={instagramUrl} target="_blank" rel="noopener noreferrer">
                    <span className={styles.cIcon} aria-hidden>
                      <Camera size={22} />
                    </span>
                    <div>
                      <b>Instagram</b>
                      <span>@{site.contact.instagram}</span>
                    </div>
                    <span className={styles.cGo} aria-hidden>
                      <ArrowUpRight size={20} />
                    </span>
                  </a>
                )}
                {address &&
                  (directionsUrl ? (
                    <a className={styles.cCard} href={directionsUrl} target="_blank" rel="noopener noreferrer">
                      <span className={styles.cIcon} aria-hidden>
                        <MapPin size={22} />
                      </span>
                      <div>
                        <b>{address}</b>
                        <span>{[cityLine, 'como chegar'].filter(Boolean).join(' · ')}</span>
                      </div>
                      <span className={styles.cGo} aria-hidden>
                        <ArrowUpRight size={20} />
                      </span>
                    </a>
                  ) : (
                    <div className={styles.cCard}>
                      <span className={styles.cIcon} aria-hidden>
                        <MapPin size={22} />
                      </span>
                      <div>
                        <b>{address}</b>
                        {cityLine && <span>{cityLine}</span>}
                      </div>
                    </div>
                  ))}
                {schedule && (
                  <div className={styles.cCard}>
                    <span className={styles.cIcon} aria-hidden>
                      <Clock size={22} />
                    </span>
                    <div>
                      <b>Hoje</b>
                      <span>
                        {schedule[today].closed ? 'Fechado' : `${schedule[today].open} – ${schedule[today].close}`}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              {hasCoords && (
                <div className={styles.mapCard}>
                  <ArenaMap lat={arenaInfo!.lat!} lng={arenaInfo!.lng!} label={site.arenaName} />
                  {address && (
                    <div
                      className={styles.mapAddr}
                      /* Inline: o compilador de CSS do Next remove backdrop-filter de CSS Module. */
                      style={{ backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
                    >
                      <MapPin size={20} aria-hidden />
                      <div>
                        <b>{site.arenaName}</b>
                        <span>{[address, cityLine].filter(Boolean).join(' — ')}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Reveal>
          </div>
        </section>
      )}

      <footer className={styles.footer}>
        <div className={styles.footIn}>
          <span>
            © {new Date().getFullYear()} {site.arenaName}
          </span>
          <a className={styles.footNx} href="/" title="feito com nexaGO">
            <Image src="/brand/logo.png" alt="" width={18} height={18} />
            feito com nexaGO
          </a>
        </div>
      </footer>
    </main>
  );
}

/** Classe da célula da galeria: reproduz o mosaico do protótipo (destaque 2×2 +
 *  faixa de 2 colunas) e mantém a grade de 4 colunas cheia para 1–5 fotos. */
function galleryCell(index: number, total: number, css: Record<string, string>): string {
  if (total === 1) return css.galFull;
  if (total === 2) return css.galHalf;
  if (index === 0) return css.galA;
  if (total === 3) return css.galB;
  if (total === 4 && index === 3) return css.galB;
  return '';
}

/** Quebra o texto livre do "sobre" em parágrafos (linha em branco ou quebra simples). */
function splitParagraphs(body: string): string[] {
  return body
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** "R$ 100 / mês" → ["R$ 100", "mês"]. Sem barra, o preço vai inteiro. */
function splitPrice(price: string): [string, string] {
  const at = price.indexOf('/');
  if (at < 0) return [price.trim(), ''];
  return [price.slice(0, at).trim(), price.slice(at + 1).trim()];
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Sao_Paulo',
  })
    .format(date)
    .replace(',', ' ·');
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
        <Star key={i} size={16} strokeWidth={1.6} fill={i < filled ? 'currentColor' : 'none'} aria-hidden />
      ))}
    </span>
  );
}
