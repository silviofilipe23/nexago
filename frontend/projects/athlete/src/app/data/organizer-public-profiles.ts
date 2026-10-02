/**
 * Perfil público do organizador — leitura pura dos docs que o servidor mantém.
 * Spec: docs/superpowers/specs/2026-10-02-organizer-public-profile-design.md
 *
 * Só o portal do atleta lê isto, e só as telas de `/organizadores` importam este módulo: nada
 * daqui pode entrar no `TournamentLiveStore`, que mora na carga inicial (orçamento de 1 MB).
 */
import type { AthletePublicProfile } from './public-profiles-repository';
import { teamMemberIds, type ArenaTeam } from './teams-repository';
import { isPubliclyListedTournamentDoc, tournamentSummaryFromDoc, type TournamentSummary } from './tournaments-repository';
import {
  TOURNAMENT_REVIEW_ASPECTS,
  organizerReputationFromData,
  type OrganizerReputation,
  type TournamentReviewAspectKey,
} from './tournament-reviews';

export const ORGANIZER_PUBLIC_PROFILES = 'organizerPublicProfiles';
export const ORGANIZER_FOLLOWERS = 'followers';

export interface OrganizerVenue {
  readonly name: string;
  readonly arenaId: string | null;
  readonly city: string | null;
  readonly count: number;
}

export interface OrganizerStats {
  readonly listedEvents: number;
  readonly eventsCompleted: number;
  readonly openEvents: number;
  readonly athletes: number;
  readonly organizerSince: Date | null;
  /** Códigos de `tournaments.sport`, do mais frequente ao menos frequente. */
  readonly sports: readonly string[];
  readonly venues: readonly OrganizerVenue[];
}

/** `organizerPublicProfiles/{uid}` — leitura pública, escrita só por Cloud Function. */
export interface OrganizerPublicProfile {
  readonly uid: string;
  readonly name: string;
  readonly logoUrl: string | null;
  readonly coverUrl: string | null;
  readonly bio: string | null;
  readonly city: string | null;
  readonly state: string | null;
  /** Só dígitos (DDI 55 + DDD + número). `null` = sem botão "Mensagem". */
  readonly whatsapp: string | null;
  readonly isOrganizer: boolean;
  readonly verified: boolean;
  readonly listed: boolean;
  readonly followersCount: number;
  readonly stats: OrganizerStats;
}

export type StarDistribution = Readonly<Record<1 | 2 | 3 | 4 | 5, number>>;

/** `organizerReputation/{uid}` com o que a aba Avaliações precisa além da média. */
export interface OrganizerReputationDetail extends OrganizerReputation {
  /** `null` abaixo de 3 avaliações (o servidor não publica). */
  readonly distribution: StarDistribution | null;
  /** Média de cada aspecto que recebeu nota. */
  readonly aspects: Partial<Record<TournamentReviewAspectKey, number>>;
}

/** `tournamentReviewSummaries/{tid}`, só o que a nota por evento usa. */
export interface OrganizerReviewSummaryRow {
  readonly tournamentId: string;
  readonly tournamentName: string;
  readonly tournamentStartAt: Date | null;
  readonly status: string;
  readonly count: number;
  readonly average: number | null;
}

export interface OrganizerChampion {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly teamId: string;
}

export type OrganizerEventStatus = 'open' | 'closed' | 'completed';

/** Torneio "listado" do organizador (definição da spec), com os campeões gravados. */
export interface OrganizerEvent {
  readonly summary: TournamentSummary;
  readonly listingStatus: OrganizerEventStatus;
  readonly champions: readonly OrganizerChampion[];
}

