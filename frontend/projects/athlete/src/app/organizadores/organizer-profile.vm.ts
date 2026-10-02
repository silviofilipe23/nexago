/**
 * Perfil público do organizador — regras puras de exibição (sem Angular, sem Firestore).
 * Spec: docs/superpowers/specs/2026-10-02-organizer-public-profile-design.md
 */
import { tournamentCoverOrDefault } from '@nexago/tournament-covers';
import {
  ORGANIZER_ASPECT_KEYS,
  ORGANIZER_MIN_PUBLIC_REVIEWS as MIN_PUBLIC_REVIEWS,
  formatOrganizerRating as formatRating,
  type OrganizerEvent,
  type OrganizerPublicProfile,
  type OrganizerReputationDetail,
  type OrganizerReviewSummaryRow,
} from '../data/organizer-public-profiles';
import { sportLabelForCode } from '../data/sport-catalog';
import type { TournamentReviewAspectKey } from '../data/tournament-reviews';
import type { TournamentSummary } from '../data/tournaments-repository';
import { discoveryFillPercent, discoverySpotsOf } from '../tournaments/tournament-discovery.spots';

// ── Números ──────────────────────────────────────────────────────────────────

const INTEGER = new Intl.NumberFormat('pt-BR');

/** Contagem exata com separador de milhar: "1.240". */
export function formatCount(value: number): string {
  return INTEGER.format(Math.max(0, Math.trunc(value)));
}

/** Contador social compacto: "980", "2,1 mil", "1,2 mi". Trunca (2.199 → "2,1 mil"): nunca
 *  anuncia mais seguidores do que existem. */
export function formatCompactCount(value: number): string {
  const v = Math.max(0, Math.trunc(value));
  if (v < 1000) return String(v);
  const [unit, suffix] = v < 1_000_000 ? [1000, 'mil'] : [1_000_000, 'mi'];
  const tenths = Math.floor(v / (unit / 10));
  const whole = Math.floor(tenths / 10);
  const decimal = tenths % 10;
  return decimal === 0 ? `${INTEGER.format(whole)} ${suffix}` : `${INTEGER.format(whole)},${decimal} ${suffix}`;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** "R$ 140" (inteiro) ou "R$ 140,50". Montado à mão: o `currency` do Intl põe espaço rígido. */
export function formatPrice(value: number): string {
  const digits = Number.isInteger(value) ? 0 : 2;
  return `R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(value)}`;
}

// ── Identidade ───────────────────────────────────────────────────────────────

const SMALL_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', '&']);

/** Até 3 iniciais, sem preposição: "Liga Amadora Goiânia" → "LAG", "Arena de Vôlei" → "AV". */
export function organizerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => w.length > 0);
  const significant = words.filter((w, i) => i === 0 || !SMALL_WORDS.has(w.toLowerCase()));
  return significant.slice(0, 3).map((w) => w.charAt(0).toUpperCase()).join('') || 'O';
}

/** `tournaments.sport` é camelCase (`beachVolleyball`); o catálogo do perfil usa `VOLEI_PRAIA`. */
const TOURNAMENT_SPORT_LABELS: Record<string, string> = {
  beachvolleyball: 'Vôlei de praia',
  indoorvolleyball: 'Vôlei de quadra',
  footvolley: 'Futevôlei',
  beachtennis: 'Beach tennis',
  padel: 'Padel',
};

export function tournamentSportLabel(code: string | null | undefined): string | null {
  const raw = code?.trim();
  if (!raw) return null;
  return TOURNAMENT_SPORT_LABELS[raw.toLowerCase()] ?? sportLabelForCode(raw);
}

// ── Datas (sempre no fuso de São Paulo, o do torneio) ───────────────────────

const SP_PARTS = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric', day: 'numeric' });
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

interface DayParts {
  y: number;
  m: number;
  d: number;
}

function spDay(date: Date): DayParts {
  const parts = SP_PARTS.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day') };
}

const two = (n: number) => String(n).padStart(2, '0');
const dayKey = (p: DayParts) => p.y * 10_000 + p.m * 100 + p.d;

