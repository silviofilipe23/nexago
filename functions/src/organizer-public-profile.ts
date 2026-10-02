import {Timestamp} from "firebase-admin/firestore";

/**
 * Perfil público do organizador (`organizerPublicProfiles/{uid}`): projeções puras usadas pelos
 * gatilhos e pelo backfill. Spec: docs/superpowers/specs/2026-10-02-organizer-public-profile-design.md
 */

export const ORGANIZER_PUBLIC_PROFILES_COLLECTION = "organizerPublicProfiles";
export const ORGANIZER_FOLLOWERS_SUBCOLLECTION = "followers";
export const ORGANIZER_FOLLOWER_PUSHES_COLLECTION = "organizerFollowerPushes";
export const ORGANIZER_BIO_MAX = 280;
export const ORGANIZER_NAME_MAX = 60;
const URL_MAX = 2048;
export const ORGANIZER_VENUES_MAX = 3;

export type DocData = Record<string, unknown>;

export interface TournamentRow {
  id: string;
  data: DocData;
}

export interface OrganizerIdentity {
  name: string;
  logoUrl: string | null;
  coverUrl: string | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  whatsapp: string | null;
  isOrganizer: boolean;
}

export interface OrganizerVenue {
  name: string;
  arenaId: string | null;
  city: string | null;
  count: number;
}

