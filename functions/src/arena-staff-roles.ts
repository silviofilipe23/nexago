/**
 * Cargos da equipe de arena e limite de assentos por plano — consumido pelas
 * Cloud Functions de convite/gestão de equipe.
 *
 * ESPELHO MANUAL da matriz de acesso — ver o cabeçalho de
 * `frontend/projects/arena/src/app/painel/data/arena-roles.model.ts`. Aqui só
 * vivem os cargos e o limite de assentos; a matriz de áreas por cargo é
 * autoridade das `firestore.rules` (replicada no portal Angular) — não
 * duplicar essa matriz aqui.
 */
import {arenaEntitledTier} from "./arena-entitlement";

/**
 * Mesmo formato de campos de plano exigido por `arenaEntitledTier` em
 * `./arena-entitlement`. O tipo original não é exportado por aquele módulo;
 * duplicado aqui por compatibilidade estrutural, sem alterar o módulo
 * original.
 */
type ArenaPlanFields = {
  planStatus?: unknown;
  planTier?: unknown;
  planActiveUntil?: unknown;
};

export const ARENA_STAFF_ROLES = [
  "gestor",
  "recepcao",
  "financeiro",
  "manutencao",
] as const;
export type ArenaStaffRole = (typeof ARENA_STAFF_ROLES)[number];

export function isArenaStaffRole(value: unknown): value is ArenaStaffRole {
  return typeof value === "string" &&
    (ARENA_STAFF_ROLES as readonly string[]).includes(value);
}

/** Assentos de equipe por titularidade de plano. Sem plano e Starter não têm
 *  equipe (o catálogo vende Starter como "1 admin"); Pro tem 5; Elite é
 *  ilimitado. `parceiro` já chega aqui normalizado como `elite`. */
export function maxArenaStaffSeats(
  arena: ArenaPlanFields,
  nowMs: number,
): number {
  switch (arenaEntitledTier(arena, nowMs)) {
    case "elite":
      return Infinity;
    case "pro":
      return 5;
    default:
      return 0;
  }
}

/** Chave de casamento do convite: sempre aparada e em minúsculas. */
export function normalizeInviteEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}
