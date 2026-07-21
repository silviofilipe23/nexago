import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {
  FieldValue,
  type Firestore,
  getFirestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

import {syncAchievementsForUser} from "./achievement-engine";

/**
 * Programa de indicação (referral).
 *
 * Código de indicação: reaproveita o próprio UID do atleta. O projeto não
 * tem hoje nenhum handle/username curto e único (confirmado lendo
 * `athlete_profile.dart` — só existe `nickname`, texto livre sem checagem de
 * unicidade). Gerar um código aleatório novo exigiria uma coleção de reserva
 * só para isso; o UID já é único, estável e existe pra todo atleta, então é
 * o "identificador curto reaproveitável" mais simples disponível.
 *
 * Recompensa: XP via `users/{uid}/gamification` (não existe carteira de
 * atleta hoje — ver spec da feature). Mesmo padrão idempotente dos outros
 * gatilhos de gamificação (doc de evento com ID determinístico em
 * `gamification_events`, nunca credita duas vezes).
 *
 * Âncora de crédito: 1ª partida concluída do atleta indicado — reaproveita o
 * MESMO evento `GAME_COMPLETED` que `game-completed-gamification.ts` já
 * escreve (ele incrementa `totalGames` no summary). É a âncora mais fácil de
 * detectar sem duplicar lógica de elegibilidade de reserva/pagamento, e
 * evita farming: só credita depois que o indicado de fato jogou, nunca no
 * cadastro puro.
 */

export const XP_REFERRAL_BONUS = 50;
export const REFERRAL_BONUS_EVENT_TYPE = "REFERRAL_BONUS";

export function referralBonusEventId(referredUid: string): string {
  return `referral_bonus_${referredUid.trim()}`;
}

// —— Registro da indicação (`registerReferral`) ——

export type ReferralRegistrationRejection =
  | "MISSING_CODE"
  | "SELF_REFERRAL"
  | "REFERRER_NOT_FOUND"
  | "ALREADY_SET";

export interface ReferralRegistrationDecision {
  apply: boolean;
  rejection?: ReferralRegistrationRejection;
}

/**
 * Decide se `registerReferral` deve gravar `referredBy` — pura, sem tocar
 * Firestore, pra testar idempotência/auto-indicação isoladas do transporte.
 */
export function resolveReferralRegistration(params: {
  callerUid: string;
  referralCode: string;
  currentReferredBy: unknown;
  referrerExists: boolean;
}): ReferralRegistrationDecision {
  const callerUid = params.callerUid.trim();
  const referrerUid = params.referralCode.trim();

  if (!referrerUid) return {apply: false, rejection: "MISSING_CODE"};
  if (referrerUid === callerUid) return {apply: false, rejection: "SELF_REFERRAL"};

  const currentReferredBy =
    typeof params.currentReferredBy === "string" ? params.currentReferredBy.trim() : "";
  if (currentReferredBy) return {apply: false, rejection: "ALREADY_SET"};

  if (!params.referrerExists) return {apply: false, rejection: "REFERRER_NOT_FOUND"};

  return {apply: true};
}

/**
 * Grava `users/{callerUid}.referredBy = referrerUid` — idempotente (só se
 * ainda não setado) e nunca sobrescreve. Chamada uma vez pelo atleta novo,
 * logo após o cadastro.
 */
export async function registerReferralForUser(
  db: Firestore,
  callerUid: string,
  referralCodeRaw: string,
): Promise<ReferralRegistrationDecision> {
  const callerUidTrim = callerUid.trim();
  const referrerUid = (referralCodeRaw ?? "").trim();

  if (!callerUidTrim) return {apply: false, rejection: "MISSING_CODE"};
  if (!referrerUid) return {apply: false, rejection: "MISSING_CODE"};
  if (referrerUid === callerUidTrim) return {apply: false, rejection: "SELF_REFERRAL"};

  const referrerSnap = await db.collection("users").doc(referrerUid).get();
  const referrerExists = referrerSnap.exists;

  const userRef = db.collection("users").doc(callerUidTrim);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const currentReferredBy = snap.exists ? snap.data()?.["referredBy"] : undefined;

    const decision = resolveReferralRegistration({
      callerUid: callerUidTrim,
      referralCode: referrerUid,
      currentReferredBy,
      referrerExists,
    });
    if (!decision.apply) return decision;

    tx.set(
      userRef,
      {
        referredBy: referrerUid,
        referredByAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    return decision;
  });
}

export const registerReferral = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Login necessário.");
  }

  const referralCode =
    typeof request.data?.referralCode === "string" ? request.data.referralCode : "";

  try {
    const decision = await registerReferralForUser(getFirestore(), uid, referralCode);
    return {applied: decision.apply, rejection: decision.rejection ?? null};
  } catch (error) {
    logger.error("registerReferral: falha", {uid, error});
    throw new HttpsError("internal", "Não foi possível registrar a indicação.");
  }
});

