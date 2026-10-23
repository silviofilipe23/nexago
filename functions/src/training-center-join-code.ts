/**
 * Código de entrada do Centro de Treinamento ("Tenho um código", O3 do app do atleta).
 *
 * O gestor gera (ou desliga) o código no portal; o aluno digita no app e vira aluno do centro
 * (`students/{id}` com `uid`, ativo, consentimento registrado). A unicidade fica em
 * `trainingCenterJoinCodes/{CODIGO}` (só servidor — catch-all das rules); o centro guarda o código
 * vigente em `joinCode`/`joinCodeEnabled` para o portal mostrar.
 */
import {randomInt} from "node:crypto";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {TRAINING_CENTERS} from "./training-center-billing-model";
import {requireManager} from "./training-center-billing";
import {str} from "./arena-class";
import {CLIENT_FACING_REGIONS} from "./function-regions";

type Data = Record<string, unknown>;

export const TRAINING_CENTER_JOIN_CODES = "trainingCenterJoinCodes";
const JOIN_ATTEMPTS = "trainingCenterJoinAttempts";
/** Sem 0/O, 1/I/L: o aluno digita o que o centro falou ou colou no grupo. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LEN = 6;
/** Tentativas erradas por hora por conta (contra chute). */
export const MAX_FAILED_PER_HOUR = 10;

