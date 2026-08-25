import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {deliverNotificationToUser} from "./notification-delivery";
import {
  adjacentLevel,
  resolveLadderLevel,
  type RatingLadderConfig,
  type RatingLadderLevel,
} from "./rating-config";

/**
 * State machine de promoção/rebaixamento da escada de níveis.
 *
 * [evaluateLadderTransition] é pura (estado + config + relógio → próximo
 * estado + ações); [applyLadderActions] executa os efeitos externos (nível em
 * `users/{uid}`, auditoria em `levelHistory`, notificação) respeitando as
 * flags de rollout — em `shadowMode` os estados são persistidos para
 * validação, mas nenhum efeito externo acontece.
 */

export type LadderZone = "stable" | "promotion" | "relegation";
export type LadderState =
  | "stable"
  | "promotion_pending"
  | "relegation_observation";

export interface AthleteRatingState {
  athleteId: string;
  sportCode: string;
  rating: number;
  rd: number;
  volatility: number;
  ratedMatches: number;
  wins: number;
  losses: number;
  lastMatchAt: Date | null;
  levelCode: string;
  levelRank: number;
  zone: LadderZone;
  ladderState: LadderState;
  observationStartedAt: Date | null;
  observationMatches: number;
  notifiedAt: Date | null;
  protectedUntil: Date | null;
  seededFromLevel: string;
}

export type LadderNotificationType =
  | "level_promotion"
  | "relegation_warning"
  | "relegation_cleared"
  | "relegation_applied";

export type LadderAction =
  | {kind: "promote"; from: RatingLadderLevel; to: RatingLadderLevel}
  | {kind: "demote"; from: RatingLadderLevel; to: RatingLadderLevel}
  | {kind: "notify"; type: LadderNotificationType};

export interface LadderEvaluation {
  next: AthleteRatingState;
  actions: LadderAction[];
}

const DAY_MS = 86_400_000;

const SPORT_LABELS: Record<string, string> = {
  VOLEI_PRAIA: "vôlei de praia",
  VOLEI_QUADRA: "vôlei de quadra",
  BEACH_TENNIS: "beach tennis",
};

export function sportLabel(sportCode: string): string {
  return SPORT_LABELS[sportCode] ?? sportCode;
}

/** Zona informativa do rating dentro das bandas do nível atual. */
export function computeZone(
  rating: number,
  level: RatingLadderLevel,
): LadderZone {
  if (level.promoteAt != null && rating >= level.promoteAt) return "promotion";
  if (level.demoteAt != null && rating <= level.demoteAt) return "relegation";
  return "stable";
}

function meetsDecisionGates(
  state: AthleteRatingState,
  config: RatingLadderConfig,
): boolean {
  return (
    state.rd <= config.ladder.maxRdForDecision &&
    state.ratedMatches >= config.ladder.minRatedMatches
  );
}

/**
 * Avalia o estado da escada após um rating update ([trigger] `match`) ou no
 * passe diário ([trigger] `daily`). Não aplica promoção/rebaixamento — devolve
 * ações para [applyLadderActions] decidir conforme as flags.
 */
