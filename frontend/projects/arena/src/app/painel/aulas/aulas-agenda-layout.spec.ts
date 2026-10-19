import { agendaHourRange, layoutDayBlocks } from './aulas-agenda-layout';
import { studentFrequency } from './panel-aula-class-detail.component';
import { buildRoster } from './panel-aula-session.component';
import type { ClassSession, ClassStudent } from './class.model';

describe('layoutDayBlocks', () => {
  it('aulas que se cruzam dividem a coluna; a seguinte volta à largura cheia', () => {
    const out = layoutDayBlocks([
      { id: 'volei', startTime: '18:00', endTime: '19:30' },
      { id: 'diego', startTime: '19:00', endTime: '20:00' },
      { id: 'cedo', startTime: '07:00', endTime: '08:00' },
      { id: 'noite', startTime: '20:00', endTime: '21:00' },
    ]);
    const byId = new Map(out.map((b) => [b.id, b]));
    expect(byId.get('cedo')).toEqual(jasmine.objectContaining({ lane: 0, lanes: 1 }));
    expect(byId.get('volei')).toEqual(jasmine.objectContaining({ lane: 0, lanes: 2 }));
    expect(byId.get('diego')).toEqual(jasmine.objectContaining({ lane: 1, lanes: 2 }));
    expect(byId.get('noite')).toEqual(jasmine.objectContaining({ lane: 0, lanes: 1 }));
  });

  it('reaproveita a faixa que vagou dentro do mesmo grupo', () => {
    const out = layoutDayBlocks([
      { id: 'a', startTime: '08:00', endTime: '10:00' },
      { id: 'b', startTime: '08:00', endTime: '09:00' },
      { id: 'c', startTime: '09:00', endTime: '10:00' },
    ]);
    const byId = new Map(out.map((b) => [b.id, b]));
    expect(byId.get('c')!.lane).toBe(byId.get('b')!.lane);
    expect(out.every((b) => b.lanes === 2)).toBeTrue();
  });

  it('janela padrão 07–21, esticada para caber aula cedo ou tarde', () => {
    expect(agendaHourRange([])).toEqual([7, 21]);
    expect(agendaHourRange([{ id: 'x', startTime: '06:30', endTime: '07:30' }, { id: 'y', startTime: '21:00', endTime: '22:15' }])).toEqual([6, 23]);
  });
});

function session(attendance: ClassSession['attendance'], extras: ClassSession['extras'] = {}, date = '2026-10-20'): Pick<ClassSession, 'attendance' | 'extras' | 'date'> {
  return { attendance, extras, date };
}

function student(
  id: string,
  name: string,
  status: 'active' | 'paused' | 'removed' = 'active',
  athleteId: string | null = null,
  weekdays: number[] | null = null,
): ClassStudent {
  return { id, athleteId, name, phone: null, photoUrl: null, status, enrolledAt: null, enrollmentId: null, weekdays, planName: null };
}

describe('buildRoster (chamada)', () => {
  it('lista os ativos e mantém quem saiu mas já tem presença nesta aula', () => {
    const rows = buildRoster(
      [student('u1', 'Carla', 'active', 'u1'), student('g1', 'Bruno', 'removed'), student('g2', 'Zeca', 'removed')],
      session({ g1: { mark: 'present', name: 'Bruno' }, old: { mark: 'absent', name: 'Ana' } }),
    );
    expect(rows.map((r) => r.name)).toEqual(['Ana', 'Bruno', 'Carla']);
    expect(rows.find((r) => r.id === 'u1')).toEqual({ id: 'u1', name: 'Carla', hasAccount: true, removed: false, kind: 'regular' });
    expect(rows.find((r) => r.id === 'g1')!.removed).toBeTrue();
  });
});

describe('buildRoster (fase 2)', () => {
  it('terça só lista quem faz terça; pausado sai; encaixe entra com o tipo', () => {
    // 2026-10-20 é terça (2).
    const rows = buildRoster(
      [
        student('ter', 'Só terça', 'active', null, [2]),
        student('qui', 'Só quinta', 'active', null, [4]),
        student('todos', 'Sem dias (fase 1)'),
        student('pausa', 'Pausado', 'paused', null, [2]),
      ],
      session({}, { rep: { name: 'Lia', kind: 'makeup', creditId: 'cr1', athleteId: 'u9' } }),
    );
    expect(rows.map((r) => r.id).sort()).toEqual(['rep', 'ter', 'todos']);
    expect(rows.find((r) => r.id === 'rep')!.kind).toBe('makeup');
  });
});

describe('studentFrequency', () => {
  it('presença sobre aulas com marca; sem marca nenhuma = null', () => {
    const sessions = [
      { attendance: { u1: { mark: 'present', name: '' } } },
      { attendance: { u1: { mark: 'excused', name: '' } } },
      { attendance: { u1: { mark: 'present', name: '' } } },
      { attendance: {} },
    ] as unknown as ClassSession[];
    expect(studentFrequency(sessions, 'u1')).toBe(67);
    expect(studentFrequency(sessions, 'u2')).toBeNull();
  });
});
