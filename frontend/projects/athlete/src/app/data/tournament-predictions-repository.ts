import { collection, getDocs, type Firestore, type QueryDocumentSnapshot } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';

/**
 * Palpites da torcida no chaveamento — `tournamentPredictions/{tournamentId}/entries/{userId}`.
 *
 * Leitura direta do Firestore: a regra é pública de propósito (a graça é um ranking aberto de
 * quem mais acerta). Escrita EXCLUSIVA pela callable `submitBracketPrediction`, que valida dono,
 * torneio e status da partida antes de gravar — o portal nunca escreve nesse documento. Ver
 * `firestore.rules` e `functions/src/tournament-predictions.ts`.
 *
 * Uma leitura só traz o ranking E o palpite do próprio atleta (o app mobile faz duas porque os
 * providers são separados; aqui a coleção inteira já vem em memória).
 */
export interface TournamentPredictionEntry {
  userId: string;
  /** `matchId` → id do time apontado como vencedor: o mesmo valor que `winnerId` assume. */
  picks: Readonly<Record<string, string>>;
  /** Quem o atleta aposta como campeão — derivado do palpite na final. */
  championPick: string | null;
  /** Pontos creditados pelo trigger de conclusão de partida: +1 por acerto, +3 no campeão. */
  score: number;
  /**
   * Posição que a pessoa ocupava ANTES da última partida pontuada — a base da seta de variação.
   * Gravada pelo trigger (`snapshotPredictionRanks`, `functions/src/tournament-predictions.ts`)
   * em todas as entries de uma vez. `null` até o torneio ter a primeira partida concluída, ou
   * enquanto as functions de palpites não estiverem implantadas no ambiente.
   */
  previousRank: number | null;
}

function stringOf(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function picksOf(raw: unknown): Record<string, string> {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const picks: Record<string, string> = {};
  for (const [matchId, teamId] of Object.entries(raw as Record<string, unknown>)) {
    const id = stringOf(teamId);
    if (matchId.trim() && id) picks[matchId.trim()] = id;
  }
  return picks;
}

function entryFromDoc(snap: QueryDocumentSnapshot): TournamentPredictionEntry {
  const data = snap.data() as Record<string, unknown>;
  return {
    userId: stringOf(data['userId']) || snap.id,
    picks: picksOf(data['picks']),
    championPick: stringOf(data['championPick']) || null,
    score: typeof data['score'] === 'number' ? data['score'] : 0,
    previousRank: typeof data['previousRank'] === 'number' && data['previousRank'] > 0 ? data['previousRank'] : null,
  };
}

export async function fetchPredictionEntries(db: Firestore, tournamentId: string): Promise<TournamentPredictionEntry[]> {
  const id = tournamentId.trim();
  if (!id) return [];
  const snap = await getDocs(collection(db, 'tournamentPredictions', id, 'entries'));
  return snap.docs.map(entryFromDoc);
}

export interface SubmitPredictionParams {
  tournamentId: string;
  /** Só partidas ainda `Scheduled` — a callable rejeita a chamada INTEIRA se uma delas travou. */
  picks: Readonly<Record<string, string>>;
  championPick?: string | null;
}

/** Envia/atualiza os palpites do atleta logado. O merge é feito no servidor campo a campo
 *  (`picks.{matchId}`), então mandar um palpite de cada vez não apaga os anteriores. */
export async function submitBracketPrediction(functions: Functions, params: SubmitPredictionParams): Promise<void> {
  const tournamentId = params.tournamentId.trim();
  const champion = params.championPick?.trim() ?? '';
  if (!tournamentId) return;
  if (Object.keys(params.picks).length === 0 && !champion) return;

  const call = httpsCallable<Record<string, unknown>, unknown>(functions, 'submitBracketPrediction');
  await call({
    tournamentId,
    picks: params.picks,
    ...(champion ? { championPick: champion } : {}),
  });
}
