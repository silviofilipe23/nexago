/**
 * Chamada das próprias aulas pelo professor (vínculo `ACTIVE` com "Gerenciar as próprias aulas").
 * A lista vem de `getMyClassSessionRoster` (`functions/src/arena-class-teacher.ts`) — nome, foto,
 * tipo e marca, sem telefone nem financeiro — e grava pela mesma `saveArenaClassAttendance` da
 * equipe. Mesmas regras da chamada do portal da arena (`panel-aula-session.component.ts`): marcar
 * de novo a mesma marca limpa, "restantes presentes" não apaga falta já anotada, a chamada abre
 * no dia da aula e não existe em aula cancelada. Spec:
 * `docs/superpowers/specs/2026-10-20-vinculos-permissoes-reserva-aulas-design.md`.
 */

export type AttendanceMark = 'present' | 'absent' | 'excused';

export const ATTENDANCE_MARKS: readonly AttendanceMark[] = ['present', 'absent', 'excused'];

export const ATTENDANCE_MARK_LABEL: Record<AttendanceMark, string> = {
  present: 'Presente',
  absent: 'Falta',
  excused: 'Justificada',
};

export type TeacherRosterKind = 'regular' | 'makeup' | 'trial';

export interface TeacherRosterStudent {
  studentId: string;
  name: string;
  photoUrl: string | null;
  kind: TeacherRosterKind;
  mark: AttendanceMark | null;
}

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
  teacherNote: string | null;
  /** Decidido pelo servidor: a chamada abre no dia da aula e não existe em aula cancelada. */
  attendanceOpen: boolean;
}

export interface TeacherRoster {
  session: TeacherRosterSession;
  students: TeacherRosterStudent[];
}

type Raw = Record<string, unknown>;

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function isRaw(v: unknown): v is Raw {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function markOf(v: unknown): AttendanceMark | null {
  return v === 'present' || v === 'absent' || v === 'excused' ? v : null;
}

/** Resposta de `getMyClassSessionRoster` → modelo. `null` quando não veio a aula. */
export function teacherRosterFromRaw(raw: unknown): TeacherRoster | null {
  if (!isRaw(raw) || !isRaw(raw['session'])) return null;
  const s = raw['session'];
  const sessionId = str(s['sessionId']);
  if (!sessionId) return null;
  const status = s['status'];
  const students = Array.isArray(raw['students']) ? raw['students'].filter(isRaw) : [];
  return {
    session: {
      sessionId,
      arenaId: str(s['arenaId']),
      arenaName: str(s['arenaName'], 'Arena'),
      classId: str(s['classId']),
      className: str(s['className'], 'Aula'),
      date: str(s['date']),
      startTime: str(s['startTime']),
      endTime: str(s['endTime']),
      courtName: str(s['courtName'], 'Quadra'),
      status: status === 'canceled' || status === 'completed' ? status : 'scheduled',
      teacherNote: str(s['teacherNote']).trim() || null,
      attendanceOpen: s['attendanceOpen'] === true,
    },
    students: students
      .map((st) => {
        const kind = st['kind'];
        return {
          studentId: str(st['studentId']),
          name: str(st['name'], 'Aluno'),
          photoUrl: str(st['photoUrl']).trim() || null,
          kind: kind === 'makeup' || kind === 'trial' ? kind : 'regular',
          mark: markOf(st['mark']),
        } satisfies TeacherRosterStudent;
      })
      .filter((st) => st.studentId !== ''),
  };
}

// ---------------------------------------------------------------------------
// Rascunho da chamada: o professor marca à vontade e só grava ao salvar/fechar
// ---------------------------------------------------------------------------

/** studentId (todos da lista) → marca; `null` = sem marca. */
export type AttendanceDraft = Readonly<Record<string, AttendanceMark | null>>;

export function draftFromRoster(students: readonly TeacherRosterStudent[]): AttendanceDraft {
  return Object.fromEntries(students.map((s) => [s.studentId, s.mark]));
}

/** Tocar a marca que já está limpa o aluno (mesmo gesto da chamada do portal da arena). */
export function toggleMark(draft: AttendanceDraft, studentId: string, mark: AttendanceMark): AttendanceDraft {
  return { ...draft, [studentId]: draft[studentId] === mark ? null : mark };
}

/** "Marcar restantes presentes": só quem está sem marca — falta e justificada ficam. */
export function markRemainingPresent(draft: AttendanceDraft): AttendanceDraft {
  return Object.fromEntries(Object.entries(draft).map(([id, mark]) => [id, mark ?? 'present']));
}

export interface AttendanceCounts {
  present: number;
  absent: number;
  excused: number;
  unmarked: number;
}

export function attendanceCounts(draft: AttendanceDraft): AttendanceCounts {
  const counts: AttendanceCounts = { present: 0, absent: 0, excused: 0, unmarked: 0 };
  for (const mark of Object.values(draft)) {
    if (mark === 'present') counts.present += 1;
    else if (mark === 'absent') counts.absent += 1;
    else if (mark === 'excused') counts.excused += 1;
    else counts.unmarked += 1;
  }
  return counts;
}

/** O rascunho difere do que está gravado na aula? */
export function draftDiffers(draft: AttendanceDraft, students: readonly TeacherRosterStudent[]): boolean {
  return students.some((s) => (draft[s.studentId] ?? null) !== s.mark);
}

/** `marks` de `saveArenaClassAttendance`: a marca de todo aluno da lista (`null` apaga), para o
 *  servidor espelhar a tela. */
export function attendancePayload(
  draft: AttendanceDraft,
  students: readonly TeacherRosterStudent[],
): Record<string, AttendanceMark | null> {
  return Object.fromEntries(students.map((s) => [s.studentId, draft[s.studentId] ?? null]));
}

/** "3 presentes · 1 falta · 0 justificadas · 2 sem marcação". */
export function attendanceCountsLine(c: AttendanceCounts): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    plural(c.present, 'presente', 'presentes'),
    plural(c.absent, 'falta', 'faltas'),
    plural(c.excused, 'justificada', 'justificadas'),
    `${c.unmarked} sem marcação`,
  ].join(' · ');
}

