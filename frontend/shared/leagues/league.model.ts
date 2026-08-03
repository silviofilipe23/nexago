/** Modelo de `leagues/{id}` (top-level, leitura pública) compartilhado entre os portais.
 *
 *  Fonte da verdade das escritas é o Flutter (`league_create_mapper.dart` +
 *  `league_stage_tournament_factory.dart`) e o wizard do organizador web
 *  (`league-create.model.ts`), que gravam os mesmos campos. Etapas ficam embutidas no array
 *  `stages` do próprio doc e referenciam torneios reais por `tournamentIds` — não existe
 *  "status da etapa" confiável no Firestore (o campo `status` é do rascunho do wizard), então
 *  o status operacional é derivado do torneio referenciado. */

export type LeagueListingStatus = 'draft' | 'open' | 'closed' | 'cancelled';

export type LeagueCountingStagesMode = 'best_4_of_6' | 'best_3_of_5' | 'all_stages';

/** Gênero da categoria normalizado (`genderType` grava 'male' | 'female' | 'mixed'). */
export type LeagueGenderCat = 'M' | 'F' | 'Mix';

export interface LeagueStage {
  id: string;
  name: string;
  order: number;
  locationName: string | null;
  city: string | null;
  state: string | null;
  startAt: Date | null;
  endAt: Date | null;
  dateLabel: string | null;
  isGrandFinal: boolean;
  tournamentIds: string[];
  /** Primeiro torneio da etapa — hoje o app e o portal gravam sempre no máximo 1. */
  tournamentId: string | null;
}

export interface LeagueCategory {
  id: string;
  categoryName: string;
  genderType: LeagueGenderCat;
}

export interface League {
  id: string;
  name: string;
  managerId: string | null;
  /** Valor cru de `sport` (`beachVolleyball` | `indoorVolleyball` | `footvolley`). */
  sport: string | null;
  sportLabel: string;
  seasonLabel: string | null;
  city: string | null;
  state: string | null;
  organizationName: string | null;
  description: string | null;
  /** Capa da liga (`coverUrl`/`imageUrl`) — nula quando não enviada. */
  coverUrl: string | null;
  listingStatus: LeagueListingStatus;
  seasonStartAt: Date | null;
  seasonEndAt: Date | null;
  plannedStagesCount: number | null;
  grandFinalEnabled: boolean;
  grandFinalSpots: number;
  countingStagesMode: LeagueCountingStagesMode;
  stages: LeagueStage[];
  categories: LeagueCategory[];
  updatedAt: Date | null;
}

/** Mesmos rótulos de `tournaments-repository.ts` — ligas gravam `sport` com os valores de
 *  `TournamentSport` (`league_create_mapper.dart`: `'sport': draft.sport.name`). */
const SPORT_LABELS: Record<string, string> = {
  beachVolleyball: 'Vôlei de praia',
  indoorVolleyball: 'Vôlei de quadra',
  footvolley: 'Futevôlei',
};

export const LEAGUE_STATUS_LABEL: Record<LeagueListingStatus, string> = {
  draft: 'Rascunho',
  open: 'Publicada',
  closed: 'Temporada encerrada',
  cancelled: 'Cancelada',
};

export const LEAGUE_COUNTING_MODE_LABEL: Record<LeagueCountingStagesMode, string> = {
  best_4_of_6: '4 melhores de 6 etapas',
  best_3_of_5: '3 melhores de 5 etapas',
  all_stages: 'Todas as etapas contam',
};

