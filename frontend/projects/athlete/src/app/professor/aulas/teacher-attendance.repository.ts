import { httpsCallable } from 'firebase/functions';
import { athleteFunctions } from '../../data/functions';
import { teacherRosterFromRaw, type AttendanceMark, type TeacherRoster } from './teacher-attendance.model';

/** Erro das callables da chamada, com a mensagem do servidor pronta para a tela. */
export class TeacherAttendanceError extends Error {
  constructor(
    message: string,
    readonly code: string | null = null,
  ) {
    super(message);
  }

  /** Aula de outro professor, ou o vínculo não deixa (sem vínculo, suspenso, chave desligada). */
  get isPermissionDenied(): boolean {
    return this.code === 'permission-denied';
  }
}

export function teacherAttendanceError(err: unknown, fallback: string): TeacherAttendanceError {
  const fb = err as { code?: unknown; message?: unknown };
  const code = typeof fb.code === 'string' ? fb.code.replace(/^functions\//, '') : null;
  const message = typeof fb.message === 'string' && fb.message.trim() ? fb.message.trim() : null;
  if (code === 'unauthenticated') return new TeacherAttendanceError('Entre na sua conta para fazer a chamada.', code);
  // `internal`/rede: a mensagem do SDK é técnica ("internal") — vale o texto da tela.
  if (!code || code === 'internal' || code === 'unavailable' || code === 'deadline-exceeded') {
    return new TeacherAttendanceError(fallback, code);
  }
  return new TeacherAttendanceError(message ?? fallback, code);
}

/** Lista da chamada de UMA aula minha (`getMyClassSessionRoster`). */
export async function fetchMyClassSessionRoster(sessionId: string): Promise<TeacherRoster> {
  try {
    const res = await httpsCallable(athleteFunctions(), 'getMyClassSessionRoster')({ sessionId });
    const roster = teacherRosterFromRaw(res.data);
    if (!roster) throw new TeacherAttendanceError('Resposta inválida do servidor.');
    return roster;
  } catch (err) {
    if (err instanceof TeacherAttendanceError) throw err;
    throw teacherAttendanceError(err, 'Não foi possível carregar a lista da aula.');
  }
}

export interface SaveAttendanceResult {
  status: string;
  marked: number;
  credited: number;
  debited: number;
}

/** Grava a chamada pela mesma callable da equipe (`saveArenaClassAttendance`). */
export async function saveMyClassAttendance(input: {
  sessionId: string;
  marks: Record<string, AttendanceMark | null>;
  teacherNote: string | null;
  close: boolean;
}): Promise<SaveAttendanceResult> {
  try {
    const res = await httpsCallable<Record<string, unknown>, Partial<SaveAttendanceResult>>(
      athleteFunctions(),
      'saveArenaClassAttendance',
    )({
      sessionId: input.sessionId,
      marks: input.marks,
      teacherNote: input.teacherNote,
      close: input.close,
    });
    const data = res.data ?? {};
    return {
      status: typeof data.status === 'string' ? data.status : input.close ? 'completed' : 'scheduled',
      marked: Number(data.marked) || 0,
      credited: Number(data.credited) || 0,
      debited: Number(data.debited) || 0,
    };
  } catch (err) {
    throw teacherAttendanceError(err, 'Não foi possível salvar a chamada. Tente de novo.');
  }
}
