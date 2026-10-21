/**
 * QR de check-in por quadra — alternativa ao check-in por localização nas aulas da turma.
 *
 * Cada quadra tem um código aleatório (128 bits) guardado só no servidor, em
 * `arenaCourtCheckinCodes/{arenaId}_{courtId}` (rules fechadas: nenhum cliente lê). O QR impresso
 * carrega `nexago-checkin:v1:{token}`; conhecer os ids da arena e da quadra não basta para forjar
 * um. A equipe (área `quadras`) gera/vê o QR no portal e pode trocar o código — o antigo deixa de
 * valer na hora (QR fotografado e compartilhado num grupo, por exemplo).
 */
import {randomBytes} from "node:crypto";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue, type Firestore} from "firebase-admin/firestore";
import {assertArenaAreaAccess} from "./arena-area-access";
import {requireUid, str} from "./arena-class";
import {CLIENT_FACING_REGIONS} from "./function-regions";

export const ARENA_COURT_CHECKIN_CODES = "arenaCourtCheckinCodes";
export const COURT_QR_PREFIX = "nexago-checkin:v1:";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function courtCheckinCodeId(arenaId: string, courtId: string): string {
  return `${arenaId}_${courtId}`;
}

export function newCourtCheckinToken(): string {
  return randomBytes(16).toString("base64url");
}

export function courtQrPayload(token: string): string {
  return `${COURT_QR_PREFIX}${token}`;
}

/** Token do QR lido pelo app — só o formato v1; qualquer outro QR volta `null`. */
export function parseCourtQrPayload(raw: string): string | null {
  const text = raw.trim();
  if (!text.startsWith(COURT_QR_PREFIX)) return null;
  const token = text.slice(COURT_QR_PREFIX.length);
  return TOKEN_PATTERN.test(token) ? token : null;
}

export interface CourtCheckinCode {
  arenaId: string;
  courtId: string;
  courtName: string;
}

/** Quadra dona do token, ou `null` se ele não existe (nunca existiu ou foi trocado). */
export async function resolveCourtCheckinToken(db: Firestore, token: string): Promise<CourtCheckinCode | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const snap = await db.collection(ARENA_COURT_CHECKIN_CODES).where("token", "==", token).limit(1).get();
  const data = snap.docs[0]?.data() as Record<string, unknown> | undefined;
  if (!data) return null;
  return {arenaId: str(data["arenaId"]), courtId: str(data["courtId"]), courtName: str(data["courtName"]) || "Quadra"};
}

export interface CourtQrInput {
  arenaId: string;
  courtId: string;
  uid: string;
  /** Troca o código: o QR impresso antes para de valer. */
  rotate: boolean;
}

export interface CourtQrResult {
  payload: string;
  courtName: string;
  rotated: boolean;
}

/** QR da quadra para a equipe: devolve o atual ou cria o primeiro (e troca, se pedido). */
export async function getCourtCheckinQrCore(db: Firestore, input: CourtQrInput): Promise<CourtQrResult> {
  await assertArenaAreaAccess(db, input.arenaId, input.uid, "quadras", input.rotate ? "write" : "read");
  const court = await db.collection("arenas").doc(input.arenaId).collection("courts").doc(input.courtId).get();
  if (!court.exists) throw new HttpsError("not-found", "Quadra não encontrada.");
  const courtName = str(court.data()?.["name"]) || "Quadra";
  const ref = db.collection(ARENA_COURT_CHECKIN_CODES).doc(courtCheckinCodeId(input.arenaId, input.courtId));
  const current = await ref.get();
  const existing = str(current.data()?.["token"]);
  if (existing && !input.rotate) return {payload: courtQrPayload(existing), courtName, rotated: false};

  const token = newCourtCheckinToken();
  await ref.set({
    arenaId: input.arenaId,
    courtId: input.courtId,
    courtName,
    token,
    createdBy: input.uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  return {payload: courtQrPayload(token), courtName, rotated: Boolean(existing)};
}

export const getArenaCourtCheckinQr = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const arenaId = str(data["arenaId"]);
  const courtId = str(data["courtId"]);
  if (!arenaId || !courtId) throw new HttpsError("invalid-argument", "Quadra inválida.");
  return getCourtCheckinQrCore(getFirestore(), {arenaId, courtId, uid, rotate: data["rotate"] === true});
});
