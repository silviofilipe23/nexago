import {
  getFirestore,
  type DocumentReference,
} from "firebase-admin/firestore";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import type {UserRecord} from "firebase-admin/auth";

import {callerIsSuperAdmin} from "./auth-roles";
import {
  buildLeagueSearchFields,
  buildTeamSearchFields,
  buildTournamentSearchFields,
  buildUserSearchFields,
  leagueSearchSourceFieldsChanged,
  searchFieldsChanged,
  teamSearchSourceFieldsChanged,
  tournamentSearchSourceFieldsChanged,
  userSearchSourceFieldsChanged,
} from "./search-keywords";

async function resolveUserDisplayName(uid: string): Promise<string> {
  const trimmed = uid.trim();
  if (!trimmed) return "";
  const snap = await getFirestore().doc(`users/${trimmed}`).get();
  if (!snap.exists) return "";
  const data = snap.data() ?? {};
  const nickname = typeof data.nickname === "string" ? data.nickname.trim() : "";
  const fullName =
    (typeof data.fullName === "string" ? data.fullName.trim() : "") ||
    (typeof data.name === "string" ? data.name.trim() : "");
  const email = typeof data.email === "string" ? data.email.trim() : "";
  return nickname || fullName || email;
}

async function applyUserSearchFields(
  ref: DocumentReference,
  data: Record<string, unknown>
): Promise<boolean> {
  const fields = buildUserSearchFields(data);
  const payload: Record<string, unknown> = {
    keywords: fields.keywords,
    hasAthleteRole: fields.hasAthleteRole,
    hasOrganizerRole: fields.hasOrganizerRole,
  };
  const current = (await ref.get()).data();
  if (!searchFieldsChanged(current, payload)) return false;
  await ref.update(payload);
  return true;
}

async function applyTournamentSearchFields(
  ref: DocumentReference,
  data: Record<string, unknown>
): Promise<boolean> {
  const fields = buildTournamentSearchFields(data);
  const payload = {keywords: fields.keywords};
  const current = (await ref.get()).data();
  if (!searchFieldsChanged(current, payload)) return false;
  await ref.update(payload);
  return true;
}

async function applyLeagueSearchFields(
  ref: DocumentReference,
  data: Record<string, unknown>
): Promise<boolean> {
  const fields = buildLeagueSearchFields(data);
  const payload = {keywords: fields.keywords};
  const current = (await ref.get()).data();
  if (!searchFieldsChanged(current, payload)) return false;
  await ref.update(payload);
  return true;
}

async function applyTeamSearchFields(
  ref: DocumentReference,
  data: Record<string, unknown>
): Promise<boolean> {
  const player1Id =
    typeof data.player1Id === "string" ? data.player1Id.trim() : "";
  const player2Id =
    typeof data.player2Id === "string" ? data.player2Id.trim() : "";

  const playerNames: string[] = [];
  if (player1Id) playerNames.push(await resolveUserDisplayName(player1Id));
  if (player2Id && player2Id !== player1Id) {
    playerNames.push(await resolveUserDisplayName(player2Id));
  }

  const fields = buildTeamSearchFields(data, playerNames);
  const payload: Record<string, unknown> = {keywords: fields.keywords};
  if (fields.player1DisplayName) {
    payload.player1DisplayName = fields.player1DisplayName;
  }
  if (fields.player2DisplayName) {
    payload.player2DisplayName = fields.player2DisplayName;
  }

  const current = (await ref.get()).data();
  if (!searchFieldsChanged(current, payload)) return false;
  await ref.update(payload);
  return true;
}

export const onUserSearchKeywordsSync = onDocumentWritten(
  "users/{userId}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const afterData = after.data();
    if (!afterData) return;

    const beforeData = event.data?.before?.data();
    if (!userSearchSourceFieldsChanged(beforeData, afterData)) {
      const hasKeywords = Array.isArray(afterData.keywords);
      const hasFlags =
        typeof afterData.hasAthleteRole === "boolean" &&
        typeof afterData.hasOrganizerRole === "boolean";
      if (hasKeywords && hasFlags) return;
    }

    try {
      const updated = await applyUserSearchFields(after.ref, afterData);
      if (updated) {
        logger.info(`search-keywords: updated users/${after.id}`);
      }
    } catch (err) {
      logger.error(`search-keywords: users/${after.id} failed`, err);
    }
  }
);

export const onTournamentSearchKeywordsSync = onDocumentWritten(
  "tournaments/{tournamentId}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const afterData = after.data();
    if (!afterData) return;

    const beforeData = event.data?.before?.data();
    if (
      !tournamentSearchSourceFieldsChanged(beforeData, afterData) &&
      Array.isArray(afterData.keywords)
    ) {
      return;
    }

    try {
      const updated = await applyTournamentSearchFields(after.ref, afterData);
      if (updated) {
        logger.info(`search-keywords: updated tournaments/${after.id}`);
      }
    } catch (err) {
      logger.error(`search-keywords: tournaments/${after.id} failed`, err);
    }
  }
);

export const onLeagueSearchKeywordsSync = onDocumentWritten(
  "leagues/{leagueId}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const afterData = after.data();
    if (!afterData) return;

    const beforeData = event.data?.before?.data();
    if (
      !leagueSearchSourceFieldsChanged(beforeData, afterData) &&
      Array.isArray(afterData.keywords)
    ) {
      return;
    }

    try {
      const updated = await applyLeagueSearchFields(after.ref, afterData);
      if (updated) {
        logger.info(`search-keywords: updated leagues/${after.id}`);
      }
    } catch (err) {
      logger.error(`search-keywords: leagues/${after.id} failed`, err);
    }
  }
);