// —— Crédito de XP pro indicador (1ª partida concluída do indicado) ——

/**
 * Detecta a transição "0 → 1" em `totalGames` do summary — sinal de que o
 * atleta concluiu a 1ª partida (campo exclusivamente incrementado por
 * `processCompletedGameForUser`, em `game-completed-gamification.ts`).
 */
export function shouldAwardReferralFirstGameBonus(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): boolean {
  if (!after) return false;
  const totalGamesAfter = Number(after["totalGames"] ?? 0) || 0;
  if (totalGamesAfter !== 1) return false;
  const totalGamesBefore = Number(before?.["totalGames"] ?? 0) || 0;
  return totalGamesBefore === 0;
}

export interface ReferralBonusComputation {
  award: boolean;
  nextXp: number;
  nextLevel: number;
  nextReferralsCount: number;
}

/**
 * Calcula o próximo estado do summary do indicador — pura, sem Firestore,
 * pra testar a idempotência (evento já existente não deve gerar novo
 * crédito) isolada da transação.
 */
export function computeReferralBonusAward(params: {
  alreadyCredited: boolean;
  currentXp: unknown;
  currentReferralsCount: unknown;
}): ReferralBonusComputation {
  const rawXp =
    typeof params.currentXp === "number" ? params.currentXp : Number(params.currentXp ?? 0);
  const rawReferrals =
    typeof params.currentReferralsCount === "number" ?
      params.currentReferralsCount :
      Number(params.currentReferralsCount ?? 0);
  const currentXp = Number.isFinite(rawXp) ? rawXp : 0;
  const currentReferrals = Number.isFinite(rawReferrals) ? rawReferrals : 0;

  if (params.alreadyCredited) {
    return {
      award: false,
      nextXp: currentXp,
      nextLevel: Math.floor(currentXp / 100),
      nextReferralsCount: currentReferrals,
    };
  }

  const nextXp = currentXp + XP_REFERRAL_BONUS;
  return {
    award: true,
    nextXp,
    nextLevel: Math.floor(nextXp / 100),
    nextReferralsCount: currentReferrals + 1,
  };
}

/** Credita XP pro indicador de `referredUid`, se houver um (idempotente por indicado). */
export async function awardReferralBonusForFirstGame(
  db: Firestore,
  referredUid: string,
): Promise<boolean> {
  const referredUidTrim = referredUid.trim();
  if (!referredUidTrim) return false;

  const referredUserSnap = await db.collection("users").doc(referredUidTrim).get();
  const referredByRaw = referredUserSnap.data()?.["referredBy"];
  const referrerUid = typeof referredByRaw === "string" ? referredByRaw.trim() : "";
  if (!referrerUid) return false;

  const eventRef = db
    .collection("users")
    .doc(referrerUid)
    .collection("gamification_events")
    .doc(referralBonusEventId(referredUidTrim));
  const summaryRef = db
    .collection("users")
    .doc(referrerUid)
    .collection("gamification")
    .doc("summary");

  const awarded = await db.runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef);
    const summarySnap = await tx.get(summaryRef);
    const data = summarySnap.data() ?? {};

    const computation = computeReferralBonusAward({
      alreadyCredited: eventSnap.exists,
      currentXp: data["xp"],
      currentReferralsCount: data["referralsCount"],
    });
    if (!computation.award) return false;

    tx.set(
      summaryRef,
      {
        xp: computation.nextXp,
        level: computation.nextLevel,
        referralsCount: computation.nextReferralsCount,
        updatedAt: FieldValue.serverTimestamp(),
        lastXpReason: REFERRAL_BONUS_EVENT_TYPE,
      },
      {merge: true},
    );
    tx.set(eventRef, {
      type: REFERRAL_BONUS_EVENT_TYPE,
      referredUid: referredUidTrim,
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (!awarded) return false;
  await syncAchievementsForUser(db, referrerUid);
  return true;
}

export const onGamificationSummaryWrittenAwardReferralBonus = onDocumentWritten(
  "users/{userId}/gamification/summary",
  async (event) => {
    const beforeSnap = event.data?.before;
    const afterSnap = event.data?.after;
    if (!afterSnap?.exists) return;

    const before = beforeSnap?.exists ? beforeSnap.data() ?? {} : undefined;
    const after = afterSnap.data() ?? {};
    if (!shouldAwardReferralFirstGameBonus(before, after)) return;

    const referredUid = event.params.userId;
    try {
      const awarded = await awardReferralBonusForFirstGame(getFirestore(), referredUid);
      if (awarded) {
        logger.info(
          `referralBonus: +${XP_REFERRAL_BONUS} XP pro indicador de ${referredUid} (1ª partida concluída)`,
        );
      }
    } catch (error) {
      logger.error(`referralBonus: falha ao processar indicado ${referredUid}`, error);
    }
  },
);
