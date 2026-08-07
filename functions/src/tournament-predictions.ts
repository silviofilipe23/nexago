import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {
  FieldValue,
  getFirestore,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

import {artifactsMatchesPath, getFirebaseProjectId} from "./firebase-paths";
import {isMatchScheduled} from "./match-status";
import {isFinalMatchType} from "./tournament-completion";
import {
  parseGamificationSummary,
  shouldProcessTournamentMatchXp,
  stringField,
} from "./tournament-match-gamification";

/**
 * Palpites da torcida no chaveamento (feature #5, engajamento — NÃO envolve
 * dinheiro real). Coleção `tournamentPredictions/{tournamentId}/entries/{userId}`:
 * `{ userId, picks: {[matchId]: predictedWinnerTeamId}, championPick?,
 *   submittedAt, updatedAt, score }`.
 *
 * `picks[matchId]` grava o id do "time" (`teamAId`/`teamBId` da partida —
 * em jogo simples o "time" É o próprio atleta) escolhido como vencedor
 * previsto, o mesmo valor que `winnerId` assume quando a partida termina.
 */

export const MATCH_PICK_POINTS = 1;
export const CHAMPION_PICK_POINTS = 3;

/** Um pouco de XP por acerto de palpite — mesmo mecanismo de
 * `tournament-match-gamification.ts` (resumo `users/{uid}/gamification/summary`
 * + evento idempotente), não um sistema de pontuação paralelo. */
export const XP_PREDICTION_MATCH_CORRECT = 10;
export const XP_PREDICTION_CHAMPION_CORRECT = 30;
export const BRACKET_PREDICTION_XP_REASON = "BRACKET_PREDICTION_CORRECT";

export function bracketPredictionEntryPath(
  tournamentId: string,
  userId: string,
): string {
  return `tournamentPredictions/${tournamentId.trim()}/entries/${userId.trim()}`;
}

export function bracketPredictionEventId(matchId: string, userId: string): string {
  return `bracket_prediction_${matchId.trim()}_${userId.trim()}`;
}

// ─────────────────────────── validação de picks ───────────────────────────

export interface PredictableMatchLookup {
  tournamentId?: unknown;
  status?: unknown;
  teamAId?: unknown;
  teamBId?: unknown;
}

/**
 * Regra de negócio: só é possível palpitar enquanto a partida ainda está
 * `Scheduled` — trava automaticamente quando a partida começa (mesmo padrão
 * de "não pode editar depois que já rolou" usado em `validateMatchResult`,
 * `functions/src/organizer-match-ops.ts`). Lança `HttpsError` no primeiro
 * problema encontrado.
 */
export function assertPickIsAllowed(
  match: PredictableMatchLookup | undefined,
  tournamentId: string,
  predictedWinnerId: string,
): void {
  if (!match) {
    throw new HttpsError("not-found", "Partida não encontrada");
  }
  const matchTournamentId = stringField(match.tournamentId);
  if (matchTournamentId !== tournamentId.trim()) {
    throw new HttpsError(
      "invalid-argument",
      "Partida não pertence a este torneio",
    );
  }
  if (!isMatchScheduled(match.status)) {
    throw new HttpsError(
      "failed-precondition",
      "Palpite só é permitido enquanto a partida está agendada",
    );
  }
  const teamAId = stringField(match.teamAId);
  const teamBId = stringField(match.teamBId);
  const pick = predictedWinnerId.trim();
  if (!pick || (pick !== teamAId && pick !== teamBId)) {
    throw new HttpsError(
      "invalid-argument",
      "O palpite deve ser um dos dois competidores da partida",
    );
  }
}

/**
 * Monta o patch gravado em `tournamentPredictions/{tid}/entries/{uid}` com
 * `set(..., {merge: true})`.
 *
 * `picks` vai como MAPA ANINHADO, nunca como chaves `picks.${matchId}`:
 * diferente de `update()`, o `set()` NÃO interpreta ponto como separador de
 * caminho — a chave viraria um campo de nome literal `picks.<matchId>` e o
 * mapa `picks` jamais existiria (quem lê `data.picks` acharia o palpite
 * vazio). Com o mapa aninhado o document mask sai como `picks.<matchId>`
 * (caminho de 2 segmentos), então o merge atualiza pick a pick e preserva os
 * palpites já salvos em outras partidas — a semântica pretendida.
 *
 * Só inicializa `score`/`submittedAt` em entrada nova: reescrever `score`
 * zeraria os pontos já creditados pelo trigger de conclusão de partida.
 */
export function buildPredictionEntryPatch(params: {
  userId: string;
  picks: Record<string, string>;
  championPick?: string;
  isNewEntry: boolean;
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    userId: params.userId,
    updatedAt: FieldValue.serverTimestamp(),
  };
  // `picks: {}` explícito entraria no mask como o caminho `picks` e o merge
  // substituiria o mapa inteiro por vazio, apagando o que já estava salvo.
  if (Object.keys(params.picks).length > 0) {
    patch.picks = params.picks;
  }
  if (params.championPick) {
    patch.championPick = params.championPick;
  }
  if (params.isNewEntry) {
    patch.submittedAt = FieldValue.serverTimestamp();
    patch.score = 0;
  }
  return patch;
}

// ─────────────────────────── callable de submissão ────────────────────────

export const submitBracketPrediction = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const tournamentId = stringField(request.data?.tournamentId);
  if (!tournamentId) {
    throw new HttpsError("invalid-argument", "tournamentId obrigatório");
  }

  const rawPicks = request.data?.picks;
  if (!rawPicks || typeof rawPicks !== "object" || Array.isArray(rawPicks)) {
    throw new HttpsError("invalid-argument", "picks obrigatório");
  }
  const picks = rawPicks as Record<string, unknown>;
  const matchIds = Object.keys(picks)
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  const championPickRaw = request.data?.championPick;
  const championPick = stringField(championPickRaw) || undefined;

  if (matchIds.length === 0 && !championPick) {
    throw new HttpsError(
      "invalid-argument",
      "Envie ao menos um palpite de partida ou o palpite de campeão",
    );
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();

  const sanitizedPicks: Record<string, string> = {};
  if (matchIds.length > 0) {
    const matchRefs = matchIds.map((id) =>
      db.doc(`${artifactsMatchesPath(projectId)}/${id}`),
    );
    const matchSnaps = await db.getAll(...matchRefs);

    matchSnaps.forEach((snap, index) => {
      const matchId = matchIds[index];
      const predictedWinnerId = stringField(picks[matchId]);
      assertPickIsAllowed(
        snap.exists ? (snap.data() as PredictableMatchLookup) : undefined,
        tournamentId,
        predictedWinnerId,
      );
      sanitizedPicks[matchId] = predictedWinnerId;
    });
  }

  const entryRef = db.doc(bracketPredictionEntryPath(tournamentId, uid));
  const entrySnap = await entryRef.get();

  const patch = buildPredictionEntryPatch({
    userId: uid,
    picks: sanitizedPicks,
    championPick,
    isNewEntry: !entrySnap.exists,
  });

  await entryRef.set(patch, {merge: true});

  return {ok: true, picks: sanitizedPicks, championPick: championPick ?? null};
});

