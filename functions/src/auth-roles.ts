import type {UserRecord} from "firebase-admin/auth";

export const ALLOWED_APP_ROLES = ["admin", "organizer", "athlete", "arena"] as const;
export type AppRole = (typeof ALLOWED_APP_ROLES)[number];

export function isAllowedRole(r: string): r is AppRole {
  return (ALLOWED_APP_ROLES as readonly string[]).includes(r);
}

export function rolesFromClaims(claims: {[key: string]: unknown} | undefined): AppRole[] {
  if (!claims) return [];
  const rolesClaim = claims["roles"];
  if (Array.isArray(rolesClaim)) {
    const out: AppRole[] = [];
    for (const x of rolesClaim) {
      if (typeof x === "string" && isAllowedRole(x) && !out.includes(x)) {
        out.push(x);
      }
    }
    if (out.length > 0) {
      return out.sort();
    }
  }
  const legacy = claims["role"];
  if (typeof legacy === "string" && isAllowedRole(legacy)) {
    return [legacy];
  }
  return [];
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

/** Acesso ao backoffice: admin da plataforma, gestor de torneios (`organizer`) ou super admin. */
export function callerCanAccessBackoffice(user: UserRecord): boolean {
  return (
    callerIsOrganizer(user) ||
    hasRoleInClaims(user.customClaims, "organizer") ||
    isSuperAdminClaim(user.customClaims)
  );
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
 * Atualiza claims com lista de papéis e campo legado `role`
 * (prioridade admin > organizer > arena > atleta).
 * Remove superAdmin se não houver mais papel admin.
 */
export function applyRolesToClaims(
  previous: Record<string, unknown>,
  nextRoles: AppRole[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {...previous};
  const sorted = uniqueSortedRoles(nextRoles);
  out["roles"] = sorted;
  if (sorted.includes("admin")) {
    out["role"] = "admin";
  } else if (sorted.includes("organizer")) {
    out["role"] = "organizer";
  } else if (sorted.includes("arena")) {
    out["role"] = "arena";
  } else if (sorted.includes("athlete")) {
    out["role"] = "athlete";
  } else {
    delete out["role"];
  }
  if (!sorted.includes("admin")) {
    delete out["superAdmin"];
  }
  return out;
}

/** Campos `roles` e `role` (legado) para gravar em `users/{uid}`. */
export function firestoreRolesPayload(roles: AppRole[]): Record<string, unknown> {
  const sorted = uniqueSortedRoles(roles);
  const out: Record<string, unknown> = {roles: sorted};
  if (sorted.includes("admin")) {
    out["role"] = "admin";
  } else if (sorted.includes("organizer")) {
    out["role"] = "organizer";
  } else if (sorted.includes("arena")) {
    out["role"] = "arena";
  } else if (sorted.includes("athlete")) {
    out["role"] = "athlete";
  }
  return out;
}
