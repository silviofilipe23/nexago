import { Timestamp, collection, doc, getDoc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { organizerFirestore } from './firestore';
import { generateKeywords } from './search-keywords';
import {
  BRACKET_FORMAT_FIRESTORE,
  DISPUTE_TEAM_SIZE,
  SKILL_LEVEL_LABEL,
  type TournamentCategoryDraft,
  type TournamentPaymentMode,
  type TournamentSport,
  categoryGenderComposition,
  defaultCourtsFromCount,
  isTeamDispute,
  suggestCategoryName,
} from './tournament-create.model';

/** Porta fiel de `league_create_draft.dart` + `league_create_mapper.dart` +
 *  `league_stage_tournament_factory.dart` + `organizer_leagues_repository.dart` (publish):
 *  doc `leagues/{id}` + torneios de etapa (`tournaments/{id}` com `leagueId`/`isLeagueStage`)
 *  gravados num único batch, igual ao app. */

export type LeagueCountingStagesMode = 'best4Of6' | 'best3Of5' | 'allStages';
export type LeagueStageStatus = 'defined' | 'pending';

export interface LeagueStageDraft {
  id: string;
  name: string;
  order: number;
  status: LeagueStageStatus;
  isGrandFinal: boolean;
  locationName: string;
  city: string;
  state: string;
  startAt: Date | null;
  endAt: Date | null;
  dateLabel: string;
  tournamentIds: string[];
}

export interface LeagueCreateDraft {
  leagueId: string | null;
  sport: TournamentSport;
  name: string;
  organizationName: string;
  description: string;
  city: string;
  state: string;
  seasonStartAt: Date | null;
  seasonEndAt: Date | null;
  plannedStagesCount: number;
  grandFinalEnabled: boolean;
  categories: TournamentCategoryDraft[];
  defaultPriceCents: number;
  countingStagesMode: LeagueCountingStagesMode;
  rankingTableId: string;
  rankingPointsByPlace: Record<string, number>;
  grandFinalSpots: number;
  wildcardEnabled: boolean;
  wildcardSpots: number;
  stages: LeagueStageDraft[];
}

export function emptyLeagueDraft(): LeagueCreateDraft {
  return {
    leagueId: null,
    sport: 'beachVolleyball',
    name: '',
    organizationName: '',
    description: '',
    city: '',
    state: '',
    seasonStartAt: null,
    seasonEndAt: null,
    plannedStagesCount: 6,
    grandFinalEnabled: true,
    categories: [],
    defaultPriceCents: 22000,
    countingStagesMode: 'best4Of6',
    rankingTableId: 'state_circuit',
    rankingPointsByPlace: {},
    grandFinalSpots: 16,
    wildcardEnabled: false,
    wildcardSpots: 2,
    stages: [],
  };
}

export function emptyStageDraft(order: number): LeagueStageDraft {
  return {
    id: `stage-${order}-${Date.now()}`,
    name: '',
    order,
    status: 'pending',
    isGrandFinal: false,
    locationName: '',
    city: '',
    state: '',
    startAt: null,
    endAt: null,
    dateLabel: '',
    tournamentIds: [],
  };
}

/** Mesmos defaults do app (`defaultLeagueRankingPoints`). */
export const DEFAULT_LEAGUE_RANKING_POINTS: Record<string, number> = {
  '1': 450,
  '2': 280,
  '3': 180,
  '4': 120,
  quarters: 80,
  groups: 40,
};

export const COUNTING_MODE_LABEL: Record<LeagueCountingStagesMode, string> = {
  best4Of6: '4 melhores de 6 etapas',
  best3Of5: '3 melhores de 5 etapas',
  allStages: 'Todas as etapas contam',
};

const COUNTING_MODE_FIRESTORE: Record<LeagueCountingStagesMode, string> = {
  best4Of6: 'best_4_of_6',
  best3Of5: 'best_3_of_5',
  allStages: 'all_stages',
};

function parseCountingMode(raw: unknown): LeagueCountingStagesMode {
  if (raw === 'best_3_of_5') return 'best3Of5';
  if (raw === 'all_stages') return 'allStages';
  return 'best4Of6';
}

const MONTH_YEAR = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

export function formatLeagueSeasonRange(start: Date | null, end: Date | null): string {
  if (!start) return 'Temporada a definir';
  const startFmt = MONTH_YEAR.format(start);
  if (!end) return startFmt;
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) return startFmt;
  return `${startFmt} a ${MONTH_YEAR.format(end)}`;
}

