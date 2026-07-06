import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  FieldValue,
  type DocumentSnapshot,
  type Firestore,
  getFirestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

import {parseGamificationSummary, countGameDaysInWindow} from "./tournament-match-gamification";
import {computeProfileRewardContext, achievementEventId} from "./profile-completion-shared";

export {achievementEventId};

/**
 * Porte 1:1 do catálogo de 24 conquistas em
 * nexago_app/lib/features/athlete/domain/achievements/*.dart
 * (achievement_catalog.dart, achievement_unlock_rule.dart, achievement_state_resolver.dart).
 * Mantém os dois lados em paridade — qualquer conquista nova precisa ser adicionada aqui também.
 */

export type AchievementRule =
  | {type: "onboardingCompleted"}
  | {type: "totalGames"; target: number}
  | {type: "streak"; target: number}
  | {type: "gamesInLastDays"; days: number; target: number}
  | {type: "profileStepsDone"; target: number}
  | {type: "profileAllComplete"}
  | {type: "identityComplete"}
  | {type: "invitesCount"; target: number}
  | {type: "profileSharesCount"; target: number}
  | {type: "attendanceConfirmations"; target: number}
  | {type: "attendanceStreak"; target: number}
  | {type: "totalBookings"; target: number}
  | {type: "favoriteArenasCount"; target: number}
  | {type: "checkInsCount"; target: number};

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  rule: AchievementRule;
}

export const ACHIEVEMENT_CATALOG: AchievementDef[] = [
  // —— Primeiros passos (8) ——
  {
    id: "WELCOME",
    title: "Bem-vindo",
    description: "Complete o onboarding.",
    xpReward: 20,
    rule: {type: "onboardingCompleted"},
  },
  {
    id: "FIRST_GAME",
    title: "Primeiro jogo",
    description: "Bata uma bola.",
    xpReward: 50,
    rule: {type: "totalGames", target: 1},
  },
  {
    id: "IDENTITY",
    title: "Identidade",
    description: "Foto + esporte no perfil.",
    xpReward: 40,
    rule: {type: "identityComplete"},
  },
  {
    id: "PROFILE_COMPLETE",
    title: "Perfil completo",
    description: "Todos os passos do perfil.",
    xpReward: 80,
    rule: {type: "profileAllComplete"},
  },
  {
    id: "FIRST_BOOKING",
    title: "Primeira reserva",
    description: "Reserve sua primeira quadra.",
    xpReward: 30,
    rule: {type: "totalBookings", target: 1},
  },
  {
    id: "FIRST_FAVORITE",
    title: "Arena favorita",
    description: "Favorite uma arena.",
    xpReward: 15,
    rule: {type: "favoriteArenasCount", target: 1},
  },
  {
    id: "FIRST_INVITE",
    title: "Primeiro convite",
    description: "Convide alguém para jogar.",
    xpReward: 25,
    rule: {type: "invitesCount", target: 1},
  },
  {
    id: "FIRST_CHECKIN",
    title: "Check-in",
    description: "Confirme presença no local.",
    xpReward: 25,
    rule: {type: "checkInsCount", target: 1},
  },
  // —— Constância (8) ——
  {
    id: "FIVE_GAMES",
    title: "5 jogos",
    description: "Cinco partidas no total.",
    xpReward: 60,
    rule: {type: "totalGames", target: 5},
  },
  {
    id: "TEN_GAMES_30D",
    title: "10 jogos",
    description: "10 partidas em 30 dias.",
    xpReward: 100,
    rule: {type: "gamesInLastDays", days: 30, target: 10},
  },
  {
    id: "TWENTY_FIVE_GAMES",
    title: "25 jogos",
    description: "Veterano da quadra.",
    xpReward: 120,
    rule: {type: "totalGames", target: 25},
  },
  {
    id: "STREAK_3",
    title: "Sequência 3",
    description: "Jogue 3 dias seguidos.",
    xpReward: 45,
    rule: {type: "streak", target: 3},
  },
  {
    id: "STREAK_5",
    title: "Em chamas",
    description: "Sequência de 5 dias.",
    xpReward: 70,
    rule: {type: "streak", target: 5},
  },
  {
    id: "STREAK_7",
    title: "Regular",
    description: "Semana cheia de jogos.",
    xpReward: 90,
    rule: {type: "streak", target: 7},
  },
  {
    id: "ATTENDANCE_STREAK_5",
    title: "Pontual",
    description: "5 confirmações seguidas.",
    xpReward: 55,
    rule: {type: "attendanceStreak", target: 5},
  },
  {
    id: "ATTENDANCE_TOTAL_10",
    title: "Comprometido",
    description: "10 confirmações de presença.",
    xpReward: 75,
    rule: {type: "attendanceConfirmations", target: 10},
  },
  // —— Social (8) ——
  {
    id: "CONNECTOR",
    title: "Conector",
    description: "Convide 3 amigos.",
    xpReward: 60,
    rule: {type: "invitesCount", target: 3},
  },
  {
    id: "AMBASSADOR",
    title: "Embaixador",
    description: "Compartilhe seu perfil.",
    xpReward: 35,
    rule: {type: "profileSharesCount", target: 1},
  },
  {
    id: "FIVE_INVITES",
    title: "Recrutador",
    description: "5 convites enviados.",
    xpReward: 80,
    rule: {type: "invitesCount", target: 5},
  },
  {
    id: "THREE_SHARES",
    title: "Influencer",
    description: "Compartilhe 3 vezes.",
    xpReward: 50,
    rule: {type: "profileSharesCount", target: 3},
  },
  {
    id: "TEN_INVITES",
    title: "Rede forte",
    description: "10 convites enviados.",
    xpReward: 120,
    rule: {type: "invitesCount", target: 10},
  },
  {
    id: "FIVE_SHARES",
    title: "Divulgador",
    description: "5 compartilhamentos.",
    xpReward: 70,
    rule: {type: "profileSharesCount", target: 5},
  },
  {
    id: "ACTIVE_WEEK",
    title: "Semana ativa",
    description: "4 jogos em 7 dias.",
    xpReward: 65,
    rule: {type: "gamesInLastDays", days: 7, target: 4},
  },
  {
    id: "DEDICATED",
    title: "Dedicado",
    description: "20 jogos no total.",
    xpReward: 100,
    rule: {type: "totalGames", target: 20},
  },
];