/** "21 jul", "04–05 ago", "30 jul – 02 ago"; com ano: "02–03 mai 2026". Virada de ano leva o
 *  ano dos dois lados. */
export function eventDateLabel(start: Date | null, end: Date | null, withYear = false): string {
  if (!start) return 'Data a confirmar';
  const a = spDay(start);
  const b = end ? spDay(end) : a;
  const year = (p: DayParts) => (withYear ? ` ${p.y}` : '');
  if (dayKey(b) <= dayKey(a)) return `${two(a.d)} ${MONTHS[a.m - 1]}${year(a)}`;
  if (a.y === b.y && a.m === b.m) return `${two(a.d)}–${two(b.d)} ${MONTHS[a.m - 1]}${year(a)}`;
  if (a.y === b.y) return `${two(a.d)} ${MONTHS[a.m - 1]} – ${two(b.d)} ${MONTHS[b.m - 1]}${year(b)}`;
  return `${two(a.d)} ${MONTHS[a.m - 1]} ${a.y} – ${two(b.d)} ${MONTHS[b.m - 1]} ${b.y}`;
}

// ── Cabeçalho ────────────────────────────────────────────────────────────────

export interface OrganizerStatVm {
  readonly value: string;
  readonly label: string;
  readonly star: boolean;
}

export interface OrganizerHeaderVm {
  readonly name: string;
  readonly initials: string;
  readonly logoUrl: string | null;
  readonly coverUrl: string | null;
  readonly verified: boolean;
  /** "Goiânia · GO". */
  readonly locationLabel: string | null;
  /** "Organizador desde 2021". */
  readonly sinceLabel: string | null;
  readonly stats: readonly OrganizerStatVm[];
  readonly sports: readonly string[];
  readonly bio: string | null;
  readonly whatsappUrl: string | null;
}

/** "Organizador desde AAAA" — some se o ano ainda não chegou (evento futuro contado como o
 *  primeiro; o servidor também deixa de contá-los). */
function sinceLabel(since: Date | null, now: Date): string | null {
  if (!since) return null;
  const year = spDay(since).y;
  return year > spDay(now).y ? null : `Organizador desde ${year}`;
}

/** Nota pública: só com `average` publicado pelo servidor (3+ avaliações). */
export function hasPublicRating(r: OrganizerReputationDetail | null): r is OrganizerReputationDetail & { average: number } {
  return r != null && r.average != null && r.reviewsCount >= MIN_PUBLIC_REVIEWS;
}

export function organizerHeaderVm(
  profile: OrganizerPublicProfile,
  reputation: OrganizerReputationDetail | null,
  followersCount: number,
  now: Date,
): OrganizerHeaderVm {
  const { eventsCompleted, athletes, organizerSince } = profile.stats;
  const stats: OrganizerStatVm[] = [
    { value: formatCount(eventsCompleted), label: plural(eventsCompleted, 'Evento realizado', 'Eventos realizados'), star: false },
    { value: formatCount(athletes), label: plural(athletes, 'Atleta', 'Atletas'), star: false },
  ];
  if (hasPublicRating(reputation)) stats.push({ value: formatRating(reputation.average), label: 'Nota média', star: true });
  stats.push({ value: formatCompactCount(followersCount), label: plural(followersCount, 'Seguidor', 'Seguidores'), star: false });

  const location = [profile.city, profile.state].filter((v): v is string => !!v).join(' · ');
  const sports = [...new Set(profile.stats.sports.map(tournamentSportLabel).filter((s): s is string => !!s))];
  return {
    name: profile.name,
    initials: organizerInitials(profile.name),
    logoUrl: profile.logoUrl,
    coverUrl: profile.coverUrl,
    verified: profile.verified,
    locationLabel: location || null,
    sinceLabel: sinceLabel(organizerSince, now),
    stats,
    sports,
    bio: profile.bio,
    whatsappUrl: profile.whatsapp ? `https://wa.me/${profile.whatsapp}` : null,
  };
}

// ── Eventos ──────────────────────────────────────────────────────────────────

