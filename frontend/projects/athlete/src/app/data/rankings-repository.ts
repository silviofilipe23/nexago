import { collection, doc, getDoc, getDocs, query, where, type Firestore } from 'firebase/firestore';

/** Espelha o ranking de pontos por torneio (`artifacts/{projectId}/public/data/athleteRankings`
 *  e `.../teamRankings`, agregados a partir de `tournamentCategoryResults`) — é o ranking que a
 *  tela "Ranking" do app mostra; NÃO é o rating Glicko-2 (`ratingLadders`) nem o Sand Rank (XP). */

function artifactsBase(projectId: string): ['artifacts', string, 'public', 'data'] {
  return ['artifacts', projectId, 'public', 'data'];
}

export interface AthleteRankingAggregate {
  id: string;
  totalPoints: number;
  tournamentsCount: number;
}

export interface TeamRankingAggregate {
  id: string;
  totalPoints: number;
  tournamentsCount: number;
}

function aggregateFromDoc(id: string, data: Record<string, unknown>): { totalPoints: number; tournamentsCount: number } {
  return {
    totalPoints: typeof data['totalPoints'] === 'number' ? data['totalPoints'] : 0,
    tournamentsCount: typeof data['tournamentsCount'] === 'number' ? data['tournamentsCount'] : 0,
  };
}

/** Ranking geral (todo o histórico) — espelha `loadAthleteRankingGeneral`: lê a coleção
 *  inteira (sem `where`/`orderBy`) e ordena em memória. Sem paginação — aceitável na escala
 *  atual, mas é o mesmo ponto de atenção que o Flutter já tem. */
export async function fetchAthleteRankingGeneral(db: Firestore, projectId: string): Promise<AthleteRankingAggregate[]> {
  const snap = await getDocs(collection(db, ...artifactsBase(projectId), 'athleteRankings'));
  return snap.docs
    .map((d) => ({ id: d.id, ...aggregateFromDoc(d.id, d.data() as Record<string, unknown>) }))
    .sort((a, b) => b.totalPoints - a.totalPoints);
}

export async function fetchTeamRankingGeneral(db: Firestore, projectId: string): Promise<TeamRankingAggregate[]> {
  const snap = await getDocs(collection(db, ...artifactsBase(projectId), 'teamRankings'));
  return snap.docs
    .map((d) => ({ id: d.id, ...aggregateFromDoc(d.id, d.data() as Record<string, unknown>) }))
    .sort((a, b) => b.totalPoints - a.totalPoints);
}

/** Linha do ranking por esporte (`athleteRankingsBySport`/`teamRankingsBySport`, multiesporte
 *  fase 3a). O id do doc é `{id}_{CODE}` — quem é o atleta/equipe vem do CAMPO. */
export interface RankingBySportRow {
  id: string;
  totalPoints: number;
  tournamentsCount: number;
  pointsByYear: Record<string, number>;
}

export function rankingBySportRowFromDoc(
  docId: string,
  data: Record<string, unknown>,
  idField: 'athleteId' | 'teamId',
  sportCode: string,
): RankingBySportRow {
  const fromField = typeof data[idField] === 'string' ? (data[idField] as string).trim() : '';
  const suffix = `_${sportCode}`;
  const fromDocId = docId.endsWith(suffix) ? docId.slice(0, -suffix.length) : docId;
  const rawByYear = data['pointsByYear'];
  const pointsByYear: Record<string, number> = {};
  if (rawByYear && typeof rawByYear === 'object' && !Array.isArray(rawByYear)) {
    for (const [year, points] of Object.entries(rawByYear as Record<string, unknown>)) {
      if (typeof points === 'number') pointsByYear[year] = points;
    }
  }
  return { id: fromField || fromDocId, ...aggregateFromDoc(docId, data), pointsByYear };
}

/** Geral = total do esporte; temporada = pontos do ano (`pointsByYear`) — beach tennis não
 *  está em `tournamentCategoryResults`, então a temporada por esporte sai daqui. */
export function pointsForPeriod(row: RankingBySportRow, period: 'geral' | 'temporada', year: number): number {
  return period === 'geral' ? row.totalPoints : (row.pointsByYear[String(year)] ?? 0);
}

