/**
 * Papel `professor` no app: concedido quando um vínculo professor ↔ arena vira `ACTIVE` (aceite do
 * convite, aprovação do pedido ou reativação). Só serve para o app oferecer o modo Professor no
 * seletor de papéis — NUNCA autoriza nada: rules e callables continuam conferindo o vínculo
 * (`effectiveArenaProfessorPermissions`). Por isso não é removido quando o vínculo encerra: o
 * modo mostra estado vazio ("nenhuma arena ativa"), como o gestor sem arena.
 *
 * Mesmo padrão de `ensureArenaRole` (`arena-staff-ops.ts`): claim + `users/{uid}.roles`.
 */
import {getAuth, type Auth} from "firebase-admin/auth";
import type {Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  applyRolesToClaims,
  firestoreRolesPayload,
  rolesFromClaims,
  uniqueSortedRoles,
  type AppRole,
} from "./auth-roles";

export function withProfessorRole(existingRoles: AppRole[]): AppRole[] {
  return uniqueSortedRoles([...existingRoles, "professor"]);
}

export type ProfessorRoleAuth = Pick<Auth, "getUser" | "setCustomUserClaims">;

/** Concede `professor` (claim e `users/{uid}.roles`). Idempotente. */
export async function ensureProfessorRole(
  db: Firestore,
  uid: string,
  auth: ProfessorRoleAuth = getAuth(),
): Promise<void> {
  const user = await auth.getUser(uid);
  const roles = rolesFromClaims(user.customClaims);
  const next = withProfessorRole(roles);
  if (next.length !== roles.length) {
    await auth.setCustomUserClaims(
      uid,
      applyRolesToClaims((user.customClaims || {}) as Record<string, unknown>, next),
    );
    logger.info("arenaProfessor: role professor concedida", {uid});
  }
  // Write incondicional, como em `ensureArenaRole`: claim e documento se autocuram juntos.
  await db.doc(`users/${uid}`).set(firestoreRolesPayload(next), {merge: true});
}

/** Quem concede o papel depois da transição — os testes trocam por um dublê. */
export type ProfessorRoleGranter = (db: Firestore, uid: string) => Promise<void>;

/**
 * Best-effort: o vínculo já está `ACTIVE` quando isto roda. Falhar aqui não pode derrubar a
 * resposta (o professor tentaria de novo e levaria "este convite não está mais aberto"); o
 * papel volta a ser concedido na próxima ativação (reativação) e o app segue oferecendo
 * "Minhas arenas" nos ajustes do atleta.
 */
export async function grantProfessorRoleSafely(db: Firestore, uid: string): Promise<void> {
  try {
    await ensureProfessorRole(db, uid);
  } catch (error) {
    logger.error("arenaProfessor: falha ao conceder a role professor", {uid, error});
  }
}
