/**
 * Correção manual do NÍVEL declarado de um atleta pelo backoffice.
 *
 * Mesmo problema (e mesma solução) do script `scripts/set-athlete-level.js`,
 * agora como callable: as rules (`athleteLevelsNotDowngraded()`) e a UI do
 * app/portal só deixam SUBIR de nível, então o caso "o nível não condiz com a
 * realidade" — quase sempre um rebaixamento — só existe via Admin SDK.
 *
 * O nível vive em DOIS lugares e os dois precisam ser escritos:
 *
 * 1. `users/{uid}.sportOnboarding.levelsBySport[sportCode]` — nível declarado,
 *    fonte canônica de elegibilidade de categoria e de exibição. O espelho
 *    `public_profiles/{uid}` atualiza sozinho (onUserWrittenSyncPublicProfile).
 * 2. `athleteRatings/{uid}_{sportCode}` — estado da escada (Glicko-2). SEM
 *    realinhar, a escada desfaz a correção: ela decide promoção/rebaixamento
 *    pelo `levelCode` do doc de rating, então um rebaixamento manual deixaria o
 *    atleta na zona de promoção do nível antigo e o passe diário o devolveria.
 *
 * ORDEM DAS ESCRITAS (não inverter): rating ANTES do doc do usuário. O trigger
 * `onUserWrittenTrackLevelChanges` dispara na escrita de `users/{uid}` e
 * re-seeda o rating quando o nível SOBE; com o doc de rating já no nível novo
 * ele cai no guard `current.levelCode === newLevel.code` e não faz nada.
 */

import {getAuth} from "firebase-admin/auth";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {callerCanAccessBackoffice} from "./auth-roles";
import {
  ATHLETE_SPORT_CODES,
  LEVEL_CODES,
  levelDisplayLabel,
  levelRank,
} from "./category-level-eligibility";
import {getFirebaseProjectId} from "./firebase-paths";
import {deliverNotificationToUser} from "./notification-delivery";
import {
  RATED_SPORT_CODES,
  RatingLadderConfig,
  loadRatingLadderConfig,
  resolveLadderLevel,
} from "./rating-config";
import {athleteRatingDocId, athleteRatingsPath} from "./rating-engine";
import {
  AthleteRatingState,
  computeZone,
  ratingStateFromDoc,
  ratingStateToDoc,
  sportLabel,
} from "./rating-ladder";

const DAY_MS = 86_400_000;

/** Rota do portal do atleta aberta pela notificação (igual à da escada). */
const SPORTS_LEVELS_URL = "/athlete/profile/sports-levels";

/** Limites do motivo — mesmo padrão da remoção de inscrição pelo organizador. */
export const LEVEL_CHANGE_REASON_MIN = 10;
export const LEVEL_CHANGE_REASON_MAX = 500;

/** Quantas entradas de `levelHistory` o diálogo mostra. */
const HISTORY_LIMIT = 5;

export type LevelChangeDirection = "seed" | "up" | "down" | "same";

export interface LevelChangePlan {
  direction: LevelChangeDirection;
  /** Valor CRU que estava no perfil (pode ser legado/label); `null` se ausente. */
  fromLevel: string | null;
  toLevel: string;
  /** Estado a gravar em `athleteRatings`; `null` quando não há o que realinhar. */
  ratingNext: AthleteRatingState | null;
}

/**
 * Decide a direção da mudança e o realinhamento do rating. Puro de propósito:
 * é o miolo testável do callable.
 *
 * `ratingNext` só existe quando o esporte tem escada, o doc de rating já existe
 * (senão a engine semeia na 1ª partida rateada, já com o nível novo) e ele
 * ainda não está no nível alvo (reescrever zeraria observação e proteção à toa).
 */
export function planLevelChange(params: {
  currentLevel: string | null;
  targetCode: string;
  config: RatingLadderConfig | null;
  currentRating: AthleteRatingState | null;
  now: Date;
}): LevelChangePlan {
  const {currentLevel, targetCode, config, currentRating, now} = params;
  const fromLevel = currentLevel?.trim() || null;
  const currentRank = levelRank(fromLevel);
  const targetRank = levelRank(targetCode);

  const direction: LevelChangeDirection =
    currentRank == null || targetRank == null ?
      "seed" :
      targetRank > currentRank ?
        "up" :
        targetRank < currentRank ?
          "down" :
          "same";

  if (!config || !currentRating) {
    return {direction, fromLevel, toLevel: targetCode, ratingNext: null};
  }

  const targetLevel = resolveLadderLevel(config, targetCode);
  if (currentRating.levelCode === targetLevel.code) {
    return {direction, fromLevel, toLevel: targetCode, ratingNext: null};
  }

  // Puxa o rating para dentro da banda do nível novo sem devolver degrau de
  // graça: descendo, no máximo o inicial do nível; subindo, no mínimo.
  const nextRating =
    direction === "down" ?
      Math.min(currentRating.rating, targetLevel.initialRating) :
      direction === "up" ?
        Math.max(currentRating.rating, targetLevel.initialRating) :
        currentRating.rating;

  return {
    direction,
    fromLevel,
    toLevel: targetCode,
    ratingNext: {
      ...currentRating,
      rating: nextRating,
      // RD alto trava decisão da escada (maxRdForDecision) até reconsolidar.
      rd: config.glicko.initialRd,
      levelCode: targetLevel.code,
      levelRank: targetLevel.rank,
      zone: computeZone(nextRating, targetLevel),
      ladderState: "stable",
      observationStartedAt: null,
      observationMatches: 0,
      notifiedAt: null,
      // Proteção contra rebaixamento automático só faz sentido subindo (mesma
      // semântica do self-upgrade em rating-triggers.ts).
      protectedUntil:
        direction === "up" ?
          new Date(now.getTime() + config.ladder.promotionProtectionDays * DAY_MS) :
          null,
    },
  };
}