export const onLegacyTournamentSearchKeywordsSync = onDocumentWritten(
  "artifacts/{appId}/public/data/tournaments/{tournamentId}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const afterData = after.data();
    if (!afterData) return;

    const beforeData = event.data?.before?.data();
    if (
      !tournamentSearchSourceFieldsChanged(beforeData, afterData) &&
      Array.isArray(afterData.keywords)
    ) {
      return;
    }

    try {
      const updated = await applyTournamentSearchFields(after.ref, afterData);
      if (updated) {
        logger.info(
          `search-keywords: updated legacy tournament ${after.ref.path}`
        );
      }
    } catch (err) {
      logger.error(`search-keywords: legacy tournament failed`, err);
    }
  }
);

export const onTeamSearchKeywordsSync = onDocumentWritten(
  "artifacts/{appId}/public/data/teams/{teamId}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const afterData = after.data();
    if (!afterData) return;

    const beforeData = event.data?.before?.data();
    if (
      !teamSearchSourceFieldsChanged(beforeData, afterData) &&
      Array.isArray(afterData.keywords)
    ) {
      return;
    }

    try {
      const updated = await applyTeamSearchFields(after.ref, afterData);
      if (updated) {
        logger.info(`search-keywords: updated team ${after.ref.path}`);
      }
    } catch (err) {
      logger.error(`search-keywords: team failed`, err);
    }
  }
);

type BackfillCollection =
  | "users"
  | "tournaments"
  | "legacyTournaments"
  | "leagues"
  | "teams";

async function backfillCollection(
  collection: BackfillCollection,
  pageSize: number,
  startAfterId?: string
): Promise<{processed: number; updated: number; lastId: string | null}> {
  const db = getFirestore();
  let processed = 0;
  let updated = 0;
  let lastId: string | null = null;

  if (collection === "users") {
    let query = db.collection("users").orderBy("__name__").limit(pageSize);
    if (startAfterId) {
      query = query.startAfter(startAfterId);
    }
    const snap = await query.get();
    for (const doc of snap.docs) {
      processed += 1;
      lastId = doc.id;
      const data = doc.data();
      if (await applyUserSearchFields(doc.ref, data)) updated += 1;
    }
    return {processed, updated, lastId};
  }

  if (collection === "tournaments") {
    let query = db.collection("tournaments").orderBy("__name__").limit(pageSize);
    if (startAfterId) {
      query = query.startAfter(startAfterId);
    }
    const snap = await query.get();
    for (const doc of snap.docs) {
      processed += 1;
      lastId = doc.id;
      if (await applyTournamentSearchFields(doc.ref, doc.data())) updated += 1;
    }
    return {processed, updated, lastId};
  }

  if (collection === "leagues") {
    let query = db.collection("leagues").orderBy("__name__").limit(pageSize);
    if (startAfterId) {
      query = query.startAfter(startAfterId);
    }
    const snap = await query.get();
    for (const doc of snap.docs) {
      processed += 1;
      lastId = doc.id;
      if (await applyLeagueSearchFields(doc.ref, doc.data())) updated += 1;
    }
    return {processed, updated, lastId};
  }

  if (collection === "legacyTournaments") {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
    if (!projectId) {
      throw new HttpsError("failed-precondition", "Project id unavailable.");
    }
    const base = `artifacts/${projectId}/public/data/tournaments`;
    let query = db.collection(base).orderBy("__name__").limit(pageSize);
    if (startAfterId) {
      query = query.startAfter(startAfterId);
    }
    const snap = await query.get();
    for (const doc of snap.docs) {
      processed += 1;
      lastId = doc.id;
      if (await applyTournamentSearchFields(doc.ref, doc.data())) updated += 1;
    }
    return {processed, updated, lastId};
  }

  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  if (!projectId) {
    throw new HttpsError("failed-precondition", "Project id unavailable.");
  }
  const base = `artifacts/${projectId}/public/data/teams`;
  let query = db.collection(base).orderBy("__name__").limit(pageSize);
  if (startAfterId) {
    query = query.startAfter(startAfterId);
  }
  const snap = await query.get();
  for (const doc of snap.docs) {
    processed += 1;
    lastId = doc.id;
    if (await applyTeamSearchFields(doc.ref, doc.data())) updated += 1;
  }
  return {processed, updated, lastId};
}

/**
 * Reprocessa `keywords` em lote (super admin). Após mudanças em nome/apelido,
 * chame com `{ collection: "users", pageSize: 200 }` e repita com
 * `startAfterId` do último doc até `hasMore` ser false.
 */
export const backfillSearchKeywords = onCall(
  {timeoutSeconds: 540},
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado");
    }

    const {getAuth} = await import("firebase-admin/auth");
    const callerUser: UserRecord = await getAuth().getUser(callerUid);
    if (!callerIsSuperAdmin(callerUser)) {
      throw new HttpsError(
        "permission-denied",
        "Apenas o super administrador pode executar o backfill."
      );
    }

    const collection = (request.data?.collection as BackfillCollection) || "users";
    const pageSize =
      typeof request.data?.pageSize === "number" && request.data.pageSize > 0 ?
        Math.min(request.data.pageSize, 500) :
        200;
    const startAfterId =
      typeof request.data?.startAfterId === "string" ?
        request.data.startAfterId :
        undefined;

    const allowed: BackfillCollection[] = [
      "users",
      "tournaments",
      "legacyTournaments",
      "leagues",
      "teams",
    ];
    if (!allowed.includes(collection)) {
      throw new HttpsError("invalid-argument", "Coleção inválida.");
    }

    const result = await backfillCollection(collection, pageSize, startAfterId);
    logger.info(
      `backfillSearchKeywords ${collection}: processed=${result.processed} updated=${result.updated}`
    );

    return {
      success: true,
      collection,
      ...result,
      hasMore: result.processed >= pageSize,
    };
  }
);