export function effectiveRankingPoints(draft: LeagueCreateDraft): Record<string, number> {
  return Object.keys(draft.rankingPointsByPlace).length > 0 ? draft.rankingPointsByPlace : DEFAULT_LEAGUE_RANKING_POINTS;
}

/** Chaves da tabela de pontos — mesmo contrato lido pela CF `league-ranking.ts`. */
export const LEAGUE_RANKING_POINT_KEYS: readonly string[] = ['1', '2', '3', '4', 'quarters', 'groups'];

export const LEAGUE_RANKING_POINT_LABEL: Record<string, string> = {
  '1': '1º lugar',
  '2': '2º lugar',
  '3': '3º lugar',
  '4': '4º lugar',
  quarters: 'Quartas',
  groups: 'Fase de grupos',
};

/** Mesmo clamp do app (`getPointsForPlaceFromLeagueConfig`): inteiro em 0..999999. */
export function sanitizeRankingPointsValue(raw: unknown): number {
  const value = Math.round(Number(raw));
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, 999999);
}

/** Tabela completa com `key` editado — a primeira edição materializa o padrão no draft. */
export function withRankingPoint(draft: LeagueCreateDraft, key: string, raw: unknown): Record<string, number> {
  return { ...effectiveRankingPoints(draft), [key]: sanitizeRankingPointsValue(raw) };
}

export function isCustomRankingTable(draft: LeagueCreateDraft): boolean {
  const effective = effectiveRankingPoints(draft);
  return LEAGUE_RANKING_POINT_KEYS.some((key) => (effective[key] ?? 0) !== DEFAULT_LEAGUE_RANKING_POINTS[key]);
}

export function reviewRankingSummary(draft: LeagueCreateDraft): string {
  const table = isCustomRankingTable(draft) ? 'tabela personalizada' : 'tabela padrão nexaGO';
  return `${COUNTING_MODE_LABEL[draft.countingStagesMode]} · ${table}`;
}

export function isValidLeagueForPublish(draft: LeagueCreateDraft): boolean {
  return (
    draft.name.trim().length > 0 &&
    draft.city.trim().length > 0 &&
    draft.seasonStartAt != null &&
    draft.seasonEndAt != null &&
    draft.seasonEndAt >= draft.seasonStartAt &&
    draft.categories.length > 0
  );
}

// ── Serialização ──────────────────────────────────────────────────────────────

const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

function formatDateRange(start: Date, end: Date): string {
  const sameDay = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth() && start.getDate() === end.getDate();
  if (sameDay) return SHORT_DATE.format(start);
  return `${SHORT_DATE.format(start)} – ${SHORT_DATE.format(end)}`;
}