export function evaluateLadderTransition(
  state: AthleteRatingState,
  config: RatingLadderConfig,
  now: Date,
  trigger: "match" | "daily",
): LadderEvaluation {
  const level = resolveLadderLevel(config, state.levelCode);
  const actions: LadderAction[] = [];
  const next: AthleteRatingState = {
    ...state,
    levelCode: level.code,
    levelRank: level.rank,
    zone: computeZone(state.rating, level),
  };

  if (state.ladderState === "relegation_observation") {
    if (trigger === "match") {
      next.observationMatches = state.observationMatches + 1;
    }

    // Recuperação: saiu da banda com margem → volta a stable em qualquer update.
    if (
      level.demoteAt != null &&
      state.rating > level.demoteAt + config.ladder.relegationRecoveryMargin
    ) {
      next.ladderState = "stable";
      next.observationStartedAt = null;
      next.observationMatches = 0;
      actions.push({kind: "notify", type: "relegation_cleared"});
      return {next, actions};
    }

    // Expiração da janela: só o passe diário decide.
    const startedAt = state.observationStartedAt;
    const windowMs = config.ladder.relegationObservationDays * DAY_MS;
    if (
      trigger === "daily" &&
      startedAt != null &&
      now.getTime() - startedAt.getTime() >= windowMs
    ) {
      const conclusive =
        next.observationMatches >=
          config.ladder.relegationObservationMinMatches &&
        level.demoteAt != null &&
        state.rating <= level.demoteAt;
      const below = adjacentLevel(config, level, "down");
      if (conclusive && below) {
        actions.push({kind: "demote", from: level, to: below});
        actions.push({kind: "notify", type: "relegation_applied"});
      } else {
        // Inconclusivo (poucas partidas na janela) → nunca rebaixa por
        // inatividade; volta a stable sem notificação.
        next.ladderState = "stable";
        next.observationStartedAt = null;
        next.observationMatches = 0;
      }
    }
    return {next, actions};
  }

  if (state.ladderState === "promotion_pending") {
    // Caiu da banda antes de aplicar → volta a stable (zona morta evita flap).
    if (level.promoteAt == null || state.rating < level.promoteAt) {
      next.ladderState = "stable";
      return {next, actions};
    }
    // Continua elegível: reemite a ação (aplicada quando as flags permitirem).
    const above = adjacentLevel(config, level, "up");
    if (above && meetsDecisionGates(state, config)) {
      actions.push({kind: "promote", from: level, to: above});
      actions.push({kind: "notify", type: "level_promotion"});
    }
    return {next, actions};
  }

  // stable →
  const above = adjacentLevel(config, level, "up");
  if (
    level.promoteAt != null &&
    state.rating >= level.promoteAt &&
    above != null &&
    meetsDecisionGates(state, config)
  ) {
    next.ladderState = "promotion_pending";
    actions.push({kind: "promote", from: level, to: above});
    actions.push({kind: "notify", type: "level_promotion"});
    return {next, actions};
  }

  const below = adjacentLevel(config, level, "down");
  const isProtected =
    state.protectedUntil != null && now.getTime() <= state.protectedUntil.getTime();
  if (
    level.demoteAt != null &&
    state.rating <= level.demoteAt &&
    below != null &&
    !isProtected &&
    meetsDecisionGates(state, config)
  ) {
    next.ladderState = "relegation_observation";
    next.observationStartedAt = now;
    next.observationMatches = 0;
    actions.push({kind: "notify", type: "relegation_warning"});
    return {next, actions};
  }

  return {next, actions};
}

/** Aplica a promoção no estado (nível novo, proteção; rating/RD intocados). */
export function applyPromotion(
  state: AthleteRatingState,
  config: RatingLadderConfig,
  to: RatingLadderLevel,
  now: Date,
): AthleteRatingState {
  return {
    ...state,
    levelCode: to.code,
    levelRank: to.rank,
    ladderState: "stable",
    zone: computeZone(state.rating, to),
    observationStartedAt: null,
    observationMatches: 0,
    protectedUntil: new Date(
      now.getTime() + config.ladder.promotionProtectionDays * DAY_MS,
    ),
  };
}

/** Aplica o rebaixamento (nível abaixo, RD re-seedado para consolidar). */
export function applyRelegation(
  state: AthleteRatingState,
  config: RatingLadderConfig,
  to: RatingLadderLevel,
): AthleteRatingState {
  return {
    ...state,
    levelCode: to.code,
    levelRank: to.rank,
    ladderState: "stable",
    zone: computeZone(state.rating, to),
    observationStartedAt: null,
    observationMatches: 0,
    // RD alto bloqueia nova decisão via maxRdForDecision até consolidar.
    rd: Math.round(config.glicko.initialRd * 0.7),
  };
}

function notificationContent(
  type: LadderNotificationType,
  params: {sportCode: string; levelLabel: string},
): {title: string; body: string} {
  const sport = sportLabel(params.sportCode);
  switch (type) {
    case "level_promotion":
      return {
        title: "Parabéns! Você subiu de nível 🎉",
        body: `Seus resultados em torneios te levaram para ${params.levelLabel} no ${sport}.`,
      };
    case "relegation_warning":
      return {
        title: "Zona de reclassificação",
        body:
          `Seu desempenho recente no ${sport} ficou abaixo da faixa de ` +
          `${params.levelLabel}. Você tem 90 dias de observação para recuperar.`,
      };
    case "relegation_cleared":
      return {
        title: "Você saiu da zona de reclassificação 💪",
        body: `Boa recuperação! Seu nível ${params.levelLabel} no ${sport} está garantido.`,
      };
    case "relegation_applied":
      return {
        title: "Seu nível foi atualizado",
        body:
          `Após o período de observação, seu nível no ${sport} passou a ser ` +
          `${params.levelLabel}. Continue jogando para subir de novo!`,
      };
  }
}

const SPORTS_LEVELS_URL = "/athlete/profile/sports-levels";