function levelsBySportOf(data: Record<string, unknown> | undefined): Record<string, string> {
  const onboarding = data?.["sportOnboarding"];
  const bySport =
    onboarding && typeof onboarding === "object" ?
      (onboarding as Record<string, unknown>)["levelsBySport"] :
      null;
  const out: Record<string, string> = {};
  if (bySport && typeof bySport === "object") {
    for (const [key, value] of Object.entries(bySport as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) {
        out[key] = value.trim();
      }
    }
  }
  return out;
}

function primarySportOf(data: Record<string, unknown> | undefined): string | null {
  const onboarding = data?.["sportOnboarding"];
  const raw =
    onboarding && typeof onboarding === "object" ?
      (onboarding as Record<string, unknown>)["primarySportId"] :
      null;
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return (ATHLETE_SPORT_CODES as readonly string[]).includes(code) ? code : null;
}

async function assertBackofficeCaller(callerUid: string | undefined): Promise<string> {
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }
  const caller = await getAuth().getUser(callerUid);
  if (!callerCanAccessBackoffice(caller)) {
    throw new HttpsError(
      "permission-denied",
      "Apenas administradores da plataforma podem alterar o nível de um atleta.",
    );
  }
  return caller.email ?? callerUid;
}

function requireUid(raw: unknown): string {
  const uid = typeof raw === "string" ? raw.trim() : "";
  if (!uid) {
    throw new HttpsError("invalid-argument", "UID inválido");
  }
  return uid;
}

/**
 * Estado de nível do atleta para o diálogo do backoffice: níveis declarados,
 * esporte principal e as últimas mudanças.
 *
 * Vai por callable (e não por leitura direta do cliente) porque a rule de
 * `users/{uid}/levelHistory` exige o claim `admin` — um super admin sem o papel
 * seria barrado — e porque o espelho `public_profiles` tem alguns segundos de
 * atraso: aqui o diálogo lê o doc canônico.
 */
export const getAthleteLevelState = onCall(async (request) => {
  await assertBackofficeCaller(request.auth?.uid);
  const uid = requireUid((request.data as {uid?: unknown} | undefined)?.uid);

  const db = getFirestore();
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) {
    // `failed-precondition` (e não `not-found`): a conta EXISTE no Auth, o que
    // falta é o doc de perfil — o cliente traduz `not-found` como "usuário não
    // encontrado" e a mensagem viraria mentira.
    throw new HttpsError("failed-precondition", "Este usuário ainda não tem perfil de atleta.");
  }
  const data = userSnap.data() ?? {};
  const bySport = levelsBySportOf(data);
  const primarySportId = primarySportOf(data);

  // Esporte principal primeiro; o resto em ordem alfabética (estável na tela).
  const declared = Object.keys(bySport).sort((a, b) => {
    if (a === primarySportId) return -1;
    if (b === primarySportId) return 1;
    return a.localeCompare(b);
  });

  const historySnap = await db
    .collection(`users/${uid}/levelHistory`)
    .orderBy("createdAt", "desc")
    .limit(HISTORY_LIMIT)
    .get();

  return {
    uid,
    primarySportId,
    sports: declared.map((sportCode) => ({
      sportCode,
      level: bySport[sportCode] ?? null,
      label: levelDisplayLabel(bySport[sportCode]),
      rated: (RATED_SPORT_CODES as readonly string[]).includes(sportCode),
    })),
    history: historySnap.docs.map((doc) => {
      const entry = doc.data();
      const createdAt = entry["createdAt"];
      return {
        id: doc.id,
        sportCode: typeof entry["sportCode"] === "string" ? entry["sportCode"] : null,
        fromLevel: typeof entry["fromLevel"] === "string" ? entry["fromLevel"] : null,
        toLevel: typeof entry["toLevel"] === "string" ? entry["toLevel"] : null,
        reason: typeof entry["reason"] === "string" ? entry["reason"] : null,
        note: typeof entry["note"] === "string" ? entry["note"] : null,
        actor: typeof entry["actor"] === "string" ? entry["actor"] : null,
        actorLabel: typeof entry["actorLabel"] === "string" ? entry["actorLabel"] : null,
        createdAtMs:
          createdAt && typeof createdAt === "object" && "toDate" in createdAt ?
            (createdAt as {toDate(): Date}).toDate().getTime() :
            null,
      };
    }),
  };
});

