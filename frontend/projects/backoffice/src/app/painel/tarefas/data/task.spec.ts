import {
  byStatus,
  dueLabel,
  dueState,
  matchesTask,
  myDueCount,
  normalizeDraft,
  emptyDraft,
  orderAtEnd,
  orderFor,
  taskFromDoc,
  type Task,
  type TaskFilter,
} from './task';

function task(id: string, over: Partial<Task> = {}): Task {
  return { ...taskFromDoc(id, { title: id }), ...over };
}

const NO_FILTER: TaskFilter = { term: '', assignee: null, area: null, overdueOnly: false };

describe('tarefas: modelo', () => {
  it('lê doc com campos inválidos sem quebrar', () => {
    const t = taskFromDoc('x', { status: 'bogus', priority: 3, dueDate: '10/11/2026', checklist: [{ text: ' ' }, { text: 'a', done: true }] });
    expect(t.status).toBe('todo');
    expect(t.priority).toBe('medium');
    expect(t.dueDate).toBeNull();
    expect(t.title).toBe('Sem título');
    expect(t.checklist.map((i) => i.text)).toEqual(['a']);
  });

  it('prazo: atrasada, hoje, em breve; concluída não tem prazo', () => {
    const today = '2026-11-10';
    expect(dueState(task('a', { dueDate: '2026-11-09' }), today)).toBe('overdue');
    expect(dueState(task('a', { dueDate: today }), today)).toBe('today');
    expect(dueState(task('a', { dueDate: '2026-11-12' }), today)).toBe('soon');
    expect(dueState(task('a', { dueDate: '2026-11-20' }), today)).toBe('later');
    expect(dueState(task('a', { dueDate: '2026-11-01', status: 'done' }), today)).toBeNull();
    expect(dueLabel('2026-11-11', today)).toBe('Amanhã');
    expect(dueLabel('2026-12-01', today)).toBe('01 dez');
  });

  it('ordem: ponto médio entre vizinhos, início e fim', () => {
    const col = [task('a', { order: 1000 }), task('b', { order: 2000 }), task('c', { order: 3000 })];
    expect(orderFor(col, 'c', 'b')).toBe(1500);
    expect(orderFor(col, 'c', 'a')).toBe(0);
    expect(orderFor(col, 'a', null)).toBe(4000);
    expect(orderFor([], 'z', null)).toBe(1000);
    expect(orderAtEnd(col)).toBe(4000);
  });

  it('Concluído ordena pela conclusão mais recente', () => {
    const cols = byStatus([
      task('velha', { status: 'done', doneAt: new Date(2026, 10, 1) }),
      task('nova', { status: 'done', doneAt: new Date(2026, 10, 9) }),
      task('t2', { order: 2 }),
      task('t1', { order: 1 }),
    ]);
    expect(cols.done.map((t) => t.id)).toEqual(['nova', 'velha']);
    expect(cols.todo.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('busca ignora acento e caixa; filtros combinam', () => {
    const t = task('a', { title: 'Revisar Operação da etapa', area: 'operacao', assigneeUid: 'u1', dueDate: '2026-11-01' });
    expect(matchesTask(t, { ...NO_FILTER, term: 'operacao ETAPA' }, '2026-11-10')).toBeTrue();
    expect(matchesTask(t, { ...NO_FILTER, assignee: 'u2' }, '2026-11-10')).toBeFalse();
    expect(matchesTask(t, { ...NO_FILTER, area: 'comercial' }, '2026-11-10')).toBeFalse();
    expect(matchesTask(t, { ...NO_FILTER, overdueOnly: true }, '2026-11-10')).toBeTrue();
  });

  it('badge conta só minhas abertas atrasadas ou de hoje', () => {
    const today = '2026-11-10';
    const list = [
      task('a', { assigneeUid: 'me', dueDate: '2026-11-09' }),
      task('b', { assigneeUid: 'me', dueDate: today }),
      task('c', { assigneeUid: 'me', dueDate: '2026-11-30' }),
      task('d', { assigneeUid: 'me', dueDate: '2026-11-01', status: 'done' }),
      task('e', { assigneeUid: 'outro', dueDate: '2026-11-01' }),
    ];
    expect(myDueCount(list, 'me', today)).toBe(2);
  });

  it('normaliza o rascunho antes de gravar', () => {
    const d = normalizeDraft({
      ...emptyDraft(),
      title: '  Ligar  ',
      dueDate: 'amanhã',
      assigneeName: 'Fantasma',
      checklist: [{ id: '1', text: '  ', done: false }, { id: '2', text: ' ok ', done: true }],
    });
    expect(d.title).toBe('Ligar');
    expect(d.dueDate).toBeNull();
    expect(d.assigneeName).toBeNull();
    expect(d.checklist).toEqual([{ id: '2', text: 'ok', done: true }]);
  });
});
