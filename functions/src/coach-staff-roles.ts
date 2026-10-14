/**
 * Cargos da comissão técnica do treinador e matriz de acesso por área.
 *
 * A matriz vive em DOIS lugares: este arquivo e `firestore.rules` (funções
 * `coachWriteAreas` / `coachReadAreas`, a autoridade de verdade). Mudou um, muda o outro.
 * `functions/test/coach-roles-parity.test.mjs` extrai os mapas das rules e os compara
 * com este arquivo: divergência quebra o teste.
 *
 * Consumidores: o guard `assertCoachAreaAccess` (coach-area-access.ts) e as callables
 * de equipe. O modelo do portal (fase 2) entra na mesma comparação.
 *
 * O treinador principal é o dono (`uid == coachUid`) e não é um cargo: não aparece aqui.
 * `presenca` foi fundida em `treinos` (colunas idênticas; a presença é o campo
 * `attendance` do doc de treino).
 */
export const COACH_STAFF_ROLES = [
  "auxiliar",
  "preparador_fisico",
  "fisioterapeuta",
  "psicologo",
] as const;
export type CoachStaffRole = (typeof COACH_STAFF_ROLES)[number];

export function isCoachStaffRole(value: unknown): value is CoachStaffRole {
  return typeof value === "string" &&
    (COACH_STAFF_ROLES as readonly string[]).includes(value);
}

export const COACH_AREAS = [
  "atletas",
  "treinos",
  "convocacoes",
  "avaliacoes",
  "fisico",
  "saude",
  "mental",
  "comunicacao",
  "financeiro",
  "equipe",
] as const;
export type CoachArea = (typeof COACH_AREAS)[number];

/** Áreas em que o cargo escreve. Escrita implica leitura. */
const COACH_WRITE_AREAS: Record<CoachStaffRole, readonly CoachArea[]> = {
  auxiliar: ["treinos", "convocacoes", "comunicacao"],
  preparador_fisico: ["fisico"],
  fisioterapeuta: ["saude"],
  psicologo: ["mental"],
};

/** Áreas só de leitura, somadas às de escrita. */
const COACH_READ_ONLY_AREAS: Record<CoachStaffRole, readonly CoachArea[]> = {
  auxiliar: ["atletas", "avaliacoes"],
  preparador_fisico: ["atletas", "treinos", "avaliacoes"],
  fisioterapeuta: ["atletas", "treinos", "fisico"],
  psicologo: ["atletas"],
};

export function coachRoleCanWrite(role: CoachStaffRole, area: CoachArea): boolean {
  return (COACH_WRITE_AREAS[role] ?? []).includes(area);
}

export function coachRoleCanRead(role: CoachStaffRole, area: CoachArea): boolean {
  return coachRoleCanWrite(role, area) || (COACH_READ_ONLY_AREAS[role] ?? []).includes(area);
}
