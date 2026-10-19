import { Timestamp, type DocumentSnapshot, type QueryDocumentSnapshot } from 'firebase/firestore';
import { courtSportLabel } from '@nexago/arena-discovery';

/** Espelha `functions/src/arena-class.ts` — docs `arenaClasses` (+ `classStudents`),
 *  `arenaClassSessions` e `arenas/{id}/classTeachers`. Escrita 100% server-side; aqui só
 *  parse de leitura e regras de exibição. */

export type ClassType = 'turma' | 'particular' | 'dupla' | 'experimental';
export type ClassLevel = 'iniciante' | 'intermediario' | 'avancado' | 'kids' | 'livre';
export type ClassStatus = 'active' | 'paused' | 'archived';
export type ClassSessionStatus = 'scheduled' | 'canceled' | 'completed';
export type AttendanceMark = 'present' | 'absent' | 'excused';
export type CancelReason = 'rain' | 'teacher_absent' | 'maintenance' | 'holiday' | 'other';

export interface ClassTeacher {
  id: string;
  name: string;
  specialty: string | null;
  phone: string | null;
  color: string;
  status: 'active' | 'archived';
}

export interface ArenaClass {
  id: string;
  arenaId: string;
  name: string;
  type: ClassType;
  sport: string;
  level: ClassLevel;
  teacherId: string;
  teacherName: string;
  teacherColor: string;
  /** ISO 1=seg … 7=dom; vazio = aula avulsa (uma data só). */
  weekdays: number[];
  startTime: string;
  endTime: string;
  courtId: string;
  courtName: string;
  capacity: number;
  studentCount: number;
  startDate: string;
  endDate: string | null;
  status: ClassStatus;
  notes: string | null;
  conflictDates: string[];
  createdAt: Date | null;
}

export interface ClassStudent {
  id: string;
  athleteId: string | null;
  name: string;
  phone: string | null;
  photoUrl: string | null;
  status: 'active' | 'removed';
  enrolledAt: Date | null;
}

export interface ClassSession {
  id: string;
  classId: string;
  arenaId: string;
  className: string;
  type: ClassType;
  sport: string;
  level: ClassLevel;
  teacherId: string;
  teacherName: string;
  teacherColor: string;
  courtId: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  status: ClassSessionStatus;
  attendance: Record<string, { mark: AttendanceMark; name: string }>;
  teacherNote: string | null;
  cancelReason: string | null;
}

// ── Rótulos ─────────────────────────────────────────────────────────────────

export const CLASS_TYPE_LABEL: Record<ClassType, string> = {
  turma: 'Turma',
  particular: 'Particular',
  dupla: 'Dupla',
  experimental: 'Experimental',
};

export const CLASS_LEVEL_LABEL: Record<ClassLevel, string> = {
  iniciante: 'Iniciante',
  intermediario: 'Intermediário',
  avancado: 'Avançado',
  kids: 'Kids',
  livre: 'Livre',
};

export const CLASS_LEVELS: readonly ClassLevel[] = ['iniciante', 'intermediario', 'avancado', 'kids', 'livre'];

export const CLASS_STATUS_LABEL: Record<ClassStatus, string> = {
  active: 'Ativa',
  paused: 'Pausada',
  archived: 'Encerrada',
};

export const ATTENDANCE_LABEL: Record<AttendanceMark, string> = {
  present: 'Presente',
  absent: 'Falta',
  excused: 'Justificada',
};

export const CANCEL_REASON_LABEL: Record<CancelReason, string> = {
  rain: 'Chuva',
  teacher_absent: 'Professor ausente',
  maintenance: 'Manutenção',
  holiday: 'Feriado',
  other: 'Outro',
};

/** ISO 1–7 → rótulo curto do protótipo. */
export const WEEKDAY_SHORT: Record<number, string> = {
  1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb', 7: 'Dom',
};

/** Paleta dos professores (protótipo) — cor vira a borda das aulas na agenda. */
export const TEACHER_COLORS: readonly string[] = [
  '#FF6A1A', '#5B9BFF', '#2BD17E', '#C08CFF', '#F4C543', '#FF5C8A', '#3DD6D0', '#B8E986',
];

export function sportLabel(code: string): string {
  return courtSportLabel(code) || 'Modalidade';
}

// ── Parse ───────────────────────────────────────────────────────────────────

