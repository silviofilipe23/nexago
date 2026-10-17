/**
 * NexaSquad: atribuição de uma inscrição a um embaixador.
 *
 *   squadAttributions/{uid}   — o último (ou primeiro, conforme o modelo) link/QR de embaixador que o
 *                               atleta abriu: `{ambassadorId, code, origin, at}`. Vale pela janela
 *                               `attribution.windowDays` das regras (tela 06).
 *
 * No checkout, o código digitado **sempre vence** o link. Autoindicação (pagador ou alguém da
 * inscrição é o próprio embaixador) é recusada com mensagem quando o código foi digitado e
 * ignorada em silêncio quando veio de link. Só servidor grava aqui; as rules negam o cliente.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {Timestamp, getFirestore, type Firestore} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {SQUAD_AMBASSADORS} from "./squad-commissions";
import {loadAttributionRules, type SquadTier} from "./squad-rules";

export const SQUAD_ATTRIBUTIONS = "squadAttributions";

export type AttributionOrigin = "code" | "link" | "qr";

const CODE_RE = /^[A-Z0-9]{3,20}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export const SELF_REFERRAL_MESSAGE = "Você não pode usar seu próprio código.";
export const UNKNOWN_CODE_MESSAGE = "Código de embaixador não encontrado.";

/** Contrato vigente do embaixador, como a comissão precisa dele. */
export interface AmbassadorContract {
  uid: string;
  displayName: string;
  tier: SquadTier | null;
  code: string;
  commissionPct: number;
  rulesVersion: number | null;
}

export interface ResolvedAttribution {
  ambassador: AmbassadorContract;
  origin: AttributionOrigin;
}

/** "joao10 " → "JOAO10"; inválido → null. */
export function normalizeSquadCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const code = v.trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

type Raw = Record<string, unknown>;

function contractOf(uid: string, d: Raw | undefined): AmbassadorContract | null {
  if (!d || d["status"] !== "active") return null;
  const pct = d["commissionPct"];
  const code = normalizeSquadCode(d["code"]);
  if (typeof pct !== "number" || !(pct >= 0 && pct <= 30) || !code) return null;
  return {
    uid,
    displayName: String(d["displayName"] ?? ""),
    tier: (d["tier"] as SquadTier | undefined) ?? null,
    code,
    commissionPct: pct,
    rulesVersion: typeof d["rulesVersion"] === "number" ? d["rulesVersion"] : null,
  };
}

export async function findAmbassadorByCode(db: Firestore, code: string): Promise<AmbassadorContract | null> {
  const snap = await db.collection(SQUAD_AMBASSADORS).where("code", "==", code).where("status", "==", "active").get();
  const doc = snap.docs[0];
  return doc ? contractOf(doc.id, doc.data()) : null;
}

export async function findAmbassador(db: Firestore, uid: string): Promise<AmbassadorContract | null> {
  const snap = await db.collection(SQUAD_AMBASSADORS).doc(uid).get();
  return snap.exists ? contractOf(uid, snap.data()) : null;
}

function dateOf(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (v instanceof Timestamp) return v.toDate();
  return null;
}

/**
 * Clique em link ou QR. Último toque: sempre sobrescreve. Primeiro toque: só sobrescreve quando a
 * atribuição anterior já venceu. Código inválido ou do próprio atleta não grava nada.
 */
export async function recordAttributionCore(
  db: Firestore,
  input: {uid: string; code: unknown; origin: unknown},
  now: Date,
): Promise<{recorded: boolean; ambassadorName: string | null}> {
  const origin = input.origin === "qr" ? "qr" : input.origin === "link" ? "link" : null;
  const code = normalizeSquadCode(input.code);
  if (!origin || !code) {
    throw new HttpsError("invalid-argument", "Link de embaixador inválido.");
  }
  const ambassador = await findAmbassadorByCode(db, code);
  if (!ambassador || ambassador.uid === input.uid) return {recorded: false, ambassadorName: null};

  const rules = await loadAttributionRules(db);
  const ref = db.collection(SQUAD_ATTRIBUTIONS).doc(input.uid);
  const current = await ref.get();
  const at = dateOf(current.data()?.["at"]);
  const stillValid = at !== null && now.getTime() - at.getTime() <= rules.windowDays * DAY_MS;
  if (rules.model === "firstTouch" && stillValid && current.data()?.["ambassadorId"] !== ambassador.uid) {
    return {recorded: false, ambassadorName: ambassador.displayName};
  }
  await ref.set({ambassadorId: ambassador.uid, code: ambassador.code, origin, at: now});
  return {recorded: true, ambassadorName: ambassador.displayName};
}

/**
 * Quem leva a inscrição: o código digitado (erro claro se não existe ou é autoindicação) ou, sem
 * código, a atribuição de link/QR dentro da janela. `null` = inscrição sem embaixador.
 */
export async function resolveRegistrationAttribution(
  db: Firestore,
  input: {payerUid: string; athleteUids: string[]; typedCode: unknown},
  now: Date,
): Promise<ResolvedAttribution | null> {
  const rules = await loadAttributionRules(db);
  const isSelf = (a: AmbassadorContract) =>
    rules.blockSelfReferral && (a.uid === input.payerUid || input.athleteUids.includes(a.uid));

  const typed = typeof input.typedCode === "string" && input.typedCode.trim() !== "" ? input.typedCode : null;
  if (typed !== null) {
    const code = normalizeSquadCode(typed);
    const ambassador = code ? await findAmbassadorByCode(db, code) : null;
    if (!ambassador) throw new HttpsError("invalid-argument", UNKNOWN_CODE_MESSAGE, {field: "squadCode"});
    if (isSelf(ambassador)) throw new HttpsError("failed-precondition", SELF_REFERRAL_MESSAGE, {field: "squadCode"});
    return {ambassador, origin: "code"};
  }

  const snap = await db.collection(SQUAD_ATTRIBUTIONS).doc(input.payerUid).get();
  const d = snap.data();
  const at = dateOf(d?.["at"]);
  if (!d || !at || now.getTime() - at.getTime() > rules.windowDays * DAY_MS) return null;
  const ambassador = await findAmbassador(db, String(d["ambassadorId"] ?? ""));
  if (!ambassador || isSelf(ambassador)) return null;
  return {ambassador, origin: d["origin"] === "qr" ? "qr" : "link"};
}

const CLIENT_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

/** Portal/app chamam ao abrir um link `?squad=CODIGO` (ou QR) com o atleta logado. */
export const recordSquadAttribution = onCall(CLIENT_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const data = (request.data ?? {}) as {code?: unknown; origin?: unknown};
  return recordAttributionCore(getFirestore(), {uid, code: data.code, origin: data.origin}, new Date());
});

/** Confere o código no checkout antes de pagar: "Código de João Victor aplicado". */
export const checkSquadCode = onCall(CLIENT_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const data = (request.data ?? {}) as {code?: unknown; athleteUids?: unknown};
  const athleteUids = Array.isArray(data.athleteUids) ?
    data.athleteUids.filter((u): u is string => typeof u === "string").slice(0, 10) :
    [];
  const resolved = await resolveRegistrationAttribution(
    getFirestore(),
    {payerUid: uid, athleteUids, typedCode: typeof data.code === "string" ? data.code : ""},
    new Date(),
  );
  return {ambassadorName: resolved?.ambassador.displayName ?? null, code: resolved?.ambassador.code ?? null};
});