/** Categoria de liga — igual à de torneio, mas sem premiação/uniforme (ver `LeagueCreateMapper._categoryToMap`). */
function leagueCategoryToMap(category: TournamentCategoryDraft): Record<string, unknown> {
  const isTeam = isTeamDispute(category.dispute);
  return {
    id: category.id,
    categoryName: category.name.trim() || suggestCategoryName(category),
    // Mesmo contrato do torneio: equipe "livre" grava mixed para leitores legados.
    genderType: isTeam && category.genderFree ? 'mixed' : category.gender,
    disputeType: category.dispute,
    teamSize: DISPUTE_TEAM_SIZE[category.dispute] ?? 2,
    ...(isTeam
      ? {
          genderMode: category.genderFree ? 'free' : 'composition',
          genderComposition: categoryGenderComposition(category),
        }
      : {}),
    ageBand: category.ageBand,
    level: SKILL_LEVEL_LABEL[category.skillLevel],
    minLevel: category.minSkillLevel ? SKILL_LEVEL_LABEL[category.minSkillLevel] : null,
    maxTeams: category.spots,
    spotsTotal: category.spots,
    spotsLeft: category.spots,
    entryFee: category.priceCents / 100,
    entryFeeCents: category.priceCents,
    useDefaultPrice: category.useDefaultPrice,
    bracketFormat: BRACKET_FORMAT_FIRESTORE[category.bracketSystem],
    teamsPerGroup: category.teamsPerGroup,
    qualifiersPerGroup: category.qualifiersPerGroup,
    bestOf: category.bestOf,
    finalBestOf5: category.finalBestOf5,
    maxRegistrationsPerAthlete: category.maxRegistrationsPerAthlete,
    registrationClosed: false,
    isCompleted: false,
    prizes: category.prizes.map((p) => ({
      position: p.position,
      value: (p.valueCents / 100).toFixed(0),
      valueCents: p.valueCents,
      ...(p.label ? { label: p.label } : {}),
    })),
    uniformType: null,
    uniformNameOnShirt: false,
    uniformNumberOnShirt: false,
  };
}

function stageToMap(stage: LeagueStageDraft, opts?: { markDefined?: boolean }): Record<string, unknown> {
  return {
    id: stage.id,
    name: stage.name,
    order: stage.order,
    status: opts?.markDefined ? 'defined' : stage.status,
    isGrandFinal: stage.isGrandFinal,
    locationName: stage.locationName.trim() || null,
    city: stage.city.trim() || null,
    state: stage.state.trim() || null,
    startAt: stage.startAt ? Timestamp.fromDate(stage.startAt) : null,
    endAt: stage.endAt ? Timestamp.fromDate(stage.endAt) : null,
    dateLabel: stage.dateLabel.trim() || null,
    tournamentIds: stage.tournamentIds,
  };
}

function leagueToFirestore(params: {
  draft: LeagueCreateDraft;
  managerId: string;
  publish: boolean;
  isUpdate: boolean;
  stagesWithTournamentIds: LeagueStageDraft[];
}): Record<string, unknown> {
  const { draft, managerId, publish, isUpdate, stagesWithTournamentIds } = params;
  const name = draft.name.trim();
  const listingStatus = publish ? 'open' : 'draft';
  return {
    name,
    sport: draft.sport,
    organizationName: draft.organizationName.trim() || null,
    description: draft.description.trim() || null,
    city: draft.city.trim(),
    state: draft.state.trim() || null,
    seasonLabel: formatLeagueSeasonRange(draft.seasonStartAt, draft.seasonEndAt),
    seasonStartAt: Timestamp.fromDate(draft.seasonStartAt!),
    seasonEndAt: Timestamp.fromDate(draft.seasonEndAt!),
    plannedStagesCount: draft.plannedStagesCount,
    grandFinalEnabled: draft.grandFinalEnabled,
    categories: draft.categories.map(leagueCategoryToMap),
    defaultEntryFeeCents: draft.defaultPriceCents,
    countingStagesMode: COUNTING_MODE_FIRESTORE[draft.countingStagesMode],
    rankingTableId: draft.rankingTableId,
    rankingPointsByPlace: effectiveRankingPoints(draft),
    grandFinalSpots: draft.grandFinalSpots,
    wildcardEnabled: draft.wildcardEnabled,
    wildcardSpots: draft.wildcardEnabled ? draft.wildcardSpots : 0,
    stages: stagesWithTournamentIds.map((s) => stageToMap(s)),
    listingStatus,
    status: listingStatus,
    managerId,
    keywords: generateKeywords([name, draft.organizationName, draft.city, draft.description, ...draft.categories.map((c) => c.name)]),
    wizardStep: 'review',
    updatedAt: serverTimestamp(),
    ...(isUpdate ? {} : { createdAt: serverTimestamp() }),
  };
}