const startMs = (e: OrganizerEvent) => e.summary.startAt?.getTime() ?? null;

function byStart(direction: 1 | -1) {
  return (a: OrganizerEvent, b: OrganizerEvent): number => {
    const x = startMs(a);
    const y = startMs(b);
    if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;
    return (x - y) * direction;
  };
}

/**
 * Definições compartilhadas com o app e com o backend (mesma regra nos três).
 *
 * `completed` só é gravado quando todas as finais de categoria terminam pelo sistema: um evento
 * que acabou sem isso não podia sumir de "Próximos" e de "Realizados" ao mesmo tempo. Por isso
 * "realizado" também vale para o evento cujo fim (`endAt`, ou `startAt`) já passou há 12h.
 * Um `OrganizerEvent` só existe para evento listado (`organizerEventFromDoc`).
 */
export const EVENT_END_GRACE_MS = 12 * 60 * 60 * 1000;

/** Fim do evento em ms: `endAt`, senão `startAt`; `null` sem nenhum dos dois. */
export function eventEndMs(s: Pick<TournamentSummary, 'startAt' | 'endAt'>): number | null {
  return (s.endAt ?? s.startAt)?.getTime() ?? null;
}

export function isRealizedOrganizerEvent(e: OrganizerEvent, now: Date): boolean {
  if (e.listingStatus === 'completed') return true;
  const end = eventEndMs(e.summary);
  return end != null && end + EVENT_END_GRACE_MS <= now.getTime();
}

export function isUpcomingOrganizerEvent(e: OrganizerEvent, now: Date): boolean {
  return !isRealizedOrganizerEvent(e, now);
}

/** Ao vivo: há partida rolando, ou o evento já começou, não terminou e a inscrição não está mais
 *  aberta. No dia do evento com inscrição `open` e sem partida, o selo segue o da inscrição. */
export function isLiveOrganizerEvent(e: OrganizerEvent, now: Date): boolean {
  const { liveMatchesNow, startAt } = e.summary;
  if (liveMatchesNow > 0) return true;
  return startAt != null && startAt.getTime() <= now.getTime() && !isRealizedOrganizerEvent(e, now) && e.listingStatus !== 'open';
}

/** Próximos, do mais perto ao mais longe. */
export function upcomingOrganizerEvents(events: readonly OrganizerEvent[], now: Date): OrganizerEvent[] {
  return events.filter((e) => isUpcomingOrganizerEvent(e, now)).sort(byStart(1));
}

/** Realizados, do mais recente ao mais antigo (histórico, Resultados e "Ver os N"). */
export function realizedOrganizerEvents(events: readonly OrganizerEvent[], now: Date): OrganizerEvent[] {
  return events.filter((e) => isRealizedOrganizerEvent(e, now)).sort(byStart(-1));
}

/** Aceita inscrição agora: status `open`, já passou de `registrationOpensAt` e o prazo não venceu. */
function registrationOpenNow(e: OrganizerEvent, now: Date): boolean {
  const { registrationOpensAt, registrationClosesAt } = e.summary;
  if (e.listingStatus !== 'open') return false;
  if (registrationOpensAt && registrationOpensAt.getTime() > now.getTime()) return false;
  return !(registrationClosesAt && registrationClosesAt.getTime() <= now.getTime());
}

/** "3 com inscrição aberta" ao lado de "Próximos eventos" — os "Em breve" não contam. */
export function openRegistrationCaption(upcoming: readonly OrganizerEvent[], now: Date): string | null {
  const n = upcoming.filter((e) => registrationOpenNow(e, now)).length;
  return n === 0 ? null : `${n} com inscrição aberta`;
}

export type OrganizerEventBadgeTone = 'live' | 'soon' | 'closed' | 'full' | 'last' | 'open';