function toDate(v: unknown): Date | null {
  return v instanceof Timestamp ? v.toDate() : null;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function optStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

const TYPES: readonly ClassType[] = ['turma', 'particular', 'dupla', 'experimental'];

export function classTeacherFromDoc(doc: QueryDocumentSnapshot | DocumentSnapshot): ClassTeacher {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  return {
    id: doc.id,
    name: str(d['name'], 'Professor'),
    specialty: optStr(d['specialty']),
    phone: optStr(d['phone']),
    color: str(d['color'], TEACHER_COLORS[0]!),
    status: d['status'] === 'archived' ? 'archived' : 'active',
  };
}

export function arenaClassFromDoc(doc: QueryDocumentSnapshot | DocumentSnapshot): ArenaClass {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  return {
    id: doc.id,
    arenaId: str(d['arenaId']),
    name: str(d['name'], 'Aula'),
    type: oneOf(d['type'], TYPES, 'turma'),
    sport: str(d['sport']),
    level: oneOf(d['level'], CLASS_LEVELS, 'livre'),
    teacherId: str(d['teacherId']),
    teacherName: str(d['teacherName'], 'Professor'),
    teacherColor: str(d['teacherColor'], TEACHER_COLORS[0]!),
    weekdays: Array.isArray(d['weekdays'])
      ? (d['weekdays'] as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
      : [],
    startTime: str(d['startTime']),
    endTime: str(d['endTime']),
    courtId: str(d['courtId']),
    courtName: str(d['courtName'], 'Quadra'),
    capacity: num(d['capacity']),
    studentCount: num(d['studentCount']),
    startDate: str(d['startDate']),
    endDate: optStr(d['endDate']),
    status: oneOf(d['status'], ['active', 'paused', 'archived'] as const, 'active'),
    notes: optStr(d['notes']),
    conflictDates: Array.isArray(d['conflictDates']) ? (d['conflictDates'] as unknown[]).map(String) : [],
    createdAt: toDate(d['createdAt']),
  };
}

export function classStudentFromDoc(doc: QueryDocumentSnapshot | DocumentSnapshot): ClassStudent {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  return {
    id: doc.id,
    athleteId: optStr(d['athleteId']),
    name: str(d['name'], 'Aluno'),
    phone: optStr(d['phone']),
    photoUrl: optStr(d['photoUrl']),
    status: d['status'] === 'removed' ? 'removed' : 'active',
    enrolledAt: toDate(d['enrolledAt']),
  };
}

export function classSessionFromDoc(doc: QueryDocumentSnapshot | DocumentSnapshot): ClassSession {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  const attendance: ClassSession['attendance'] = {};
  const raw = d['attendance'];
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [studentId, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value == null || typeof value !== 'object') continue;
      const v = value as Record<string, unknown>;
      const mark = oneOf<AttendanceMark | ''>(v['mark'], ['present', 'absent', 'excused'], '');
      if (!mark) continue;
      attendance[studentId] = { mark, name: str(v['name'], 'Aluno') };
    }
  }
  return {
    id: doc.id,
    classId: str(d['classId']),
    arenaId: str(d['arenaId']),
    className: str(d['className'], 'Aula'),
    type: oneOf(d['type'], TYPES, 'turma'),
    sport: str(d['sport']),
    level: oneOf(d['level'], CLASS_LEVELS, 'livre'),
    teacherId: str(d['teacherId']),
    teacherName: str(d['teacherName'], 'Professor'),
    teacherColor: str(d['teacherColor'], TEACHER_COLORS[0]!),
    courtId: str(d['courtId']),
    courtName: str(d['courtName'], 'Quadra'),
    date: str(d['date']),
    startTime: str(d['startTime']),
    endTime: str(d['endTime']),
    capacity: num(d['capacity']),
    status: oneOf(d['status'], ['scheduled', 'canceled', 'completed'] as const, 'scheduled'),
    attendance,
    teacherNote: optStr(d['teacherNote']),
    cancelReason: optStr(d['cancelReason']),
  };
}

// ── Regras de exibição ──────────────────────────────────────────────────────

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((p) => Number(p));
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Fim da aula a partir do início e da duração; passou da meia-noite vira "24:00" (recusado). */
export function endTimeFor(startTime: string, durationMin: number): string {
  const total = minutesOf(startTime) + durationMin;
  if (total >= 24 * 60) return '24:00';
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** "Seg e Qua" — "Seg, Qua e Sex". */
export function weekdaysLabel(weekdays: readonly number[]): string {
  const parts = [...weekdays].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT[d] ?? '?');
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

/** `2026-10-21` → `21/10`. */
export function shortDate(dateKey: string): string {
  const parts = dateKey.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : dateKey;
}

/** Dia da semana ISO (1=seg…7=dom) de um `YYYY-MM-DD`, pelo calendário local. */
export function isoWeekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const js = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay();
  return js === 0 ? 7 : js;
}

