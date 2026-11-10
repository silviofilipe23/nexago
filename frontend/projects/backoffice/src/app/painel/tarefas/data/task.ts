/**
 * Quadro de tarefas da equipe do backoffice (`backofficeTasks/{id}`). Funções puras: o repositório lê
 * e grava, a tela só monta colunas e filtros a partir daqui.
 */

export const STATUSES = ['todo', 'doing', 'review', 'done'] as const;
export type TaskStatus = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'A fazer',
  doing: 'Em andamento',
  review: 'Em revisão',
  done: 'Concluído',
};

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
};

export const AREAS = ['produto', 'comercial', 'operacao', 'marketing', 'financeiro', 'suporte'] as const;
export type TaskArea = (typeof AREAS)[number];

export const AREA_LABELS: Record<TaskArea, string> = {
  produto: 'Produto',
  comercial: 'Comercial',
  operacao: 'Operação',
  marketing: 'Marketing',
  financeiro: 'Financeiro',
  suporte: 'Suporte',
};

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 4000;
export const CHECKLIST_MAX = 50;
export const CHECKLIST_TEXT_MAX = 200;

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  area: TaskArea;
  assigneeUid: string | null;
  assigneeName: string | null;
  /** `YYYY-MM-DD`, dia local. */
  dueDate: string | null;
  checklist: ChecklistItem[];
  order: number;
  archived: boolean;
  createdByName: string;
  createdAt: Date | null;
  updatedByName: string;
  updatedAt: Date | null;
  /** Quando entrou em Concluído; volta a `null` se sair. */
  doneAt: Date | null;
}

/** O que o painel lateral edita. */
export interface TaskDraft {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  area: TaskArea;
  assigneeUid: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  checklist: ChecklistItem[];
}

export interface Member {
  uid: string;
  name: string;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function dateOf(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate(): Date }).toDate();
  }
  return value instanceof Date ? value : null;
}

function checklistOf(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
    .map((i, n) => ({ id: text(i['id']) || `item-${n}`, text: text(i['text']), done: i['done'] === true }))
    .filter((i) => i.text.trim() !== '');
}

export function taskFromDoc(id: string, data: Record<string, unknown>): Task {
  const due = text(data['dueDate']);
  return {
    id,
    title: text(data['title']) || 'Sem título',
    description: text(data['description']),
    status: pick(data['status'], STATUSES, 'todo'),
    priority: pick(data['priority'], PRIORITIES, 'medium'),
    area: pick(data['area'], AREAS, 'produto'),
    assigneeUid: text(data['assigneeUid']) || null,
    assigneeName: text(data['assigneeName']) || null,
    dueDate: DATE_KEY.test(due) ? due : null,
    checklist: checklistOf(data['checklist']),
    order: typeof data['order'] === 'number' && Number.isFinite(data['order']) ? data['order'] : 0,
    archived: data['archived'] === true,
    createdByName: text(data['createdByName']),
    createdAt: dateOf(data['createdAt']),
    updatedByName: text(data['updatedByName']),
    updatedAt: dateOf(data['updatedAt']),
    doneAt: dateOf(data['doneAt']),
  };
}

export function emptyDraft(status: TaskStatus = 'todo'): TaskDraft {
  return {
    title: '',
    description: '',
    status,
    priority: 'medium',
    area: 'produto',
    assigneeUid: null,
    assigneeName: null,
    dueDate: null,
    checklist: [],
  };
}

export function draftOf(task: Task): TaskDraft {
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    area: task.area,
    assigneeUid: task.assigneeUid,
    assigneeName: task.assigneeName,
    dueDate: task.dueDate,
    checklist: task.checklist.map((i) => ({ ...i })),
  };
}

/** Limpa o que o usuário digitou antes de gravar (as rules recusam o resto). */
export function normalizeDraft(draft: TaskDraft): TaskDraft {
  return {
    ...draft,
    title: draft.title.trim().slice(0, TITLE_MAX),
    description: draft.description.trim().slice(0, DESCRIPTION_MAX),
    dueDate: draft.dueDate && DATE_KEY.test(draft.dueDate) ? draft.dueDate : null,
    assigneeName: draft.assigneeUid ? draft.assigneeName : null,
    checklist: draft.checklist
      .map((i) => ({ ...i, text: i.text.trim().slice(0, CHECKLIST_TEXT_MAX) }))
      .filter((i) => i.text !== '')
      .slice(0, CHECKLIST_MAX),
  };
}

