import {FieldValue, Timestamp, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {compositeTeamRating, updateRating, type GlickoRating} from "./glicko";
import {
  RATED_SPORT_CODES,
  loadRatingLadderConfig,
  resolveLadderLevel,
  type RatingLadderConfig,
} from "./rating-config";
import {
  applyLadderActions,
  evaluateLadderTransition,
  ratingStateFromDoc,
  ratingStateToDoc,
  type AthleteRatingState,
} from "./rating-ladder";
import {
  isTournamentMatchCompleted,
  parseMatchPlayedAt,
  stringField,
} from "./tournament-match-gamification";
import {tournamentSportToLevelSportCode} from "./category-level-eligibility";
import {isWinnerInMatch} from "./match-status";
import {artifactsPublicDataBase} from "./firebase-paths";
import {loadTeamAthleteIds} from "./league-ranking";

/**
 * Engine de rating Glicko-2 por partida (streaming: cada partida = um rating
 * period), com ledger append-only `ratingEvents` que torna tudo determinístico
 * e replayável. Correção de resultado = sobrescreve o evento (guardando o
 * estado anterior em `superseded`) + replay do ledger de cada atleta envolvido
 * ordenado por `endedAt`.
 */

export const RATING_ENGINE_VERSION = 1;

export function ratingEventsPath(projectId: string): string {
  return `${artifactsPublicDataBase(projectId)}/ratingEvents`;
}

export function athleteRatingsPath(projectId: string): string {
  return `${artifactsPublicDataBase(projectId)}/athleteRatings`;
}

export function ratingEventId(sportCode: string, matchId: string): string {
  return `${sportCode}_${matchId.trim()}`;
}

export function athleteRatingDocId(athleteId: string, sportCode: string): string {
  return `${athleteId.trim()}_${sportCode}`;
}

/** W.O. não é evidência de skill: não pontua rating (mas pontua colocação). */
export function isWalkoverMatch(match: Record<string, unknown>): boolean {
  return (
    stringField(match["resultA"]) === "W.O." ||
    stringField(match["resultB"]) === "W.O."
  );
}

/**
 * Processa rating quando a partida fica concluída com vencedor, ou quando o
 * vencedor é corrigido — mesma semântica de `shouldPropagateMatchAdvance`.
 */
export function shouldProcessRatingUpdate(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): boolean {
  if (!after) return false;
  if (!isTournamentMatchCompleted(after["status"])) return false;
  const winnerId = stringField(after["winnerId"]);
  if (!winnerId) return false;
  if (!before || !isTournamentMatchCompleted(before["status"])) return true;
  return stringField(before["winnerId"]) !== winnerId;
}

/** Nível declarado do atleta para o esporte (código cru, com legados). */
export function declaredLevelFor(
  userData: Record<string, unknown> | null | undefined,
  sportCode: string,
): string {
  if (!userData) return "";
  const onboarding = userData["sportOnboarding"];
  if (onboarding != null && typeof onboarding === "object") {
    const bySport = (onboarding as Record<string, unknown>)["levelsBySport"];
    if (bySport != null && typeof bySport === "object") {
      const value = (bySport as Record<string, unknown>)[sportCode];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  const global = userData["level"];
  return typeof global === "string" ? global.trim() : "";
}

/** Estado inicial de rating seedado pelo nível declarado. */
export function seedRatingState(
  athleteId: string,
  sportCode: string,
  config: RatingLadderConfig,
  declaredLevel: string,
): AthleteRatingState {
  const level = resolveLadderLevel(config, declaredLevel);
  return {
    athleteId,
    sportCode,
    rating: level.initialRating,
    rd: config.glicko.initialRd,
    volatility: config.glicko.initialVolatility,
    ratedMatches: 0,
    wins: 0,
    losses: 0,
    lastMatchAt: null,
    levelCode: level.code,
    levelRank: level.rank,
    zone: "stable",
    ladderState: "stable",
    observationStartedAt: null,
    observationMatches: 0,
    notifiedAt: null,
    protectedUntil: null,
    seededFromLevel: declaredLevel || level.code,
  };
}

interface RatingEventSide {
  teamId: string;
  athleteIds: string[];
}

interface AthleteSnapshot {
  r: number;
  rd: number;
  vol: number;
  level: string;
}

function snapshotOf(state: AthleteRatingState): AthleteSnapshot {
  return {
    r: state.rating,
    rd: state.rd,
    vol: state.volatility,
    level: state.levelCode,
  };
}

export interface ApplyMatchRatingResult {
  processed: boolean;
  reason?: string;
  walkover?: boolean;
  /** Atletas cujo ledger foi replayado por correção de resultado. */
  replayedAthleteIds?: string[];
}

/**
 * Aplica o rating de uma partida concluída de forma idempotente (doc id do
 * evento em transação, padrão `gamification_events`). Correção de vencedor
 * sobrescreve o evento e replaya o ledger dos atletas envolvidos.
 */
export async function applyMatchRatingUpdate(
  db: Firestore,
  projectId: string,
  params: {
    matchId: string;
    match: Record<string, unknown>;
    now?: Date;
  },
): Promise<ApplyMatchRatingResult> {
  const {matchId, match} = params;
  const now = params.now ?? new Date();

  if (!isTournamentMatchCompleted(match["status"])) {
    return {processed: false, reason: "not_completed"};
  }
  const winnerTeamId = stringField(match["winnerId"]);
  const tournamentId = stringField(match["tournamentId"]);
  const categoryId = stringField(match["categoryId"]);
  const teamAId = stringField(match["teamAId"]);
  const teamBId = stringField(match["teamBId"]);
  if (!winnerTeamId || !tournamentId || !teamAId || !teamBId) {
    return {processed: false, reason: "missing_fields"};
  }
  // Vencedor fora dos dois lados: aplicar o Glicko marcaria DERROTA para os
  // dois times (`won` falso em ambos). Falha alto e não grava evento.
  if (!isWinnerInMatch(winnerTeamId, teamAId, teamBId)) {
    logger.warn(
      `rating-engine: partida ${matchId} com winnerId fora dos dois lados ` +
        `(winnerId=${winnerTeamId}, teamAId=${teamAId}, teamBId=${teamBId})`,
    );
    return {processed: false, reason: "winner_not_in_match"};
  }

  const tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!tournamentSnap.exists) {
    return {processed: false, reason: "tournament_not_found"};
  }
  const sportCode = tournamentSportToLevelSportCode(
    tournamentSnap.data()?.sport,
  );
  // Ter código de esporte no perfil não basta: só os esportes da escada v1
  // são rateados (footvolley/beach tennis têm nível declarado, sem rating).
  if (
    !sportCode ||
    !(RATED_SPORT_CODES as readonly string[]).includes(sportCode)
  ) {
    return {processed: false, reason: "sport_not_rated"};
  }

  const config = await loadRatingLadderConfig(db, sportCode);
  if (!config.flags.ratingEnabled) {
    return {processed: false, reason: "rating_disabled"};
  }

  const [athleteIdsA, athleteIdsB] = await Promise.all([
    loadTeamAthleteIds(db, projectId, teamAId),
    loadTeamAthleteIds(db, projectId, teamBId),
  ]);
  if (athleteIdsA.length === 0 || athleteIdsB.length === 0) {
    logger.warn(`rating-engine: partida ${matchId} sem atletas resolvidos`);
    return {processed: false, reason: "missing_athletes"};
  }
  const allAthleteIds = [...athleteIdsA, ...athleteIdsB];

  // Níveis declarados p/ seed (fora da transação: mudam raramente e o replay
  // administrativo corrige qualquer corrida).
  const declaredLevels = new Map<string, string>();
  await Promise.all(
    allAthleteIds.map(async (uid) => {
      const snap = await db.doc(`users/${uid}`).get();
      declaredLevels.set(uid, declaredLevelFor(snap.data() ?? null, sportCode));
    }),
  );

  const walkover = isWalkoverMatch(match);
  const endedAt = parseMatchPlayedAt(match, now);
  const eventRef = db
    .collection(ratingEventsPath(projectId))
    .doc(ratingEventId(sportCode, matchId));

  const teamA: RatingEventSide = {teamId: teamAId, athleteIds: athleteIdsA};
  const teamB: RatingEventSide = {teamId: teamBId, athleteIds: athleteIdsB};

  const outcome = await db.runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef);
    const existing = eventSnap.exists
      ? (eventSnap.data() as Record<string, unknown>)
      : null;

    if (existing) {
      const sameWinner = stringField(existing["winnerTeamId"]) === winnerTeamId;
      const sameWalkover = (existing["walkover"] === true) === walkover;
      if (sameWinner && sameWalkover) {
        return {kind: "duplicate" as const};
      }
      // Correção: sobrescreve o evento guardando o estado anterior e replaya
      // fora da transação.
      const superseded = Array.isArray(existing["superseded"])
        ? [...(existing["superseded"] as unknown[])]
        : [];
      superseded.push({
        winnerTeamId: existing["winnerTeamId"] ?? null,
        walkover: existing["walkover"] === true,
        post: existing["post"] ?? null,
        supersededAt: Timestamp.fromDate(now),
      });
      tx.set(
        eventRef,
        {
          winnerTeamId,
          walkover,
          status: walkover ? "skipped" : "applied",
          superseded,
          engineVersion: RATING_ENGINE_VERSION,
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
      const previousIds = Array.isArray(existing["athleteIds"])
        ? (existing["athleteIds"] as unknown[]).map(String)
        : [];
      return {
        kind: "correction" as const,
        replayIds: [...new Set([...previousIds, ...allAthleteIds])],
      };
    }

    // Leituras antes de qualquer escrita (regra de transação do Firestore).
    const ratingRefs = allAthleteIds.map((uid) =>
      db
        .collection(athleteRatingsPath(projectId))
        .doc(athleteRatingDocId(uid, sportCode)),
    );
    const ratingSnaps = await Promise.all(ratingRefs.map((ref) => tx.get(ref)));

    const states = new Map<string, AthleteRatingState>();
    allAthleteIds.forEach((uid, index) => {
      const snap = ratingSnaps[index];
      states.set(
        uid,
        snap.exists
          ? ratingStateFromDoc(uid, sportCode, snap.data() as Record<string, unknown>)
          : seedRatingState(uid, sportCode, config, declaredLevels.get(uid) ?? ""),
      );
    });

    const pre: Record<string, AthleteSnapshot> = {};
    for (const [uid, state] of states) pre[uid] = snapshotOf(state);

    const baseEvent = {
      matchId,
      sportCode,
      tournamentId,
      categoryId,
      endedAt: Timestamp.fromDate(endedAt),
      walkover,
      winnerTeamId,
      teamA,
      teamB,
      athleteIds: allAthleteIds,
      pre,
      engineVersion: RATING_ENGINE_VERSION,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (walkover) {
      tx.set(eventRef, {...baseEvent, post: pre, status: "skipped"});
      return {kind: "walkover" as const};
    }

    const glickoOptions = {
      tau: config.glicko.tau,
      minRd: config.glicko.minRd,
      maxRd: config.glicko.maxRd,
    };
    const evaluations: Array<{
      uid: string;
      evaluation: ReturnType<typeof evaluateLadderTransition>;
    }> = [];
    const post: Record<string, AthleteSnapshot> = {};

    for (const [uid, state] of states) {
      const onTeamA = athleteIdsA.includes(uid);
      const won = winnerTeamId === (onTeamA ? teamAId : teamBId);
      const opponents = (onTeamA ? athleteIdsB : athleteIdsA).map(
        (oppId) => states.get(oppId)!,
      );
      const composite = compositeTeamRating(
        opponents.map((opp) => ({rating: opp.rating, rd: opp.rd})),
      );
      const updated: GlickoRating = updateRating(
        {rating: state.rating, rd: state.rd, volatility: state.volatility},
        [{rating: composite.rating, rd: composite.rd, score: won ? 1 : 0}],
        glickoOptions,
      );
      const nextState: AthleteRatingState = {
        ...state,
        rating: updated.rating,
        rd: updated.rd,
        volatility: updated.volatility,
        ratedMatches: state.ratedMatches + 1,
        wins: state.wins + (won ? 1 : 0),
        losses: state.losses + (won ? 0 : 1),
        lastMatchAt: endedAt,
      };
      const evaluation = evaluateLadderTransition(nextState, config, now, "match");
      post[uid] = snapshotOf(evaluation.next);
      evaluations.push({uid, evaluation});
    }

    tx.set(eventRef, {...baseEvent, post, status: "applied"});
    allAthleteIds.forEach((uid, index) => {
      const entry = evaluations.find((e) => e.uid === uid)!;
      tx.set(ratingRefs[index], ratingStateToDoc(entry.evaluation.next));
    });
    return {kind: "applied" as const, evaluations};
  });

  if (outcome.kind === "duplicate") {
    return {processed: false, reason: "duplicate"};
  }
  if (outcome.kind === "walkover") {
    return {processed: true, walkover: true};
  }
  if (outcome.kind === "correction") {
    for (const uid of outcome.replayIds) {
      await replayAthleteLedger(db, projectId, uid, sportCode, config);
    }
    return {processed: true, replayedAthleteIds: outcome.replayIds};
  }

  // Efeitos externos da escada (nível/auditoria/notificação) fora da transação.
  for (const {evaluation} of outcome.evaluations) {
    if (evaluation.actions.length === 0) continue;
    const finalState = await applyLadderActions(db, evaluation, config, now);
    await db
      .collection(athleteRatingsPath(projectId))
      .doc(athleteRatingDocId(finalState.athleteId, sportCode))
      .set(ratingStateToDoc(finalState), {merge: true});
  }
  return {processed: true};
}

/**
 * Recomputa o rating de um atleta do zero replayando seu ledger em ordem de
 * `endedAt` (seed = `pre` do primeiro evento; oponentes = `pre` gravado em
 * cada evento — sem cascata transitiva, decisão documentada do v1). Preserva
 * os campos de escada (nível/observação) do doc atual.
 */
export async function replayAthleteLedger(
  db: Firestore,
  projectId: string,
  athleteId: string,
  sportCode: string,
  preloadedConfig?: RatingLadderConfig,
): Promise<AthleteRatingState | null> {
  const config =
    preloadedConfig ?? (await loadRatingLadderConfig(db, sportCode));

  const eventsSnap = await db
    .collection(ratingEventsPath(projectId))
    .where("sportCode", "==", sportCode)
    .where("athleteIds", "array-contains", athleteId)
    .orderBy("endedAt", "asc")
    .get();

  const ratingRef = db
    .collection(athleteRatingsPath(projectId))
    .doc(athleteRatingDocId(athleteId, sportCode));
  const currentSnap = await ratingRef.get();
  const current = currentSnap.exists
    ? ratingStateFromDoc(
        athleteId,
        sportCode,
        currentSnap.data() as Record<string, unknown>,
      )
    : null;

  let glicko: GlickoRating | null = null;
  let seededFromLevel = current?.seededFromLevel ?? "";
  let ratedMatches = 0;
  let wins = 0;
  let losses = 0;
  let lastMatchAt: Date | null = null;

  const glickoOptions = {
    tau: config.glicko.tau,
    minRd: config.glicko.minRd,
    maxRd: config.glicko.maxRd,
  };

  for (const doc of eventsSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (data["status"] === "skipped" || data["walkover"] === true) continue;

    const pre = (data["pre"] ?? {}) as Record<string, AthleteSnapshot>;
    if (!glicko) {
      const seed = pre[athleteId];
      if (seed) {
        glicko = {rating: seed.r, rd: seed.rd, volatility: seed.vol};
        seededFromLevel = seededFromLevel || seed.level;
      } else {
        const seeded = seedRatingState(athleteId, sportCode, config, "");
        glicko = {
          rating: seeded.rating,
          rd: seeded.rd,
          volatility: seeded.volatility,
        };
      }
    }

    const teamA = (data["teamA"] ?? {}) as Record<string, unknown>;
    const teamB = (data["teamB"] ?? {}) as Record<string, unknown>;
    const idsA = Array.isArray(teamA["athleteIds"])
      ? (teamA["athleteIds"] as unknown[]).map(String)
      : [];
    const idsB = Array.isArray(teamB["athleteIds"])
      ? (teamB["athleteIds"] as unknown[]).map(String)
      : [];
    const onTeamA = idsA.includes(athleteId);
    const myTeamId = stringField(onTeamA ? teamA["teamId"] : teamB["teamId"]);
    const won = stringField(data["winnerTeamId"]) === myTeamId;

    const oppSnapshots = (onTeamA ? idsB : idsA)
      .map((id) => pre[id])
      .filter((snap): snap is AthleteSnapshot => snap != null);
    if (oppSnapshots.length === 0) continue;
    const composite = compositeTeamRating(
      oppSnapshots.map((snap) => ({rating: snap.r, rd: snap.rd})),
    );

    glicko = updateRating(
      glicko,
      [{rating: composite.rating, rd: composite.rd, score: won ? 1 : 0}],
      glickoOptions,
    );
    ratedMatches++;
    if (won) wins++;
    else losses++;

    const ended = data["endedAt"];
    if (ended && typeof ended === "object" && "toDate" in ended) {
      lastMatchAt = (ended as Timestamp).toDate();
    }

    // Auditoria: realinha o `post` deste atleta no evento.
    await doc.ref.set(
      {
        post: {
          [athleteId]: {
            r: glicko.rating,
            rd: glicko.rd,
            vol: glicko.volatility,
            level: current?.levelCode ?? "",
          },
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  }

  if (!glicko) {
    // Sem eventos rateáveis: nada a recomputar.
    return current;
  }

  const base =
    current ?? seedRatingState(athleteId, sportCode, config, seededFromLevel);
  const level = resolveLadderLevel(config, base.levelCode);
  const next: AthleteRatingState = {
    ...base,
    rating: glicko.rating,
    rd: glicko.rd,
    volatility: glicko.volatility,
    ratedMatches,
    wins,
    losses,
    lastMatchAt,
    levelCode: level.code,
    levelRank: level.rank,
    seededFromLevel,
  };
  const evaluation = evaluateLadderTransition(next, config, new Date(), "daily");
  await ratingRef.set(ratingStateToDoc(evaluation.next));
  return evaluation.next;
}

/** Replay em lote (callable admin de recomputação). */
export async function recomputeSportRatings(
  db: Firestore,
  projectId: string,
  sportCode: string,
  athleteIds: string[],
): Promise<number> {
  const config = await loadRatingLadderConfig(db, sportCode);
  let recomputed = 0;
  for (const athleteId of athleteIds) {
    const result = await replayAthleteLedger(
      db,
      projectId,
      athleteId,
      sportCode,
      config,
    );
    if (result) recomputed++;
  }
  return recomputed;
}
