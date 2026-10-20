import { httpsCallable } from 'firebase/functions';
import {
  teacherRosterFromRaw,
  type AttendanceMark,
  type TeacherRoster,
} from '../professor/teacher-attendance.model';
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
  /** Só para o professor: o vínculo com a arena libera a chamada ("Gerenciar as próprias
   *  aulas"). Servidor antigo (sem o campo) = `false`. */
  canManageLessons: boolean;
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
    canManageLessons: raw['canManageLessons'] === true,
  };
}

/** Falha da chamada do professor, com a mensagem do servidor pronta para a tela. */
export class TeacherClassError extends Error {}

/** Mensagem do callable; quando o SDK devolve só o código ("not-found", "INTERNAL"), o texto
 *  genérico — callable fora do ar não vira infraestrutura na tela. */
function callableMessage(err: unknown, fallback: string): string {
  const e = err as { code?: unknown; message?: unknown };
  const message = typeof e?.message === 'string' ? e.message.trim() : '';
  const code = typeof e?.code === 'string' ? e.code.replace(/^functions\//, '') : '';
  const norm = (t: string) => t.toLowerCase().replace(/[\s_-]/g, '');
  if (!message || (code && norm(message) === norm(code)) || norm(message) === 'internal') return fallback;
  return message;
}

/** Lista da chamada de uma aula que dou (`getMyClassSessionRoster`; só com o vínculo). */
export async function fetchMyClassSessionRoster(sessionId: string): Promise<TeacherRoster> {
  try {
    const res = await httpsCallable(athleteFunctions(), 'getMyClassSessionRoster')({ sessionId });
    return teacherRosterFromRaw(res.data);
  } catch (err) {
    throw new TeacherClassError(callableMessage(err, 'Não foi possível abrir a chamada agora. Tente de novo em instantes.'));
  }
}

/** Grava a chamada pela mesma `saveArenaClassAttendance` da equipe — o servidor aceita o
 *  professor da aula com a permissão. `close` fecha (crédito de reposição e débito de pacote). */
export async function saveTeacherClassAttendance(
  sessionId: string,
  marks: Record<string, AttendanceMark | null>,
  close: boolean,
): Promise<void> {
  try {
    await httpsCallable(athleteFunctions(), 'saveArenaClassAttendance')({ sessionId, marks, close });
  } catch (err) {
    throw new TeacherClassError(callableMessage(err, 'Não foi possível salvar a chamada. Tente novamente.'));
  }
}

/** Intervalo padrão do servidor: 30 dias para trás, 35 para a frente. */
export async function fetchMyClassAgenda(): Promise<MyClassAgendaItem[]> {
  const res = await httpsCallable(athleteFunctions(), 'getMyClassAgenda')({});
  const items = (res.data as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? items.filter((i): i is Record<string, unknown> => i != null && typeof i === 'object').map(classAgendaItemFromRaw) : [];
}

/**
 * Mensalidade de aula em aberto do atleta, pela callable `getMyClassCharges`
 * (`functions/src/arena-class-athlete-charges.ts`) — `arenaClassCharges` segue só da equipe.
 * `invoiceUrl` só vem quando dá para pagar online (mensalidade e fatura em aberto); cobrança
 * manual é só informativa: o aluno paga direto à arena.
 */
export interface MyClassChargeItem {
  chargeId: string;
  arenaId: string;
  arenaName: string;
  description: string;
  amountReais: number;
  /** `YYYY-MM-DD`. */
  dueDate: string;
  overdue: boolean;
  /** `online` = fatura pronta; `preparing` = link sendo gerado; `manual` = paga direto à arena. */
  payment: 'online' | 'preparing' | 'manual';
  /** Fatura do Asaas (PIX ou cartão) — só http(s). */
  invoiceUrl: string | null;
}

/** Link externo que dá para abrir: http(s) absoluto. */
export function safeExternalUrl(v: unknown): string | null {
  return typeof v === 'string' && /^https?:\/\/[^/\s]+/i.test(v.trim()) ? v.trim() : null;
}

export function classChargeItemFromRaw(raw: Record<string, unknown>): MyClassChargeItem {
  const payment = raw['payment'];
  const amount = raw['amountReais'];
  return {
    chargeId: str(raw['chargeId']),
    arenaId: str(raw['arenaId']),
    arenaName: str(raw['arenaName'], 'Arena'),
    description: str(raw['description'], 'Mensalidade'),
    amountReais: typeof amount === 'number' ? amount : 0,
    dueDate: str(raw['dueDate']),
    overdue: raw['overdue'] === true,
    payment: payment === 'online' || payment === 'preparing' ? payment : 'manual',
    invoiceUrl: safeExternalUrl(raw['invoiceUrl']),
  };
}

/** "R$ 180,00 · vence 05/11" / "R$ 180,00 · venceu 05/10". */
export function classChargeLine(c: Pick<MyClassChargeItem, 'amountReais' | 'dueDate' | 'overdue'>): string {
  const amount = c.amountReais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const [, month, day] = c.dueDate.split('-');
  if (!month || !day) return amount;
  return `${amount} · ${c.overdue ? 'venceu' : 'vence'} ${day}/${month}`;
}

/** Texto no lugar do "Pagar" quando não há fatura (`null` = tem botão). */
export function classChargeInfoLabel(c: Pick<MyClassChargeItem, 'invoiceUrl' | 'payment'>): string | null {
  if (c.invoiceUrl) return null;
  return c.payment === 'preparing' ? 'Link de pagamento em preparo' : 'Pagamento direto com a arena';
}

/** Em aberto, da que vence primeiro. */
export async function fetchMyClassCharges(): Promise<MyClassChargeItem[]> {
  const res = await httpsCallable(athleteFunctions(), 'getMyClassCharges')({});
  const items = (res.data as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? items.filter((i): i is Record<string, unknown> => i != null && typeof i === 'object').map(classChargeItemFromRaw) : [];
}