/** Toast depois de fechar — mesmo texto da chamada do portal da arena. */
export function closeAttendanceNotice(credited: number, debited: number): string {
  const parts = ['Chamada fechada'];
  if (credited > 0) parts.push(`${credited} crédito${credited === 1 ? '' : 's'} de reposição gerado${credited === 1 ? '' : 's'}`);
  if (debited > 0) parts.push(`${debited} aula${debited === 1 ? '' : 's'} descontada${debited === 1 ? '' : 's'} de pacote`);
  return `${parts.join(' · ')}.`;
}

/** Rótulo do botão principal: fechar (com a contagem) ou corrigir a chamada já fechada. */
export function attendancePrimaryLabel(status: TeacherRosterSession['status'], present: number): string {
  if (status === 'completed') return 'Salvar correções';
  return `Fechar chamada · ${present} presente${present === 1 ? '' : 's'}`;
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

/** "ter, 21/10 · 18:00–19:00 · Quadra 2 · Arena Sol". */
export function teacherSessionSubtitle(
  s: Pick<TeacherRosterSession, 'date' | 'startTime' | 'endTime' | 'courtName' | 'arenaName'>,
): string {
  const [y, m, d] = s.date.split('-').map(Number);
  const day =
    y && m && d ? `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}` : s.date;
  return [day, `${s.startTime}–${s.endTime}`, s.courtName, s.arenaName].filter((p) => !!p).join(' · ');
}

// ---------------------------------------------------------------------------
// Agenda: o atalho para a chamada no item de professor
// ---------------------------------------------------------------------------

/** `YYYY-MM-DD` do dia local. */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface TeacherClassCta {
  label: string;
  primary: boolean;
}

/**
 * Botão da aula que eu dou na agenda. Só quando o servidor deixaria (`canManageLessons`, do
 * `getMyClassAgenda`) e a aula não foi cancelada; `null` mantém o "Ver arena" de sempre.
 * Aula futura abre a lista ("Ver lista" — a chamada só abre no dia); chamada já fechada, "Ver
 * chamada"; do dia ou passada sem chamada, "Fazer chamada" em destaque.
 */
export function teacherClassCta(
  item: { role: 'student' | 'teacher'; canManageLessons: boolean | null; status: string; date: string },
  todayKey: string,
): TeacherClassCta | null {
  if (item.role !== 'teacher' || item.canManageLessons !== true || item.status === 'canceled') return null;
  if (item.status === 'completed') return { label: 'Ver chamada', primary: false };
  if (item.date > todayKey) return { label: 'Ver lista', primary: false };
  return { label: 'Fazer chamada', primary: true };
}
