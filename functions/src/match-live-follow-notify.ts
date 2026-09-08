/**
 * Decide quais escritas no doc da partida viram push de "placar ao vivo" para
 * quem segue o jogo.
 *
 * A mesa grava PONTO A PONTO (`recordPointTransaction` no app,
 * `updateLiveMatchScore` na web), então este módulo é chamado dezenas de vezes
 * por partida e a maior parte do trabalho é dizer "não". Ver
 * `docs/superpowers/specs/2026-09-05-seguir-partida-tela-bloqueada-design.md`.
 */

import {
  DEFAULT_BEST_OF,
  ScoreSet,
  isSetWon,
  setsWon,
  targetPointsForSet,
} from "./match-scoring";
import {
  isMatchCanceled,
  isMatchCompleted,
  isMatchInProgress,
  isMatchScheduled,
} from "./match-status";

/** Janela mínima entre dois pushes de ponto comum. Momento-chave a ignora. */
export const SCORE_THROTTLE_MS = 20_000;

export type LiveUpdateKind =
  | "start"
  | "set"
  | "matchPoint"
  | "score"
  | "end"
  | "dismiss";

export interface LiveScoreFields {
  setsA: number;
  setsB: number;
  currentGamesA: number;
  currentGamesB: number;
}

export interface LiveMatchSnapshot {
  status: string;
  sets: ScoreSet[];
  liveScore: LiveScoreFields | null;
  currentSetIndex: number | null;
  bestOf: number | null;
}

export interface NotifySidecar {
  lastPushAt: number | null;
  lastSignature: string | null;
}

/**
 * Lado que fecha o set no próximo ponto. `closesMatch` distingue set point de
 * match point — é o que dá o texto certo à notificação sem refazer esta conta
 * do lado de quem monta a mensagem.
 */
export interface PointAlert {
  side: "A" | "B";
  closesMatch: boolean;
}

export interface LiveUpdateDecision {
  push: boolean;
  kind: LiveUpdateKind | null;
  signature: string;
  reason: string;
  pointAlert: PointAlert | null;
}

/** Placar normalizado: as duas mesas gravam em formatos diferentes. */
interface NormalizedScore {
  wonA: number;
  wonB: number;
  currentA: number;
  currentB: number;
  setIndex: number;
  bestOf: number;
}

/** Mesma regra de `organizer-match-ops.ts`: só 1 ou 3 são formatos válidos. */
function normalizeBestOf(raw: unknown): number {
  const n = Number(raw);
  return n === 1 || n === 3 ? n : DEFAULT_BEST_OF;
}

