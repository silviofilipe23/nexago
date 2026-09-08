/**
 * Decide quais escritas no doc da partida viram push de "placar ao vivo" para
 * quem segue o jogo.
 *
 * A mesa grava PONTO A PONTO (`recordPointTransaction` no app,
 * `updateLiveMatchScore` na web), então este módulo é chamado dezenas de vezes
 * por partida e a maior parte do trabalho é dizer "não". Ver
 * `docs/superpowers/specs/2026-09-05-seguir-partida-tela-bloqueada-design.md`.
 */

import {FieldValue, Firestore, Timestamp, getFirestore} from "firebase-admin/firestore";
import {TopicMessage, getMessaging} from "firebase-admin/messaging";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";

import {
  DEFAULT_BEST_OF,
  ScoreSet,
  isSetWon,
  setsWon,
  targetPointsForSet,
} from "./match-scoring";
import {
  artifactsMatchesPath,
  artifactsTeamsPath,
  getFirebaseProjectId,
} from "./firebase-paths";
import {coerceNotificationData} from "./notification-delivery";
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

// --- Tópicos ----------------------------------------------------------------

/**
 * FNV-1a de 32 bits sobre UNIDADES DE CÓDIGO UTF-16, em base 36.
 *
 * O app precisa gerar exatamente o mesmo nome de tópico (`matchTopicName` em
 * `followed_matches_repository.dart`) ou o push simplesmente não chega — falha
 * silenciosa, sem erro em lugar nenhum. SHA-1 obrigaria o pacote `crypto` no
 * Flutter; isto aqui são cinco linhas idênticas nas duas linguagens, e os dois
 * lados travam os mesmos vetores no teste.
 */
export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** Alfabeto aceito pelo FCM em nome de tópico. */
const TOPIC_SAFE = /^[a-zA-Z0-9\-_.~%]+$/;
const TOPIC_UNSAFE = /[^a-zA-Z0-9\-_.~%]/g;

/**
 * Torna o id seguro para nome de tópico SEM permitir colisão.
 *
 * Substituição cega mandaria `a/b` e `a b` para o mesmo `a_b`, e um seguidor
 * passaria a receber o placar de outra partida. Quando algo é trocado, o hash
 * do id original entra como sufixo e desempata.
 */
function safeTopicSegment(matchId: string): string {
  const id = matchId.trim();
  if (!id) throw new Error("matchId obrigatório para montar o tópico");
  if (TOPIC_SAFE.test(id)) return id;

  return `${id.replace(TOPIC_UNSAFE, "_")}.${fnv1a32(id)}`;
}

/**
 * Um tópico por plataforma: Android precisa de mensagem data-only e iOS de
 * alerta, e uma mensagem só não consegue ser as duas coisas. Continua sendo
 * O(1) por atualização — dois `send()`, não um por seguidor.
 */
export function matchLiveTopics(matchId: string): {android: string; ios: string} {
  const id = safeTopicSegment(matchId);
  return {android: `match-${id}-android`, ios: `match-${id}-ios`};
}

// --- Contexto da mensagem ---------------------------------------------------

export interface MatchLiveContext {
  matchId: string;
  tournamentId: string;
  teamALabel: string;
  teamBLabel: string;
  courtName: string;
  /** Pontos do set em jogo, já formatados: `20 x 15`. */
  scoreLine: string;
  /** Sets vencidos, já formatados: `1 x 0`. */
  setsLine: string;
  /** `Set 2`, `Encerrada`, `Cancelada`. */
  statusLabel: string;
  updatedAtMs: number;
  pointAlert: PointAlert | null;
}

function statusLabelFor(kind: LiveUpdateKind | null, setIndex: number): string {
  if (kind === "end") return "Encerrada";
  if (kind === "dismiss") return "Cancelada";
  return `Set ${setIndex + 1}`;
}

/**
 * Monta o contexto a partir do que o gatilho tem em mãos.
 *
 * Mora aqui, e não no gatilho, para a formatação ficar sob teste: o gatilho é
 * a única parte não coberta por unitário.
 */