export interface OrganizerEventCardVm {
  readonly id: string;
  readonly name: string;
  readonly link: readonly string[];
  readonly badge: { readonly label: string; readonly tone: OrganizerEventBadgeTone };
  /** "Torneio" ou "Liga · Etapa 5". */
  readonly typeLabel: string;
  readonly sportLabel: string | null;
  readonly dateLabel: string;
  readonly venue: string | null;
  /** `known: false` = contagem de inscrições ainda não chegou: só a capacidade aparece. */
  readonly spots: { readonly label: string; readonly pct: number; readonly known: boolean } | null;
  /** "a partir de" (valores variam) · "R$ 140" · "por dupla"; "Grátis" · "em algumas categorias". */
  readonly price: { readonly prefix: string; readonly label: string; readonly unit: string } | null;
  readonly cta: { readonly label: 'Inscrever' | 'Acompanhar' | 'Ver evento'; readonly primary: boolean; readonly link: readonly string[] };
  readonly coverUrl: string | null;
}

/** Unidade das vagas: atleta (individual), equipe (só categorias de equipe) ou dupla. */
function eventUnit(s: Pick<TournamentSummary, 'format' | 'categories'>): [string, string] {
  if (s.format === 'Individual') return ['atleta', 'atletas'];
  if (s.categories.length > 0 && s.categories.every((c) => c.teamSize != null)) return ['equipe', 'equipes'];
  return ['dupla', 'duplas'];
}

function eventTypeLabel(s: TournamentSummary): string {
  if (!s.leagueId) return 'Torneio';
  return s.leagueStageOrder != null ? `Liga · Etapa ${s.leagueStageOrder}` : 'Liga';
}

function eventPrice(s: TournamentSummary): OrganizerEventCardVm['price'] {
  if (s.categories.length === 0) return null;
  const cheapest = s.categories.reduce((min, c) => (c.entryFee < min.entryFee ? c : min));
  const varies = s.categories.some((c) => c.entryFee !== cheapest.entryFee);
  // Grátis e pago no mesmo evento: "a partir de Grátis" não se lê — o grátis vem com a ressalva.
  if (cheapest.entryFee <= 0) return { prefix: '', label: 'Grátis', unit: varies ? 'em algumas categorias' : '' };
  const unit = s.format === 'Individual' ? 'atleta' : cheapest.teamSize != null ? 'equipe' : 'dupla';
  return { prefix: varies ? 'a partir de' : '', label: formatPrice(cheapest.entryFee), unit: `por ${unit}` };
}

function eventBadge(
  e: OrganizerEvent,
  spots: { filled: number; total: number } | null,
  now: Date,
): OrganizerEventCardVm['badge'] {
  const s = e.summary;
  if (isLiveOrganizerEvent(e, now)) return { label: 'Ao vivo', tone: 'live' };
  if (e.listingStatus === 'closed') return { label: 'Inscrições encerradas', tone: 'closed' };
  if (s.registrationOpensAt && s.registrationOpensAt.getTime() > now.getTime()) return { label: 'Em breve', tone: 'soon' };
  if (s.registrationClosesAt && s.registrationClosesAt.getTime() <= now.getTime()) return { label: 'Inscrições encerradas', tone: 'closed' };
  if (spots && spots.total > 0) {
    // Lotado sem fila de espera não aceita mais ninguém; com fila, ainda dá para entrar nela.
    if (spots.filled >= spots.total && !s.waitlistEnabled) return { label: 'Vagas esgotadas', tone: 'full' };
    if (discoveryFillPercent(spots) >= 80) return { label: 'Últimas vagas', tone: 'last' };
  }
  return { label: 'Inscrições abertas', tone: 'open' };
}

/** `enrolled`: inscrições contadas em `inscriptions` (`null` enquanto não chegou). O total vem da
 *  soma dos `maxTeams` (`discoverySpotsOf`): o `capacity` do doc não tem unidade garantida. */