// ─────────────────────────── pontuação (trigger) ──────────────────────────

export interface PredictionScoringEntry {
  picks?: Record<string, unknown>;
  championPick?: unknown;
  score?: unknown;
}

/** +1 quando o palpite dessa partida bate com o vencedor real. */
export function computeMatchPickPoints(
  entry: PredictionScoringEntry,
  matchId: string,
  winnerId: string,
): number {
  const pick = entry.picks?.[matchId];
  if (typeof pick !== "string") return 0;
  return pick.trim() === winnerId.trim() ? MATCH_PICK_POINTS : 0;
}

/**
 * +3 quando a partida concluída é a grande final (`matchType === "Final"`,
 * ver `isFinalMatchType`/`tournament-completion.ts`) e o `championPick` da
 * entrada bate com quem venceu essa final.
 */
export function computeChampionPickPoints(
  entry: PredictionScoringEntry,
  isFinalMatch: boolean,
  winnerId: string,
): number {
  if (!isFinalMatch) return 0;
  const pick = entry.championPick;
  if (typeof pick !== "string" || !pick.trim()) return 0;
  return pick.trim() === winnerId.trim() ? CHAMPION_PICK_POINTS : 0;
}

/**
 * Crédito atômico (pontuação do palpite + XP) por (partida, usuário) —
 * idempotente via o mesmo doc de evento usado pela gamificação de partidas
 * (`users/{uid}/gamification_events/{eventId}`), reaproveitando
 * `parseGamificationSummary` para computar xp/level exatamente como
 * `awardTournamentMatchWinXpToUser`. Evita contagem dupla em reentregas do
 * trigger (at-least-once) do Cloud Functions.
 */