export function buildMatchLiveContext(params: {
  matchId: string;
  tournamentId: string;
  teamALabel: string;
  teamBLabel: string;
  courtName: string;
  snapshot: LiveMatchSnapshot;
  decision: LiveUpdateDecision;
  updatedAtMs: number;
}): MatchLiveContext {
  const score = normalize(params.snapshot);
  return {
    matchId: params.matchId,
    tournamentId: params.tournamentId,
    teamALabel: params.teamALabel,
    teamBLabel: params.teamBLabel,
    courtName: params.courtName,
    scoreLine: `${score.currentA} x ${score.currentB}`,
    setsLine: `${score.wonA} x ${score.wonB}`,
    statusLabel: statusLabelFor(params.decision.kind, score.setIndex),
    updatedAtMs: params.updatedAtMs,
    pointAlert: params.decision.pointAlert,
  };
}

// --- Payloads ---------------------------------------------------------------

/** Momento-chave toca e sobe a prioridade; ponto comum é mudo. */
function isRoutine(kind: LiveUpdateKind): boolean {
  return kind === "score";
}

function alertBodyFor(kind: LiveUpdateKind, ctx: MatchLiveContext): string {
  const withCourt = (text: string) =>
    ctx.courtName.trim() ? `${text} · ${ctx.courtName.trim()}` : text;

  switch (kind) {
  case "start":
    return withCourt("Começou");
  case "set":
    return `Fim do set · Sets ${ctx.setsLine}`;
  case "matchPoint": {
    const alert = ctx.pointAlert;
    if (!alert) return `${ctx.statusLabel}: ${ctx.scoreLine}`;
    const team = alert.side === "A" ? ctx.teamALabel : ctx.teamBLabel;
    const label = alert.closesMatch ? "Match point" : "Set point";
    return `${label} para ${team} · ${ctx.scoreLine}`;
  }
  case "end":
    return `Encerrada · Sets ${ctx.setsLine}`;
  case "dismiss":
    return "Partida cancelada";
  default:
    return `${ctx.statusLabel}: ${ctx.scoreLine} · Sets ${ctx.setsLine}`;
  }
}

/**
 * As duas mensagens da atualização, na ordem `[android, ios]`.
 *
 * Android vai SEM bloco `notification`: com ele o sistema desenha a notificação
 * sozinho e o isolate de background do Dart não roda de forma confiável — e é
 * justamente o isolate que atualiza a notificação fixa do placar.
 *
 * iOS vai com alerta e `apns-collapse-id` fixo por partida, que é o que faz a
 * atualização SUBSTITUIR a anterior em vez de empilhar.
 */
export function buildMatchLiveMessages(
  kind: LiveUpdateKind,
  ctx: MatchLiveContext,
): [TopicMessage, TopicMessage] {
  const topics = matchLiveTopics(ctx.matchId);
  const routine = isRoutine(kind);

  const data = coerceNotificationData(
    {
      action: kind,
      matchId: ctx.matchId,
      tournamentId: ctx.tournamentId,
      teamA: ctx.teamALabel,
      teamB: ctx.teamBLabel,
      courtName: ctx.courtName,
      scoreLine: ctx.scoreLine,
      setsLine: ctx.setsLine,
      statusLabel: ctx.statusLabel,
      updatedAt: String(ctx.updatedAtMs),
      url: `/torneios/${ctx.tournamentId}/ao-vivo/${ctx.matchId}`,
      // O Android compõe o próprio texto (o data-only não traz `notification`),
      // então precisa dos MESMOS dados que o corpo do iOS usa — sem isso lá o
      // match point vira "set point" genérico.
      pointAlertSide: ctx.pointAlert?.side ?? "",
      pointAlertClosesMatch: ctx.pointAlert?.closesMatch ? "true" : "false",
    },
    "match_live_score",
    false,
  );

  const android: TopicMessage = {
    topic: topics.android,
    data,
    android: {priority: "high"},
    fcmOptions: {analyticsLabel: "match_live_score"},
  };

  const title = `${ctx.teamALabel} x ${ctx.teamBLabel}`;
  const body = alertBodyFor(kind, ctx);

  const ios: TopicMessage = {
    topic: topics.ios,
    data,
    notification: {title, body},
    apns: {
      headers: {
        "apns-collapse-id": `match-${ctx.matchId}`,
        "apns-priority": routine ? "5" : "10",
        "apns-push-type": "alert",
      },
      payload: {
        aps: {
          alert: {title, body},
          "interruption-level": routine ? "passive" : "active",
          ...(routine ? {} : {sound: "default"}),
        },
      },
    },
    fcmOptions: {analyticsLabel: "match_live_score"},
  };

  return [android, ios];
}

// --- Leitura do doc da partida ----------------------------------------------

