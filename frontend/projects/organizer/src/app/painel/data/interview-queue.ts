import { INTERVIEW_QUESTION_MAX, type InterviewKind, type InterviewReporter } from './broadcast-control';

/** Fila de entrevistas — `tournaments/{id}/broadcast/interviewQueue`.
 *
 *  Rascunho de quem opera a transmissão: quem vai ser entrevistado, em que ordem, a pauta de cada
 *  um e o repórter. Doc separado do `control` de propósito: digitar pergunta não acorda o OBS, e
 *  a pauta não fica pública (a rule fecha a leitura). O que vai ao ar é o card montado no clique,
 *  gravado em `control.interview`.
 *
 *  A fila guarda REFERÊNCIAS (time, atleta); `label`/`photoUrl` só servem pra listar sem esperar a
 *  hidratação dos elencos. */

export interface InterviewQueueItem {
  /** Mesma identidade do card no ar (`atleta:time:uid`, `dupla:time`…): o mesmo entrevistado
   *  não entra duas vezes. */
  id: string;
  kind: InterviewKind;
  teamId: string;
  uid: string | null;
  label: string;
  photoUrl: string | null;
  questions: string[];
}

export interface InterviewShow {
  question: boolean;
  reporter: boolean;
  campaign: boolean;
}

export interface InterviewQueue {
  items: InterviewQueueItem[];
  /** Índice do entrevistado da vez (no ar, ou o próximo a entrar). */
  current: number;
  questionIndex: number;
  reporter: InterviewReporter;
  show: InterviewShow;
}

export const INTERVIEW_QUEUE_MAX = 30;
const QUESTIONS_MAX = 12;
const DEFAULT_ROLE = 'Repórter';

export const EMPTY_INTERVIEW_QUEUE: InterviewQueue = {
  items: [],
  current: 0,
  questionIndex: 0,
  reporter: { role: DEFAULT_ROLE, name: '' },
  show: { question: true, reporter: true, campaign: true },
};

const KINDS: readonly InterviewKind[] = ['atleta', 'dupla', 'equipe'];

function record(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function clamp(n: number, max: number): number {
  return Math.max(0, Math.min(max, n));
}

function index(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 0;
}

/** Uma pergunta por linha; linha vazia não é pergunta. */
export function questionsFromText(raw: string): string[] {
  return raw
    .split('\n')
    .map((l) => l.trim().slice(0, INTERVIEW_QUESTION_MAX))
    .filter((l) => l.length > 0)
    .slice(0, QUESTIONS_MAX);
}

function itemFromRaw(raw: unknown): InterviewQueueItem | null {
  const d = record(raw);
  const id = text(d['id']);
  const teamId = text(d['teamId']);
  if (!id || !teamId) return null;
  const kind = KINDS.includes(d['kind'] as InterviewKind) ? (d['kind'] as InterviewKind) : 'atleta';
  const questions = Array.isArray(d['questions']) ? d['questions'].map(text).filter((q): q is string => !!q) : [];
  return {
    id,
    kind,
    teamId,
    uid: text(d['uid']),
    label: text(d['label']) ?? '',
    photoUrl: text(d['photoUrl']),
    questions: questions.slice(0, QUESTIONS_MAX),
  };
}

/** Cursor e pergunta sempre dentro do intervalo — o resto da tela pode confiar. */
function normalized(q: InterviewQueue): InterviewQueue {
  const current = clamp(q.current, Math.max(0, q.items.length - 1));
  const questions = q.items[current]?.questions.length ?? 0;
  return { ...q, current, questionIndex: clamp(q.questionIndex, Math.max(0, questions - 1)) };
}

export function interviewQueueFromRaw(raw: unknown): InterviewQueue {
  const d = record(raw);
  const r = record(d['reporter']);
  const s = record(d['show']);
  const items = (Array.isArray(d['items']) ? d['items'] : [])
    .map(itemFromRaw)
    .filter((i): i is InterviewQueueItem => i != null)
    .slice(0, INTERVIEW_QUEUE_MAX);
  return normalized({
    items,
    current: index(d['current']),
    questionIndex: index(d['questionIndex']),
    reporter: { role: text(r['role']) ?? DEFAULT_ROLE, name: text(r['name']) ?? '' },
    show: { question: s['question'] !== false, reporter: s['reporter'] !== false, campaign: s['campaign'] !== false },
  });
}

export function currentItem(q: InterviewQueue): InterviewQueueItem | null {
  return q.items[q.current] ?? null;
}

/** A pergunta que vai ao ar agora; `null` com a pauta desligada ou sem pergunta. */
export function currentQuestion(q: InterviewQueue): string | null {
  if (!q.show.question) return null;
  return currentItem(q)?.questions[q.questionIndex] ?? null;
}

export function reporterOnAir(q: InterviewQueue): InterviewReporter | null {
  return q.show.reporter && q.reporter.name ? q.reporter : null;
}

export function queueAdd(q: InterviewQueue, item: InterviewQueueItem): InterviewQueue {
  if (q.items.some((i) => i.id === item.id) || q.items.length >= INTERVIEW_QUEUE_MAX) return q;
  return normalized({ ...q, items: [...q.items, item] });
}

/** O cursor segue o MESMO entrevistado; se ele saiu, fica no que ocupou o lugar. */
export function queueRemove(q: InterviewQueue, id: string): InterviewQueue {
  const at = q.items.findIndex((i) => i.id === id);
  if (at < 0) return q;
  const items = q.items.filter((i) => i.id !== id);
  const current = at < q.current ? q.current - 1 : q.current;
  return normalized({ ...q, items, current, questionIndex: at === q.current ? 0 : q.questionIndex });
}

export function queueMove(q: InterviewQueue, id: string, delta: -1 | 1): InterviewQueue {
  const at = q.items.findIndex((i) => i.id === id);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= q.items.length) return q;
  const items = [...q.items];
  [items[at], items[to]] = [items[to]!, items[at]!];
  const currentId = q.items[q.current]?.id;
  return normalized({ ...q, items, current: Math.max(0, items.findIndex((i) => i.id === currentId)) });
}