/** `2026-10-21` → `Qua 21/10`. */
export function weekdayDateLabel(dateKey: string): string {
  return `${WEEKDAY_SHORT[isoWeekdayOf(dateKey)] ?? ''} ${shortDate(dateKey)}`.trim();
}

/** "Seg e Qua · 07:00–08:00" (turma) ou "Qua 21/10 · 17:00–18:00" (avulsa). */
export function classScheduleLabel(cls: Pick<ArenaClass, 'weekdays' | 'startDate' | 'startTime' | 'endTime'>): string {
  const when = cls.weekdays.length === 0 ? weekdayDateLabel(cls.startDate) : weekdaysLabel(cls.weekdays);
  return `${when} · ${cls.startTime}–${cls.endTime}`;
}

export function isRecurringClass(cls: Pick<ArenaClass, 'weekdays'>): boolean {
  return cls.weekdays.length > 0;
}

export type SessionLiveState = 'canceled' | 'done' | 'live' | 'next';

/** Estado da aula agora: concluída quando a chamada fecha ou o horário passa. */
export function sessionLiveState(
  session: Pick<ClassSession, 'status' | 'date' | 'startTime' | 'endTime'>,
  now: Date,
  todayKey: string,
): SessionLiveState {
  if (session.status === 'canceled') return 'canceled';
  if (session.status === 'completed') return 'done';
  if (session.date < todayKey) return 'done';
  if (session.date > todayKey) return 'next';
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let end = minutesOf(session.endTime);
  if (end === 0) end = 24 * 60;
  if (nowMin >= end) return 'done';
  if (nowMin >= minutesOf(session.startTime)) return 'live';
  return 'next';
}

export interface AttendanceCounts {
  present: number;
  absent: number;
  excused: number;
  unmarked: number;
}

/** Contagem da chamada sobre a lista da aula (alunos ativos + quem já tem marca). */
export function attendanceCounts(session: Pick<ClassSession, 'attendance'>, rosterIds: readonly string[]): AttendanceCounts {
  const counts: AttendanceCounts = { present: 0, absent: 0, excused: 0, unmarked: 0 };
  const ids = new Set([...rosterIds, ...Object.keys(session.attendance)]);
  for (const id of ids) {
    const mark = session.attendance[id]?.mark;
    if (mark === 'present') counts.present += 1;
    else if (mark === 'absent') counts.absent += 1;
    else if (mark === 'excused') counts.excused += 1;
    else counts.unmarked += 1;
  }
  return counts;
}

/** Ocupação (%) das turmas ativas recorrentes: alunos / vagas. */
export function classesOccupancy(classes: readonly ArenaClass[]): { students: number; capacity: number; pct: number } {
  const active = classes.filter((c) => c.status === 'active' && isRecurringClass(c));
  const students = active.reduce((s, c) => s + c.studentCount, 0);
  const capacity = active.reduce((s, c) => s + c.capacity, 0);
  return { students, capacity, pct: capacity > 0 ? Math.round((students / capacity) * 100) : 0 };
}

export interface TeacherStats {
  teacherId: string;
  classesPerWeek: number;
  students: number;
  capacity: number;
  occupancyPct: number;
}

/** Aulas/semana, alunos e ocupação por professor, só das turmas ativas recorrentes. */
export function teacherStats(classes: readonly ArenaClass[]): Map<string, TeacherStats> {
  const out = new Map<string, TeacherStats>();
  for (const c of classes) {
    if (c.status !== 'active' || !isRecurringClass(c)) continue;
    const s = out.get(c.teacherId) ?? { teacherId: c.teacherId, classesPerWeek: 0, students: 0, capacity: 0, occupancyPct: 0 };
    s.classesPerWeek += c.weekdays.length;
    s.students += c.studentCount;
    s.capacity += c.capacity;
    s.occupancyPct = s.capacity > 0 ? Math.round((s.students / s.capacity) * 100) : 0;
    out.set(c.teacherId, s);
  }
  return out;
}

export function teacherInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : '';
  return (first + last).toUpperCase();
}

/** Ordena aulas do dia/semana por data e horário. */
export function compareSessions(a: ClassSession, b: ClassSession): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return minutesOf(a.startTime) - minutesOf(b.startTime);
}

export function todayKeyLocal(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return todayKeyLocal(new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
}
