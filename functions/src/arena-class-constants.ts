/**
 * Aulas da arena — turmas recorrentes e aulas avulsas (particular, dupla,
 * experimental) com professor, quadra e chamada. Constantes compartilhadas
 * entre callables, materializador e testes.
 */

export const ARENA_CLASSES = "arenaClasses";
export const ARENA_CLASS_SESSIONS = "arenaClassSessions";
/** Subcoleção de `arenaClasses/{classId}` — docId = uid do atleta ou id gerado (aluno sem conta). */
export const CLASS_STUDENTS = "classStudents";
/** Subcoleção de `arenas/{arenaId}` — professores cadastrados pela arena. */
export const CLASS_TEACHERS = "classTeachers";

/** Horizonte rolante de materialização (dias) — igual ao mensalista e ao clubinho. */
export const CLASS_HORIZON_DAYS = 35;

export const CLASS_TYPES = ["turma", "particular", "dupla", "experimental"] as const;
export type ArenaClassType = typeof CLASS_TYPES[number];

export const CLASS_LEVELS = ["iniciante", "intermediario", "avancado", "kids", "livre"] as const;
export type ArenaClassLevel = typeof CLASS_LEVELS[number];

export const ATTENDANCE_MARKS = ["present", "absent", "excused"] as const;
export type AttendanceMark = typeof ATTENDANCE_MARKS[number];

export const MAX_CLASS_CAPACITY = 40;
export const MAX_CLASS_DURATION_MINUTES = 4 * 60;

/** Uma aula por turma por dia — id determinístico garante idempotência. */
export function classSessionId(classId: string, dateKey: string): string {
  return `class_${classId.replace(/\//g, "_")}_${dateKey}`;
}
