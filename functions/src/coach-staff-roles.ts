/**
 * Cargos da comissão técnica do treinador e matriz de acesso por área.
 *
 * ESPELHO MANUAL da matriz: este arquivo e `firestore.rules` (`coachWriteAreas` /
 * `coachReadAreas`, a autoridade de verdade) precisam andar juntos. A comparação
 * automática entre os dois entra em tarefa posterior.
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
