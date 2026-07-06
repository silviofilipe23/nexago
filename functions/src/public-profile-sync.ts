import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth, type UserRecord} from "firebase-admin/auth";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {hasRoleInClaims} from "./auth-roles";

/**
 * Espelho público de perfis: `public_profiles/{uid}` contém APENAS campos de
 * exibição/busca de `users/{uid}` — nunca PII (email, telefone, nascimento).
 * O app lê o espelho para diretório (busca de parceiro, ranking, equipes);
 * `users` fica restrito ao dono/admin. Mesmos nomes de campo do doc original
 * para os mappers do app funcionarem sem mudança.
 */
const PUBLIC_PROFILE_FIELDS = [
  // Identidade de exibição
  "fullName",
  "name",
  "nickname",
  "gender",
  "profilePhotoUrl",
  "avatarUrl",
  "photoURL",
  "coverPhotoUrl",
  "bio",
  "city",
  "state",
  // Papéis e busca
  "role",
  "roles",
  "hasAthleteRole",
  "hasOrganizerRole",
  "keywords",
  "partnerInviteStatus",
  // Card público do atleta (discover / perfil público)
  "sport",
  "primarySport",
  "sports",
  "discoverSportIds",
  "level",
  "nivel",
  "goals",
  "gameObjective",
  "category",
  "lookingForPartner",
  "lastActiveAt",
  "sportOnboarding",
  "sportProfile",
  "isProfileComplete",
  "onboardingCompleted",
  // Flags de privacidade (booleans) — o app aplica na exibição
  "privacyPreferences",
] as const;

/** Projeção com whitelist — só copia campos presentes no doc de origem. */
export function buildPublicProfileData(
  userData: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of PUBLIC_PROFILE_FIELDS) {
    if (userData[field] !== undefined) {
      out[field] = userData[field];
    }
  }
  return out;
}

export const onUserWrittenSyncPublicProfile = onDocumentWritten(
  "users/{userId}",
  async (event) => {
    const {userId} = event.params;
    const db = getFirestore();
    const mirrorRef = db.doc(`public_profiles/${userId}`);

    const after = event.data?.after;
    if (!after?.exists) {
      await mirrorRef.delete();
      return;
    }

    // set sem merge: campo removido do perfil some do espelho também.
    await mirrorRef.set({
      ...buildPublicProfileData(after.data() ?? {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
  },
);

/**
 * Backfill paginado do espelho (super admin). Chame com `{ pageSize: 200 }`
 * e repita com `startAfterId` do último doc até `hasMore` ser false.
 */
export const backfillPublicProfiles = onCall(
  {timeoutSeconds: 540},
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado");
    }
    const caller: UserRecord = await getAuth().getUser(callerUid);
    const claims = caller.customClaims ?? {};
    if (claims["superAdmin"] !== true && !hasRoleInClaims(claims, "admin")) {
      throw new HttpsError(
        "permission-denied",
        "Apenas administradores podem executar o backfill.",
      );
    }

    const pageSize =
      typeof request.data?.pageSize === "number" && request.data.pageSize > 0 ?
        Math.min(request.data.pageSize, 500) :
        200;
    const startAfterId =
      typeof request.data?.startAfterId === "string" ?
        request.data.startAfterId :
        undefined;

    const db = getFirestore();
    let query = db.collection("users").orderBy("__name__").limit(pageSize);
    if (startAfterId) {
      query = query.startAfter(startAfterId);
    }

    const snap = await query.get();
    let lastId: string | undefined;
    const batch = db.batch();
    for (const doc of snap.docs) {
      lastId = doc.id;
      batch.set(db.doc(`public_profiles/${doc.id}`), {
        ...buildPublicProfileData(doc.data()),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    logger.info(
      `backfillPublicProfiles: processed=${snap.size} lastId=${lastId ?? ""}`,
    );
    return {
      success: true,
      processed: snap.size,
      lastId,
      hasMore: snap.size >= pageSize,
    };
  },
);