export function organizerEventCardVm(e: OrganizerEvent, enrolled: number | null, now: Date): OrganizerEventCardVm {
  const s = e.summary;
  const total = discoverySpotsOf(s, 0).total;
  let spots: OrganizerEventCardVm['spots'] = null;
  const filled = total > 0 && enrolled != null ? discoverySpotsOf(s, enrolled) : null;
  if (total > 0 && !filled) {
    spots = { label: `${total} vagas`, pct: 0, known: false };
  } else if (filled) {
    // A fila de espera conta em `inscriptions`: "18/16" não se mostra.
    spots = { label: `${Math.min(filled.filled, filled.total)}/${filled.total}`, pct: discoveryFillPercent(filled), known: true };
  }
  const badge = eventBadge(e, filled, now);
  const canRegister = badge.tone === 'open' || badge.tone === 'last';
  const link = ['/torneios', s.id];
  return {
    id: s.id,
    name: s.name,
    link,
    badge,
    typeLabel: eventTypeLabel(s),
    sportLabel: tournamentSportLabel(s.sport),
    dateLabel: eventDateLabel(s.startAt, s.endAt),
    venue: s.location || s.city || null,
    spots,
    price: eventPrice(s),
    cta: canRegister
      ? { label: 'Inscrever', primary: true, link: ['/torneios', s.id, 'inscricao'] }
      : { label: badge.tone === 'full' ? 'Ver evento' : 'Acompanhar', primary: false, link },
    coverUrl: tournamentCoverOrDefault(s.coverUrl, s.sport),
  };
}

export interface OrganizerHistoryRowVm {
  readonly id: string;
  readonly name: string;
  readonly link: readonly string[];
  readonly sportLabel: string | null;
  readonly dateLabel: string;
  /** "16 duplas"; `null` enquanto a contagem não chegou. */
  readonly teamsLabel: string | null;
  /** "Campeões: Ana / Bia" — a primeira categoria do evento. */
  readonly championsLabel: string | null;
}

export function organizerHistoryRowVm(
  e: OrganizerEvent,
  enrolled: number | null,
  teamNames: ReadonlyMap<string, string>,
): OrganizerHistoryRowVm {
  const s = e.summary;
  const [one, many] = eventUnit(s);
  const first = e.champions[0];
  const champion = first ? teamNames.get(first.teamId) : undefined;
  return {
    id: s.id,
    name: s.name,
    link: ['/torneios', s.id],
    sportLabel: tournamentSportLabel(s.sport),
    dateLabel: eventDateLabel(s.startAt, s.endAt, true),
    teamsLabel: enrolled == null ? null : `${formatCount(enrolled)} ${plural(enrolled, one, many)}`,
    championsLabel: champion ? `Campeões: ${champion}` : null,
  };
}

export interface OrganizerResultVm {
  readonly id: string;
  readonly name: string;
  readonly link: readonly string[];
  readonly sportLabel: string | null;
  readonly dateLabel: string;
  /** `teamName: null` = nome ainda carregando (ou equipe apagada). */
  readonly champions: readonly { readonly categoryName: string; readonly teamName: string | null }[];
}

export function organizerResultVm(e: OrganizerEvent, teamNames: ReadonlyMap<string, string>): OrganizerResultVm {
  const s = e.summary;
  return {
    id: s.id,
    name: s.name,
    link: ['/torneios', s.id],
    sportLabel: tournamentSportLabel(s.sport),
    dateLabel: eventDateLabel(s.startAt, s.endAt, true),
    champions: e.champions.map((c) => ({ categoryName: c.categoryName, teamName: teamNames.get(c.teamId) ?? null })),
  };
}

// ── Reputação e avaliações ───────────────────────────────────────────────────

/** Rótulos curtos do perfil (o formulário de avaliação usa os longos). */
export const ORGANIZER_ASPECT_LABELS: Record<TournamentReviewAspectKey, string> = {
  organization: 'Organização',
  schedule: 'Pontualidade',
  refereeing: 'Arbitragem',
  venue: 'Estrutura',
  prizes: 'Premiação',
};

export interface OrganizerAspectRowVm {
  readonly key: TournamentReviewAspectKey;
  readonly label: string;
  /** "4,9", ou "—" sem nota nesse aspecto. */
  readonly value: string;
  readonly pct: number;
}

export interface OrganizerReputationVm {
  readonly average: string;
  /** Estrelas cheias (0–5), pela média arredondada. */
  readonly stars: number;
  readonly countLabel: string;
  readonly tournamentsLabel: string;
  readonly aspects: readonly OrganizerAspectRowVm[];
}

