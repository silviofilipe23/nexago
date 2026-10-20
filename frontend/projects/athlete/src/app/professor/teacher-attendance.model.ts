/**
 * Chamada das aulas que o atleta dá como professor — liberada pelo vínculo com a arena
 * ("Gerenciar as próprias aulas"). Lista de `getMyClassSessionRoster` e gravação pela mesma
 * `saveArenaClassAttendance` da equipe (`functions/src/arena-class-teacher.ts`). Tudo aqui é
 * puro; a autoridade é o servidor. Espelha a chamada do app (`TeacherClassAttendancePage`).
 */

export type AttendanceMark = 'present' | 'absent' | 'excused';

export const ATTENDANCE_MARK_LABEL: Record<AttendanceMark, string> = {
  present: 'Presente',
  absent: 'Falta',
  excused: 'Avisou',
};

export interface TeacherRosterSession {
  sessionId: string;
  arenaId: string;
  arenaName: string;
  classId: string;
  className: string;
  /** `YYYY-MM-DD` no fuso da arena. */
  date: string;
  startTime: string;
  endTime: string;
  courtName: string;
  status: 'scheduled' | 'canceled' | 'completed';
  /** A chamada abre no dia da aula e fica fechada em aula cancelada. */
  attendanceOpen: boolean;
}

export interface TeacherRosterStudent {
  studentId: string;
  name: string;
  photoUrl: string | null;
  kind: 'regular' | 'makeup' | 'trial';
  mark: AttendanceMark | null;
}

export interface TeacherRoster {
  session: TeacherRosterSession;
  students: TeacherRosterStudent[];
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

function markOf(v: unknown): AttendanceMark | null {
  return v === 'present' || v === 'absent' || v === 'excused' ? v : null;
}

export function teacherRosterFromRaw(raw: unknown): TeacherRoster {
  const r = (raw ?? {}) as Record<string, unknown>;
  const s = (r['session'] ?? {}) as Record<string, unknown>;
  const status = s['status'];
  const students = Array.isArray(r['students']) ? (r['students'] as unknown[]) : [];
  return {
    session: {
      sessionId: str(s['sessionId']),
      arenaId: str(s['arenaId']),
      arenaName: str(s['arenaName'], 'Arena'),
      classId: str(s['classId']),
      className: str(s['className'], 'Aula'),
      date: str(s['date']),
      startTime: str(s['startTime']),
      endTime: str(s['endTime']),
      courtName: str(s['courtName'], 'Quadra'),
      status: status === 'canceled' || status === 'completed' ? status : 'scheduled',
      attendanceOpen: s['attendanceOpen'] === true,
    },
    students: students
      .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
      .map((x) => ({
        studentId: str(x['studentId']),
        name: str(x['name'], 'Aluno'),
        photoUrl: str(x['photoUrl']) || null,
        kind: x['kind'] === 'makeup' || x['kind'] === 'trial' ? x['kind'] : 'regular',
        mark: markOf(x['mark']),
      })),
  };
}

/** Rascunho local: aluno → marca (`null` = sem marca). Só grava ao fechar. */
export type AttendanceDraft = Readonly<Record<string, AttendanceMark | null>>;

export function draftFromRoster(roster: TeacherRoster): AttendanceDraft {
  return Object.fromEntries(roster.students.map((s) => [s.studentId, s.mark]));
}

export interface AttendanceCounts {
  present: number;
  absent: number;
  excused: number;
  unmarked: number;
  total: number;
}

export function attendanceCounts(draft: AttendanceDraft): AttendanceCounts {
  const counts: AttendanceCounts = { present: 0, absent: 0, excused: 0, unmarked: 0, total: 0 };
  for (const mark of Object.values(draft)) {
    counts.total += 1;
    if (mark === 'present') counts.present += 1;
    else if (mark === 'absent') counts.absent += 1;
    else if (mark === 'excused') counts.excused += 1;
    else counts.unmarked += 1;
  }
  return counts;
}

/** "Todos presentes": só quem está sem marca — falta e aviso já anotados ficam. */
export function withUnmarkedPresent(draft: AttendanceDraft): AttendanceDraft {
  return Object.fromEntries(Object.entries(draft).map(([id, mark]) => [id, mark ?? 'present']));
}

export function draftDiffers(draft: AttendanceDraft, roster: TeacherRoster): boolean {
  return roster.students.some((s) => (draft[s.studentId] ?? null) !== s.mark);
}

/** Corpo `marks` de `saveArenaClassAttendance` — todos os alunos; `null` apaga a marca. */
export function attendancePayload(draft: AttendanceDraft): Record<string, AttendanceMark | null> {
  return { ...draft };
}

/** Botão da aula que dou, na agenda, quando o vínculo libera a chamada: "Fazer chamada" no dia
 *  (ou depois, se ficou aberta), "Ver chamada" depois de fechada e "Ver lista" antes do dia.
 *  `null` sem botão (aluno, aula cancelada, vínculo sem a permissão). */
export function teacherAttendanceCta(
  item: { role: string; canManageLessons: boolean; status: string; date: string },
  now: Date,
): string | null {
  if (item.role !== 'teacher' || !item.canManageLessons || item.status === 'canceled') return null;
  if (item.status === 'completed') return 'Ver chamada';
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (item.date && item.date > today) return 'Ver lista';
  return 'Fazer chamada';
}

/** "27/10". */
export function shortDayLabel(dateKey: string): string {
  return dateKey.length === 10 ? `${dateKey.slice(8)}/${dateKey.slice(5, 7)}` : dateKey;
}
