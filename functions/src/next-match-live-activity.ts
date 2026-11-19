/**
 * Live Activity "minha próxima partida" (Modo Focus) — Firestore e push.
 *
 * - `startNextMatchActivity` (callable): o app chama ao abrir o Focus no dia do
 *   torneio. Confere que o atleta é das duplas, monta o estado do card e grava
 *   `nextMatchActivities/{uid}_{tournamentId}`. O app inicia a activity com o
 *   estado devolvido e depois grava só os tokens no doc (a regra libera só eles).
 * - `onMatchChangedNextMatchActivity` (gatilho): a cada escrita numa partida que
 *   mexe em horário, quadra, chamada, início, fim ou vaga, remonta o card de
 *   quem tem a activity aberta e manda o push se o estado mudou.
 *
 * O estado é montado só por `buildNextMatchState` (ver o módulo `-state`).
 */

import {
  DocumentReference,
  Firestore,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";
import {getMessaging} from "firebase-admin/messaging";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {dayKeyFromEventDate} from "./event-timezone";
import {
  artifactsMatchesPath,
  artifactsTeamsPath,
  artifactsTournamentsPath,
  getFirebaseProjectId,
} from "./firebase-paths";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {ProfileNameFields, pairLabelFrom} from "./match-live-follow-notify";
import {
  NEXT_MATCH_ACTIVITIES_COLLECTION,
  NextMatchContentState,
  NextMatchLite,
  buildNextMatchMessage,
  buildNextMatchState,
  nextMatchBracketMoved,
  nextMatchChangeTeamIds,
  nextMatchLiteFromData,
  nextMatchStateKey,
  pickNextMatch,
} from "./next-match-live-activity-state";
import {isInvalidFcmTokenError} from "./notification-delivery";
import {findCategoryIndex} from "./tournament-category-capacity";
import {extractTeamMemberUids} from "./tournament-team-category";

/** Duplas por atleta num torneio (uma por categoria); teto do `in`/`array-contains-any`. */
const MAX_TEAMS = 5;
const MAX_ID_LENGTH = 128;

export function nextMatchActivityDocId(uid: string, tournamentId: string): string {
  return `${uid}_${tournamentId}`;
}

// --- Leitura -------------------------------------------------------------------------

async function loadTeamMatches(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  teamIds: string[],
): Promise<NextMatchLite[]> {
  const col = db.collection(artifactsMatchesPath(projectId));
  const [asA, asB] = await Promise.all([
    col.where("teamAId", "in", teamIds).get(),
    col.where("teamBId", "in", teamIds).get(),
  ]);
  const byId = new Map<string, NextMatchLite>();
  for (const doc of [...asA.docs, ...asB.docs]) {
    const lite = nextMatchLiteFromData(doc.id, doc.data());
    if (lite.tournamentId === tournamentId) byId.set(doc.id, lite);
  }
  return [...byId.values()];
}

async function loadCategoryMatches(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  categoryId: string,
): Promise<NextMatchLite[]> {
  if (!categoryId) return [];
  const snap = await db
    .collection(artifactsMatchesPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();
  return snap.docs.map((d) => nextMatchLiteFromData(d.id, d.data()));
}

/** "Rafa / Bruno": `teamName`, ou os apelidos/nomes dos dois atletas. */
async function loadTeamLabel(
  db: Firestore,
  projectId: string,
  teamId: string,
): Promise<string> {
  if (!teamId) return "";
  const teamSnap = await db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`).get();
  const team = (teamSnap.data() ?? null) as Record<string, unknown> | null;
  if (!team) return "";
  const profiles = new Map<string, ProfileNameFields>();
  await Promise.all(
    ["player1Id", "player2Id"].map(async (key) => {
      const id = String(team[key] ?? "").trim();
      if (!id) return;
      const profile = (await db.doc(`public_profiles/${id}`).get()).data();
      if (profile) profiles.set(id, profile as ProfileNameFields);
    }),
  );
  return pairLabelFrom(team, profiles, "");
}

interface ActivityContext {
  state: NextMatchContentState | null;
  categoryId: string;
}

/** Monta o estado do card das duplas [teamIds] no dia [dayKey]. */
async function computeState(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  teamIds: string[],
  dayKey: string,
): Promise<ActivityContext> {
  const ids = new Set(teamIds);
  const matches = await loadTeamMatches(db, projectId, tournamentId, teamIds);
  const next = pickNextMatch(matches, ids, dayKey);
  // Todas as categorias do atleta (uma por dupla): a fase do jogo e a vaga
  // que ainda pode ser dele ("waiting") dependem da chave inteira.
  const categoryIds = [...new Set(matches.map((m) => m.categoryId).filter(Boolean))];
  const categoryMatches = (await Promise.all(
    categoryIds.map((id) => loadCategoryMatches(db, projectId, tournamentId, id)),
  )).flat();
  const categoryId = next?.categoryId ?? categoryIds[0] ?? "";

  const teamNames = new Map<string, string>();
  if (next) {
    const opponentId = ids.has(next.teamAId) ? next.teamBId : next.teamAId;
    const label = await loadTeamLabel(db, projectId, opponentId);
    if (label) teamNames.set(opponentId, label);
  }
  const state = buildNextMatchState({matches, categoryMatches, teamIds: ids, dayKey, teamNames});
  return {state, categoryId};
}

// --- Callable --------------------------------------------------------------------------

function parseIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.length <= MAX_ID_LENGTH);
  return [...new Set(ids)].slice(0, MAX_TEAMS);
}

/** Só as duplas do torneio em que o atleta está de fato. */
async function ownTeamIds(
  db: Firestore,
  projectId: string,
  uid: string,
  tournamentId: string,
  teamIds: string[],
): Promise<string[]> {
  const snaps = await Promise.all(
    teamIds.map((id) => db.doc(`${artifactsTeamsPath(projectId)}/${id}`).get()),
  );
  return snaps
    .filter((snap) => {
      const team = snap.data();
      if (!team) return false;
      const sameTournament = String(team.tournamentId ?? tournamentId) === tournamentId;
      return sameTournament && extractTeamMemberUids(team).includes(uid);
    })
    .map((snap) => snap.id);
}

async function tournamentLabels(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  categoryId: string,
): Promise<{tournamentName: string; categoryName: string}> {
  const data = (await db.doc(`${artifactsTournamentsPath(projectId)}/${tournamentId}`).get())
    .data() ?? {};
  const categories = Array.isArray(data.categories) ? data.categories : [];
  const index = findCategoryIndex(categories, categoryId);
  const category = index >= 0 ? categories[index] as Record<string, unknown> : null;
  const categoryName = String(category?.categoryName ?? category?.name ?? "").trim();
  return {
    tournamentName: String(data.name ?? "").trim() || "Torneio",
    categoryName,
  };
}

/**
 * O app chama ao abrir o Focus. Devolve `{state: null}` quando não há o que
 * mostrar hoje (sem partida no dia, ou o atleta não é das duplas informadas).
 */
export const startNextMatchActivity = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const tournamentId = typeof request.data?.tournamentId === "string" ?
    request.data.tournamentId.trim() : "";
  if (!tournamentId || tournamentId.length > MAX_ID_LENGTH) {
    throw new HttpsError("invalid-argument", "tournamentId obrigatório");
  }
  const requested = parseIds(request.data?.teamIds);
  if (requested.length === 0) throw new HttpsError("invalid-argument", "teamIds obrigatório");

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const teamIds = await ownTeamIds(db, projectId, uid, tournamentId, requested);
  if (teamIds.length === 0) return {state: null};

  const readAtMs = Date.now();
  const dayKey = dayKeyFromEventDate(new Date(readAtMs));
  const {state, categoryId} = await computeState(db, projectId, tournamentId, teamIds, dayKey);
  if (!state || state.phase === "dayOver") return {state: null};

  const labels = await tournamentLabels(db, projectId, tournamentId, categoryId);
  // Com duas categorias no dia o card troca de categoria ao longo do dia, e o
  // atributo é fixo: melhor não afirmar nenhuma.
  if (teamIds.length > 1) labels.categoryName = "";
  // Sem tokens aqui: eles chegam do app depois que a activity nasce, e o merge
  // não pode apagar os da activity que já estava aberta.
  await db
    .collection(NEXT_MATCH_ACTIVITIES_COLLECTION)
    .doc(nextMatchActivityDocId(uid, tournamentId))
    .set({
      uid,
      tournamentId,
      teamIds,
      dayKey,
      phase: state.phase,
      stateKey: nextMatchStateKey(state),
      stateAtMs: readAtMs,
      startedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }, {merge: true});

  return {attributes: {tournamentId, ...labels}, state};
});

// --- Gatilho ------------------------------------------------------------------------------

interface ActivityDoc {
  ref: DocumentReference;
  tournamentId: string;
  teamIds: string[];
  dayKey: string;
  fcmToken: string;
  liveActivityToken: string;
}

function activityFrom(
  ref: DocumentReference,
  data: Record<string, unknown>,
): ActivityDoc | null {
  const fcmToken = typeof data.fcmToken === "string" ? data.fcmToken : "";
  const liveActivityToken = typeof data.liveActivityToken === "string" ?
    data.liveActivityToken : "";
  const teamIds = parseIds(data.teamIds);
  const dayKey = typeof data.dayKey === "string" ? data.dayKey : "";
  if (!fcmToken || !liveActivityToken || teamIds.length === 0 || !dayKey) return null;
  return {
    ref,
    tournamentId: String(data.tournamentId ?? ""),
    teamIds,
    dayKey,
    fcmToken,
    liveActivityToken,
  };
}

interface Claim {
  key: string;
  previousKey: string | null;
  previousPhase: string | null;
  previousStateAtMs: number | null;
}

/**
 * Grava o estado novo e devolve o que havia antes; `null` quando não há o que
 * mandar. O doc é a trava: escritas em lote (agendamento dinâmico) disparam
 * vários gatilhos juntos.
 *
 * - Mesmo estado: outra execução já mandou este push.
 * - Estado lido ANTES do que já foi gravado: uma execução que leu dados mais
 *   novos já passou; mandar este agora faria o card voltar no tempo.
 */
async function claimState(
  db: Firestore,
  ref: DocumentReference,
  state: NextMatchContentState,
  readAtMs: number,
): Promise<Claim | null> {
  const key = nextMatchStateKey(state);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!data || data.stateKey === key) return null;
    const previousStateAtMs = typeof data.stateAtMs === "number" ? data.stateAtMs : null;
    if (previousStateAtMs !== null && previousStateAtMs > readAtMs) return null;
    tx.update(ref, {
      phase: state.phase,
      stateKey: key,
      stateAtMs: readAtMs,
      updatedAt: Timestamp.now(),
    });
    return {
      key,
      previousKey: typeof data.stateKey === "string" ? data.stateKey : null,
      previousPhase: typeof data.phase === "string" ? data.phase : null,
      previousStateAtMs,
    };
  });
}

/**
 * O push falhou (rede, FCM fora): devolve a trava, senão o mesmo estado nunca
 * mais seria reenviado e o card ficaria parado — ou vivo para sempre, se o
 * perdido era o "fim do dia".
 */
async function releaseClaim(db: Firestore, ref: DocumentReference, claim: Claim): Promise<void> {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.data()?.stateKey !== claim.key) return;
    tx.update(ref, {
      phase: claim.previousPhase,
      stateKey: claim.previousKey,
      stateAtMs: claim.previousStateAtMs,
    });
  });
}

async function refreshActivity(
  db: Firestore,
  projectId: string,
  activity: ActivityDoc,
): Promise<void> {
  const readAtMs = Date.now();
  if (activity.dayKey !== dayKeyFromEventDate(new Date(readAtMs))) {
    // Activity de outro dia: o iOS já a encerrou (8h ativas + 4h na tela).
    await activity.ref.delete();
    return;
  }
  const {state} = await computeState(
    db, projectId, activity.tournamentId, activity.teamIds, activity.dayKey,
  );
  // Sem partida nenhuma no dia (cancelada, movida de dia): não encerra o card
  // por isso — pode ser uma edição de passagem do organizador, e "end" não tem
  // volta. O dia seguinte limpa o doc.
  if (!state) return;
  const claim = await claimState(db, activity.ref, state, readAtMs);
  if (!claim) return;

  try {
    await getMessaging().send(buildNextMatchMessage({
      fcmToken: activity.fcmToken,
      liveActivityToken: activity.liveActivityToken,
      state,
      previousPhase: claim.previousPhase,
      nowMs: readAtMs,
    }));
  } catch (err: unknown) {
    if (isInvalidFcmTokenError((err as {code?: string})?.code ?? "")) {
      await activity.ref.delete();
      return;
    }
    await releaseClaim(db, activity.ref, claim);
    throw err;
  }
}

async function activitiesToRefresh(
  db: Firestore,
  tournamentId: string,
  teamIds: string[],
  bracketMoved: boolean,
): Promise<ActivityDoc[]> {
  const col = db.collection(NEXT_MATCH_ACTIVITIES_COLLECTION);
  const [byTeam, waiting] = await Promise.all([
    teamIds.length > 0 ?
      col.where("teamIds", "array-contains-any", teamIds.slice(0, 10)).get() :
      Promise.resolve(null),
    bracketMoved ?
      col.where("tournamentId", "==", tournamentId).where("phase", "==", "waiting").get() :
      Promise.resolve(null),
  ]);
  const byId = new Map<string, ActivityDoc>();
  for (const doc of [...(byTeam?.docs ?? []), ...(waiting?.docs ?? [])]) {
    if (doc.get("tournamentId") !== tournamentId || byId.has(doc.id)) continue;
    const activity = activityFrom(doc.ref, doc.data() as Record<string, unknown>);
    if (activity) byId.set(doc.id, activity);
  }
  return [...byId.values()];
}

export const onMatchChangedNextMatchActivity = onDocumentUpdated(
  "artifacts/{appId}/public/data/matches/{matchId}",
  async (event) => {
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;
    if (!before || !after) return;
    const teamIds = nextMatchChangeTeamIds(before, after);
    if (teamIds.length === 0) return;
    const tournamentId = String(after.tournamentId ?? "").trim();
    if (!tournamentId) return;

    const db = getFirestore();
    const activities = await activitiesToRefresh(
      db, tournamentId, teamIds, nextMatchBracketMoved(before, after),
    );
    if (activities.length === 0) return;

    const projectId = getFirebaseProjectId();
    const results = await Promise.allSettled(
      activities.map((a) => refreshActivity(db, projectId, a)),
    );
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        logger.error("nextMatchActivity: falha ao atualizar o card", {
          docId: activities[i].ref.id,
          matchId: event.params.matchId,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    });
  },
);