export interface OrganizerStats {
  listedEvents: number;
  eventsCompleted: number;
  openEvents: number;
  athletes: number;
  organizerSince: Timestamp | null;
  sports: string[];
  venues: OrganizerVenue[];
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strOrNull(value: unknown): string | null {
  const s = str(value);
  return s.length > 0 ? s : null;
}

function asMap(value: unknown): DocData {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as DocData : {};
}

/** Só `https://`: o doc é lido por qualquer visitante e a URL vira `<img src>`. */
function httpsUrlOrNull(value: unknown): string | null {
  const url = str(value);
  return url.startsWith("https://") && url.length <= URL_MAX ? url : null;
}

/**
 * Dígitos para `wa.me`: DDI 55 + DDD + número. Aceita com ou sem DDI e com zero de tronco
 * ("011 ..."); DDD 55 sem DDI ("(55) 99999-8888") também vira 55 + 55 + número. Fora disso, null.
 */
export function normalizeWhatsappDigits(phone: string): string | null {
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits;
  return null;
}

export function userHasOrganizerRole(user: DocData | null | undefined): boolean {
  const roles = user?.roles;
  return Array.isArray(roles) &&
    roles.some((r) => typeof r === "string" && r.trim().toLowerCase() === "organizer");
}

/** Só o que é exibível. `contactEmail` e o telefone sem opt-in nunca saem de `users`. */
export function buildOrganizerIdentity(user: DocData): OrganizerIdentity {
  const profile = asMap(user.organizerProfile);
  const name = (str(profile.orgName) || str(user.displayName) || str(user.fullName) ||
    str(user.name) || "Organizador").slice(0, ORGANIZER_NAME_MAX).trim();
  const bio = str(profile.bio);
  const phone = str(profile.contactPhone);
  const whatsapp = profile.publicWhatsapp === true && phone ? normalizeWhatsappDigits(phone) : null;
  const state = str(profile.state).toUpperCase();
  return {
    name,
    logoUrl: httpsUrlOrNull(profile.logoUrl),
    coverUrl: httpsUrlOrNull(profile.coverUrl),
    bio: bio ? bio.slice(0, ORGANIZER_BIO_MAX) : null,
    city: strOrNull(profile.city),
    state: state.length > 0 ? state : null,
    whatsapp,
    isOrganizer: userHasOrganizerRole(user),
  };
}

export function sameOrganizerIdentity(a: OrganizerIdentity, b: OrganizerIdentity): boolean {
  return a.name === b.name && a.logoUrl === b.logoUrl && a.coverUrl === b.coverUrl &&
    a.bio === b.bio && a.city === b.city && a.state === b.state &&
    a.whatsapp === b.whatsapp && a.isOrganizer === b.isOrganizer;
}

export function tournamentListingStatus(t: DocData | null | undefined): string {
  return (str(t?.listingStatus) || str(t?.status)).toLowerCase();
}

const LISTED_STATUSES = new Set(["open", "closed", "completed"]);

/** Mesmo critério do app e do portal (`isPubliclyListedTournamentDoc`): só `linkOnly` explícito
 *  esconde; doc sem `visibility` é anterior ao seletor e conta como público. */
export function isListedTournament(t: DocData | null | undefined): boolean {
  if (!t) return false;
  return LISTED_STATUSES.has(tournamentListingStatus(t)) && str(t.visibility) !== "linkOnly";
}

export function isOpenListedTournament(t: DocData | null | undefined): boolean {
  return isListedTournament(t) && tournamentListingStatus(t) === "open";
}

/** Mesma folga das avaliações (`REVIEW_END_GRACE_HOURS`): o evento é dado por encerrado 12 h
 *  depois do fim. */
export const EVENT_END_GRACE_MS = 12 * 60 * 60 * 1000;

/** Fim do evento: `endAt`, ou `startAt` (etapa de liga e evento de um dia gravam só o início). */
export function tournamentEndMs(t: DocData | null | undefined): number | null {
  return millisOf(t?.endAt) ?? millisOf(t?.startAt);
}

/**
 * Evento realizado: `completed`, OU o fim passou há mais de 12 h. O servidor só grava `completed`
 * quando todas as finais terminam no sistema; sem a regra de data, o evento que acabou sem isso
 * sumia do perfil (nem próximo, nem realizado). Mesma regra no portal e no app.
 */
export function isRealizedListedTournament(t: DocData | null | undefined, nowMs: number): boolean {
  if (!isListedTournament(t)) return false;
  if (tournamentListingStatus(t) === "completed") return true;
  const end = tournamentEndMs(t);
  return end != null && end + EVENT_END_GRACE_MS <= nowMs;
}

export function realizedListedTournamentIds(rows: ReadonlyArray<TournamentRow>, nowMs: number): string[] {
  return rows.filter((r) => isRealizedListedTournament(r.data, nowMs)).map((r) => r.id).sort();
}

export function normalizeVenueKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function millisOf(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

interface VenueAcc extends OrganizerVenue {
  lastMs: number;
}

/**
 * Números do perfil no instante `nowMs`. "Realizado" e "organizador desde" dependem do relógio:
 * além do gatilho de torneio, um job diário recalcula quem teve evento encerrado.
 */
export function computeOrganizerStats(
  rows: ReadonlyArray<TournamentRow>,
  athletes: number,
  nowMs: number,
): OrganizerStats {
  const listed = rows.filter((r) => isListedTournament(r.data));
  const sportCounts = new Map<string, number>();
  const venues = new Map<string, VenueAcc>();
  let sinceMs: number | null = null;

  for (const {data} of listed) {
    const sport = str(data.sport);
    if (sport) sportCounts.set(sport, (sportCounts.get(sport) ?? 0) + 1);

    const startMs = millisOf(data.startAt);
    // Evento futuro não conta: organizador novo não pode aparecer "desde" o ano que vem.
    if (startMs != null && startMs <= nowMs && (sinceMs == null || startMs < sinceMs)) sinceMs = startMs;

    const arenaId = strOrNull(data.arenaId);
    const name = str(data.locationName);
    const key = arenaId ? `arena:${arenaId}` : name ? `name:${normalizeVenueKey(name)}` : "";
    if (!key) continue;
    const ms = startMs ?? 0;
    const prev = venues.get(key);
    if (!prev) {
      venues.set(key, {name: name || "Local", arenaId, city: strOrNull(data.city), count: 1, lastMs: ms});
      continue;
    }
    prev.count += 1;
    // O rótulo é o do evento mais recente: a grafia mais nova costuma ser a corrigida.
    if (ms >= prev.lastMs && name) {
      prev.name = name;
      prev.city = strOrNull(data.city) ?? prev.city;
      prev.lastMs = ms;
    }
  }

  const sports = [...sportCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([sport]) => sport);
  const topVenues = [...venues.values()]
    .sort((a, b) => b.count - a.count || b.lastMs - a.lastMs || a.name.localeCompare(b.name))
    .slice(0, ORGANIZER_VENUES_MAX)
    .map(({name, arenaId, city, count}) => ({name, arenaId, city, count}));

  return {
    listedEvents: listed.length,
    eventsCompleted: listed.filter((r) => isRealizedListedTournament(r.data, nowMs)).length,
    openEvents: listed.filter((r) =>
      tournamentListingStatus(r.data) === "open" && !isRealizedListedTournament(r.data, nowMs)).length,
    athletes,
    organizerSince: sinceMs == null ? null : Timestamp.fromMillis(sinceMs),
    sports,
    venues: topVenues,
  };
}

export function isOrganizerListed(isOrganizer: boolean, stats: unknown): boolean {
  const listedEvents = asMap(stats).listedEvents;
  return isOrganizer && typeof listedEvents === "number" && listedEvents > 0;
}

/** Campos que mudam algum número — e os únicos que o recálculo lê (`select`), porque o doc do
 *  torneio carrega chave e categorias inteiras. Placar, `categoryOps` e `liveMatchesNow` ficam de
 *  fora: são a maior parte das escritas em `tournaments` durante o evento. */
export const ORGANIZER_STATS_SOURCE_FIELDS = [
  "managerId", "listingStatus", "status", "visibility", "sport",
  "startAt", "endAt", "locationName", "arenaId", "city",
] as const;

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Timestamp && b instanceof Timestamp) return a.isEqual(b);
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function organizerStatsRelevantChange(before: DocData | null, after: DocData | null): boolean {
  if (!before || !after) return before !== after;
  return ORGANIZER_STATS_SOURCE_FIELDS.some((field) => !sameValue(before[field], after[field]));
}

/** Atletas só mudam quando o conjunto de eventos realizados muda. */
export function touchesRealizedTournament(before: DocData | null, after: DocData | null, nowMs: number): boolean {
  return isRealizedListedTournament(before, nowMs) || isRealizedListedTournament(after, nowMs);
}

export function followerCountDelta(beforeExists: boolean, afterExists: boolean): -1 | 0 | 1 {
  if (!beforeExists && afterExists) return 1;
  if (beforeExists && !afterExists) return -1;
  return 0;
}