function setsFromRaw(raw: unknown): ScoreSet[] {
  if (!Array.isArray(raw)) return [];
  const out: ScoreSet[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    out.push({a: intOf(obj.a), b: intOf(obj.b)});
  }
  return out;
}

function liveScoreFromRaw(raw: unknown): LiveScoreFields | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  return {
    setsA: intOf(obj.setsA),
    setsB: intOf(obj.setsB),
    currentGamesA: intOf(obj.currentGamesA),
    currentGamesB: intOf(obj.currentGamesB),
  };
}

/** Doc cru do Firestore para o formato que `resolveLiveUpdate` entende. */
export function snapshotFromMatchData(
  data: Record<string, unknown> | undefined,
): LiveMatchSnapshot {
  const d = data ?? {};
  const rawIndex = d.currentSetIndex;
  return {
    status: typeof d.status === "string" ? d.status : "",
    sets: setsFromRaw(d.sets),
    liveScore: liveScoreFromRaw(d.liveScore),
    currentSetIndex: typeof rawIndex === "number" ? Math.trunc(rawIndex) : null,
    bestOf: typeof d.bestOf === "number" ? d.bestOf : null,
  };
}

// --- Rótulo da dupla --------------------------------------------------------

export interface ProfileNameFields {
  nickname?: unknown;
  fullName?: unknown;
  name?: unknown;
}