/** Troca o formato de quem já está na fila (atleta ↔ dupla/equipe, ou outro atleta do mesmo time)
 *  sem perder o lugar nem a pauta. Se o novo formato já estava escalado, os dois viram um só — o
 *  mesmo entrevistado nunca aparece duas vezes — e o cursor acompanha. */
export function queueReplaceItem(q: InterviewQueue, id: string, next: InterviewQueueItem): InterviewQueue {
  const at = q.items.findIndex((i) => i.id === id);
  if (at < 0 || next.id === id) return q;
  const old = q.items[at]!;
  const currentId = q.items[q.current]?.id;
  const existing = q.items.find((i) => i.id === next.id);
  const items = existing
    ? q.items
        .filter((i) => i.id !== id)
        .map((i) => (i.id === next.id && i.questions.length === 0 ? { ...i, questions: old.questions } : i))
    : q.items.map((i) => (i.id === id ? { ...next, questions: old.questions } : i));
  const followId = currentId === id ? next.id : currentId;
  return normalized({ ...q, items, current: Math.max(0, items.findIndex((i) => i.id === followId)) });
}

export function queueGoTo(q: InterviewQueue, at: number): InterviewQueue {
  return normalized({ ...q, current: at, questionIndex: 0 });
}

export function queueStepQuestion(q: InterviewQueue, delta: -1 | 1): InterviewQueue {
  return normalized({ ...q, questionIndex: q.questionIndex + delta });
}

export function queueSetQuestions(q: InterviewQueue, id: string, raw: string): InterviewQueue {
  const items = q.items.map((i) => (i.id === id ? { ...i, questions: questionsFromText(raw) } : i));
  return normalized({ ...q, items });
}

export function queueSetReporter(q: InterviewQueue, reporter: InterviewReporter): InterviewQueue {
  return { ...q, reporter: { role: reporter.role.trim() || DEFAULT_ROLE, name: reporter.name.trim() } };
}

export function queueSetShow(q: InterviewQueue, patch: Partial<InterviewShow>): InterviewQueue {
  return { ...q, show: { ...q.show, ...patch } };
}
