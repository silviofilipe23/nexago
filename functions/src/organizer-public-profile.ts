import {Timestamp} from "firebase-admin/firestore";
import {normalizePhoneForWhatsApp} from "./tournament-cancellation-request";

/**
 * Perfil público do organizador (`organizerPublicProfiles/{uid}`): projeções puras usadas pelos
 * gatilhos e pelo backfill. Spec: docs/superpowers/specs/2026-10-02-organizer-public-profile-design.md
 */

export const ORGANIZER_PUBLIC_PROFILES_COLLECTION = "organizerPublicProfiles";
export const ORGANIZER_FOLLOWERS_SUBCOLLECTION = "followers";
export const ORGANIZER_FOLLOWER_PUSHES_COLLECTION = "organizerFollowerPushes";
export const ORGANIZER_BIO_MAX = 280;
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

export function userHasOrganizerRole(user: DocData | null | undefined): boolean {
  const roles = user?.roles;
  return Array.isArray(roles) &&
    roles.some((r) => typeof r === "string" && r.trim().toLowerCase() === "organizer");
}

/** Só o que é exibível. `contactEmail` e o telefone sem opt-in nunca saem de `users`. */
export function buildOrganizerIdentity(user: DocData): OrganizerIdentity {
  const profile = asMap(user.organizerProfile);
  const name = str(profile.orgName) || str(user.displayName) || str(user.fullName) ||
    str(user.name) || "Organizador";
  const bio = str(profile.bio);
  const phone = str(profile.contactPhone);
  const whatsapp = profile.publicWhatsapp === true && phone ? normalizePhoneForWhatsApp(phone) : "";
  const state = str(profile.state).toUpperCase();
  return {
    name,
    logoUrl: strOrNull(profile.logoUrl),
    coverUrl: strOrNull(profile.coverUrl),
    bio: bio ? bio.slice(0, ORGANIZER_BIO_MAX) : null,
    city: strOrNull(profile.city),
    state: state.length > 0 ? state : null,
    // DDI 55 + DDD + 8/9 dígitos. Menos que isso não abre conversa no wa.me.
    whatsapp: whatsapp.length >= 12 ? whatsapp : null,
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

export function isCompletedListedTournament(t: DocData | null | undefined): boolean {
  return isListedTournament(t) && tournamentListingStatus(t) === "completed";
}

export function completedListedTournamentIds(rows: ReadonlyArray<TournamentRow>): string[] {
  return rows.filter((r) => isCompletedListedTournament(r.data)).map((r) => r.id).sort();
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

/** Números do perfil. Nada aqui depende do relógio: só mudam quando um torneio muda. */
export function computeOrganizerStats(rows: ReadonlyArray<TournamentRow>, athletes: number): OrganizerStats {
  const listed = rows.filter((r) => isListedTournament(r.data));
  const sportCounts = new Map<string, number>();
  const venues = new Map<string, VenueAcc>();
  let sinceMs: number | null = null;

  for (const {data} of listed) {
    const sport = str(data.sport);
    if (sport) sportCounts.set(sport, (sportCounts.get(sport) ?? 0) + 1);

    const startMs = millisOf(data.startAt);
    if (startMs != null && (sinceMs == null || startMs < sinceMs)) sinceMs = startMs;

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
    eventsCompleted: listed.filter((r) => tournamentListingStatus(r.data) === "completed").length,
    openEvents: listed.filter((r) => tournamentListingStatus(r.data) === "open").length,
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

/** Campos que mudam algum número. Placar, `categoryOps` e `liveMatchesNow` ficam de fora: são a
 *  maior parte das escritas em `tournaments` durante o evento. */
const STATS_FIELDS = [
  "managerId", "listingStatus", "status", "visibility", "sport",
  "startAt", "locationName", "arenaId", "city",
] as const;

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Timestamp && b instanceof Timestamp) return a.isEqual(b);
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function organizerStatsRelevantChange(before: DocData | null, after: DocData | null): boolean {
  if (!before || !after) return before !== after;
  return STATS_FIELDS.some((field) => !sameValue(before[field], after[field]));
}

/** Atletas só mudam quando o conjunto de eventos realizados muda. */
export function touchesCompletedTournament(before: DocData | null, after: DocData | null): boolean {
  return isCompletedListedTournament(before) || isCompletedListedTournament(after);
}

export function followerCountDelta(beforeExists: boolean, afterExists: boolean): -1 | 0 | 1 {
  if (!beforeExists && afterExists) return 1;
  if (beforeExists && !afterExists) return -1;
  return 0;
}