/** Torneio de etapa — espelha `LeagueStageTournamentFactory.build` (campos idênticos). */
function stageTournamentMap(params: { league: LeagueCreateDraft; stage: LeagueStageDraft; managerId: string }): Record<string, unknown> {
  const { league, stage, managerId } = params;
  const categories = league.categories.map(leagueCategoryToMap).map((c) => ({ ...c, prizes: [] }));
  const capacity = league.categories.reduce((sum, c) => sum + c.spots, 0);
  const startAt = stage.startAt ?? league.seasonStartAt ?? new Date();
  const endAt = stage.endAt ?? stage.startAt ?? league.seasonEndAt ?? startAt;
  const name = stage.name.trim() || `${league.name.trim()} · Etapa ${stage.order}`;
  const locationName = stage.locationName.trim();
  const city = stage.city.trim() || league.city.trim();
  const state = stage.state.trim() || league.state.trim();

  return {
    name,
    sport: league.sport,
    description: league.description.trim() || null,
    city,
    state: state || null,
    locationName,
    location: locationName,
    locationAddress: null,
    arenaId: null,
    startAt: Timestamp.fromDate(startAt),
    endAt: Timestamp.fromDate(endAt),
    dateLabel: stage.dateLabel.trim() || formatDateRange(startAt, endAt),
    courtsCount: 4,
    courts: defaultCourtsFromCount(4),
    format: 'dupla',
    capacity: capacity > 0 ? capacity : 16,
    enrolledCount: 0,
    collectedCents: 0,
    listingStatus: 'open',
    status: 'open',
    visibility: 'publicListing',
    featured: false,
    liveMatchesNow: 0,
    managerId,
    categories,
    defaultEntryFeeCents: league.defaultPriceCents,
    registrationOpensAt: null,
    registrationClosesAt: null,
    paymentMode: 'appPixCard',
    waitlistEnabled: true,
    inviteConfirmEnabled: false,
    cashPrizesEnabled: false,
    rankingEnabled: true,
    rankingTableId: league.rankingTableId,
    leagueId: league.leagueId ?? '',
    leagueStageId: stage.id,
    leagueStageOrder: stage.order,
    leagueStageName: stage.name,
    isLeagueStage: true,
    isGrandFinalStage: stage.isGrandFinal,
    keywords: generateKeywords([name, league.name, locationName, city, ...league.categories.map((c) => c.name)]),
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };
}

// ── Publicação (batch liga + torneios de etapa, igual `publishLeague` do app) ─

export async function publishLeague(params: { draft: LeagueCreateDraft; managerId: string }): Promise<string> {
  const { draft, managerId } = params;
  if (!isValidLeagueForPublish(draft)) throw new Error('Dados da liga incompletos.');
  const definedStages = draft.stages.filter((s) => s.status === 'defined');
  if (definedStages.length === 0) throw new Error('Defina ao menos uma etapa antes de publicar o circuito.');

  const db = organizerFirestore();
  const isUpdate = !!draft.leagueId?.trim();
  const leagueRef = isUpdate ? doc(db, 'leagues', draft.leagueId!.trim()) : doc(collection(db, 'leagues'));
  const leagueId = leagueRef.id;

  const stageTournamentIds = new Map<string, string>();
  for (const stage of definedStages) stageTournamentIds.set(stage.id, doc(collection(db, 'tournaments')).id);

  const stagesWithIds = draft.stages.map((stage) => {
    const tournamentId = stageTournamentIds.get(stage.id);
    return tournamentId ? { ...stage, tournamentIds: [tournamentId] } : stage;
  });

  const leagueDraft: LeagueCreateDraft = { ...draft, leagueId, stages: stagesWithIds };

  const batch = writeBatch(db);
  batch.set(leagueRef, leagueToFirestore({ draft: leagueDraft, managerId, publish: true, isUpdate, stagesWithTournamentIds: stagesWithIds }), { merge: isUpdate });

  for (const stage of definedStages) {
    const tournamentId = stageTournamentIds.get(stage.id)!;
    const stageWithId = stagesWithIds.find((s) => s.id === stage.id)!;
    batch.set(doc(db, 'tournaments', tournamentId), stageTournamentMap({ league: leagueDraft, stage: stageWithId, managerId }));
  }

  await batch.commit();
  return leagueId;
}

