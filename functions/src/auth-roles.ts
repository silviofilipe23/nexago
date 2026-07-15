import type {UserRecord} from "firebase-admin/auth";
import {FieldValue} from "firebase-admin/firestore";

export const ALLOWED_APP_ROLES = ["admin", "organizer", "athlete", "arena", "coach"] as const;
export type AppRole = (typeof ALLOWED_APP_ROLES)[number];

export function isAllowedRole(r: string): r is AppRole {
  return (ALLOWED_APP_ROLES as readonly string[]).includes(r);
}

export function rolesFromClaims(claims: {[key: string]: unknown} | undefined): AppRole[] {
  if (!claims) return [];
  const rolesClaim = claims["roles"];
  if (!Array.isArray(rolesClaim)) return [];
  const out: AppRole[] = [];
  for (const x of rolesClaim) {
    if (typeof x === "string" && isAllowedRole(x) && !out.includes(x)) {
      out.push(x);
    }
  }
  return out.sort();
}

export function hasRoleInClaims(
  claims: {[key: string]: unknown} | undefined,
  role: AppRole
): boolean {
  return rolesFromClaims(claims).includes(role);
}

export function isSuperAdminClaim(claims: {[key: string]: unknown} | undefined): boolean {
  return claims?.["superAdmin"] === true;
}

/**
 * Administrador da plataforma (claim `admin` — organizador geral, não o papel `organizer`).
 * Quem pode listar usuários no backoffice, Mercado Pago, etc.
 */
export function callerIsOrganizer(user: UserRecord): boolean {
  return hasRoleInClaims(user.customClaims, "admin");
}

/** Gestor de arena no app mobile (`roles` contém `arena`). */
export function callerIsArenaManager(user: UserRecord): boolean {
  return hasRoleInClaims(user.customClaims, "arena");
}

/** OAuth Mercado Pago: admin da plataforma ou gestor de arena. */
export function callerCanLinkMercadoPago(user: UserRecord): boolean {
  return (
    callerIsOrganizer(user) ||
    callerIsArenaManager(user) ||
    isSuperAdminClaim(user.customClaims)
  );
}

/**
 * Acesso ao backoffice: admin da plataforma ou super admin — **não** a role
 * `organizer` (gestor de torneios). `organizer` hoje é autoconcedida no
 * autocadastro do portal do organizador (`completeOrganizerSignup`), então
 * ela nunca pode ser suficiente pra liberar o backoffice (que expõe PII de
 * toda a base via `listBackofficeUsers`) — do contrário, qualquer cadastro
 * público ganharia esse acesso. Também mantém consistência com
 * `user-role-ops.ts`, que já trata `organizer` como role não autoconcedível.
 */
export function callerCanAccessBackoffice(user: UserRecord): boolean {
  return callerIsOrganizer(user) || isSuperAdminClaim(user.customClaims);
}

export function callerIsSuperAdmin(user: UserRecord): boolean {
  return isSuperAdminClaim(user.customClaims);
}

export function uniqueSortedRoles(roleList: string[]): AppRole[] {
  const set = new Set<AppRole>();
  for (const r of roleList) {
    if (isAllowedRole(r)) {
      set.add(r);
    }
  }
  return Array.from(set).sort();
}

/**
 * Atualiza claims com a lista de papéis (`roles`) e remove o claim legado
 * `role`. Remove `superAdmin` se não houver mais papel admin.
 */
export function applyRolesToClaims(
  previous: Record<string, unknown>,
  nextRoles: AppRole[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {...previous};
  const sorted = uniqueSortedRoles(nextRoles);
  out["roles"] = sorted;
  delete out["role"];
  if (!sorted.includes("admin")) {
    delete out["superAdmin"];
  }
  return out;
}

/** Campos de papéis para `users/{uid}` — purga o legado `role` em todo write. */
export function firestoreRolesPayload(roles: AppRole[]): Record<string, unknown> {
  return {
    roles: uniqueSortedRoles(roles),
    role: FieldValue.delete(),
  };
}