export async function awardBracketPredictionCredit(
  db: Firestore,
  params: {
    userId: string;
    matchId: string;
    tournamentId: string;
    scorePoints: number;
    xp: number;
  },
): Promise<boolean> {
  const userId = params.userId.trim();
  const matchId = params.matchId.trim();
  const tournamentId = params.tournamentId.trim();
  if (!userId || !matchId || !tournamentId) return false;
  if (params.scorePoints <= 0 && params.xp <= 0) return false;

  const eventId = bracketPredictionEventId(matchId, userId);
  const eventRef = db
    .collection("users")
    .doc(userId)
    .collection("gamification_events")
    .doc(eventId);
  const summaryRef = db
    .collection("users")
    .doc(userId)
    .collection("gamification")
    .doc("summary");
  const entryRef = db.doc(bracketPredictionEntryPath(tournamentId, userId));

  return db.runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef);
    if (eventSnap.exists) return false;

    if (params.xp > 0) {
      const summarySnap = await tx.get(summaryRef);
      const current = parseGamificationSummary(summarySnap.data());
      const nextXp = current.xp + params.xp;
      const nextLevel = Math.floor(nextXp / 100);
      tx.set(
        summaryRef,
        {
          xp: nextXp,
          level: nextLevel,
          updatedAt: FieldValue.serverTimestamp(),
          lastXpReason: BRACKET_PREDICTION_XP_REASON,
        },
        {merge: true},
      );
    }

    if (params.scorePoints > 0) {
      tx.set(
        entryRef,
        {
          score: FieldValue.increment(params.scorePoints),
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    }

    tx.set(
      eventRef,
      {
        type: BRACKET_PREDICTION_XP_REASON,
        matchId,
        tournamentId,
        xp: params.xp,
        scorePoints: params.scorePoints,
        createdAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    return true;
  });
}

// ────────────────────── foto das posições (variação) ──────────────────────

export interface PredictionRankingEntry {
  userId: string;
  score: number;
  picksCount: number;
}

/**
 * Ordem canônica do ranking de palpites: maior pontuação primeiro, desempate
 * por número de palpites enviados (separa quem acertou muito de quem palpitou
 * muito) e depois por id.
 *
 * Este comparador existe em TRÊS lugares e os três precisam concordar:
 *  - aqui;
 *  - `buildPredictionLeaderboard`, portal do atleta
 *    (`frontend/projects/athlete/src/app/tournaments/predictions/predictions.selectors.ts`);
 *  - `buildPredictionLeaderboardEntries`, app
 *    (`nexago_app/lib/features/tournaments/domain/predictions/tournament_predictions_logic.dart`).
 *
 * Se divergirem, a posição gravada aqui não bate com a que o cliente calcula e
 * a variação exibida vira ruído. Por isso o desempate por id compara code
 * units (`<`/`>`) em vez de `localeCompare`: `localeCompare` é sensível a
 * locale e ordena 'a' antes de 'B', enquanto o `compareTo` do Dart é por code
 * unit — com uids do Firebase Auth, que misturam maiúsculas e minúsculas, os
 * dois discordariam.
 */
export function comparePredictionRanking(
  a: PredictionRankingEntry,
  b: PredictionRankingEntry,
): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.picksCount !== a.picksCount) return b.picksCount - a.picksCount;
  if (a.userId === b.userId) return 0;
  return a.userId < b.userId ? -1 : 1;
}

/** Posições 1..N na ordem canônica, indexadas por userId. */
export function rankPredictionEntries(
  entries: readonly PredictionRankingEntry[],
): Map<string, number> {
  return new Map(
    [...entries]
      .sort(comparePredictionRanking)
      .map((entry, index) => [entry.userId, index + 1]),
  );
}

/** Um lote do Firestore aceita 500 operações; 450 deixa folga. */
export const RANK_SNAPSHOT_BATCH_SIZE = 450;

/**
 * Grava em TODAS as entries a posição que elas tinham antes da rodada que
 * acabou de pontuar — é o que o cliente usa para desenhar "subiu 3 posições".
 *
 * Escreve em todas, não só em quem pontuou: quem não acertou nada também muda
 * de posição quando os outros sobem.
 *
 * Só `previousRank` é persistido. A posição ATUAL não precisa ser guardada:
 * ela é recalculada do zero na próxima rodada, a partir das pontuações lidas
 * naquele momento, e o cliente exibe a posição que ele mesmo calcula. Guardar
 * as duas criaria um segundo campo para manter sincronizado, sem ganho algum.
 */
