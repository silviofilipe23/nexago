import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {getFirestore, FieldValue} from "firebase-admin/firestore";

import {getFirebaseProjectId} from "./firebase-paths";

/**
 * Vincula perfil do usuário autenticado com unicidade forte de e-mail.
 * Usa doc de reserva em userEmails/{normalizedEmail} para impedir duplicidade entre UIDs.
 */
export const linkAuthenticatedUserProfile = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const rawEmail = request.data?.email;
  if (typeof rawEmail !== "string" || !rawEmail.trim()) {
    throw new HttpsError("invalid-argument", "E-mail inválido para vincular perfil.");
  }

  const normalizedEmail = normalizeEmail(rawEmail);
  const fullName = typeof request.data?.fullName === "string" ? request.data.fullName.trim() : "";
  const profilePhotoUrl = typeof request.data?.profilePhotoUrl === "string" ? request.data.profilePhotoUrl.trim() : "";

  const db = getFirestore();
  const usersByEmailSnapshot = await db
    .collection("users")
    .where("email", "==", normalizedEmail)
    .get();

  const matchingUids = Array.from(new Set(usersByEmailSnapshot.docs.map((item) => item.id)));
  const foreignMatches = matchingUids.filter((uid) => uid !== callerUid);

  if (foreignMatches.length > 1) {
    throw new HttpsError(
      "failed-precondition",
      "Foram encontrados perfis duplicados com o mesmo e-mail. Contate o suporte para saneamento."
    );
  }

  const userRef = db.doc(`users/${callerUid}`);
  const emailLockRef = db.doc(`userEmails/${normalizedEmail}`);
  const legacyUid = foreignMatches.length === 1 ? foreignMatches[0] : null;
  const legacyRef = legacyUid ? db.doc(`users/${legacyUid}`) : null;

  let mergedFromLegacy = false;
  try {
    await db.runTransaction(async (tx) => {
      const docsToRead = [tx.get(emailLockRef), tx.get(userRef)];
      if (legacyRef) {
        docsToRead.push(tx.get(legacyRef));
      }
      const [lockSnap, userSnap, legacySnap] = await Promise.all(docsToRead);

      if (lockSnap.exists) {
        const lockUid = lockSnap.get("uid");
        const canTakeOverLegacyLock = !!(legacyUid && typeof lockUid === "string" && lockUid === legacyUid);
        if (typeof lockUid === "string" && lockUid && lockUid !== callerUid && !canTakeOverLegacyLock) {
          throw new HttpsError(
            "already-exists",
            "Este e-mail já está em uso por outro usuário."
          );
        }
      }

      const userData = userSnap.exists ? userSnap.data() || {} : {};
      const existingRoles = Array.isArray(userData["roles"]) ?
        (userData["roles"] as unknown[]).filter((r): r is string => typeof r === "string") :
        [];
      const nextPayload: Record<string, unknown> = {
        email: normalizedEmail,
        roles: existingRoles.length > 0 ? existingRoles : ["athlete"],
        role: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (!userSnap.exists || !userData["createdAt"]) {
        nextPayload["createdAt"] = FieldValue.serverTimestamp();
      }

      if (!userData["historicalPoints"]) {
        nextPayload["historicalPoints"] = 0;
      }
      if (userData["isProfileComplete"] === undefined) {
        nextPayload["isProfileComplete"] = false;
      }

      if (fullName && !userData["fullName"]) {
        nextPayload["fullName"] = fullName;
      }
      if (profilePhotoUrl && !userData["profilePhotoUrl"]) {
        nextPayload["profilePhotoUrl"] = profilePhotoUrl;
      }

      if (legacyUid && legacySnap?.exists) {
        mergedFromLegacy = true;
        const legacyData = legacySnap.data() || {};
        const legacyRoles = Array.isArray(legacyData["roles"]) ?
          (legacyData["roles"] as unknown[]).filter((r): r is string => typeof r === "string") :
          [];
        const mergedPayload: Record<string, unknown> = {
          ...legacyData,
          ...nextPayload,
          email: normalizedEmail,
          roles: Array.from(new Set([...legacyRoles, ...(nextPayload["roles"] as string[])])),
          role: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        delete mergedPayload["uid"];
        delete mergedPayload["mergedInto"];
        tx.set(userRef, mergedPayload, {merge: true});
        tx.set(legacyRef!, {
          mergedInto: callerUid,
          email: FieldValue.delete(),
          partnerInviteStatus: "accepted",
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
      } else {
        tx.set(userRef, nextPayload, {merge: true});
      }

      tx.set(emailLockRef, {
        uid: callerUid,
        email: normalizedEmail,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: lockSnap.exists ? lockSnap.get("createdAt") || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      }, {merge: true});
    });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("Erro ao vincular perfil autenticado com unicidade de e-mail:", error);
    throw new HttpsError("internal", "Não foi possível vincular o perfil do usuário.");
  }

  let migratedTeams = 0;
  if (legacyUid) {
    try {
      const teamsRef = db.collection(`artifacts/${getFirebaseProjectId()}/public/data/teams`);
      const [player1Snap, player2Snap] = await Promise.all([
        teamsRef.where("player1Id", "==", legacyUid).get(),
        teamsRef.where("player2Id", "==", legacyUid).get(),
      ]);

      const updatesByDocId = new Map<string, Record<string, unknown>>();
      player1Snap.docs.forEach((teamDoc) => {
        const current = updatesByDocId.get(teamDoc.id) || {};
        current["player1Id"] = callerUid;
        updatesByDocId.set(teamDoc.id, current);
      });
      player2Snap.docs.forEach((teamDoc) => {
        const current = updatesByDocId.get(teamDoc.id) || {};
        current["player2Id"] = callerUid;
        updatesByDocId.set(teamDoc.id, current);
      });

      if (updatesByDocId.size > 0) {
        const batch = db.batch();
        updatesByDocId.forEach((payload, docId) => {
          batch.update(teamsRef.doc(docId), {
            ...payload,
            updatedAt: FieldValue.serverTimestamp(),
          });
        });
        await batch.commit();
        migratedTeams = updatesByDocId.size;
      }
    } catch (error) {
      logger.error("Erro ao migrar playerId legado nas equipes:", {legacyUid, callerUid, error});
      throw new HttpsError(
        "internal",
        "Perfil vinculado, mas não foi possível migrar as inscrições/equipes automaticamente."
      );
    }
  }

  return {
    success: true,
    email: normalizedEmail,
    uid: callerUid,
    mergedFromLegacy,
    legacyUid: legacyUid || null,
    migratedTeams,
  };
});



function normalizeEmail(email: string): string {
  return (email || "").trim().toLowerCase();
}