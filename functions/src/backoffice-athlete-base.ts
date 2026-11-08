/**
 * Backoffice › base de atletas, numa leitura só.
 *
 * - `getBackofficeAthleteBase`: percorre o Auth inteiro (lotes de 1.000) cruzado com `users/{uid}`
 *   e `backofficeUserFlags`, e devolve o resumo (dashboard) e, com `includeRows`, todas as linhas
 *   (tela de Atletas sem "Carregar mais"). A base tem centenas de contas: uma leitura por conta é
 *   barata e evita contador desnormalizado que sai de sincronia.
 * - `setAthleteInactive`: marca/desmarca a conta como inativa. Não desativa o login nem apaga
 *   dado — só tira a conta dos números da base. Grava quem marcou e o motivo.
 *
 * Regras de quem conta como ativo em `athlete-base-model.ts`.
 */
import * as logger from "firebase-functions/logger";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {getAuth, type UserRecord} from "firebase-admin/auth";
import {FieldValue, Timestamp, getFirestore, type DocumentData} from "firebase-admin/firestore";
import {
  INACTIVE_REASON_MAX,
  USER_FLAGS,
  inactiveMarkOf,
  isAthleteAccount,
  isProfileComplete,
  photoOf,
  primaryLevel,
  statusOf,
  summarizeAthleteBase,
  type AthleteBaseRow,
} from "./athlete-base-model";
import {callerCanAccessBackoffice, rolesFromClaims} from "./auth-roles";
import {CLIENT_FACING_REGIONS} from "./function-regions";

const DOCS_PER_GET_ALL = 300;

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toMs(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return null;
}

function parseMs(value: string | undefined | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

async function assertBackoffice(uid: string | undefined): Promise<UserRecord> {
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  let caller: UserRecord;
  try {
    caller = await getAuth().getUser(uid);
  } catch (err: unknown) {
    if ((err as {code?: string})?.code === "auth/user-not-found") {
      throw new HttpsError("unauthenticated", "Sua sessão expirou. Entre novamente para continuar.");
    }
    throw err;
  }
  if (!callerCanAccessBackoffice(caller)) {
    throw new HttpsError("permission-denied", "Apenas administradores da plataforma veem a base de atletas.");
  }
  return caller;
}

async function listAllAuthUsers(): Promise<UserRecord[]> {
  const out: UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    out.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return out;
}

async function userDocs(uids: readonly string[]): Promise<Map<string, DocumentData>> {
  const db = getFirestore();
  const out = new Map<string, DocumentData>();
  for (let i = 0; i < uids.length; i += DOCS_PER_GET_ALL) {
    const refs = uids.slice(i, i + DOCS_PER_GET_ALL).map((uid) => db.doc(`users/${uid}`));
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      const data = snap.data();
      if (data) out.set(snap.id, data);
    }
  }
  return out;
}

export function rowOf(user: UserRecord, doc: DocumentData | undefined, flags: DocumentData | undefined): AthleteBaseRow {
  const docRoles = Array.isArray(doc?.["roles"]) ?
    (doc!["roles"] as unknown[]).filter((r): r is string => typeof r === "string") :
    [];
  const roles = [...new Set([...rolesFromClaims(user.customClaims), ...docRoles])].sort();
  const {sportCode, level} = primaryLevel(doc);
  const lastSignInMs = parseMs(user.metadata.lastSignInTime);
  const base = {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    fullName: str(doc?.["fullName"]),
    nickname: str(doc?.["nickname"]),
    photoUrl: photoOf(doc) ?? str(user.photoURL),
    roles,
    disabled: user.disabled === true,
    emailVerified: user.emailVerified === true,
    createdAtMs: parseMs(user.metadata.creationTime),
    lastSignInMs,
    lastSeenMs: parseMs(user.metadata.lastRefreshTime) ?? lastSignInMs,
    profileComplete: isProfileComplete(doc),
    isAthlete: isAthleteAccount(roles),
    inactive: inactiveMarkOf(flags, toMs),
    sportCode,
    level,
  };
  return {...base, status: statusOf(base)};
}

/** Núcleo do callable (também usado por script de conferência com o Admin SDK). */
export async function loadAthleteBase(includeRows: boolean) {
  const users = await listAllAuthUsers();
  const [docs, flagsSnap] = await Promise.all([
    userDocs(users.map((u) => u.uid)),
    getFirestore().collection(USER_FLAGS).get(),
  ]);
  const flags = new Map(flagsSnap.docs.map((d) => [d.id, d.data()]));
  const rows = users.map((u) => rowOf(u, docs.get(u.uid), flags.get(u.uid)));
  const now = Date.now();
  return {
    generatedAtMs: now,
    summary: summarizeAthleteBase(rows, now),
    ...(includeRows ? {rows} : {}),
  };
}

export const getBackofficeAthleteBase = onCall(
  {region: CLIENT_FACING_REGIONS, invoker: "public", timeoutSeconds: 120, memory: "512MiB"},
  async (request) => {
    await assertBackoffice(request.auth?.uid);
    const includeRows = (request.data as {includeRows?: unknown} | undefined)?.includeRows === true;
    try {
      return await loadAthleteBase(includeRows);
    } catch (err) {
      logger.error("getBackofficeAthleteBase failed", err);
      throw new HttpsError("internal", "Não foi possível ler a base de atletas.");
    }
  },
);

export const setAthleteInactive = onCall({region: CLIENT_FACING_REGIONS, invoker: "public"}, async (request) => {
  const caller = await assertBackoffice(request.auth?.uid);
  const raw = (request.data ?? {}) as {uid?: unknown; inactive?: unknown; reason?: unknown};
  const uid = str(raw.uid);
  if (!uid) throw new HttpsError("invalid-argument", "Informe a conta.");
  if (typeof raw.inactive !== "boolean") throw new HttpsError("invalid-argument", "Informe se a conta fica inativa.");
  const reason = str(raw.reason);
  if (reason && reason.length > INACTIVE_REASON_MAX) {
    throw new HttpsError("invalid-argument", `O motivo passa de ${INACTIVE_REASON_MAX} caracteres.`);
  }

  try {
    await getAuth().getUser(uid);
  } catch {
    throw new HttpsError("not-found", "Conta não encontrada.");
  }

  const byName = caller.displayName ?? caller.email ?? caller.uid;
  const ref = getFirestore().collection(USER_FLAGS).doc(uid);
  if (raw.inactive) {
    await ref.set({
      inactive: true,
      inactiveReason: reason ?? null,
      inactiveAt: FieldValue.serverTimestamp(),
      inactiveBy: caller.uid,
      inactiveByName: byName,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  } else {
    // Reativar guarda a marca anterior (motivo/quem) para o histórico; só desliga o `inactive`.
    await ref.set({
      inactive: false,
      reactivatedAt: FieldValue.serverTimestamp(),
      reactivatedBy: caller.uid,
      reactivatedByName: byName,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  }
  return {uid, inactive: raw.inactive, reason: raw.inactive ? reason ?? null : null, byName};
});
