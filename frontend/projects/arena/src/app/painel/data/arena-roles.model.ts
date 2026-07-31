/** Matriz de acesso por cargo da equipe da arena.
 *
 *  ESPELHO MANUAL — esta matriz existe em três lugares e os três precisam andar juntos:
 *   1. este arquivo (UI: menu, guards, telas);
 *   2. `functions/src/arena-staff-roles.ts` (validação server-side dos callables);
 *   3. o mapa literal em `firestore.rules` (a autoridade de verdade).
 *  `functions/test/arena-staff-rbac.rules.test.mjs` quebra se 1 e 3 divergirem. */

export const ARENA_STAFF_ROLES = ['gestor', 'recepcao', 'financeiro', 'manutencao'] as const;
export type ArenaStaffRole = (typeof ARENA_STAFF_ROLES)[number];

export const ARENA_AREAS = [
  'agenda',
  'comandas',
  'estoque',
  'financeiro',
  'promocoes',
  'site',
  'quadras',
  'perfil',
  'torneios',
  'comunidade',
] as const;
export type ArenaArea = (typeof ARENA_AREAS)[number];

/** Áreas em que o cargo pode escrever. Escrita implica leitura (ver ARENA_READ_AREAS). */
const ARENA_WRITE_AREAS: Record<ArenaStaffRole, readonly ArenaArea[]> = {
  gestor: ['agenda', 'comandas', 'estoque', 'promocoes', 'site', 'quadras', 'perfil', 'comunidade'],
  recepcao: ['agenda', 'comandas'],
  financeiro: ['financeiro', 'promocoes'],
  manutencao: ['quadras', 'estoque'],
};

/** Áreas só de leitura, somadas às de escrita. */
const ARENA_READ_ONLY_AREAS: Record<ArenaStaffRole, readonly ArenaArea[]> = {
  gestor: ['financeiro', 'torneios'],
  recepcao: ['estoque', 'comunidade'],
  financeiro: ['comandas', 'comunidade'],
  manutencao: ['agenda'],
};

export function arenaRoleCanWrite(role: ArenaStaffRole, area: ArenaArea): boolean {
  return (ARENA_WRITE_AREAS[role] ?? []).includes(area);
}

export function arenaRoleCanRead(role: ArenaStaffRole, area: ArenaArea): boolean {
  return arenaRoleCanWrite(role, area) || (ARENA_READ_ONLY_AREAS[role] ?? []).includes(area);
}

export const ARENA_ROLE_LABEL: Record<ArenaStaffRole, string> = {
  gestor: 'Gestor',
  recepcao: 'Recepção',
  financeiro: 'Financeiro',
  manutencao: 'Manutenção',
};

export const ARENA_ROLE_DESCRIPTION: Record<ArenaStaffRole, string> = {
  gestor: 'Opera a arena inteira; vê o financeiro sem poder alterá-lo',
  recepcao: 'Agenda, reservas e comandas do balcão',
  financeiro: 'Financeiro, relatórios, cupons e promoções',
  manutencao: 'Quadras e estoque, sem acesso a dinheiro',
};

/** Frases exibidas no modal de convite ("Este cargo terá acesso a"). */
export const ARENA_ROLE_AREA_LABELS: Record<ArenaStaffRole, readonly string[]> = {
  gestor: [
    'Agenda, reservas e horários fixos',
    'Comandas, estoque e promoções',
    'Quadras, perfil e site da arena',
    'Financeiro (somente leitura)',
  ],
  recepcao: ['Agenda, reservas e horários fixos', 'Comandas e clubinho', 'Estoque (consulta)'],
  financeiro: ['Financeiro e relatórios', 'Ocupação', 'Cupons e promoções'],
  manutencao: ['Quadras', 'Estoque', 'Agenda (consulta)'],
};

export function isArenaStaffRole(value: unknown): value is ArenaStaffRole {
  return typeof value === 'string' && (ARENA_STAFF_ROLES as readonly string[]).includes(value);
}