type Data = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function textOrNull(value: unknown): string | null {
  return text(value) || null;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function decimal(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function dateOf(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const t = value as { toDate?: () => Date } | null | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
}

function mapOf(value: unknown): Data {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? (value as Data) : {};
}

function venueOf(raw: unknown): OrganizerVenue | null {
  const o = mapOf(raw);
  const name = text(o['name']);
  if (!name) return null;
  return { name, arenaId: textOrNull(o['arenaId']), city: textOrNull(o['city']), count: count(o['count']) };
}

export function organizerPublicProfileFromDoc(id: string, data: Data): OrganizerPublicProfile {
  const stats = mapOf(data['stats']);
  const whatsapp = text(data['whatsapp']);
  return {
    uid: id,
    name: text(data['name']) || 'Organizador',
    logoUrl: textOrNull(data['logoUrl']),
    coverUrl: textOrNull(data['coverUrl']),
    bio: textOrNull(data['bio']),
    city: textOrNull(data['city']),
    state: textOrNull(data['state']),
    // O link é `https://wa.me/{whatsapp}`: só dígitos passam, o resto vira "sem botão".
    whatsapp: /^\d{10,15}$/.test(whatsapp) ? whatsapp : null,
    isOrganizer: data['isOrganizer'] === true,
    verified: data['verified'] === true,
    listed: data['listed'] === true,
    followersCount: count(data['followersCount']),
    stats: {
      listedEvents: count(stats['listedEvents']),
      eventsCompleted: count(stats['eventsCompleted']),
      openEvents: count(stats['openEvents']),
      athletes: count(stats['athletes']),
      organizerSince: dateOf(stats['organizerSince']),
      sports: Array.isArray(stats['sports']) ? stats['sports'].map(text).filter((s) => s.length > 0) : [],
      venues: Array.isArray(stats['venues']) ? stats['venues'].map(venueOf).filter((v): v is OrganizerVenue => v != null) : [],
    },
  };
}

/** O doc pode existir sem identidade: o gatilho de números cria `{uid, stats, listed: false}`
 *  para qualquer `managerId`, e o contador de seguidores cria `{followersCount}` por merge. Só
 *  `isOrganizer === true` (que garante o `name`) vira página; o resto é "não encontrado". */
export function organizerProfileIsPublic(profile: OrganizerPublicProfile | null): profile is OrganizerPublicProfile {
  return profile != null && profile.isOrganizer;
}

const ASPECT_KEYS: readonly string[] = TOURNAMENT_REVIEW_ASPECTS.map((a) => a.key);

export function organizerReputationDetailFromData(data: Data | undefined): OrganizerReputationDetail | null {
  const base = organizerReputationFromData(data);
  if (!base || !data) return null;
  const aspects: Partial<Record<TournamentReviewAspectKey, number>> = {};
  for (const [key, value] of Object.entries(mapOf(data['aspects']))) {
    const average = decimal(mapOf(value)['average']);
    if (ASPECT_KEYS.includes(key) && average != null) aspects[key as TournamentReviewAspectKey] = average;
  }
  const rawDistribution = data['distribution'];
  const d = mapOf(rawDistribution);
  const distribution: StarDistribution | null =
    rawDistribution == null ? null : { 1: count(d['1']), 2: count(d['2']), 3: count(d['3']), 4: count(d['4']), 5: count(d['5']) };
  return { ...base, distribution, aspects };
}

export function organizerReviewSummaryFromDoc(id: string, data: Data): OrganizerReviewSummaryRow {
  return {
    tournamentId: text(data['tournamentId']) || id,
    tournamentName: text(data['tournamentName']),
    tournamentStartAt: dateOf(data['tournamentStartAt']),
    status: text(data['status']),
    count: count(data['count']),
    average: decimal(data['average']),
  };
}

/** Campeões em `categoryOps.{categoryId}.championTeamId`, na ordem das categorias do doc — a
 *  "primeira categoria" do histórico é a primeira que o organizador cadastrou. Campeão de
 *  categoria que não está mais na lista vai pro fim, com o id no lugar do nome. */
export function championsFromDoc(data: Data): OrganizerChampion[] {
  const ops = mapOf(data['categoryOps']);
  const categories = Array.isArray(data['categories']) ? data['categories'].map(mapOf) : [];
  const order = new Map<string, { index: number; name: string }>();
  categories.forEach((c, index) => {
    const id = text(c['id']) || text(c['categoryId']) || text(c['categoryName']) || text(c['name']);
    if (id && !order.has(id)) order.set(id, { index, name: text(c['categoryName']) || text(c['name']) || id });
  });

  return Object.entries(ops)
    .map(([categoryId, raw]) => ({ categoryId, teamId: text(mapOf(raw)['championTeamId']) }))
    .filter((c) => c.teamId.length > 0)
    .map((c) => ({ ...c, categoryName: order.get(c.categoryId)?.name ?? c.categoryId, index: order.get(c.categoryId)?.index ?? Infinity }))
    .sort((a, b) => a.index - b.index || a.categoryId.localeCompare(b.categoryId))
    .map(({ categoryId, categoryName, teamId }) => ({ categoryId, categoryName, teamId }));
}

const LISTED_STATUSES: readonly OrganizerEventStatus[] = ['open', 'closed', 'completed'];

/** "Evento listado" da spec: `listingStatus` em `open | closed | completed` e não "por link".
 *  O resto (rascunho, cancelado, legado sem status) não entra em nada do perfil. */
export function organizerEventFromDoc(id: string, data: Data): OrganizerEvent | null {
  const status = (text(data['listingStatus']) || text(data['status'])).toLowerCase() as OrganizerEventStatus;
  if (!LISTED_STATUSES.includes(status) || !isPubliclyListedTournamentDoc(data)) return null;
  return { summary: tournamentSummaryFromDoc(id, data), listingStatus: status, champions: championsFromDoc(data) };
}

/** Nome da equipe campeã: o nome dado à equipe, ou os primeiros nomes do elenco ("Ana / Bia",
 *  mesma forma de `duoNameOf`; trio vira "Ana / Bia / Cris"). `null` sem nenhum dos dois. */
export function teamDisplayName(
  team: Pick<ArenaTeam, 'teamName' | 'player1Id' | 'player2Id' | 'memberUids'>,
  profiles: ReadonlyMap<string, Pick<AthletePublicProfile, 'displayName'>>,
): string | null {
  if (team.teamName) return team.teamName;
  const names = teamMemberIds(team)
    .map((uid) => profiles.get(uid)?.displayName?.trim().split(/\s+/)[0] ?? '')
    .filter((name) => name.length > 0);
  return names.length > 0 ? names.join(' / ') : null;
}

/** Doc de seguidor: id = meu uid, e exatamente as chaves que a rule aceita (o `followedAt`
 *  entra como `serverTimestamp()` no repositório). `null` em auto-follow ou id vazio. */
export function organizerFollowWrite(
  viewerUid: string,
  organizerId: string,
): { path: readonly [string, string, string, string]; data: { userId: string; organizerId: string } } | null {
  const viewer = viewerUid.trim();
  const organizer = organizerId.trim();
  if (!viewer || !organizer || viewer === organizer) return null;
  return {
    path: [ORGANIZER_PUBLIC_PROFILES, organizer, ORGANIZER_FOLLOWERS, viewer],
    data: { userId: viewer, organizerId: organizer },
  };
}
