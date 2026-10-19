import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import {
  arenaClassFromDoc,
  classSessionFromDoc,
  classStudentFromDoc,
  classTeacherFromDoc,
  type ArenaClass,
  type AttendanceMark,
  type CancelReason,
  type ClassLevel,
  type ClassSession,
  type ClassStudent,
  type ClassTeacher,
  type ClassType,
  type TeacherPayoutModel,
} from './class.model';

/** Leitura direta do Firestore — toda query filtra `arenaId`, porque a rule de leitura
 *  confere a arena do doc (`arenaCanRead(resource.data.arenaId, 'agenda')`). Escrita só
 *  por callable (`functions/src/arena-class.ts`): bloqueio da quadra, vagas e chamada
 *  vivem no servidor. */

export class ArenaClassError extends Error {}

function mapFunctionsError(err: unknown): ArenaClassError {
  const message =
    err instanceof Error && err.message ? err.message : 'Não foi possível concluir a operação. Tente novamente.';
  return new ArenaClassError(message);
}

async function call<In, Out>(functions: Functions, name: string, input: In): Promise<Out> {
  try {
    const result = await httpsCallable<In, Out>(functions, name)(input);
    return result.data;
  } catch (err) {
    throw mapFunctionsError(err);
  }
}

// ── Leituras ────────────────────────────────────────────────────────────────

export async function fetchTeachers(db: Firestore, arenaId: string): Promise<ClassTeacher[]> {
  const snap = await getDocs(collection(db, 'arenas', arenaId, 'classTeachers'));
  return snap.docs.map(classTeacherFromDoc).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function fetchClasses(db: Firestore, arenaId: string): Promise<ArenaClass[]> {
  const snap = await getDocs(query(collection(db, 'arenaClasses'), where('arenaId', '==', arenaId)));
  return snap.docs.map(arenaClassFromDoc).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function fetchClass(db: Firestore, classId: string): Promise<ArenaClass | null> {
  const snap = await getDoc(doc(db, 'arenaClasses', classId));
  return snap.exists() ? arenaClassFromDoc(snap) : null;
}

export function watchClassStudents(
  db: Firestore,
  arenaId: string,
  classId: string,
  onChange: (students: ClassStudent[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'arenaClasses', classId, 'classStudents'), where('arenaId', '==', arenaId)),
    (snap) =>
      onChange(
        snap.docs
          .map(classStudentFromDoc)
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      ),
    () => onChange([]),
  );
}

export async function fetchClassStudent(db: Firestore, classId: string, studentId: string): Promise<ClassStudent | null> {
  const snap = await getDoc(doc(db, 'arenaClasses', classId, 'classStudents', studentId));
  return snap.exists() ? classStudentFromDoc(snap) : null;
}

/** Alunos ativos de uma turma, leitura única — vagas por dia na matrícula. */
export async function fetchActiveClassStudents(db: Firestore, arenaId: string, classId: string): Promise<ClassStudent[]> {
  const snap = await getDocs(
    query(
      collection(db, 'arenaClasses', classId, 'classStudents'),
      where('arenaId', '==', arenaId),
      where('status', '==', 'active'),
    ),
  );
  return snap.docs.map(classStudentFromDoc);
}

/** Aulas da arena entre duas datas (inclusive), ao vivo — agenda semanal e "hoje". */
export function watchSessionsBetween(
  db: Firestore,
  arenaId: string,
  fromKey: string,
  toKey: string,
  onChange: (sessions: ClassSession[]) => void,
  onError?: () => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'arenaClassSessions'),
      where('arenaId', '==', arenaId),
      where('date', '>=', fromKey),
      where('date', '<=', toKey),
      orderBy('date'),
    ),
    (snap) => onChange(snap.docs.map(classSessionFromDoc)),
    () => onError?.(),
  );
}

/** Aulas da arena entre duas datas (inclusive), leitura única. */
export async function fetchSessionsBetween(
  db: Firestore,
  arenaId: string,
  fromKey: string,
  toKey: string,
): Promise<ClassSession[]> {
  const snap = await getDocs(
    query(
      collection(db, 'arenaClassSessions'),
      where('arenaId', '==', arenaId),
      where('date', '>=', fromKey),
      where('date', '<=', toKey),
      orderBy('date'),
    ),
  );
  return snap.docs.map(classSessionFromDoc);
}

