/**
 * `ContentState` da Live Activity — o contrato entre este backend e o `struct`
 * Swift da Widget Extension.
 *
 * É o acoplamento silencioso desta fase, irmão do nome de tópico da Fase 1:
 * renomear um campo aqui e o card simplesmente para de atualizar, sem erro em
 * lugar nenhum. Por isso o formato é travado por um teste de JSON exato, e a
 * ordem das chaves é estável.
 *
 * Ver `docs/superpowers/specs/2026-09-08-live-activity-ios-fase2-design.md`.
 */

import {
  LiveMatchSnapshot,
  LiveUpdateDecision,
  snapshotFromMatchData,
} from "./match-live-follow-notify";

/**
 * Quanto tempo o placar exibido continua valendo antes de o card se declarar
 * desatualizado.
 *
 * Precisa ser confortavelmente MAIOR que o throttle de 20s do fan-out: se
 * fosse menor, o card entraria em "desatualizado" entre dois pontos normais e
 * pareceria quebrado sem estar.
 */
export const STALE_WINDOW_MS = 90_000;

/** Teto do payload de push do APNs. */
export const APNS_PAYLOAD_LIMIT_BYTES = 4096;

export interface MatchLiveContentState {
  /** Sets já vencidos. */
  setsA: number;
  setsB: number;
  /** Pontos do set em jogo. */
  pointsA: number;
  pointsB: number;
  /** 0-based, como `currentSetIndex` no Firestore. */
  setIndex: number;
  servingSide: "A" | "B" | null;
  status: "live" | "finished" | "canceled";
  updatedAtMs: number;
  /** `updatedAtMs + STALE_WINDOW_MS`. Depois disto o card degrada sozinho. */
  staleAfterMs: number;
}

function statusFrom(
  decision: LiveUpdateDecision,
): MatchLiveContentState["status"] {
  if (decision.kind === "end") return "finished";
  if (decision.kind === "dismiss") return "canceled";
  return "live";
}

/**
 * Normaliza os dois formatos de mesa reusando `snapshotFromMatchData` e a
 * mesma leitura do fan-out — a Live Activity não pode depender de qual mesa
 * marcou o ponto.
 *
 * Como `normalize` é privado em `match-live-follow-notify`, a redução aqui
 * repete a MESMA regra: `sets[]` tem prioridade sobre `liveScore` quando os
 * dois existem, porque é o formato mais rico e o `liveScore` seria o velho.
 */
function reduce(snapshot: LiveMatchSnapshot): {
  setsA: number;
  setsB: number;
  pointsA: number;
  pointsB: number;
  setIndex: number;
} {
  const sets = Array.isArray(snapshot.sets) ? snapshot.sets : [];
  const rawIndex = snapshot.currentSetIndex;
  const setIndex =
    typeof rawIndex === "number" && rawIndex >= 0 ?
      Math.trunc(rawIndex) :
      Math.max(0, sets.length - 1);

  if (sets.length > 0) {
    // Sets vencidos = os fechados antes do set em jogo. Contar pelo índice, e
    // não por `setsWon`, mantém o card alinhado ao que a mesa mostra mesmo se
    // um set ficou registrado com placar atípico.
    let setsA = 0;
    let setsB = 0;
    for (let i = 0; i < Math.min(setIndex, sets.length); i++) {
      if (sets[i].a > sets[i].b) setsA++;
      else if (sets[i].b > sets[i].a) setsB++;
    }
    const current = sets[setIndex] ?? {a: 0, b: 0};
    return {setsA, setsB, pointsA: current.a, pointsB: current.b, setIndex};
  }

  const live = snapshot.liveScore;
  if (live) {
    return {
      setsA: live.setsA,
      setsB: live.setsB,
      pointsA: live.currentGamesA,
      pointsB: live.currentGamesB,
      setIndex,
    };
  }

  return {setsA: 0, setsB: 0, pointsA: 0, pointsB: 0, setIndex};
}

/**
 * Monta o estado que vai no push.
 *
 * A ordem em que os campos são atribuídos É o contrato serializado — não
 * reordene sem mexer no teste e no Swift.
 */
export function contentStateFrom(
  snapshot: LiveMatchSnapshot,
  decision: LiveUpdateDecision,
  updatedAtMs: number,
  servingSide: "A" | "B" | null = null,
): MatchLiveContentState {
  const score = reduce(snapshot);
  return {
    setsA: score.setsA,
    setsB: score.setsB,
    pointsA: score.pointsA,
    pointsB: score.pointsB,
    setIndex: score.setIndex,
    servingSide,
    status: statusFrom(decision),
    updatedAtMs,
    staleAfterMs: updatedAtMs + STALE_WINDOW_MS,
  };
}

/** Tamanho serializado, para garantir folga contra o teto de 4 KB do APNs. */
export function contentStateBytes(state: MatchLiveContentState): number {
  return Buffer.byteLength(JSON.stringify(state), "utf8");
}

/** Atalho do gatilho: doc cru do Firestore direto para o estado. */
export function contentStateFromMatchData(
  data: Record<string, unknown> | undefined,
  decision: LiveUpdateDecision,
  updatedAtMs: number,
  servingSide: "A" | "B" | null = null,
): MatchLiveContentState {
  return contentStateFrom(
    snapshotFromMatchData(data),
    decision,
    updatedAtMs,
    servingSide,
  );
}