/**
 * Executa as ações da avaliação conforme as flags e devolve o estado final a
 * persistir em `athleteRatings`. Promoção/rebaixamento escrevem APENAS
 * `sportOnboarding.levelsBySport[sportCode]` (nunca o `level` global) +
 * auditoria em `levelHistory`.
 *
 * `ratingRef` é o doc `athleteRatings/{athleteId}_{sportCode}` do PRÓPRIO
 * chamador (ele grava o estado final de novo ao final, com o resto do
 * `state` que muda depois daqui — ex. `notifiedAt`). A gravação aqui é
 * proposital e não redundante: precisa acontecer ANTES do `users/{athleteId}`
 * abaixo. `onUserWrittenTrackLevelChanges` (rating-triggers.ts) usa
 * `athleteRatings.levelCode === newLevel.code` pra distinguir a própria
 * engine (ou o script admin) de uma auto-correção do atleta — essa
 * distinção só funciona se a ORDEM das escritas for uma invariante real, não
 * um acidente de timing entre dois `await` numa função. O script admin já
 * escreve nessa ordem (rating antes de users); aqui replicamos.
 */
export async function applyLadderActions(
  db: Firestore,
  evaluation: LadderEvaluation,
  config: RatingLadderConfig,
  now: Date,
  ratingRef: DocumentReference,
): Promise<AthleteRatingState> {
  let state = evaluation.next;
  const flags = config.flags;
  const external = !flags.shadowMode;
  let appliedLevelChange: {reason: "promotion" | "relegation"; to: RatingLadderLevel} | null =
    null;

  for (const action of evaluation.actions) {
    if (action.kind === "promote" && external && flags.autoPromotionEnabled) {
      state = applyPromotion(state, config, action.to, now);
      appliedLevelChange = {reason: "promotion", to: action.to};
    }
    if (action.kind === "demote" && external && flags.autoRelegationEnabled) {
      state = applyRelegation(state, config, action.to);
      appliedLevelChange = {reason: "relegation", to: action.to};
    }
  }

  if (appliedLevelChange) {
    const {athleteId, sportCode} = state;
    // Precisa vir ANTES do write de `users/{athleteId}` — ver doc do topo da
    // função.
    await ratingRef.set(ratingStateToDoc(state), {merge: true});
    await db.doc(`users/${athleteId}`).set(
      {
        sportOnboarding: {
          levelsBySport: {[sportCode]: appliedLevelChange.to.code},
        },
      },
      {merge: true},
    );
    await db.collection(`users/${athleteId}/levelHistory`).add({
      sportCode,
      fromLevel: evaluation.next.levelCode,
      toLevel: appliedLevelChange.to.code,
      reason: appliedLevelChange.reason,
      rating: Math.round(state.rating),
      rd: Math.round(state.rd),
      ratedMatches: state.ratedMatches,
      actor: "rating_engine",
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  for (const action of evaluation.actions) {
    if (action.kind !== "notify") continue;
    if (!external || !flags.notificationsEnabled) continue;
    // Nível mudou de fato? Notificações de promoção/rebaixamento só saem
    // acompanhando a mudança real (as de warning/cleared são informativas).
    if (action.type === "level_promotion" && appliedLevelChange?.reason !== "promotion") {
      continue;
    }
    if (action.type === "relegation_applied" && appliedLevelChange?.reason !== "relegation") {
      continue;
    }
    if (action.type === "relegation_warning" && state.notifiedAt != null) {
      continue; // aviso de observação sai UMA vez por janela.
    }

    const level = resolveLadderLevel(config, state.levelCode);
    const content = notificationContent(action.type, {
      sportCode: state.sportCode,
      levelLabel: level.label,
    });
    try {
      await deliverNotificationToUser({
        userId: state.athleteId,
        title: content.title,
        body: content.body,
        type: action.type,
        data: {
          url: SPORTS_LEVELS_URL,
          sportCode: state.sportCode,
          levelCode: state.levelCode,
        },
      });
      if (action.type === "relegation_warning") {
        state = {...state, notifiedAt: now};
      }
    } catch (error) {
      logger.error(
        `rating-ladder: notificação ${action.type} falhou para ${state.athleteId}`,
        error,
      );
    }
  }

  // Saiu da observação → o próximo ciclo pode notificar de novo.
  if (state.ladderState !== "relegation_observation" && state.notifiedAt != null) {
    state = {...state, notifiedAt: null};
  }

  return state;
}

/** (De)serialização do doc `athleteRatings/{athleteId}_{sportCode}`. */
export function ratingStateToDoc(
  state: AthleteRatingState,
): Record<string, unknown> {
  return {
    athleteId: state.athleteId,
    sportCode: state.sportCode,
    rating: state.rating,
    rd: state.rd,
    volatility: state.volatility,
    ratedMatches: state.ratedMatches,
    wins: state.wins,
    losses: state.losses,
    lastMatchAt: state.lastMatchAt ? Timestamp.fromDate(state.lastMatchAt) : null,
    levelCode: state.levelCode,
    levelRank: state.levelRank,
    zone: state.zone,
    ladderState: state.ladderState,
    observationStartedAt: state.observationStartedAt
      ? Timestamp.fromDate(state.observationStartedAt)
      : null,
    observationMatches: state.observationMatches,
    notifiedAt: state.notifiedAt ? Timestamp.fromDate(state.notifiedAt) : null,
    protectedUntil: state.protectedUntil
      ? Timestamp.fromDate(state.protectedUntil)
      : null,
    seededFromLevel: state.seededFromLevel,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function toDate(raw: unknown): Date | null {
  if (raw && typeof raw === "object" && "toDate" in raw) {
    const date = (raw as Timestamp).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/** Rank correto para um código de nível segundo a escada vigente — usado pela
 *  migração de renumeração (recalcula pelo CÓDIGO; o rank gravado pode ser da
 *  numeração antiga). */
export function expectedLevelRankFor(
  config: RatingLadderConfig,
  levelCode: unknown,
): number {
  return resolveLadderLevel(config, levelCode).rank;
}

export type LevelRankChangeKind = "upgrade" | "downgrade" | "none";

/**
 * Classifica a mudança de rank declarado em `sportOnboarding.levelsBySport`.
 * Esporte novo no perfil (`beforeRank` ausente) conta como upgrade — é a
 * primeira declaração, não uma correção. Mesmo rank (rename/legado, ex.:
 * "avancado1" → "avancado_1") não é nem upgrade nem downgrade.
 */
export function classifyLevelRankChange(
  beforeRank: number | null,
  afterRank: number,
): LevelRankChangeKind {
  if (beforeRank == null || afterRank > beforeRank) return "upgrade";
  if (afterRank < beforeRank) return "downgrade";
  return "none";
}

/**
 * Efeito no rating de uma correção pré-lock (o atleta baixa o próprio nível
 * na janela de calibração — só possível para BAIXO, upgrade segue o fluxo
 * normal). Reseeda rating/RD/levelRank para o piso do novo degrau somente
 * quando o atleta ainda não jogou partida rateada (`ratedMatches === 0`):
 * com partidas já rateadas o rating fica como está (o Glicko já é uma medida
 * melhor que o nível autodeclarado) — só a auditoria em `levelHistory` muda,
 * gravada pelo chamador. `null` = nada a escrever em `athleteRatings`
 * (também cobre o caso de não existir doc ainda: nada a reseedar).
 */
export function selfCorrectionRatingUpdate(
  current: AthleteRatingState | null,
  newLevel: Pick<RatingLadderLevel, "code" | "rank" | "initialRating">,
  initialRd: number,
): AthleteRatingState | null {
  if (!current || current.ratedMatches !== 0) return null;
  return {
    ...current,
    rating: newLevel.initialRating,
    rd: initialRd,
    levelCode: newLevel.code,
    levelRank: newLevel.rank,
  };
}

export function ratingStateFromDoc(
  athleteId: string,
  sportCode: string,
  data: Record<string, unknown>,
): AthleteRatingState {
  const num = (raw: unknown, fallback: number): number => {
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  };
  const ladderState = String(data.ladderState ?? "stable");
  const zone = String(data.zone ?? "stable");
  return {
    athleteId,
    sportCode,
    rating: num(data.rating, 1500),
    rd: num(data.rd, 350),
    volatility: num(data.volatility, 0.06),
    ratedMatches: num(data.ratedMatches, 0),
    wins: num(data.wins, 0),
    losses: num(data.losses, 0),
    lastMatchAt: toDate(data.lastMatchAt),
    levelCode: String(data.levelCode ?? ""),
    levelRank: num(data.levelRank, 0),
    zone: (["stable", "promotion", "relegation"] as const).includes(
      zone as LadderZone,
    )
      ? (zone as LadderZone)
      : "stable",
    ladderState: (
      ["stable", "promotion_pending", "relegation_observation"] as const
    ).includes(ladderState as LadderState)
      ? (ladderState as LadderState)
      : "stable",
    observationStartedAt: toDate(data.observationStartedAt),
    observationMatches: num(data.observationMatches, 0),
    notifiedAt: toDate(data.notifiedAt),
    protectedUntil: toDate(data.protectedUntil),
    seededFromLevel: String(data.seededFromLevel ?? ""),
  };
}