// ── datas ──────────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` no fuso do navegador (a equipe está toda no Brasil). */
export function dateKeyOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return dateKeyOf(new Date(y, m - 1, d + days));
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function shortDate(key: string): string {
  const [, m, d] = key.split('-').map(Number) as [number, number, number];
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]}`;
}

export function shortDateOf(date: Date): string {
  return shortDate(dateKeyOf(date));
}

export type DueState = 'overdue' | 'today' | 'soon' | 'later';

/** Prazo de tarefa aberta. Concluída ou sem prazo não tem estado. */
export function dueState(task: Pick<Task, 'dueDate' | 'status'>, today: string): DueState | null {
  if (!task.dueDate || task.status === 'done') return null;
  if (task.dueDate < today) return 'overdue';
  if (task.dueDate === today) return 'today';
  if (task.dueDate <= addDays(today, 2)) return 'soon';
  return 'later';
}

export function dueLabel(key: string, today: string): string {
  if (key === today) return 'Hoje';
  if (key === addDays(today, 1)) return 'Amanhã';
  return shortDate(key);
}

// ── ordem ──────────────────────────────────────────────────────────────────

/** Ordem de uma coluna: `order` crescente; Concluído mostra o mais recente em cima. */
export function sortColumn(status: TaskStatus, tasks: Task[]): Task[] {
  const list = [...tasks];
  if (status === 'done') {
    return list.sort((a, b) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0) || a.order - b.order);
  }
  return list.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function byStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  const out = { todo: [], doing: [], review: [], done: [] } as Record<TaskStatus, Task[]>;
  for (const t of tasks) out[t.status].push(t);
  for (const s of STATUSES) out[s] = sortColumn(s, out[s]);
  return out;
}

/**
 * `order` para soltar um card antes de `beforeId` (ou no fim, com `null`) numa coluna já ordenada.
 * Ponto médio entre os vizinhos: só o card arrastado é regravado.
 */
export function orderFor(column: Task[], draggedId: string, beforeId: string | null): number {
  const rest = column.filter((t) => t.id !== draggedId);
  const index = beforeId === null ? rest.length : rest.findIndex((t) => t.id === beforeId);
  const at = index < 0 ? rest.length : index;
  const prev = rest[at - 1];
  const next = rest[at];
  if (!prev && !next) return 1000;
  if (!prev) return next!.order - 1000;
  if (!next) return prev.order + 1000;
  return (prev.order + next.order) / 2;
}

/** `order` de um card novo no fim da coluna. */
export function orderAtEnd(column: Task[]): number {
  return column.reduce((max, t) => Math.max(max, t.order), 0) + 1000;
}

// ── filtros ────────────────────────────────────────────────────────────────

export interface TaskFilter {
  term: string;
  /** `me` = só minhas; uid = desse responsável; `null` = todas. */
  assignee: string | null;
  area: TaskArea | null;
  overdueOnly: boolean;
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function matchesTask(task: Task, filter: TaskFilter, today: string): boolean {
  if (filter.assignee && task.assigneeUid !== filter.assignee) return false;
  if (filter.area && task.area !== filter.area) return false;
  if (filter.overdueOnly && dueState(task, today) !== 'overdue') return false;
  const term = fold(filter.term.trim());
  if (!term) return true;
  const hay = fold([task.title, task.description, task.assigneeName ?? '', AREA_LABELS[task.area]].join(' '));
  return term.split(/\s+/).every((t) => hay.includes(t));
}

/** Tarefas minhas, abertas, atrasadas ou vencendo hoje: o número da sidebar. */
export function myDueCount(tasks: Task[], uid: string, today: string): number {
  return tasks.filter((t) => {
    if (t.archived || t.assigneeUid !== uid) return false;
    const s = dueState(t, today);
    return s === 'overdue' || s === 'today';
  }).length;
}

// ── apresentação ───────────────────────────────────────────────────────────

export function checklistProgress(list: ChecklistItem[]): { done: number; total: number } {
  return { done: list.filter((i) => i.done).length, total: list.length };
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Cor estável por pessoa: laranja, azul, verde, roxo, rosa, amarelo. */
const AVATAR_TONES = ['orange', 'blue', 'green', 'purple', 'pink', 'yellow'] as const;
export type AvatarTone = (typeof AVATAR_TONES)[number];

export function toneOf(uid: string): AvatarTone {
  let h = 0;
  for (const c of uid) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length]!;
}
