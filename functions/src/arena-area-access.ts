/**
 * Autorização por área de arena para Cloud Functions — mirror server-side de
 * `arenaCanWrite`/`arenaCanRead` (`firestore.rules`), usado pelos callables
 * cujas escritas/leituras nunca passam pelas rules (arena-club.ts,
 * arena-recurring-booking.ts, arena-coupons.ts, arena-occupancy-report.ts,
 * arena-sites.ts, link-pages.ts) e que, antes desta migração, só aceitavam o
 * dono da arena (`managerUserId === uid`) — deixando a equipe RBAC (que as
 * rules já autorizam) travada nesses fluxos.
 *
 * Semântica (idêntica às rules, nesta ordem):
 *  1. Dono da arena (`managerUserId === uid`) — sempre permitido, em toda área.
 *  2. Bypass de admin/superAdmin — esta function NUNCA concede isso sozinha.
 *     É responsabilidade de cada arquivo chamador manter (ou não) o bypass
 *     que já tinha antes desta migração; ver comentário em cada call site.
 *  3. Membro de equipe ATIVO (`arenas/{arenaId}/staff/{uid}`, `status ===
 *     'active'`) E arena com titularidade de plano pago (`arenaEntitledTier`
 *     em `['pro', 'elite']` — `parceiro` já chega normalizado como `elite`)
 *     E a matriz do cargo (`arena-staff-roles.ts`) cobre a área pro modo
 *     pedido.
 *  4. Qualquer outro caso — nega.
 */
import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore} from "firebase-admin/firestore";
import {arenaEntitledTier} from "./arena-entitlement";
import {
  arenaRoleCanRead,
  arenaRoleCanWrite,
  isArenaStaffRole,
  type ArenaArea,
} from "./arena-staff-roles";

export type ArenaAreaAccessMode = "read" | "write";

/** Formato mínimo do doc `arenas/{arenaId}` usado pela decisão de acesso. */
export interface ArenaAreaAccessArenaData {
  managerUserId?: unknown;
  planStatus?: unknown;
  planTier?: unknown;
  planActiveUntil?: unknown;
}

/** Formato mínimo do doc `arenas/{arenaId}/staff/{uid}`. */
export interface ArenaAreaAccessStaffData {
  status?: unknown;
  role?: unknown;
}

/**
 * Lógica pura da decisão (sem Firestore) — testável exaustivamente. Espelha
 * `isArenaOwner(arenaId) || (isActiveArenaStaff(arenaId) && matriz)` das
 * firestore.rules.
 *
 * Bypass de admin/superAdmin NÃO vive aqui de propósito (ver cabeçalho do
 * módulo): um uid que não é dono nem membro ativo de equipe é sempre negado
 * por esta function, mesmo que seja admin da plataforma — quem chama decide
 * antes de chegar aqui se concede esse bypass.
 */
export function decideArenaAreaAccess(
  arenaData: ArenaAreaAccessArenaData,
  uid: string,
  staffData: ArenaAreaAccessStaffData | null,
  area: ArenaArea,
  mode: ArenaAreaAccessMode,
  nowMs: number,
): boolean {
  const managerUserId = typeof arenaData.managerUserId === "string" ?
    arenaData.managerUserId.trim() :
    "";
  if (managerUserId && managerUserId === uid) return true;

  if (!staffData) return false;
  if (staffData.status !== "active") return false;

  const tier = arenaEntitledTier(arenaData, nowMs);
  if (tier !== "pro" && tier !== "elite") return false;

  const role = staffData.role;
  if (!isArenaStaffRole(role)) return false;

  return mode === "write" ? arenaRoleCanWrite(role, area) : arenaRoleCanRead(role, area);
}

/**
 * Ponto único de autorização por área para callables. Lança
 * HttpsError("not-found", ...) se a arena não existir, e
 * HttpsError("permission-denied", ...) se o uid não passar em nenhuma das
 * condições de `decideArenaAreaAccess`.
 *
 * `db` é explícito (não usa `getFirestore()` internamente) para poder ser
 * exercitado em teste com o `FakeFirestore` — mesmo padrão de DI já usado
 * pelas functions que esta substitui (`requireArenaManager`, etc., que já
 * recebiam `db` como parâmetro).
 */
export async function assertArenaAreaAccess(
  db: Firestore,
  arenaId: string,
  uid: string,
  area: ArenaArea,
  mode: ArenaAreaAccessMode,
): Promise<void> {
  const arenaRef = db.collection("arenas").doc(arenaId);
  const staffRef = arenaRef.collection("staff").doc(uid);
  const [arenaSnap, staffSnap] = await Promise.all([arenaRef.get(), staffRef.get()]);

  if (!arenaSnap.exists) {
    throw new HttpsError("not-found", "Arena não encontrada.");
  }
  const arenaData = arenaSnap.data() as ArenaAreaAccessArenaData;
  const staffData = staffSnap.exists ?
    (staffSnap.data() as ArenaAreaAccessStaffData) :
    null;

  const allowed = decideArenaAreaAccess(arenaData, uid, staffData, area, mode, Date.now());
  if (!allowed) {
    throw new HttpsError(
      "permission-denied",
      "Você não tem acesso a esta área da arena.",
    );
  }
}