/** `null` = "Ainda sem avaliações suficientes". */
export function organizerReputationVm(r: OrganizerReputationDetail | null): OrganizerReputationVm | null {
  if (!hasPublicRating(r)) return null;
  return {
    average: formatRating(r.average),
    stars: Math.max(0, Math.min(5, Math.round(r.average))),
    countLabel: `${formatCount(r.reviewsCount)} ${plural(r.reviewsCount, 'avaliação', 'avaliações')}`,
    tournamentsLabel: `em ${r.tournamentsRated} ${plural(r.tournamentsRated, 'evento', 'eventos')}`,
    aspects: ORGANIZER_ASPECT_KEYS.map((key) => {
      const value = r.aspects[key];
      return {
        key,
        label: ORGANIZER_ASPECT_LABELS[key],
        value: value == null ? '—' : formatRating(value),
        pct: value == null ? 0 : Math.round((value / 5) * 100),
      };
    }),
  };
}

export interface OrganizerReviewEventVm {
  readonly id: string;
  readonly name: string;
  readonly link: readonly string[];
  readonly dateLabel: string;
  readonly average: string;
  readonly countLabel: string;
}

export interface OrganizerReviewsVm {
  readonly summary: OrganizerReputationVm | null;
  /** 5 → 1 estrelas; vazio sem distribuição pública. */
  readonly distribution: readonly { readonly stars: number; readonly count: number; readonly pct: number }[];
  readonly events: readonly OrganizerReviewEventVm[];
}

/** Aba Avaliações: nota geral, distribuição, aspectos e a nota de cada evento listado cuja janela
 *  fechou com 3+ avaliações. Sem texto de comentário (decisão do dono). */
export function organizerReviewsVm(
  reputation: OrganizerReputationDetail | null,
  summaries: readonly OrganizerReviewSummaryRow[],
  listedEventIds: ReadonlySet<string>,
): OrganizerReviewsVm {
  const summary = organizerReputationVm(reputation);
  const d = summary ? reputation?.distribution : null;
  const total = d ? d[1] + d[2] + d[3] + d[4] + d[5] : 0;
  const distribution = d
    ? ([5, 4, 3, 2, 1] as const).map((stars) => ({ stars, count: d[stars], pct: total > 0 ? Math.round((d[stars] / total) * 100) : 0 }))
    : [];
  const events = summaries
    // Só eventos listados: o resumo de um torneio "por link" não pode expor o evento aqui.
    .filter((s) => listedEventIds.has(s.tournamentId))
    .filter((s): s is OrganizerReviewSummaryRow & { average: number } => s.status === 'closed' && s.count >= MIN_PUBLIC_REVIEWS && s.average != null)
    .sort((a, b) => (b.tournamentStartAt?.getTime() ?? 0) - (a.tournamentStartAt?.getTime() ?? 0))
    .map((s) => ({
      id: s.tournamentId,
      name: s.tournamentName || 'Evento',
      link: ['/torneios', s.tournamentId],
      dateLabel: eventDateLabel(s.tournamentStartAt, null, true),
      average: formatRating(s.average),
      countLabel: `${formatCount(s.count)} avaliações`,
    }));
  return { summary, distribution, events };
}

// ── Abas ─────────────────────────────────────────────────────────────────────

export type OrganizerTabId = 'visao-geral' | 'eventos' | 'resultados' | 'avaliacoes';

export const ORGANIZER_TABS: readonly { readonly id: OrganizerTabId; readonly label: string }[] = [
  { id: 'visao-geral', label: 'Visão geral' },
  { id: 'eventos', label: 'Eventos' },
  { id: 'resultados', label: 'Resultados' },
  { id: 'avaliacoes', label: 'Avaliações' },
];

/** `?aba=` desconhecida ou ausente cai na visão geral. */
export function organizerTabFromParam(raw: string | null | undefined): OrganizerTabId {
  return ORGANIZER_TABS.find((t) => t.id === raw)?.id ?? 'visao-geral';
}