/** "areia 7k2" → "AREIA7K2": maiúsculas, sem espaço/hífen. */
export function normalizeJoinCode(raw: unknown): string {
  return str(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** "XK7Q2M" → "XK7-Q2M" para mostrar (o aluno pode digitar com ou sem hífen). */
export function formatJoinCode(code: string): string {
  return code.length === CODE_LEN ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

export function randomJoinCode(rand: (max: number) => number = randomInt): string {
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[rand(ALPHABET.length)];
  return out;
}

// ---------------------------------------------------------------------------
// Gestor: gerar / desligar
// ---------------------------------------------------------------------------

export interface JoinCodeResult {
  code: string | null;
  enabled: boolean;
}

export async function setCenterJoinCodeCore(
  db: Firestore, uid: string | undefined, raw: unknown, now: Date,
  rand: (max: number) => number = randomInt,
): Promise<JoinCodeResult> {
  const d = (raw && typeof raw === "object" ? raw : {}) as Data;
  const centerId = str(d["centerId"]);
  if (!centerId || centerId.includes("/")) throw new HttpsError("invalid-argument", "Centro inválido.");
  const enabled = d["enabled"] !== false;
  const actor = await requireManager(db, uid, centerId);
  const centerRef = db.collection(TRAINING_CENTERS).doc(centerId);
  const at = Timestamp.fromDate(now);

  return db.runTransaction(async (tx) => {
    const center = (await tx.get(centerRef)).data();
    if (!center) throw new HttpsError("not-found", "Centro não encontrado.");
    const old = str(center["joinCode"]);
    let code: string | null = null;
    if (enabled) {
      // Sorteia até achar um livre (colisão é rara: 31^6 ≈ 887 mi).
      for (let i = 0; i < 8 && !code; i++) {
        const c = randomJoinCode(rand);
        if (!(await tx.get(db.collection(TRAINING_CENTER_JOIN_CODES).doc(c))).exists) code = c;
      }
      if (!code) throw new HttpsError("aborted", "Não foi possível gerar o código. Tente de novo.");
    }
    if (old) tx.delete(db.collection(TRAINING_CENTER_JOIN_CODES).doc(old));
    if (code) tx.set(db.collection(TRAINING_CENTER_JOIN_CODES).doc(code), {centerId, createdAt: at, createdBy: actor.uid});
    tx.update(centerRef, {joinCode: code, joinCodeEnabled: enabled, joinCodeUpdatedAt: at});
    tx.set(centerRef.collection("auditLogs").doc(), {
      at, actorUid: actor.uid, actorName: actor.name,
      action: enabled ? "center.join_code_rotated" : "center.join_code_disabled",
      entity: "center", entityId: centerId,
      detail: enabled ? `Código de entrada novo: ${formatJoinCode(code!)}` : "Código de entrada desligado",
      reason: "",
    });
    return {code: code ? formatJoinCode(code) : null, enabled};
  });
}

// ---------------------------------------------------------------------------
// Aluno: entrar com o código
// ---------------------------------------------------------------------------

export interface JoinResult {
  centerId: string;
  centerName: string;
  /** true = já era aluno (nada mudou). */
  already: boolean;
}

export async function joinCenterByCodeCore(
  db: Firestore,
  auth: {uid: string; email: string; verified: boolean; name: string},
  raw: unknown,
  now: Date,
): Promise<JoinResult> {
  const d = (raw && typeof raw === "object" ? raw : {}) as Data;
  const code = normalizeJoinCode(d["code"]);
  const attemptsRef = db.collection(JOIN_ATTEMPTS).doc(auth.uid);
  const attempts = (await attemptsRef.get()).data();
  const windowStart = attempts?.["windowStart"] instanceof Timestamp ? (attempts["windowStart"] as Timestamp).toMillis() : 0;
  const inWindow = now.getTime() - windowStart < 3600_000;
  const failed = inWindow ? Number(attempts?.["failed"] ?? 0) : 0;
  if (failed >= MAX_FAILED_PER_HOUR) {
    throw new HttpsError("resource-exhausted", "Muitas tentativas. Espere um pouco e confira o código com o centro.");
  }
  const fail = async (message: string): Promise<never> => {
    await attemptsRef.set({
      failed: failed + 1,
      windowStart: inWindow ? attempts!["windowStart"] : Timestamp.fromDate(now),
    });
    throw new HttpsError("not-found", message);
  };
  if (code.length !== CODE_LEN) return fail("Código inválido. Confira com o centro.");

  const link = (await db.collection(TRAINING_CENTER_JOIN_CODES).doc(code).get()).data();
  const centerId = str(link?.["centerId"]);
  if (!centerId) return fail("Código não encontrado. Confira com o centro.");
  const centerRef = db.collection(TRAINING_CENTERS).doc(centerId);
  const center = (await centerRef.get()).data();
  if (!center || center["joinCodeEnabled"] === false || str(center["joinCode"]) !== code) {
    return fail("Este código não vale mais. Peça o novo ao centro.");
  }
  if (center["status"] === "suspended") {
    throw new HttpsError("failed-precondition", "Este centro não está recebendo alunos agora.");
  }
  const centerName = str(center["name"]) || "Centro de treinamento";
  const students = centerRef.collection("students");

  const mine = await students.where("uid", "==", auth.uid).limit(1).get();
  if (!mine.empty) {
    const s = mine.docs[0]!.data();
    if (s["status"] === "blocked") throw new HttpsError("permission-denied", "Fale com o centro para voltar a treinar.");
    return {centerId, centerName, already: true};
  }

  const user = (await db.collection("users").doc(auth.uid).get()).data() ?? {};
  const name = str(user["fullName"]) || str(user["displayName"]) || str(user["name"]) || auth.name || "Aluno";
  const phone = str(user["phone"]) || str(user["phoneNumber"]);
  // Convite pendente para o mesmo e-mail (verificado): vincula esse cadastro em vez de duplicar.
  const invited = auth.email && auth.verified ?
    (await students.where("email", "==", auth.email).limit(5).get()).docs
      .find((x) => x.data()["status"] === "invited" && !str(x.data()["uid"])) :
    undefined;
  const at = Timestamp.fromDate(now);
  // Id fixo por conta: toque duplo não cria dois cadastros.
  const ref = invited?.ref ?? students.doc(`app_${auth.uid}`);
  const created = await db.runTransaction(async (tx) => {
    if (invited) {
      const cur = (await tx.get(ref)).data();
      if (!cur || cur["status"] !== "invited" || str(cur["uid"])) {
        throw new HttpsError("aborted", "O cadastro mudou agora. Tente de novo.");
      }
      tx.update(ref, {uid: auth.uid, status: "active", lgpdConsentAt: at, inviteAnsweredAt: at, joinedBy: "code"});
    } else {
      if ((await tx.get(ref)).exists) return false;
      tx.set(ref, {
        uid: auth.uid,
        name,
        email: auth.email,
        phone,
        status: "active",
        isMinor: false,
        birthDate: null,
        guardian: null,
        lgpdConsentAt: at,
        imageUseAllowed: false,
        notifyClasses: true,
        emergencyName: "",
        emergencyPhone: "",
        medicalNotes: "",
        makeupCredits: 0,
        joinedBy: "code",
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    tx.set(centerRef.collection("auditLogs").doc(), {
      at, actorUid: auth.uid, actorName: name,
      action: "student.joined_by_code", entity: "student", entityId: ref.id,
      detail: `${name} entrou pelo código do centro no app`, reason: "",
    });
    return true;
  });
  return {centerId, centerName, already: !created};
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

export const setTrainingCenterJoinCode = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  setCenterJoinCodeCore(getFirestore(), request.auth?.uid, request.data, new Date()));

export const joinTrainingCenterByCode = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const token = (request.auth.token ?? {}) as Data;
  return joinCenterByCodeCore(getFirestore(), {
    uid: request.auth.uid,
    email: str(token["email"]).toLowerCase(),
    verified: token["email_verified"] === true,
    name: str(token["name"]),
  }, request.data, new Date());
});
