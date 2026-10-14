/**
 * Espelho e limpeza da comissão técnica — mesmo padrão de `arena-staff-sync.ts`.
 * `users/{uid}/coachStaff/{coachUid}` é como o portal descobre de quais treinadores o
 * usuário é equipe (as rules não deixam consultar `staff` de outro). É só DESCOBERTA:
 * a autorização lê `coaches/{coachUid}/staff/{uid}` ao vivo, então remover o vínculo
 * corta o acesso no mesmo instante, antes do trigger rodar.
 */
import {onDocumentDeleted, onDocumentWritten} from "firebase-functions/v2/firestore";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {isCoachStaffRole} from "./coach-staff-roles";

export function buildCoachStaffMirrorData(
  staffData: Record<string, unknown>,
  coachData: Record<string, unknown>,
): {role: string; coachName: string; coachPhotoUrl: string | null} {
  const photo = coachData.photoUrl;
  return {
    role: isCoachStaffRole(staffData.role) ? staffData.role : "",
    coachName: typeof coachData.displayName === "string" ? coachData.displayName : "",
    coachPhotoUrl: typeof photo === "string" && photo.trim() ? photo : null,
  };
}

export const onCoachStaffWrittenSyncMirror = onDocumentWritten(
  "coaches/{coachUid}/staff/{staffUserId}",
  async (event) => {
    const {coachUid, staffUserId} = event.params;
    const db = getFirestore();
    const mirrorRef = db.doc(`users/${staffUserId}/coachStaff/${coachUid}`);

    const after = event.data?.after;
    if (!after?.exists) {
      await mirrorRef.delete();
      return;
    }
    const coachSnap = await db.doc(`coaches/${coachUid}`).get();
    if (!coachSnap.exists) {
      logger.warn("coachStaff: treinador inexistente, espelho omitido", {coachUid, staffUserId});
      return;
    }
    await mirrorRef.set(
      {
        ...buildCoachStaffMirrorData(after.data() ?? {}, coachSnap.data() ?? {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  },
);

/** Treinador excluído: apaga vínculos (cada delete dispara o sync, que limpa o espelho) e convites. */
export const onCoachDeletedCleanupStaff = onDocumentDeleted(
  "coaches/{coachUid}",
  async (event) => {
    const {coachUid} = event.params;
    const db = getFirestore();
    const [staffSnap, invitesSnap] = await Promise.all([
      db.collection(`coaches/${coachUid}/staff`).get(),
      db.collection("coachStaffInvites").where("coachUid", "==", coachUid).get(),
    ]);
    if (staffSnap.empty && invitesSnap.empty) return;
    const batch = db.batch();
    for (const d of [...staffSnap.docs, ...invitesSnap.docs]) batch.delete(d.ref);
    await batch.commit();
    logger.info("coachStaff: limpeza apos exclusao do treinador", {
      coachUid, staff: staffSnap.size, invites: invitesSnap.size,
    });
  },
);
