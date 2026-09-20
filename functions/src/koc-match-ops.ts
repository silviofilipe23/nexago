import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  FieldValue,
  getFirestore,
  type Firestore,
} from "firebase-admin/firestore";

import {artifactsMatchesPath, getFirebaseProjectId} from "./firebase-paths";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {assertCanScoreTournament} from "./tournament-acl";
import {
  MatchStatus,
  isKingOfCourtMatch,
  isMatchCanceled,
  isMatchCompleted,
} from "./match-status";
import {syncTournamentLiveMatchesNow} from "./tournament-live-matches";
import {
  KOC_MAX_ROUND_DURATION_SEC,
  KOC_MIN_ROUND_DURATION_SEC,
} from "./koc-bracket-builders";
import {
  KocEngineError,
  kocClockEndsAtMs,
  kocClockPause,
  kocClockRemainingSec,
  kocClockResume,
  kocClockSetDuration,
  kocClockStart,
  kocQualifyingTies,
  kocReplay,
  kocStandings,
  type KocClock,
  type KocRally,
  type KocRallyWinner,
  type KocState,
} from "./koc-engine";

/**
 * Mesa da rodada King of the Court.
 *
 * O log de rallies vive num ARRAY no próprio doc da rodada (`kocRallies`), e não
 * numa subcoleção: o relógio limita a rodada a algumas dezenas de rallies, então
 * o log inteiro cabe folgado num doc. Em troca, toda operação é uma leitura só e
 * o estado é SEMPRE reproduzido do log — nunca ajustado de forma incremental.
 * Isso é o que faz desfazer ser exato num formato onde a coroação não tem
 * inversa única.
 *
 * Nada aqui aceita escrita direta do cliente: as rules de `matches` só liberam
 * campos de placar de duelo, e a rodada passa por estas callables.
 */

const CLOCK_BOUNDS = {
  minSec: KOC_MIN_ROUND_DURATION_SEC,
  maxSec: KOC_MAX_ROUND_DURATION_SEC,
};

/** Ajuste fino do relógio pela mesa, em segundos. */
export const KOC_CLOCK_NUDGE_SEC = 60;

interface RoundContext {
  ref: FirebaseFirestore.DocumentReference;
  data: FirebaseFirestore.DocumentData;
  teamIds: string[];
  rallies: KocRally[];
  durationSec: number;
  qualifiersPerRound: number;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asPositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

/** Log gravado → log do motor, ignorando entrada corrompida. */
export function parseStoredRallies(raw: unknown): KocRally[] {
  if (!Array.isArray(raw)) return [];
  const out: KocRally[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const seq = Number(entry.seq);
    const winner = asString(entry.winner);
    if (!Number.isInteger(seq) || seq < 1) continue;
    if (winner !== "king" && winner !== "challenger") continue;
    out.push({seq, winner: winner as KocRallyWinner});
  }
  return out.sort((a, b) => a.seq - b.seq);
}

export function parseStoredClock(raw: unknown): KocClock | null {
  if (raw == null || typeof raw !== "object") return null;
  const clock = raw as Record<string, unknown>;
  const startedAtMs = Number(clock.startedAtMs);
  const durationSec = Number(clock.durationSec);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(durationSec)) return null;
  const pausedAtMs = Number(clock.pausedAtMs);
  return {
    startedAtMs,
    durationSec,
    pausedAccumSec: Number.isFinite(Number(clock.pausedAccumSec)) ?
      Number(clock.pausedAccumSec) :
      0,
    pausedAtMs: Number.isFinite(pausedAtMs) && pausedAtMs > 0 ? pausedAtMs : null,
  };
}

/**
 * Campos derivados que vão para o doc.
 *
 * O cliente lê estes campos e NÃO recalcula nada — em especial `clockEndsAtMs`,
 * que é o que mantém mesa, telão e app no mesmo relógio.
 */