/**
 * Troca o nível declarado de um atleta em um esporte — inclusive para BAIXO.
 * Escreve rating (quando há o que realinhar), perfil e auditoria, nessa ordem,
 * e avisa o atleta. O motivo é interno: fica no `levelHistory`, não vai na
 * notificação.
 */
export const setAthleteLevel = onCall(async (request) => {
  const actorLabel = await assertBackofficeCaller(request.auth?.uid);
  const callerUid = request.auth!.uid;

  const raw = request.data as
    | {uid?: unknown; sportCode?: unknown; level?: unknown; reason?: unknown}
    | undefined;

  const uid = requireUid(raw?.uid);
  const sportCode = typeof raw?.sportCode === "string" ? raw.sportCode.trim().toUpperCase() : "";
  if (!(ATHLETE_SPORT_CODES as readonly string[]).includes(sportCode)) {
    throw new HttpsError("invalid-argument", "Esporte inválido.");
  }
  const level = typeof raw?.level === "string" ? raw.level.trim() : "";
  if (!(LEVEL_CODES as readonly string[]).includes(level)) {
    throw new HttpsError("invalid-argument", "Nível inválido.");
  }
  const reason = typeof raw?.reason === "string" ? raw.reason.trim() : "";
  if (reason.length < LEVEL_CHANGE_REASON_MIN || reason.length > LEVEL_CHANGE_REASON_MAX) {
    throw new HttpsError(
      "invalid-argument",
      `O motivo precisa ter de ${LEVEL_CHANGE_REASON_MIN} a ${LEVEL_CHANGE_REASON_MAX} caracteres.`,
    );
  }

  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    // `failed-precondition` (e não `not-found`): a conta EXISTE no Auth, o que
    // falta é o doc de perfil — o cliente traduz `not-found` como "usuário não
    // encontrado" e a mensagem viraria mentira.
    throw new HttpsError("failed-precondition", "Este usuário ainda não tem perfil de atleta.");
  }
  const currentLevel = levelsBySportOf(userSnap.data())[sportCode] ?? null;

  // Esporte fora da escada não tem doc de rating para realinhar.
  const rated = (RATED_SPORT_CODES as readonly string[]).includes(sportCode);
  const config = rated ? await loadRatingLadderConfig(db, sportCode) : null;
  const ratingRef = db
    .collection(athleteRatingsPath(getFirebaseProjectId()))
    .doc(athleteRatingDocId(uid, sportCode));
  const ratingSnap = rated ? await ratingRef.get() : null;
  const currentRating =
    ratingSnap?.exists ?
      ratingStateFromDoc(uid, sportCode, ratingSnap.data() as Record<string, unknown>) :
      null;

  const plan = planLevelChange({
    currentLevel,
    targetCode: level,
    config,
    currentRating,
    now: new Date(),
  });

  const profileChanged = currentLevel !== level;
  if (!profileChanged && !plan.ratingNext) {
    return {
      applied: false,
      sportCode,
      fromLevel: plan.fromLevel,
      toLevel: level,
      direction: plan.direction,
      ratingRealigned: false,
      notified: false,
    };
  }

  // Rating ANTES do perfil: com o levelCode já no nível novo, o trigger
  // onUserWrittenTrackLevelChanges cai no guard de igualdade e não re-seeda.
  if (plan.ratingNext) {
    await ratingRef.set(ratingStateToDoc(plan.ratingNext));
  }

  if (profileChanged) {
    await userRef.set(
      {
        sportOnboarding: {levelsBySport: {[sportCode]: level}},
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    const state = plan.ratingNext ?? currentRating;
    await db.collection(`users/${uid}/levelHistory`).add({
      sportCode,
      fromLevel: plan.fromLevel,
      toLevel: level,
      reason: "admin_manual",
      note: reason,
      rating: state ? Math.round(state.rating) : null,
      rd: state ? Math.round(state.rd) : null,
      ratedMatches: state ? state.ratedMatches : null,
      actor: `backoffice:${callerUid}`,
      actorLabel,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  logger.info(
    `athlete-level: ${uid} em ${sportCode} ${plan.fromLevel ?? "(sem nível)"} → ${level} ` +
      `(${plan.direction}) por ${actorLabel}`,
  );

  // O motivo é interno (staff para staff) — a notificação não o repete.
  let notified = false;
  if (profileChanged) {
    try {
      await deliverNotificationToUser({
        userId: uid,
        title: "Seu nível foi atualizado",
        body:
          `A plataforma ajustou seu nível no ${sportLabel(sportCode)} para ` +
          `${levelDisplayLabel(level) ?? level}.`,
        type: "level_admin_adjust",
        data: {url: SPORTS_LEVELS_URL, sportCode, levelCode: level},
      });
      notified = true;
    } catch (error) {
      logger.error(`athlete-level: notificação falhou para ${uid}`, error);
    }
  }

  return {
    applied: true,
    sportCode,
    fromLevel: plan.fromLevel,
    toLevel: level,
    direction: plan.direction,
    ratingRealigned: plan.ratingNext != null,
    notified,
  };
});
