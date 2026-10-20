import { httpsCallable } from 'firebase/functions';
import { athleteFunctions } from './functions';

/**
 * Aulas da arena na agenda do atleta, pela callable `getMyClassAgenda`
 * (`functions/src/arena-class-athlete-agenda.ts`). As coleções de aula são só da equipe da arena —
 * o atleta não lê direto, e a resposta não traz dado de outro aluno.
 */
export interface MyClassAgendaItem {
  sessionId: string;
  arenaId: string;
  arenaName: string;
  className: string;
  teacherName: string;
  courtName: string;
  /** `YYYY-MM-DD` no fuso da arena. */
  date: string;
  startTime: string;
  endTime: string;
  status: 'scheduled' | 'canceled' | 'completed';
  role: 'student' | 'teacher';
  kind: 'regular' | 'makeup' | 'trial';
  myMark: 'present' | 'absent' | 'excused' | null;
  studentCount: number | null;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

export function classAgendaItemFromRaw(raw: Record<string, unknown>): MyClassAgendaItem {
  const status = raw['status'];
  const mark = raw['myMark'];
  const count = raw['studentCount'];
  return {
    sessionId: str(raw['sessionId']),
    arenaId: str(raw['arenaId']),
    arenaName: str(raw['arenaName'], 'Arena'),
    className: str(raw['className'], 'Aula'),
    teacherName: str(raw['teacherName']),
    courtName: str(raw['courtName']),
    date: str(raw['date']),
    startTime: str(raw['startTime']),
    endTime: str(raw['endTime']),
    status: status === 'canceled' || status === 'completed' ? status : 'scheduled',
    role: raw['role'] === 'teacher' ? 'teacher' : 'student',
    kind: raw['kind'] === 'makeup' || raw['kind'] === 'trial' ? raw['kind'] : 'regular',
    myMark: mark === 'present' || mark === 'absent' || mark === 'excused' ? mark : null,
    studentCount: typeof count === 'number' ? count : null,
  };
}

/** Intervalo padrão do servidor: 30 dias para trás, 35 para a frente. */
export async function fetchMyClassAgenda(): Promise<MyClassAgendaItem[]> {
  const res = await httpsCallable(athleteFunctions(), 'getMyClassAgenda')({});
  const items = (res.data as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? items.filter((i): i is Record<string, unknown> => i != null && typeof i === 'object').map(classAgendaItemFromRaw) : [];
}