export async function snapshotPredictionRanks(
  db: Firestore,
  params: {tournamentId: string; entries: readonly PredictionRankingEntry[]},
): Promise<void> {
  const tournamentId = params.tournamentId.trim();
  if (!tournamentId || params.entries.length === 0) return;

  const ranks = rankPredictionEntries(params.entries);

  for (let i = 0; i < params.entries.length; i += RANK_SNAPSHOT_BATCH_SIZE) {
    const chunk = params.entries.slice(i, i + RANK_SNAPSHOT_BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((entry) => {
      const rank = ranks.get(entry.userId);
      if (rank === undefined) return;
      batch.set(
        db.doc(bracketPredictionEntryPath(tournamentId, entry.userId)),
        {
          previousRank: rank,
          rankUpdatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    });
    await batch.commit();
  }
}

export async function processBracketPredictionScoring(params: {
  db: Firestore;
  matchId: string;
  match: Record<string, unknown>;
}): Promise<void> {
  const tournamentId = stringField(params.match["tournamentId"]);
  const winnerId = stringField(params.match["winnerId"]);
  if (!tournamentId || !winnerId) return;

  const isFinal = isFinalMatchType(stringField(params.match["matchType"]));

  const entriesSnap = await params.db
    .collection(`tournamentPredictions/${tournamentId}/entries`)
    .get();
  if (entriesSnap.empty) return;

  // Montado ANTES dos créditos abaixo: é exatamente a foto do ranking como
  // estava antes desta partida ser pontuada.
  const rankingBefore: PredictionRankingEntry[] = entriesSnap.docs.map((doc) => {
    const data = doc.data() as PredictionScoringEntry;
    return {
      userId: doc.id,
      score: typeof data.score === "number" && Number.isFinite(data.score) ? data.score : 0,
      picksCount: Object.keys(data.picks ?? {}).length,
    };
  });

  let credited = 0;
  await Promise.all(
    entriesSnap.docs.map(async (doc) => {
      const data = doc.data() as PredictionScoringEntry;
      const matchPoints = computeMatchPickPoints(data, params.matchId, winnerId);
      const championPoints = computeChampionPickPoints(data, isFinal, winnerId);
      const scorePoints = matchPoints + championPoints;
      if (scorePoints <= 0) return;

      const xp =
        (matchPoints > 0 ? XP_PREDICTION_MATCH_CORRECT : 0) +
        (championPoints > 0 ? XP_PREDICTION_CHAMPION_CORRECT : 0);

      try {
        const awarded = await awardBracketPredictionCredit(params.db, {
          userId: doc.id,
          matchId: params.matchId,
          tournamentId,
          scorePoints,
          xp,
        });
        if (awarded) credited++;
      } catch (error) {
        logger.error(
          `bracketPredictions: falha ao creditar palpite de ${doc.id} na partida ${params.matchId}`,
          error,
        );
      }
    }),
  );

  // `credited === 0` significa que NENHUMA pontuação mudou — ou ninguém
  // acertou, ou é uma reentrega do trigger e todos os créditos caíram na
  // idempotência de `gamification_events`. Refotografar aqui gravaria a
  // posição atual como "anterior" e apagaria em silêncio as setas de variação
  // da rodada que valeu. Só refotografa quando algo de fato mudou.
  if (credited > 0) {
    logger.info(
      `bracketPredictions: ${credited} palpite(s) pontuado(s) na partida ${params.matchId}`,
    );
    try {
      await snapshotPredictionRanks(params.db, {tournamentId, entries: rankingBefore});
    } catch (error) {
      // Os pontos já foram creditados — o que importa está gravado. A variação
      // é cosmética e se recompõe na próxima partida concluída.
      logger.error(
        `bracketPredictions: falha ao fotografar posições do torneio ${tournamentId}`,
        error,
      );
    }
  }
}

/**
 * Trigger DESACOPLADO no mesmo path de matches — coexiste com
 * `onTournamentMatchCompletedAdvance` (avanço de chave),
 * `onTournamentMatchCompletedAwardXp` (XP de vitória) e
 * `onTournamentMatchCompletedAwardGlobalPoints` (ranking global). É o padrão
 * já estabelecido neste arquivo/domínio para reagir à conclusão de uma
 * partida (ver comentário em `tournament-ranking.ts`): cada trigger cuida de
 * UMA responsabilidade independente sobre o mesmo documento, em vez de um
 * único handler acoplando módulos que hoje não se conhecem. Pontuação de
 * palpites segue a mesma lógica de "já deveria processar" usada pela
 * gamificação (`shouldProcessTournamentMatchXp`) — mesma leitura do
 * documento, reaproveitada em vez de duplicada.
 */
export const onTournamentMatchCompletedScoreBracketPredictions = onDocumentUpdated(
  "artifacts/{appId}/public/data/matches/{matchId}",
  async (event) => {
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;

    if (!shouldProcessTournamentMatchXp(before, after) || !after) {
      return;
    }

    await processBracketPredictionScoring({
      db: getFirestore(),
      matchId: event.params.matchId,
      match: after,
    });
  },
);