// ── Leitura pra edição / adicionar etapa ──────────────────────────────────────

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function ts(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
}

export function stageFromMap(map: Record<string, unknown>): LeagueStageDraft | null {
  const id = str(map['id']);
  if (!id) return null;
  return {
    id,
    name: str(map['name']),
    order: num(map['order']) ?? 1,
    status: map['status'] === 'defined' ? 'defined' : 'pending',
    isGrandFinal: map['isGrandFinal'] === true,
    locationName: str(map['locationName']),
    city: str(map['city']),
    state: str(map['state']),
    startAt: ts(map['startAt']),
    endAt: ts(map['endAt']),
    dateLabel: str(map['dateLabel']),
    tournamentIds: Array.isArray(map['tournamentIds']) ? map['tournamentIds'].filter((x): x is string => typeof x === 'string') : [],
  };
}

export interface PublishedLeagueForStageAdd {
  leagueId: string;
  leagueName: string;
  sport: TournamentSport;
  city: string;
  state: string;
  defaultPriceCents: number;
  rankingTableId: string;
  paymentMode: TournamentPaymentMode;
  categoriesRaw: Array<Record<string, unknown>>;
  existingStages: LeagueStageDraft[];
}

export async function getPublishedLeagueForStageAdd(leagueId: string, uid: string): Promise<PublishedLeagueForStageAdd> {
  const db = organizerFirestore();
  const snap = await getDoc(doc(db, 'leagues', leagueId.trim()));
  if (!snap.exists()) throw new Error('Liga não encontrada.');
  const data = snap.data() as Record<string, unknown>;
  if (str(data['managerId']) !== uid) throw new Error('Sem permissão para gerenciar esta liga.');
  if (str(data['listingStatus']) !== 'open') throw new Error('A liga precisa estar publicada para adicionar etapas.');

  const stagesRaw = data['stages'];
  const existingStages = Array.isArray(stagesRaw)
    ? stagesRaw
        .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
        .map(stageFromMap)
        .filter((s): s is LeagueStageDraft => s != null)
    : [];

  return {
    leagueId: snap.id,
    leagueName: str(data['name']) || 'Liga',
    sport: (data['sport'] === 'indoorVolleyball' || data['sport'] === 'footvolley' ? data['sport'] : 'beachVolleyball') as TournamentSport,
    city: str(data['city']),
    state: str(data['state']),
    defaultPriceCents: num(data['defaultEntryFeeCents']) ?? 22000,
    rankingTableId: str(data['rankingTableId']) || 'state_circuit',
    paymentMode: (data['paymentMode'] === 'directWithOrganizer' ? 'directWithOrganizer' : 'appPixCard') as TournamentPaymentMode,
    categoriesRaw: Array.isArray(data['categories']) ? data['categories'].filter((x): x is Record<string, unknown> => x != null && typeof x === 'object') : [],
    existingStages,
  };
}

/** Nova etapa pós-publish (espelha `saveStage`): grava o torneio da etapa + merge no
 *  `stages[]` da liga num batch. As categorias herdam as da liga (categoriesRaw). */