export function leagueSportLabel(raw: unknown): string {
  const v = optionalStr(raw);
  if (!v) return 'Esporte';
  return SPORT_LABELS[v] ?? v;
}

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  if (typeof t?.toDate === 'function') return t.toDate();
  if (typeof v === 'string') {
    const parsed = new Date(v);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/** Normaliza `listingStatus`/`status`. Docs antigos podem trazer só um dos dois, e rascunhos
 *  do wizard em português ('rascunho') — mesma tolerância do `_isDraftDocument` do Flutter. */
export function leagueListingStatusOf(data: Record<string, unknown>): LeagueListingStatus {
  const raw = (optionalStr(data['listingStatus']) ?? optionalStr(data['status']) ?? '').toLowerCase();
  if (raw === 'open' || raw === 'closed' || raw === 'cancelled') return raw;
  if (raw === 'canceled' || raw.includes('cancel')) return 'cancelled';
  if (raw === 'closed' || raw.includes('encerr')) return 'closed';
  return 'draft';
}

function genderCatOf(raw: unknown): LeagueGenderCat {
  const v = optionalStr(raw)?.toLowerCase() ?? '';
  if (v.includes('fem') || v === 'f') return 'F';
  if (v.includes('mist') || v.includes('mix')) return 'Mix';
  return 'M';
}

function stageFromRaw(raw: unknown): LeagueStage | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = optionalStr(o['id']);
  if (!id) return null;
  const tournamentIds = Array.isArray(o['tournamentIds'])
    ? o['tournamentIds'].filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
  return {
    id,
    name: optionalStr(o['name']) ?? id,
    order: typeof o['order'] === 'number' ? o['order'] : 0,
    locationName: optionalStr(o['locationName']),
    city: optionalStr(o['city']),
    state: optionalStr(o['state']),
    startAt: toDate(o['startAt']),
    endAt: toDate(o['endAt']),
    dateLabel: optionalStr(o['dateLabel']),
    isGrandFinal: o['isGrandFinal'] === true,
    tournamentIds,
    tournamentId: tournamentIds[0] ?? null,
  };
}

function categoryFromRaw(raw: unknown): LeagueCategory | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = optionalStr(o['categoryId']) ?? optionalStr(o['id']) ?? optionalStr(o['categoryName']) ?? optionalStr(o['name']);
  if (!id) return null;
  return {
    id,
    categoryName: optionalStr(o['categoryName']) ?? optionalStr(o['name']) ?? id,
    genderType: genderCatOf(o['genderType']),
  };
}

export function leagueFromDoc(id: string, data: Record<string, unknown>): League {
  const countingMode = optionalStr(data['countingStagesMode']);
  const stages = Array.isArray(data['stages'])
    ? data['stages'].map(stageFromRaw).filter((s): s is LeagueStage => s != null)
    : [];
  return {
    id,
    name: optionalStr(data['name']) ?? 'Liga',
    managerId: optionalStr(data['managerId']),
    sport: optionalStr(data['sport']),
    sportLabel: leagueSportLabel(data['sport']),
    seasonLabel: optionalStr(data['seasonLabel']) ?? optionalStr(data['season']),
    city: optionalStr(data['city']),
    state: optionalStr(data['state']),
    organizationName: optionalStr(data['organizationName']),
    description: optionalStr(data['description']),
    // Mesmo fallback do app (`league_document_mapper.dart`): coverUrl ?? imageUrl.
    coverUrl: optionalStr(data['coverUrl']) ?? optionalStr(data['imageUrl']),
    listingStatus: leagueListingStatusOf(data),
    seasonStartAt: toDate(data['seasonStartAt']),
    seasonEndAt: toDate(data['seasonEndAt']),
    plannedStagesCount: typeof data['plannedStagesCount'] === 'number' ? data['plannedStagesCount'] : null,
    grandFinalEnabled: data['grandFinalEnabled'] === true,
    grandFinalSpots: typeof data['grandFinalSpots'] === 'number' ? data['grandFinalSpots'] : 16,
    countingStagesMode: countingMode === 'best_3_of_5' || countingMode === 'all_stages' ? countingMode : 'best_4_of_6',
    stages: [...stages].sort((a, b) => a.order - b.order),
    categories: Array.isArray(data['categories'])
      ? data['categories'].map(categoryFromRaw).filter((c): c is LeagueCategory => c != null)
      : [],
    updatedAt: toDate(data['updatedAt']),
  };
}

/** Etapas que já têm torneio publicado — as demais são só planejadas no doc da liga. */
export function leagueDefinedStages(league: League): LeagueStage[] {
  return league.stages.filter((s) => s.tournamentId != null);
}

/** Categorias visíveis para um gênero (usado nos chips do ranking). */
export function leagueCategoriesForGender(categories: readonly LeagueCategory[], gender: LeagueGenderCat | null): LeagueCategory[] {
  if (!gender) return [...categories];
  return categories.filter((c) => c.genderType === gender);
}

/** Gêneros presentes nas categorias da liga, na ordem M → F → Mix. */
export function leagueGendersOf(categories: readonly LeagueCategory[]): LeagueGenderCat[] {
  const order: LeagueGenderCat[] = ['M', 'F', 'Mix'];
  return order.filter((g) => categories.some((c) => c.genderType === g));
}