function intOf(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/**
 * Reduz os dois formatos de placar a um só.
 *
 * A mesa do app grava `sets[]` (incluindo o set em jogo) + `currentSetIndex`; a
 * mesa web grava `liveScore` com sets JÁ VENCIDOS + pontos do set corrente.
 * `sets` tem prioridade por ser o formato mais rico: quando os dois coexistem
 * (partida começada numa mesa e seguida na outra), o `liveScore` é o velho.
 */
function normalize(snapshot: LiveMatchSnapshot): NormalizedScore {
  const bestOf = normalizeBestOf(snapshot.bestOf);
  const sets = Array.isArray(snapshot.sets) ? snapshot.sets : [];
  const rawIndex = snapshot.currentSetIndex;
  const setIndex =
    typeof rawIndex === "number" && rawIndex >= 0 ?
      Math.trunc(rawIndex) :
      Math.max(0, sets.length - 1);

  if (sets.length > 0) {
    const wins = setsWon(sets, bestOf);
    const current = sets[setIndex] ?? {a: 0, b: 0};
    return {
      wonA: wins.a,
      wonB: wins.b,
      currentA: intOf(current.a),
      currentB: intOf(current.b),
      setIndex,
      bestOf,
    };
  }

  const live = snapshot.liveScore;
  if (live) {
    return {
      wonA: intOf(live.setsA),
      wonB: intOf(live.setsB),
      currentA: intOf(live.currentGamesA),
      currentB: intOf(live.currentGamesB),
      setIndex,
      bestOf,
    };
  }

  return {wonA: 0, wonB: 0, currentA: 0, currentB: 0, setIndex, bestOf};
}

/**
 * Assinatura do que é PLACAR — nunca `updatedAt`.
 *
 * Serve a dois propósitos: ignorar update que mexeu no doc sem mexer no jogo
 * (a mesa corrigiu a quadra) e ignorar reentrega do mesmo evento pelo gatilho.
 */
export function liveScoreSignature(snapshot: LiveMatchSnapshot): string {
  const s = normalize(snapshot);
  const status = String(snapshot.status ?? "").trim().toLowerCase();
  return [status, s.wonA, s.wonB, s.currentA, s.currentB, s.setIndex].join("|");
}

/** Quem fecha o set no próximo ponto, e se esse set também fecha a partida. */
function pointAlertOf(s: NormalizedScore): PointAlert | null {
  const target = targetPointsForSet(s.setIndex, s.bestOf);
  const neededSets = Math.ceil(s.bestOf / 2);

  if (isSetWon(s.currentA + 1, s.currentB, target)) {
    return {side: "A", closesMatch: s.wonA + 1 >= neededSets};
  }
  if (isSetWon(s.currentA, s.currentB + 1, target)) {
    return {side: "B", closesMatch: s.wonB + 1 >= neededSets};
  }
  return null;
}

function decision(
  push: boolean,
  kind: LiveUpdateKind | null,
  signature: string,
  reason: string,
  pointAlert: PointAlert | null = null,
): LiveUpdateDecision {
  return {push, kind, signature, reason, pointAlert};
}

/**
 * Núcleo puro do fan-out: dada a partida antes e depois da escrita, diz se
 * aquilo merece um push e de que tipo.
 *
 * `nowMs` entra por parâmetro (e não `Date.now()`) para o teste conseguir
 * posicionar a janela do throttle.
 */
export function resolveLiveUpdate(
  before: LiveMatchSnapshot,
  after: LiveMatchSnapshot,
  sidecar: NotifySidecar,
  nowMs: number,
): LiveUpdateDecision {
  const signature = liveScoreSignature(after);

  if (liveScoreSignature(before) === signature) {
    return decision(false, null, signature, "placar inalterado");
  }
  if (sidecar.lastSignature === signature) {
    return decision(false, null, signature, "assinatura ja notificada");
  }

  const wasInProgress = isMatchInProgress(before.status);
  const wasCompleted = isMatchCompleted(before.status);

  if (isMatchCanceled(after.status)) {
    return decision(true, "dismiss", signature, "partida cancelada");
  }
  if (isMatchScheduled(after.status) && (wasInProgress || wasCompleted)) {
    return decision(true, "dismiss", signature, "partida devolvida a agenda");
  }
  if (isMatchCompleted(after.status) && !wasCompleted) {
    return decision(true, "end", signature, "partida encerrada");
  }
  if (isMatchInProgress(after.status) && !wasInProgress) {
    return decision(true, "start", signature, "partida comecou");
  }

  const scoreBefore = normalize(before);
  const scoreAfter = normalize(after);

  if (
    scoreAfter.wonA !== scoreBefore.wonA ||
    scoreAfter.wonB !== scoreBefore.wonB
  ) {
    return decision(true, "set", signature, "set encerrado");
  }

  // Só a ENTRADA em set/match point alerta. Sem isso, 20x15, 20x16, 20x17...
  // continuariam sendo match point e a notificação vibraria a cada ponto do
  // adversário até o set fechar.
  const alertAfter = pointAlertOf(scoreAfter);
  const alertBefore = pointAlertOf(scoreBefore);
  const enteredAlert =
    alertAfter !== null &&
    (alertBefore === null || alertBefore.side !== alertAfter.side);
  if (enteredAlert) {
    const reason = alertAfter.closesMatch ? "match point" : "set point";
    return decision(true, "matchPoint", signature, reason, alertAfter);
  }

  const last = sidecar.lastPushAt;
  const withinThrottle = last !== null && nowMs - last < SCORE_THROTTLE_MS;
  if (withinThrottle) {
    return decision(false, "score", signature, "ponto dentro da janela");
  }

  return decision(true, "score", signature, "ponto comum");
}
