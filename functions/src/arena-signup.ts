import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, FieldValue, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  type AppRole,
  applyRolesToClaims,
  firestoreRolesPayload,
  rolesFromClaims,
} from "./auth-roles";
import {CLIENT_FACING_REGIONS} from "./function-regions";

/**
 * Garante que `arena` está entre os papéis do usuário, preservando os que já
 * existiam — nunca reduz acesso.
 */
export function withArenaRole(existingRoles: AppRole[]): AppRole[] {
  return existingRoles.includes("arena") ? existingRoles : [...existingRoles, "arena"];
}

/** Campos do formulário de cadastro que já nascem no doc da arena. */
export interface ArenaSignupDetails {
  cityState?: string;
  whatsapp?: string;
}

const CITY_STATE_PUNCT = /^(.+?)\s*[,/-]\s*([A-Za-z]{2})$/;
const CITY_STATE_SPACE = /^(.+?)\s+([A-Za-z]{2})$/;

/**
 * "Florianópolis, SC" → `{city: "Florianópolis", state: "SC"}`. O cadastro tem
 * um campo único "Cidade / UF", mas o perfil da arena (e o app) guardam cidade
 * e UF separados. Sem UF reconhecível tudo vira cidade — melhor `state` vazio,
 * que o gestor corrige no Perfil, do que um pedaço do nome virando UF.
 */
export function splitCityState(raw: string | undefined): {city: string; state: string} {
  const value = (raw ?? "").trim();
  if (!value) {
    return {city: "", state: ""};
  }
  const match = CITY_STATE_PUNCT.exec(value) ?? CITY_STATE_SPACE.exec(value);
  if (!match) {
    return {city: value, state: ""};
  }
  return {city: match[1].trim(), state: match[2].toUpperCase()};
}

/**
 * Cria `arenas/{arenaId}` do gestor recém-cadastrado. Sem esse doc o
 * autocadastro parava na role: o painel resolve a arena por
 * `managerUserId == uid` (ver `ArenaContextService`), então quem se cadastrava
 * caía em "Nenhuma arena vinculada à sua conta" até alguém criar o doc na mão.
 *
 * Idempotente por `managerUserId`: se o gestor já tem arena (retry do client,
 * conta que já era arena antes) devolve a que existe em vez de criar uma
 * segunda — duas arenas mandariam o painel pra tela de seleção sem motivo.
 *
 * Nunca grava `planTier`/`planStatus`/`unclaimed`: plano é dos callables de
 * assinatura (o mesmo freeze que `firestore.rules` impõe ao client) e
 * `unclaimed` marca arena de pré-cadastro, que é trabalho do script de
 * prospecção.
 */
export async function ensureManagedArena(
  db: Firestore,
  uid: string,
  input: {arenaName: string} & ArenaSignupDetails,
): Promise<string> {
  const existing = await db
    .collection("arenas")
    .where("managerUserId", "==", uid)
    .limit(1)
    .get();
  if (!existing.empty) {
    return existing.docs[0].id;
  }

  const {city, state} = splitCityState(input.cityState);
  const whatsapp = (input.whatsapp ?? "").trim();
  const ref = db.collection("arenas").doc();
  await ref.set({
    id: ref.id,
    name: input.arenaName,
    managerUserId: uid,
    status: "active",
    basePriceReais: 0,
    ...(city ? {city} : {}),
    ...(state ? {state} : {}),
    ...(whatsapp ? {whatsapp} : {}),
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/**
 * Chamada uma vez pelo client logo após `createUserWithEmailAndPassword` no
 * autocadastro do portal arena. Define a claim `arena` (via Admin SDK — nunca
 * client-write direto, ver firestore.rules em users/{userId}), mirra o papel
 * em `users/{uid}`, de onde o login do portal arena confere a role, e cria a
 * arena do gestor (`ensureManagedArena`) — sem ela o painel abre vazio.
 */
export const completeArenaSignup = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const arenaName = (request.data?.arenaName as string | undefined)?.trim() ?? "";
  if (!arenaName) {
    throw new HttpsError("invalid-argument", "Nome da arena é obrigatório.");
  }

  const auth = getAuth();
  let user;
  try {
    user = await auth.getUser(uid);
  } catch (err: unknown) {
    const code = (err as {code?: string})?.code;
    if (code === "auth/user-not-found") {
      // Token ainda válido (JWT não expirou) mas a conta foi apagada depois
      // que o cliente o obteve — sessão órfã, não um erro interno real.
      throw new HttpsError(
        "unauthenticated",
        "Sua sessão expirou. Entre novamente para continuar."
      );
    }
    throw err;
  }
  const existingRoles = rolesFromClaims(user.customClaims);
  const nextRoles = withArenaRole(existingRoles);

  const nextClaims = applyRolesToClaims(
    (user.customClaims || {}) as Record<string, unknown>,
    nextRoles,
  );
  await auth.setCustomUserClaims(uid, nextClaims);

  const db = getFirestore();
  await db.doc(`users/${uid}`).set(
    {
      uid,
      email: user.email ?? "",
      displayName: arenaName,
      fullName: arenaName,
      ...firestoreRolesPayload(nextRoles),
    },
    {merge: true},
  );

  const arenaId = await ensureManagedArena(db, uid, {
    arenaName,
    cityState: typeof request.data?.cityState === "string" ? request.data.cityState : undefined,
    whatsapp: typeof request.data?.whatsapp === "string" ? request.data.whatsapp : undefined,
  });

  logger.info("Arena signup completed", {uid, arenaId});
  return {ok: true, arenaId};
});