export function kocStateFields(
  state: KocState,
  clock: KocClock,
  rallies: readonly KocRally[],
): Record<string, unknown> {
  return {
    kocState: {
      kingTeamId: state.kingTeamId,
      challengerTeamId: state.challengerTeamId,
      queue: state.queue,
      points: state.points,
      crowns: state.crowns,
      rallies: state.rallies,
      crownOrder: state.crownOrder,
      servingTeamId: state.servingTeamId,
    },
    kocClock: {
      startedAtMs: clock.startedAtMs,
      durationSec: clock.durationSec,
      pausedAccumSec: clock.pausedAccumSec,
      pausedAtMs: clock.pausedAtMs,
      // Derivado no servidor, de propósito.
      endsAtMs: kocClockEndsAtMs(clock),
    },
    kocRallies: rallies.map((r) => ({seq: r.seq, winner: r.winner})),
    kocRallySeq: rallies.length,
  };
}

async function loadRoundOrThrow(
  db: Firestore,
  uid: string,
  matchId: string,
): Promise<RoundContext> {
  if (!matchId) throw new HttpsError("invalid-argument", "matchId obrigatório");
  const projectId = getFirebaseProjectId();
  const ref = db.doc(`${artifactsMatchesPath(projectId)}/${matchId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Rodada não encontrada");
  const data = snap.data()!;

  await assertCanScoreTournament(db, uid, asString(data.tournamentId));

  if (!isKingOfCourtMatch(data.matchType)) {
    throw new HttpsError(
      "failed-precondition",
      "Esta partida não é uma rodada King of the Court.",
      {reason: "not_a_koc_round"},
    );
  }
  if (isMatchCanceled(data.status)) {
    throw new HttpsError("failed-precondition", "Rodada cancelada.");
  }

  const config = (data.kocConfig ?? {}) as Record<string, unknown>;
  return {
    ref,
    data,
    teamIds: Array.isArray(data.kocTeamIds) ?
      (data.kocTeamIds as unknown[]).map(asString).filter((id) => id.length > 0) :
      [],
    rallies: parseStoredRallies(data.kocRallies),
    // Duração vem do SNAPSHOT da rodada, nunca da categoria: mexer na config
    // depois não pode alterar uma rodada já gerada nem em jogo.
    durationSec: asPositiveInt(config.durationSec, KOC_MIN_ROUND_DURATION_SEC),
    qualifiersPerRound: asPositiveInt(config.qualifiersPerRound, 2),
  };
}

function engineErrorToHttps(e: unknown): never {
  if (e instanceof KocEngineError) {
    throw new HttpsError("failed-precondition", e.message, {reason: e.reason});
  }
  throw e;
}

/** Relógio da rodada em jogo, ou erro se ela não começou. */
function requireClock(round: RoundContext): KocClock {
  const clock = parseStoredClock(round.data.kocClock);
  if (!clock) {
    throw new HttpsError(
      "failed-precondition",
      "A rodada ainda não foi iniciada.",
      {reason: "koc_round_not_started"},
    );
  }
  return clock;
}

function requireInProgress(round: RoundContext): void {
  if (isMatchCompleted(round.data.status)) {
    throw new HttpsError(
      "failed-precondition",
      "Rodada já encerrada. Reabra antes de corrigir.",
      {reason: "koc_round_completed"},
    );
  }
}

// ─── Iniciar ────────────────────────────────────────────────────────────────

export async function kocStartRoundCore(
  db: Firestore,
  uid: string,
  input: Record<string, unknown>,
  nowMs: number = Date.now(),
): Promise<{ok: true; endsAtMs: number}> {
  const round = await loadRoundOrThrow(db, uid, asString(input.matchId));
  requireInProgress(round);

  // Já em jogo: reiniciar apagaria os pontos conquistados. Exige intenção.
  if (round.rallies.length > 0 && input.restart !== true) {
    throw new HttpsError(
      "failed-precondition",
      "A rodada já está em andamento. Reinicie explicitamente para zerar.",
      {reason: "koc_round_already_started"},
    );
  }

  let state: KocState;
  try {
    state = kocReplay(round.teamIds, []);
  } catch (e) {
    engineErrorToHttps(e);
  }

  const clock = kocClockStart(nowMs, round.durationSec);
  await round.ref.update({
    ...kocStateFields(state, clock, []),
    status: MatchStatus.inProgress,
    matchStartedAt: FieldValue.serverTimestamp(),
    matchEndedAt: FieldValue.delete(),
    kocStandings: FieldValue.delete(),
    winnerId: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await syncTournamentLiveMatchesNow(
    db,
    getFirebaseProjectId(),
    asString(round.data.tournamentId),
  );
  return {ok: true, endsAtMs: kocClockEndsAtMs(clock)};
}

// ─── Rally ──────────────────────────────────────────────────────────────────

export async function kocRegisterRallyCore(
  db: Firestore,
  uid: string,
  input: Record<string, unknown>,
): Promise<{ok: true; seq: number; kingTeamId: string}> {
  const round = await loadRoundOrThrow(db, uid, asString(input.matchId));
  requireInProgress(round);
  const clock = requireClock(round);

  const winner = asString(input.winner);
  if (winner !== "king" && winner !== "challenger") {
    throw new HttpsError(
      "invalid-argument",
      "winner deve ser 'king' ou 'challenger'.",
    );
  }

  const nextSeq = round.rallies.length + 1;
  // Duplo toque com rede ruim reenviaria o mesmo rally. Quando a mesa manda o
  // seq que espera, divergência é recusada em vez de virar ponto fantasma.
  if (input.expectedSeq != null && Number(input.expectedSeq) !== nextSeq) {
    throw new HttpsError(
      "aborted",
      "A rodada avançou desde o último envio. Recarregue a mesa.",
      {reason: "koc_seq_mismatch", expected: nextSeq},
    );
  }

  const rallies: KocRally[] = [
    ...round.rallies,
    {seq: nextSeq, winner: winner as KocRallyWinner},
  ];
  let state: KocState;
  try {
    state = kocReplay(round.teamIds, rallies);
  } catch (e) {
    engineErrorToHttps(e);
  }

  await round.ref.update({
    ...kocStateFields(state, clock, rallies),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return {ok: true, seq: nextSeq, kingTeamId: state.kingTeamId};
}

export async function kocUndoRallyCore(
  db: Firestore,
  uid: string,
  input: Record<string, unknown>,
): Promise<{ok: true; rallies: number}> {
  const round = await loadRoundOrThrow(db, uid, asString(input.matchId));
  requireInProgress(round);
  const clock = requireClock(round);

  if (round.rallies.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      "Não há rally para desfazer.",
      {reason: "koc_no_rally_to_undo"},
    );
  }

  const rallies = round.rallies.slice(0, -1);
  let state: KocState;
  try {
    // Reprodução completa, não a inversa do último rally: uma coroação
    // desfeita não tem inversa única.
    state = kocReplay(round.teamIds, rallies);
  } catch (e) {
    engineErrorToHttps(e);
  }

  await round.ref.update({
    ...kocStateFields(state, clock, rallies),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return {ok: true, rallies: rallies.length};
}

// ─── Relógio ────────────────────────────────────────────────────────────────

export async function kocSetClockCore(
  db: Firestore,
  uid: string,
  input: Record<string, unknown>,
  nowMs: number = Date.now(),
): Promise<{ok: true; endsAtMs: number; remainingSec: number}> {
  const round = await loadRoundOrThrow(db, uid, asString(input.matchId));
  requireInProgress(round);
  const current = requireClock(round);
  const action = asString(input.action);

  let clock: KocClock;
  switch (action) {
    case "pause":
      clock = kocClockPause(current, nowMs);
      break;
    case "resume":
      clock = kocClockResume(current, nowMs);
      break;
    case "setDuration":
      clock = kocClockSetDuration(
        current,
        Number(input.durationSec),
        CLOCK_BOUNDS,
      );
      break;
    case "nudge": {
      const deltaSec = Number(input.deltaSec);
      if (!Number.isFinite(deltaSec) || Math.abs(deltaSec) > KOC_CLOCK_NUDGE_SEC) {
        throw new HttpsError(
          "invalid-argument",
          `Ajuste precisa estar entre -${KOC_CLOCK_NUDGE_SEC} e ` +
            `${KOC_CLOCK_NUDGE_SEC} segundos.`,
        );
      }
      clock = kocClockSetDuration(
        current,
        current.durationSec + deltaSec,
        CLOCK_BOUNDS,
      );
      break;
    }
    default:
      throw new HttpsError(
        "invalid-argument",
        "action deve ser 'pause', 'resume', 'setDuration' ou 'nudge'.",
      );
  }

  await round.ref.update({
    kocClock: {
      startedAtMs: clock.startedAtMs,
      durationSec: clock.durationSec,
      pausedAccumSec: clock.pausedAccumSec,
      pausedAtMs: clock.pausedAtMs,
      endsAtMs: kocClockEndsAtMs(clock),
    },
    updatedAt: FieldValue.serverTimestamp(),
  });
  return {
    ok: true,
    endsAtMs: kocClockEndsAtMs(clock),
    remainingSec: kocClockRemainingSec(clock, nowMs),
  };
}

// ─── Encerrar ───────────────────────────────────────────────────────────────

export async function kocFinishRoundCore(
  db: Firestore,
  uid: string,
  input: Record<string, unknown>,
): Promise<{
  ok: true;
  standings: Array<{teamId: string; place: number; points: number}>;
  unresolvedTies: string[][];
}> {
  const round = await loadRoundOrThrow(db, uid, asString(input.matchId));
  requireClock(round);

  if (isMatchCompleted(round.data.status) && input.force !== true) {
    throw new HttpsError(
      "failed-precondition",
      "Rodada já encerrada.",
      {reason: "koc_round_completed"},
    );
  }

  let state: KocState;
  try {
    state = kocReplay(round.teamIds, round.rallies);
  } catch (e) {
    engineErrorToHttps(e);
  }

  const standings = kocStandings(round.teamIds, state);
  const ties = kocQualifyingTies(standings, round.qualifiersPerRound);

  // Empate que decide vaga é resolvido na areia (bola de ouro), não por
  // critério silencioso. A mesa precisa jogar o rally e registrar antes de
  // encerrar — ou dizer explicitamente que aceita o desempate automático.
  if (ties.length > 0 && input.acceptTiebreak !== true) {
    throw new HttpsError(
      "failed-precondition",
      "Há empate em pontos decidindo a classificação. Jogue a bola de ouro e " +
        "registre o rally, ou confirme o desempate automático.",
      {reason: "koc_unresolved_tie", ties},
    );
  }

  const winnerId = standings[0]?.teamId ?? "";
  await round.ref.update({
    kocStandings: standings.map((s) => ({
      teamId: s.teamId,
      place: s.place,
      points: s.points,
      crowns: s.crowns,
    })),
    // `winnerId` é o 1º da TABELA, não o vencedor de um duelo. A blindagem da
    // fase 0 é o que impede isso de virar avanço de chave ou rating.
    winnerId,
    status: MatchStatus.completed,
    matchEndedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await syncTournamentLiveMatchesNow(
    db,
    getFirebaseProjectId(),
    asString(round.data.tournamentId),
  );
  return {
    ok: true,
    standings: standings.map((s) => ({
      teamId: s.teamId,
      place: s.place,
      points: s.points,
    })),
    unresolvedTies: ties,
  };
}

// ─── Callables ──────────────────────────────────────────────────────────────

function requireUid(uid: string | undefined): string {
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");
  return uid;
}

export const kocStartRound = onCall(
  {region: CLIENT_FACING_REGIONS},
  async (request) =>
    kocStartRoundCore(getFirestore(), requireUid(request.auth?.uid), request.data ?? {}),
);

export const kocRegisterRally = onCall(
  {region: CLIENT_FACING_REGIONS},
  async (request) =>
    kocRegisterRallyCore(
      getFirestore(),
      requireUid(request.auth?.uid),
      request.data ?? {},
    ),
);

export const kocUndoRally = onCall(
  {region: CLIENT_FACING_REGIONS},
  async (request) =>
    kocUndoRallyCore(getFirestore(), requireUid(request.auth?.uid), request.data ?? {}),
);

export const kocSetClock = onCall(
  {region: CLIENT_FACING_REGIONS},
  async (request) =>
    kocSetClockCore(getFirestore(), requireUid(request.auth?.uid), request.data ?? {}),
);

export const kocFinishRound = onCall(
  {region: CLIENT_FACING_REGIONS},
  async (request) =>
    kocFinishRoundCore(
      getFirestore(),
      requireUid(request.auth?.uid),
      request.data ?? {},
    ),
);
