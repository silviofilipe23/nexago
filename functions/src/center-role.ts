/**
 * Papel `center` no app: concedido quando um vínculo com um Centro de Treinamento
 * (`trainingCenters/{c}/centerMembers/{uid}`) vira `active` — bootstrap do owner junto com o centro,
 * aceite de convite ou reativação pelo gestor. Esses writes são do cliente (portal), validados pelas
 * rules, então quem concede é um trigger.
 *
 * Só serve para o app oferecer o modo Centro no seletor de papéis — NUNCA autoriza nada: as rules
 * releem o vínculo a cada requisição. Por isso não é removido quando o vínculo é revogado: o modo
 * mostra o estado vazio ("acesso encerrado"), como o professor sem arena ativa.
 *
 * Mesmo padrão de `ensureProfessorRole` (`professor-role.ts`): claim + `users/{uid}.roles`.
 */
import {getAuth, type Auth} from "firebase-admin/auth";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {
  applyRolesToClaims,
  firestoreRolesPayload,
  rolesFromClaims,
  uniqueSortedRoles,
  type AppRole,
} from "./auth-roles";
import {TRAINING_CENTERS} from "./training-center-billing-model";

export function withCenterRole(existingRoles: AppRole[]): AppRole[] {
  return uniqueSortedRoles([...existingRoles, "center"]);
}

export type CenterRoleAuth = Pick<Auth, "getUser" | "setCustomUserClaims">;

/** Concede `center` (claim e `users/{uid}.roles`). Idempotente. */
export async function ensureCenterRole(
  db: Firestore,
  uid: string,
  auth: CenterRoleAuth = getAuth(),
): Promise<void> {
  const user = await auth.getUser(uid);
  const roles = rolesFromClaims(user.customClaims);
  const next = withCenterRole(roles);
  if (next.length !== roles.length) {
    await auth.setCustomUserClaims(
      uid,
      applyRolesToClaims((user.customClaims || {}) as Record<string, unknown>, next),
    );
    logger.info("trainingCenter: role center concedida", {uid});
  }
  // Write incondicional, como em `ensureProfessorRole`: claim e documento se autocuram juntos.
  await db.doc(`users/${uid}`).set(firestoreRolesPayload(next), {merge: true});
}

/** O vínculo acabou de ficar ativo (criado ativo ou reativado)? Editar papel/permissões não conta. */
export function centerMemberBecameActive(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): boolean {
  return after?.["status"] === "active" && before?.["status"] !== "active";
}

export const onTrainingCenterMemberRole = onDocumentWritten(
  `${TRAINING_CENTERS}/{centerId}/centerMembers/{memberUid}`,
  async (event) => {
    const after = event.data?.after?.data();
    if (!centerMemberBecameActive(event.data?.before?.data(), after)) return;
    // O id do documento é o uid (as rules exigem `memberUid == request.auth.uid` na criação).
    const uid = typeof after?.["uid"] === "string" && after["uid"] ? after["uid"] : event.params.memberUid;
    try {
      await ensureCenterRole(getFirestore(), uid);
    } catch (error) {
      // Best-effort: o vínculo já vale; o app segue oferecendo "Centros onde dou aula" nos ajustes,
      // e o backfill (`scripts/backfill-center-role.js`) recupera.
      logger.error("trainingCenter: falha ao conceder a role center", {
        centerId: event.params.centerId, uid, error,
      });
    }
  },
);
