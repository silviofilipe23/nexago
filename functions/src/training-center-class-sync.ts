/**
 * Nome e quadra da turma mudaram (o professor da turma pode mexer nisso — "Ver e editar turmas
 * atribuídas") → as aulas futuras ainda agendadas acompanham. A quadra só muda nas aulas que não
 * foram alteradas uma a uma (`changed`); o nome vale para todas. O professor não grava em
 * `sessions` (rules), por isso a cópia é do servidor.
 */
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {TRAINING_CENTERS} from "./training-center-billing-model";
import {dayKeyIn} from "./training-center-waitlist-model";

type Data = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** O que copiar para as aulas (null = nada mudou que importe). */
export function classSyncPatch(before: Data | undefined, after: Data | undefined): {name: string | null; court: {courtId: string; courtName: string} | null} | null {
  if (!before || !after) return null;
  const name = str(before["name"]) !== str(after["name"]) ? str(after["name"]) : null;
  const court = str(before["courtId"]) !== str(after["courtId"]) || str(before["courtName"]) !== str(after["courtName"]) ?
    {courtId: str(after["courtId"]), courtName: str(after["courtName"])} :
    null;
  return name === null && court === null ? null : {name, court};
}

export async function syncClassSessions(db: Firestore, centerId: string, classId: string, before: Data | undefined, after: Data | undefined, now: Date): Promise<number> {
  const patch = classSyncPatch(before, after);
  if (!patch) return 0;
  const center = (await db.collection(TRAINING_CENTERS).doc(centerId).get()).data();
  const today = dayKeyIn(now, str(center?.["timezone"]));
  const snap = await db.collection(TRAINING_CENTERS).doc(centerId).collection("sessions").where("classId", "==", classId).get();
  let updated = 0;
  let batch = db.batch();
  let pending = 0;
  for (const doc of snap.docs) {
    const s = doc.data();
    if (str(s["date"]) < today || s["status"] !== "scheduled") continue;
    const data: Data = {};
    if (patch.name !== null && s["className"] !== patch.name) data["className"] = patch.name;
    if (patch.court && s["changed"] !== true && (s["courtId"] !== patch.court.courtId || s["courtName"] !== patch.court.courtName)) {
      data["courtId"] = patch.court.courtId;
      data["courtName"] = patch.court.courtName;
    }
    if (Object.keys(data).length === 0) continue;
    batch.update(doc.ref, data);
    updated++;
    if (++pending === 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending) await batch.commit();
  return updated;
}

export const onTrainingCenterClassSync = onDocumentWritten(`${TRAINING_CENTERS}/{centerId}/classes/{classId}`, async (event) => {
  await syncClassSessions(getFirestore(), event.params.centerId, event.params.classId,
    event.data?.before?.data(), event.data?.after?.data(), new Date());
});