export async function saveLeagueStage(params: {
  league: PublishedLeagueForStageAdd;
  stage: LeagueStageDraft;
  managerId: string;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  courtsCount: number;
}): Promise<string> {
  const { league, stage, managerId } = params;
  const db = organizerFirestore();
  const tournamentId = doc(collection(db, 'tournaments')).id;
  const definedStage: LeagueStageDraft = { ...stage, status: 'defined', tournamentIds: [tournamentId] };

  const startAt = definedStage.startAt ?? new Date();
  const endAt = definedStage.endAt ?? startAt;
  const name = definedStage.name.trim() || `${league.leagueName.trim()} · Etapa ${definedStage.order}`;
  const city = definedStage.city.trim() || league.city;
  const state = definedStage.state.trim() || league.state;
  const locationName = definedStage.locationName.trim();

  const categories: Array<Record<string, unknown>> = league.categoriesRaw.map((c) => ({
    ...c,
    spotsLeft: c['maxTeams'] ?? c['spotsTotal'] ?? 16,
    registrationClosed: false,
    isCompleted: false,
    prizes: [],
  }));
  const capacity = categories.reduce((sum, c) => sum + (typeof c['maxTeams'] === 'number' ? (c['maxTeams'] as number) : 16), 0);

  const tournamentDoc: Record<string, unknown> = {
    name,
    sport: league.sport,
    description: null,
    city,
    state: state || null,
    locationName,
    location: locationName,
    locationAddress: null,
    arenaId: null,
    startAt: Timestamp.fromDate(startAt),
    endAt: Timestamp.fromDate(endAt),
    dateLabel: definedStage.dateLabel.trim() || formatDateRange(startAt, endAt),
    courtsCount: params.courtsCount,
    courts: defaultCourtsFromCount(params.courtsCount),
    format: 'dupla',
    capacity: capacity > 0 ? capacity : 16,
    enrolledCount: 0,
    collectedCents: 0,
    listingStatus: 'open',
    status: 'open',
    visibility: 'publicListing',
    featured: false,
    liveMatchesNow: 0,
    managerId,
    categories,
    defaultEntryFeeCents: league.defaultPriceCents,
    registrationOpensAt: params.registrationOpensAt ? Timestamp.fromDate(params.registrationOpensAt) : null,
    registrationClosesAt: params.registrationClosesAt ? Timestamp.fromDate(params.registrationClosesAt) : null,
    paymentMode: league.paymentMode,
    waitlistEnabled: true,
    inviteConfirmEnabled: false,
    cashPrizesEnabled: false,
    rankingEnabled: true,
    rankingTableId: league.rankingTableId,
    leagueId: league.leagueId,
    leagueStageId: definedStage.id,
    leagueStageOrder: definedStage.order,
    leagueStageName: definedStage.name,
    isLeagueStage: true,
    isGrandFinalStage: definedStage.isGrandFinal,
    keywords: generateKeywords([name, league.leagueName, locationName, city]),
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };

  const mergedStages = (() => {
    let found = false;
    const merged = league.existingStages.map((s) => {
      if (s.id === definedStage.id) {
        found = true;
        return stageToMap(definedStage, { markDefined: true });
      }
      return stageToMap(s);
    });
    if (!found) {
      merged.push(stageToMap(definedStage, { markDefined: true }));
      merged.sort((a, b) => ((a['order'] as number) ?? 0) - ((b['order'] as number) ?? 0));
    }
    return merged;
  })();

  const batch = writeBatch(db);
  batch.set(doc(db, 'tournaments', tournamentId), tournamentDoc);
  batch.update(doc(db, 'leagues', league.leagueId), { stages: mergedStages, updatedAt: serverTimestamp() });
  await batch.commit();
  return tournamentId;
}

export async function updateLeagueListingStatus(leagueId: string, listingStatus: 'closed' | 'cancelled'): Promise<void> {
  const db = organizerFirestore();
  await updateDoc(doc(db, 'leagues', leagueId.trim()), { listingStatus, status: listingStatus, updatedAt: serverTimestamp() });
}