async function fetchRankingBySport(
  db: Firestore,
  projectId: string,
  collectionName: 'athleteRankingsBySport' | 'teamRankingsBySport',
  idField: 'athleteId' | 'teamId',
  sportCode: string,
): Promise<RankingBySportRow[]> {
  const snap = await getDocs(query(collection(db, ...artifactsBase(projectId), collectionName), where('sport', '==', sportCode)));
  return snap.docs.map((d) => rankingBySportRowFromDoc(d.id, d.data() as Record<string, unknown>, idField, sportCode));
}

/** Ranking de atletas de UM esporte (código de perfil, ex.: `BEACH_TENNIS`). Ordena quem chama. */
export function fetchAthleteRankingBySport(db: Firestore, projectId: string, sportCode: string): Promise<RankingBySportRow[]> {
  return fetchRankingBySport(db, projectId, 'athleteRankingsBySport', 'athleteId', sportCode);
}

export function fetchTeamRankingBySport(db: Firestore, projectId: string, sportCode: string): Promise<RankingBySportRow[]> {
  return fetchRankingBySport(db, projectId, 'teamRankingsBySport', 'teamId', sportCode);
}

export interface TournamentCategoryResult {
  tournamentId: string;
  categoryId: string;
  teamId: string;
  finalPlace: number;
  pointsEarned: number;
  year: number;
}

/** Ranking por temporada (`year`) — só equality single-field, sem índice composto. Agrupa por
 *  time (via `teams`) e soma TODOS os resultados do ano, espelhando
 *  `getResultsByYear`/`sumPoints`. */
export async function fetchTournamentCategoryResultsByYear(db: Firestore, projectId: string, year: number): Promise<TournamentCategoryResult[]> {
  const snap = await getDocs(query(collection(db, ...artifactsBase(projectId), 'tournamentCategoryResults'), where('year', '==', year)));
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      tournamentId: typeof data['tournamentId'] === 'string' ? data['tournamentId'] : '',
      categoryId: typeof data['categoryId'] === 'string' ? data['categoryId'] : '',
      teamId: typeof data['teamId'] === 'string' ? data['teamId'] : '',
      finalPlace: typeof data['finalPlace'] === 'number' ? data['finalPlace'] : 0,
      pointsEarned: typeof data['pointsEarned'] === 'number' ? data['pointsEarned'] : 0,
      year: typeof data['year'] === 'number' ? data['year'] : year,
    };
  });
}

/** Soma a pontuação inteira: todo resultado conta, nenhum é descartado. */
export function sumPoints(points: readonly number[]): number {
  return points.reduce((sum, p) => sum + p, 0);
}

export async function fetchTeamRankingFor(db: Firestore, projectId: string, teamId: string): Promise<TeamRankingAggregate | null> {
  const snap = await getDoc(doc(db, ...artifactsBase(projectId), 'teamRankings', teamId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...aggregateFromDoc(snap.id, snap.data() as Record<string, unknown>) };
}

export interface AthleteRankingPosition {
  /** 1-based, derivada da ordenação por `totalPoints`. */
  position: number;
  totalPoints: number;
  tournamentsCount: number;
  totalAthletes: number;
}

/** Posição do atleta no ranking geral. O doc `athleteRankings/{uid}` NÃO guarda posição —
 *  ela só existe como ordem relativa, então é derivada da coleção ordenada (mesma leitura
 *  que a tela "Ranking" faz). Retorna null quando o atleta ainda não pontuou. */
export async function fetchAthleteRankingPosition(
  db: Firestore,
  projectId: string,
  athleteId: string,
): Promise<AthleteRankingPosition | null> {
  const rows = await fetchAthleteRankingGeneral(db, projectId);
  const index = rows.findIndex((row) => row.id === athleteId);
  const row = index >= 0 ? rows[index] : undefined;
  if (!row) return null;
  return {
    position: index + 1,
    totalPoints: row.totalPoints,
    tournamentsCount: row.tournamentsCount,
    totalAthletes: rows.length,
  };
}

export async function fetchAthleteRankingFor(db: Firestore, projectId: string, athleteId: string): Promise<AthleteRankingAggregate | null> {
  const snap = await getDoc(doc(db, ...artifactsBase(projectId), 'athleteRankings', athleteId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...aggregateFromDoc(snap.id, snap.data() as Record<string, unknown>) };
}
