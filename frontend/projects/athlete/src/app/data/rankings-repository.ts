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

export interface TournamentCategoryResult {
  tournamentId: string;
  categoryId: string;
  teamId: string;
  finalPlace: number;
  pointsEarned: number;
  year: number;
}

const BEST_N_RESULTS = 5;

/** Ranking por temporada (`year`) — só equality single-field, sem índice composto. Agrupa por
 *  time (via `teams`) e soma os {@link BEST_N_RESULTS} melhores resultados, espelhando
 *  `getResultsByYear`/`sumBestNPoints`. */
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

export function sumBestNPoints(points: readonly number[], n = BEST_N_RESULTS): number {
  return [...points]
    .sort((a, b) => b - a)
    .slice(0, n)
    .reduce((sum, p) => sum + p, 0);
}

export async function fetchTeamRankingFor(db: Firestore, projectId: string, teamId: string): Promise<TeamRankingAggregate | null> {
  const snap = await getDoc(doc(db, ...artifactsBase(projectId), 'teamRankings', teamId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...aggregateFromDoc(snap.id, snap.data() as Record<string, unknown>) };
}

export async function fetchAthleteRankingFor(db: Firestore, projectId: string, athleteId: string): Promise<AthleteRankingAggregate | null> {
  const snap = await getDoc(doc(db, ...artifactsBase(projectId), 'athleteRankings', athleteId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...aggregateFromDoc(snap.id, snap.data() as Record<string, unknown>) };
}
