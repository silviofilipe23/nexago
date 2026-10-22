/**
 * Gatilho da chamada do Centro de Treinamento: aula finalizada (ou corrigida, ou reaberta) →
 * ajusta créditos de pacote das matrículas e créditos de reposição dos alunos.
 *
 * Fica no servidor porque o professor registra a chamada mas, pelas rules, não mexe em créditos
 * (nem em matrícula nem em aluno). Idempotente pelo `effectsApplied` da aula: a transação relê a
 * aula, calcula o desejado e aplica só a diferença — ver `training-center-attendance-model.ts`.
 */
import * as logger from "firebase-functions/logger";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {TRAINING_CENTERS} from "./training-center-billing-model";
import {
  desiredEffects,
  effectDeltas,
  readEffectMap,
  readPolicies,
  type AttendanceMark,
  type ClassEnrollment,
  type EffectMap,
} from "./training-center-attendance-model";

const SEAT_STATUSES = ["pending", "active", "paused"];

function sameEffects(a: EffectMap, b: EffectMap): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = a[k];
    const y = b[k];
    if (!x || !y || x.credit !== y.credit || x.makeup !== y.makeup || x.enrollmentId !== y.enrollmentId) return false;
  }
  return true;
}

/** Aplica (na transação) o que falta dos efeitos da chamada. Devolve quantos ajustes fez. */
export async function applySessionAttendanceEffects(db: Firestore, centerId: string, sessionId: string): Promise<number> {
  const centerRef = db.doc(`${TRAINING_CENTERS}/${centerId}`);
  const sessionRef = db.doc(`${TRAINING_CENTERS}/${centerId}/sessions/${sessionId}`);
  return db.runTransaction(async (tx) => {
    const sSnap = await tx.get(sessionRef);
    if (!sSnap.exists) return 0;
    const s = sSnap.data() as Record<string, unknown>;
    const applied = readEffectMap(s["effectsApplied"]);
    const status = String(s["status"] ?? "");
    const classId = String(s["classId"] ?? "");

    let enrollments: ClassEnrollment[] = [];
    let centerPolicies = readPolicies(null);
    if (status === "done") {
      const cSnap = await tx.get(centerRef);
      centerPolicies = readPolicies(cSnap.data()?.["policies"]);
      const eSnap = await tx.get(db.collection(`${TRAINING_CENTERS}/${centerId}/enrollments`).where("classId", "==", classId));
      enrollments = eSnap.docs
        .map((d) => ({id: d.id, data: d.data() as Record<string, unknown>}))
        .filter(({data}) => SEAT_STATUSES.includes(String(data["status"])))
        .map(({id, data}) => {
          const contract = (data["contract"] ?? {}) as Record<string, unknown>;
          return {
            id,
            studentId: String(data["studentId"] ?? ""),
            planType: contract["planType"] === "class_pack" ? "class_pack" : "monthly",
            policies: readPolicies(contract["policies"]),
          } as ClassEnrollment;
        });
    }
    const desired = desiredEffects({
      status,
      attendance: (s["attendance"] ?? {}) as Record<string, AttendanceMark>,
      makeupStudentIds: Array.isArray(s["makeupStudentIds"]) ? (s["makeupStudentIds"] as string[]) : [],
      enrollments,
      centerPolicies,
    });
    if (sameEffects(applied, desired)) return 0;
    const deltas = effectDeltas(applied, desired);

    // Todas as leituras antes das escritas (regra da transação).
    const enrollmentIds = [...new Set(deltas.filter((d) => d.enrollmentId && d.credit).map((d) => d.enrollmentId!))];
    const studentIds = [...new Set(deltas.filter((d) => d.makeup).map((d) => d.studentId))];
    const eDocs = await Promise.all(enrollmentIds.map((id) => tx.get(db.doc(`${TRAINING_CENTERS}/${centerId}/enrollments/${id}`))));
    const sDocs = await Promise.all(studentIds.map((id) => tx.get(db.doc(`${TRAINING_CENTERS}/${centerId}/students/${id}`))));

    for (const doc of eDocs) {
      if (!doc.exists) continue;
      const delta = deltas.filter((d) => d.enrollmentId === doc.id).reduce((sum, d) => sum + d.credit, 0);
      const cur = doc.data()?.["creditsLeft"];
      if (typeof cur !== "number" || delta === 0) continue;
      tx.update(doc.ref, {creditsLeft: Math.max(0, cur + delta)});
    }
    for (const doc of sDocs) {
      if (!doc.exists) continue;
      const delta = deltas.filter((d) => d.studentId === doc.id).reduce((sum, d) => sum + d.makeup, 0);
      if (delta === 0) continue;
      const cur = Number(doc.data()?.["makeupCredits"] ?? 0);
      tx.update(doc.ref, {makeupCredits: Math.max(0, cur + delta)});
    }
    tx.update(sessionRef, {effectsApplied: desired, effectsAppliedAt: FieldValue.serverTimestamp()});
    return deltas.length;
  });
}

/** Só reage quando muda o que define os efeitos (evita rodar no próprio `effectsApplied`). */
export function sessionEffectsInputChanged(before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined): boolean {
  if (!after) return false;
  const pick = (d: Record<string, unknown> | undefined) =>
    JSON.stringify([d?.["status"] ?? null, d?.["attendance"] ?? null, d?.["makeupStudentIds"] ?? null]);
  return pick(before) !== pick(after);
}

export const onTrainingCenterSessionWritten = onDocumentWritten(
  `${TRAINING_CENTERS}/{centerId}/sessions/{sessionId}`,
  async (event) => {
    if (!sessionEffectsInputChanged(event.data?.before?.data(), event.data?.after?.data())) return;
    const {centerId, sessionId} = event.params;
    const n = await applySessionAttendanceEffects(getFirestore(), centerId, sessionId);
    if (n > 0) logger.info("training-center attendance effects", {centerId, sessionId, deltas: n});
  },
);