/** Próximas aulas de uma turma, a partir de `fromKey`. */
export async function fetchClassSessions(
  db: Firestore,
  arenaId: string,
  classId: string,
  fromKey: string,
): Promise<ClassSession[]> {
  const snap = await getDocs(
    query(
      collection(db, 'arenaClassSessions'),
      where('arenaId', '==', arenaId),
      where('classId', '==', classId),
      where('date', '>=', fromKey),
      orderBy('date'),
    ),
  );
  return snap.docs.map(classSessionFromDoc);
}

export function watchSession(
  db: Firestore,
  sessionId: string,
  onChange: (session: ClassSession | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'arenaClassSessions', sessionId),
    (snap) => onChange(snap.exists() ? classSessionFromDoc(snap) : null),
    () => onChange(null),
  );
}

// ── Callables ───────────────────────────────────────────────────────────────

export interface TeacherInput {
  arenaId: string;
  teacherId?: string;
  /** Conta NexaGO do professor: obrigatória no cadastro; em professor antigo, vincula. */
  userId?: string;
  specialty?: string | null;
  phone?: string | null;
  color: string;
  status?: 'active' | 'archived';
  /** Só o gestor manda (o servidor recusa o resto); ausente mantém o gravado. */
  payout?: TeacherPayoutModel;
}

export function upsertTeacher(functions: Functions, input: TeacherInput): Promise<{ teacherId: string }> {
  return call(functions, 'upsertArenaClassTeacher', input);
}

export interface ClassScheduleInput {
  arenaId: string;
  classId?: string;
  type: ClassType;
  weekdays: number[];
  startTime: string;
  endTime: string;
  courtId: string;
  startDate: string;
  endDate: string | null;
}

export interface ClassConflict {
  date: string;
  label: string;
}

export function previewClassSchedule(
  functions: Functions,
  input: ClassScheduleInput,
): Promise<{ totalDates: number; conflicts: ClassConflict[] }> {
  return call(functions, 'previewArenaClassSchedule', input);
}

export interface NewStudentInput {
  athleteId?: string;
  name?: string;
  phone?: string;
}

export interface ClassInput extends ClassScheduleInput {
  name: string;
  sport: string;
  level: ClassLevel;
  teacherId: string;
  capacity: number;
  notes?: string | null;
  /** Só na criação — aula avulsa já nasce com o(s) aluno(s). */
  students?: NewStudentInput[];
}

export function upsertClass(
  functions: Functions,
  input: ClassInput,
): Promise<{ classId: string; createdDates: string[]; conflictDates: string[] }> {
  return call(functions, 'upsertArenaClass', input);
}

export function setClassStatus(
  functions: Functions,
  classId: string,
  status: 'active' | 'paused' | 'archived',
): Promise<{ classId: string; status: string; conflictDates?: string[] }> {
  return call(functions, 'setArenaClassStatus', { classId, status });
}

export function scheduleClassDate(functions: Functions, classId: string, date: string): Promise<{ sessionId: string }> {
  return call(functions, 'scheduleArenaClassDate', { classId, date });
}

export function cancelClassSession(
  functions: Functions,
  sessionId: string,
  reason: CancelReason,
  note: string | null,
  generateCredits?: boolean,
): Promise<{ sessionId: string; notified: number; credited?: number }> {
  return call(functions, 'cancelArenaClassSession', { sessionId, reason, note, generateCredits });
}

export function addClassStudent(
  functions: Functions,
  classId: string,
  input: NewStudentInput,
): Promise<{ studentId: string; studentCount: number }> {
  return call(functions, 'addArenaClassStudent', { classId, ...input });
}

export function removeClassStudent(functions: Functions, classId: string, studentId: string): Promise<{ studentCount: number }> {
  return call(functions, 'removeArenaClassStudent', { classId, studentId });
}

export function saveAttendance(
  functions: Functions,
  sessionId: string,
  marks: Record<string, AttendanceMark | null>,
  teacherNote: string | null,
  close: boolean,
): Promise<{ status: string; marked: number; credited?: number; debited?: number }> {
  return call(functions, 'saveArenaClassAttendance', { sessionId, marks, teacherNote, close });
}
