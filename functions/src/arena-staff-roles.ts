/**
 * Cargos da equipe de arena, limite de assentos por plano e matriz de acesso
 * por área — consumido pelas Cloud Functions de convite/gestão de equipe e
 * pelo guard de autorização `assertArenaAreaAccess` (`arena-area-access.ts`)
 * usado pelos callables que escrevem/leem fora do alcance das rules.
 *
 * ESPELHO MANUAL da matriz de acesso — esta matriz existe em três lugares e
 * os três precisam andar juntos:
 *  1. `frontend/projects/arena/src/app/painel/data/arena-roles.model.ts` (UI:
 *     menu, guards, telas);
 *  2. este arquivo (validação server-side dos callables);
 *  3. o mapa literal (`arenaWriteAreas`/`arenaReadAreas`) em `firestore.rules`
 *     (a autoridade de verdade).
 * `torneios` está deliberadamente ausente daqui: é uma área só de leitura do
 * frontend sem nenhum bloco de regra ou callable equivalente — não
 * adicionar.
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

// ---------------------------------------------------------------------------
// Matriz de acesso por área (ESPELHO MANUAL — ver cabeçalho do arquivo)
// ---------------------------------------------------------------------------

/** `torneios` fica de fora de propósito — ver cabeçalho do arquivo. */
export const ARENA_AREAS = [
  "agenda",
  "comandas",
  "estoque",
  "financeiro",
  "promocoes",
  "site",
  "quadras",
  "perfil",
  "comunidade",
] as const;
export type ArenaArea = (typeof ARENA_AREAS)[number];

/** Áreas em que o cargo pode escrever. Escrita implica leitura (ver ARENA_READ_ONLY_AREAS). */
const ARENA_WRITE_AREAS: Record<ArenaStaffRole, readonly ArenaArea[]> = {
  gestor: ["agenda", "comandas", "estoque", "promocoes", "site", "quadras", "perfil", "comunidade"],
  recepcao: ["agenda", "comandas"],
  financeiro: ["promocoes"],
  manutencao: ["quadras", "estoque"],
};

/** Áreas só de leitura, somadas às de escrita. */
const ARENA_READ_ONLY_AREAS: Record<ArenaStaffRole, readonly ArenaArea[]> = {
  gestor: ["financeiro"],
  recepcao: ["estoque", "comunidade"],
  financeiro: ["financeiro", "comandas", "comunidade"],
  manutencao: ["agenda"],
};

export function arenaRoleCanWrite(role: ArenaStaffRole, area: ArenaArea): boolean {
  return (ARENA_WRITE_AREAS[role] ?? []).includes(area);
}

export function arenaRoleCanRead(role: ArenaStaffRole, area: ArenaArea): boolean {
  return arenaRoleCanWrite(role, area) || (ARENA_READ_ONLY_AREAS[role] ?? []).includes(area);
}