export interface AchievementMetrics {
  xp: number;
  level: number;
  streak: number;
  totalGames: number;
  invitesCount: number;
  profileSharesCount: number;
  gamesLast30Days: number;
  gamesLast7Days: number;
  favoriteArenasCount: number;
  checkInsCount: number;
  attendanceConfirmationsTotal: number;
  attendanceConfirmationStreak: number;
  totalBookings: number;
  onboardingCompleted: boolean;
  profileStepsDone: number;
  profileAllComplete: boolean;
  identityComplete: boolean;
}

function numberField(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildAchievementMetrics(
  summaryData: Record<string, unknown> | undefined,
  userData: Record<string, unknown> | undefined,
  totalBookings = 0,
): AchievementMetrics {
  const summary = parseGamificationSummary(summaryData);
  const s = summaryData ?? {};

  const gamesLast30Days = typeof s["gamesLast30Days"] === "number" ?
    (s["gamesLast30Days"] as number) :
    countGameDaysInWindow(summary.gameCompletionDays, 30);
  const gamesLast7Days = typeof s["gamesLast7Days"] === "number" ?
    (s["gamesLast7Days"] as number) :
    countGameDaysInWindow(summary.gameCompletionDays, 7);

  const ctx = computeProfileRewardContext(userData ?? {});
  const profileStepsDone = Object.values(ctx.stepDone).filter(Boolean).length;
  const identityComplete = ctx.stepDone.photo && ctx.stepDone.sport_level;

  return {
    xp: summary.xp,
    level: summary.level,
    streak: summary.streak,
    totalGames: summary.totalGames,
    invitesCount: numberField(s, "invitesCount"),
    profileSharesCount: numberField(s, "profileSharesCount"),
    gamesLast30Days,
    gamesLast7Days,
    favoriteArenasCount: numberField(s, "favoriteArenasCount"),
    checkInsCount: numberField(s, "checkInsCount"),
    attendanceConfirmationsTotal: numberField(s, "attendanceConfirmationsTotal"),
    attendanceConfirmationStreak: numberField(s, "attendanceConfirmationStreak"),
    totalBookings,
    onboardingCompleted: ctx.onboardingCompleted,
    profileStepsDone,
    profileAllComplete: ctx.allStepsComplete,
    identityComplete,
  };
}

export function isAchievementRuleMet(
  rule: AchievementRule,
  m: AchievementMetrics,
): boolean {
  switch (rule.type) {
  case "onboardingCompleted":
    return m.onboardingCompleted;
  case "totalGames":
    return m.totalGames >= rule.target;
  case "streak":
    return m.streak >= rule.target;
  case "gamesInLastDays":
    return (rule.days === 7 ? m.gamesLast7Days : m.gamesLast30Days) >= rule.target;
  case "profileStepsDone":
    return m.profileStepsDone >= rule.target;
  case "profileAllComplete":
    return m.profileAllComplete;
  case "identityComplete":
    return m.identityComplete;
  case "invitesCount":
    return m.invitesCount >= rule.target;
  case "profileSharesCount":
    return m.profileSharesCount >= rule.target;
  case "attendanceConfirmations":
    return m.attendanceConfirmationsTotal >= rule.target;
  case "attendanceStreak":
    return m.attendanceConfirmationStreak >= rule.target;
  case "totalBookings":
    return m.totalBookings >= rule.target;
  case "favoriteArenasCount":
    return m.favoriteArenasCount >= rule.target;
  case "checkInsCount":
    return m.checkInsCount >= rule.target;
  }
}

/**
 * Sincroniza desbloqueios do catálogo (24) e XP de conquista (idempotente).
 * Porte de GamificationService.syncAchievements (gamification_service.dart) — mesma
 * estrutura em duas fases: métricas lidas fora da transação (paridade com o Dart),
 * e a transação relê xp/badges/events para os escritos.
 */
export async function syncAchievementsForUser(
  db: Firestore,
  userId: string,
  opts?: {totalBookings?: number},
): Promise<string[]> {
  const uid = userId.trim();
  if (!uid) return [];

  const summaryRef = db.collection("users").doc(uid).collection("gamification").doc("summary");
  const userRef = db.collection("users").doc(uid);
  const badgesCol = db.collection("users").doc(uid).collection("gamification_badges");
  const eventsCol = db.collection("users").doc(uid).collection("gamification_events");

  const [summarySnap, userSnap] = await Promise.all([summaryRef.get(), userRef.get()]);
  const metrics = buildAchievementMetrics(
    summarySnap.data(),
    userSnap.data(),
    opts?.totalBookings ?? 0,
  );

  const eligible = ACHIEVEMENT_CATALOG.filter((def) => isAchievementRuleMet(def.rule, metrics));
  if (eligible.length === 0) return [];

  return db.runTransaction(async (tx) => {
    // Firestore: todas as leituras antes de qualquer escrita.
    const summarySnapTx = await tx.get(summaryRef);
    const summaryData = summarySnapTx.data() ?? {};
    let xp = numberField(summaryData, "xp");
    const initialXp = xp;

    const badgeSnaps: Record<string, DocumentSnapshot> = {};
    const eventSnaps: Record<string, DocumentSnapshot> = {};
    for (const def of eligible) {
      badgeSnaps[def.id] = await tx.get(badgesCol.doc(def.id));
      eventSnaps[def.id] = await tx.get(eventsCol.doc(achievementEventId(def.id)));
    }

    const unlockedNow: string[] = [];
    for (const def of eligible) {
      if (badgeSnaps[def.id]?.exists) continue;

      const eventRef = eventsCol.doc(achievementEventId(def.id));
      if (!eventSnaps[def.id]?.exists && def.xpReward > 0) {
        xp += def.xpReward;
        tx.set(eventRef, {
          type: "ACHIEVEMENT_UNLOCK",
          achievementId: def.id,
          xp: def.xpReward,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      tx.set(
        badgesCol.doc(def.id),
        {
          badgeId: def.id,
          title: def.title,
          description: def.description,
          xpReward: def.xpReward,
          unlockedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
      unlockedNow.push(def.id);
    }

    if (xp !== initialXp) {
      tx.set(
        summaryRef,
        {
          xp,
          level: Math.floor(xp / 100),
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    }

    return unlockedNow;
  });
}

export const syncAchievements = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Login necessário.");
  }

  try {
    const unlockedAchievementIds = await syncAchievementsForUser(getFirestore(), uid);
    return {unlockedAchievementIds};
  } catch (error) {
    logger.error("syncAchievements: falha", {uid, error});
    throw new HttpsError("internal", "Não foi possível sincronizar conquistas.");
  }
});