function displayNameOf(profile: ProfileNameFields | undefined): string {
  if (!profile) return "";
  for (const candidate of [profile.nickname, profile.fullName, profile.name]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

/**
 * Mesma ordem de preferência do app (`resolveAppUserDisplayName`): apelido,
 * depois nome completo. `teamName` ganha de tudo quando a dupla tem nome.
 */
export function pairLabelFrom(
  team: {teamName?: unknown; player1Id?: unknown; player2Id?: unknown} | null,
  profiles: Map<string, ProfileNameFields>,
  fallback: string,
): string {
  if (!team) return fallback;

  const teamName = team.teamName;
  if (typeof teamName === "string" && teamName.trim()) return teamName.trim();

  const p1 = displayNameOf(profiles.get(String(team.player1Id ?? "")));
  const p2 = displayNameOf(profiles.get(String(team.player2Id ?? "")));

  if (p1 && p2 && p1 !== p2) return `${p1} / ${p2}`;
  if (p1) return p1;
  if (p2) return p2;
  return fallback;
}

// --- Gatilho ----------------------------------------------------------------

/**
 * Coleção do estado de notificação, IRMÃ do doc da partida.
 *
 * Mora fora de `artifacts/` de propósito: a function não pode gravar no doc que
 * a dispara, senão se re-dispara em laço. Nada tem gatilho aqui.
 */
const NOTIFY_COLLECTION = "matchLiveNotify";

interface StoredSidecar extends NotifySidecar {
  teamALabel: string | null;
  teamBLabel: string | null;
}

function sidecarFrom(data: Record<string, unknown> | undefined): StoredSidecar {
  const d = data ?? {};
  const lastPushAt = d.lastPushAt;
  return {
    lastPushAt: typeof lastPushAt === "number" ? lastPushAt : null,
    lastSignature: typeof d.lastSignature === "string" ? d.lastSignature : null,
    teamALabel: typeof d.teamALabel === "string" ? d.teamALabel : null,
    teamBLabel: typeof d.teamBLabel === "string" ? d.teamBLabel : null,
  };
}

/** `updatedAt` da partida quando existe; é o instante real do ponto. */
function updatedAtMsOf(data: Record<string, unknown>, fallbackMs: number): number {
  const raw = data.updatedAt as {toMillis?: () => number} | undefined;
  if (raw && typeof raw.toMillis === "function") {
    const ms = raw.toMillis();
    if (Number.isFinite(ms)) return ms;
  }
  return fallbackMs;
}

/**
 * Resolve o nome das duas duplas com o join `teams` → `public_profiles`.
 *
 * Custa quatro leituras e por isso roda UMA vez por partida: o resultado fica
 * no sidecar e as atualizações seguintes o reaproveitam. Fazer isso a cada
 * ponto multiplicaria as leituras pelo número de pontos do jogo.
 */
async function resolveTeamLabels(
  db: Firestore,
  projectId: string,
  data: Record<string, unknown>,
): Promise<{a: string; b: string}> {
  const teamsPath = artifactsTeamsPath(projectId);
  const idA = String(data.teamAId ?? "").trim();
  const idB = String(data.teamBId ?? "").trim();

  const [snapA, snapB] = await Promise.all([
    idA ? db.doc(`${teamsPath}/${idA}`).get() : Promise.resolve(null),
    idB ? db.doc(`${teamsPath}/${idB}`).get() : Promise.resolve(null),
  ]);
  const teamA = (snapA?.data() ?? null) as Record<string, unknown> | null;
  const teamB = (snapB?.data() ?? null) as Record<string, unknown> | null;

  const playerIds = new Set<string>();
  for (const team of [teamA, teamB]) {
    for (const key of ["player1Id", "player2Id"]) {
      const id = String(team?.[key] ?? "").trim();
      if (id) playerIds.add(id);
    }
  }

  const profiles = new Map<string, ProfileNameFields>();
  await Promise.all(
    Array.from(playerIds).map(async (id) => {
      const snap = await db.doc(`public_profiles/${id}`).get();
      const profile = snap.data();
      if (profile) profiles.set(id, profile as ProfileNameFields);
    }),
  );

  const fallbackA = String(data.teamADescription ?? "").trim() || "Dupla A";
  const fallbackB = String(data.teamBDescription ?? "").trim() || "Dupla B";
  return {
    a: pairLabelFrom(teamA, profiles, fallbackA),
    b: pairLabelFrom(teamB, profiles, fallbackB),
  };
}

/**
 * Fan-out do placar ao vivo para quem segue a partida.
 *
 * A mesa grava ponto a ponto, então este gatilho roda dezenas de vezes por
 * jogo; `resolveLiveUpdate` derruba a maioria antes de qualquer I/O extra.
 */
export const onMatchLiveScoreChanged = onDocumentUpdated(
  "artifacts/{appId}/public/data/matches/{matchId}",
  async (event) => {
    const matchId = event.params.matchId;
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;
    if (!after) return;

    const tournamentId = String(after.tournamentId ?? "").trim();
    if (!tournamentId || !matchId.trim()) return;

    const db = getFirestore();
    const notifyRef = db.doc(`${NOTIFY_COLLECTION}/${matchId}`);

    try {
      const stored = sidecarFrom((await notifyRef.get()).data());
      const nowMs = Date.now();
      const decision = resolveLiveUpdate(
        snapshotFromMatchData(before),
        snapshotFromMatchData(after),
        stored,
        nowMs,
      );

      if (!decision.push) {
        // Sem gravar nada: o sidecar só guarda o que foi REALMENTE notificado,
        // e um write por ponto engolido dobraria as escritas da partida à toa.
        return;
      }

      const cachedA = stored.teamALabel;
      const cachedB = stored.teamBLabel;
      const labels =
        cachedA && cachedB ?
          {a: cachedA, b: cachedB} :
          await resolveTeamLabels(db, getFirebaseProjectId(), after);

      const context = buildMatchLiveContext({
        matchId,
        tournamentId,
        teamALabel: labels.a,
        teamBLabel: labels.b,
        courtName: String(after.courtName ?? "").trim(),
        snapshot: snapshotFromMatchData(after),
        decision,
        updatedAtMs: updatedAtMsOf(after, nowMs),
      });

      const messages = buildMatchLiveMessages(decision.kind!, context);
      const results = await Promise.allSettled(
        messages.map((message) => getMessaging().send(message)),
      );
      for (const [i, result] of results.entries()) {
        if (result.status === "rejected") {
          // Falha de uma plataforma não pode derrubar a outra.
          logger.warn(
            `matchLiveNotify: envio ${i === 0 ? "android" : "ios"} falhou ` +
            `na partida ${matchId}`,
            result.reason,
          );
        }
      }

      await notifyRef.set(
        {
          lastPushAt: nowMs,
          lastSignature: decision.signature,
          lastKind: decision.kind,
          teamALabel: labels.a,
          teamBLabel: labels.b,
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    } catch (error) {
      // Nunca relançar: o gatilho roda em cima da escrita da mesa e um erro
      // aqui vira retry infinito em plena partida.
      logger.error(`matchLiveNotify: falha na partida ${matchId}`, error);
    }
  },
);

// --- Varredura de follows órfãos --------------------------------------------

/**
 * Quanto tempo uma partida encerrada continua em "Acompanhando".
 *
 * O caminho normal de limpeza é o push `end`, que o cliente usa para derrubar a
 * notificação e apagar o doc. Esta janela existe para o atleta que não abriu o
 * app: ele ainda vê o resultado da partida que seguiu.
 */
export const FOLLOW_RETENTION_MS = 48 * 60 * 60 * 1000;

/** Quantos follows a varredura examina por execução. */
export const FOLLOW_SWEEP_BATCH = 400;

export interface FollowCandidate {
  path: string;
  matchId: string;
}

export interface MatchEndState {
  exists: boolean;
  status: string;
  endedAtMs: number | null;
}

/**
 * Quais follows já não têm razão de existir.
 *
 * Conservador de propósito: partida que a varredura não conseguiu ler NÃO entra
 * na lista. Apagar o follow de uma partida que ainda vai acontecer é pior que
 * deixar lixo — o atleta perde o acompanhamento sem entender por quê.
 */
export function staleFollowPaths(
  candidates: FollowCandidate[],
  matches: Map<string, MatchEndState>,
  nowMs: number,
): string[] {
  const stale: string[] = [];

  for (const candidate of candidates) {
    const match = matches.get(candidate.matchId);
    if (!match) continue;

    if (!match.exists) {
      stale.push(candidate.path);
      continue;
    }

    const finished =
      isMatchCompleted(match.status) || isMatchCanceled(match.status);
    if (!finished) continue;

    // Encerrada sem `matchEndedAt` é dado antigo: o candidato só chegou aqui
    // por já ter passado da janela de retenção.
    const endedAtMs = match.endedAtMs;
    if (endedAtMs === null || nowMs - endedAtMs > FOLLOW_RETENTION_MS) {
      stale.push(candidate.path);
    }
  }

  return stale;
}

function endedAtMsOf(data: Record<string, unknown>): number | null {
  const raw = data.matchEndedAt as {toMillis?: () => number} | undefined;
  if (raw && typeof raw.toMillis === "function") {
    const ms = raw.toMillis();
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

/**
 * Rede de segurança para follows de partidas que já acabaram.
 *
 * Ordena pelos mais antigos porque é lá que o lixo está: sem `orderBy`, um lote
 * fixo examinaria sempre os mesmos primeiros docs e nunca alcançaria o resto.
 */
export const sweepStaleFollowedMatches = onSchedule(
  {schedule: "every day 04:00", timeZone: "America/Sao_Paulo"},
  async () => {
    const db = getFirestore();
    const nowMs = Date.now();
    const cutoff = Timestamp.fromMillis(nowMs - FOLLOW_RETENTION_MS);

    const snap = await db
      .collectionGroup("followedMatches")
      .where("followedAt", "<", cutoff)
      .orderBy("followedAt", "asc")
      .limit(FOLLOW_SWEEP_BATCH)
      .get();

    const candidates: FollowCandidate[] = snap.docs.map((doc) => ({
      path: doc.ref.path,
      matchId: String(doc.data().matchId ?? doc.id).trim(),
    }));

    const matchesPath = artifactsMatchesPath(getFirebaseProjectId());
    const matchIds = Array.from(
      new Set(candidates.map((c) => c.matchId).filter(Boolean)),
    );

    // Uma leitura por partida DISTINTA, não por follow: numa etapa, dezenas de
    // atletas seguem a mesma partida.
    const matches = new Map<string, MatchEndState>();
    await Promise.all(
      matchIds.map(async (matchId) => {
        try {
          const doc = await db.doc(`${matchesPath}/${matchId}`).get();
          const data = doc.data();
          matches.set(matchId, {
            exists: doc.exists,
            status: typeof data?.status === "string" ? data.status : "",
            endedAtMs: data ? endedAtMsOf(data) : null,
          });
        } catch (error) {
          // Fica de fora do mapa e `staleFollowPaths` preserva o follow.
          logger.warn(`sweepFollowedMatches: falha lendo ${matchId}`, error);
        }
      }),
    );

    const stale = staleFollowPaths(candidates, matches, nowMs);

    for (let i = 0; i < stale.length; i += 400) {
      const batch = db.batch();
      for (const path of stale.slice(i, i + 400)) batch.delete(db.doc(path));
      await batch.commit();
    }

    // Loga toda volta, inclusive vazia: job agendado que só fala quando age é
    // indistinguível de job que parou de rodar.
    logger.info("Varredura de partidas seguidas concluída", {
      candidates: candidates.length,
      distinctMatches: matchIds.length,
      deleted: stale.length,
    });
  },
);
