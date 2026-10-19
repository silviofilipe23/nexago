import type { DocumentSnapshot } from 'firebase/firestore';
import {
  addDaysKey,
  arenaClassFromDoc,
  attendanceCounts,
  classScheduleLabel,
  classSessionFromDoc,
  classesOccupancy,
  endTimeFor,
  sessionLiveState,
  teacherStats,
  weekdayDateLabel,
  weekdaysLabel,
  type ArenaClass,
} from './class.model';

function fakeDoc(id: string, data: Record<string, unknown>): DocumentSnapshot {
  return { id, data: () => data } as unknown as DocumentSnapshot;
}

function makeClass(overrides: Partial<ArenaClass> = {}): ArenaClass {
  return {
    id: 'c1', arenaId: 'a1', name: 'Iniciante A', type: 'turma', sport: 'beachTennis', level: 'iniciante',
    teacherId: 't1', teacherName: 'Thiago Mendes', teacherColor: '#FF6A1A', weekdays: [1, 3],
    startTime: '07:00', endTime: '08:00', courtId: 'q1', courtName: 'Quadra 1', capacity: 6, studentCount: 6,
    startDate: '2026-10-01', endDate: null, status: 'active', notes: null, conflictDates: [], createdAt: null,
    ...overrides,
  };
}

describe('class.model rótulos', () => {
  it('dias da semana no formato do protótipo', () => {
    expect(weekdaysLabel([3, 1])).toBe('Seg e Qua');
    expect(weekdaysLabel([1, 3, 5])).toBe('Seg, Qua e Sex');
    expect(weekdaysLabel([6])).toBe('Sáb');
  });

  it('horário da turma e da aula avulsa', () => {
    expect(classScheduleLabel(makeClass())).toBe('Seg e Qua · 07:00–08:00');
    expect(classScheduleLabel(makeClass({ weekdays: [], startDate: '2026-10-21' }))).toBe('Qua 21/10 · 07:00–08:00');
    expect(weekdayDateLabel('2026-10-25')).toBe('Dom 25/10');
  });

  it('fim da aula pela duração; meia-noite vira 24:00', () => {
    expect(endTimeFor('18:00', 90)).toBe('19:30');
    expect(endTimeFor('23:30', 30)).toBe('24:00');
  });

  it('soma dias atravessando o mês', () => {
    expect(addDaysKey('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDaysKey('2026-11-02', -7)).toBe('2026-10-26');
  });
});

describe('class.model estado da aula', () => {
  const today = '2026-10-19';
  const at = (h: number, m: number) => new Date(2026, 9, 19, h, m);
  const s = { status: 'scheduled' as const, date: today, startTime: '18:00', endTime: '19:30' };

  it('próxima → em andamento → concluída pelo relógio', () => {
    expect(sessionLiveState(s, at(17, 40), today)).toBe('next');
    expect(sessionLiveState(s, at(18, 0), today)).toBe('live');
    expect(sessionLiveState(s, at(19, 30), today)).toBe('done');
  });

  it('chamada fechada e cancelada mandam no estado', () => {
    expect(sessionLiveState({ ...s, status: 'completed' }, at(18, 10), today)).toBe('done');
    expect(sessionLiveState({ ...s, status: 'canceled' }, at(17, 0), today)).toBe('canceled');
  });

  it('outros dias: passado concluído, futuro próximo', () => {
    expect(sessionLiveState({ ...s, date: '2026-10-18' }, at(8, 0), today)).toBe('done');
    expect(sessionLiveState({ ...s, date: '2026-10-20' }, at(23, 0), today)).toBe('next');
  });
});

describe('class.model chamada e ocupação', () => {
  it('conta quem tem marca e quem falta marcar, incluindo quem já saiu da turma', () => {
    const counts = attendanceCounts(
      { attendance: { a: { mark: 'present', name: 'A' }, b: { mark: 'absent', name: 'B' }, x: { mark: 'excused', name: 'X' } } },
      ['a', 'b', 'c'],
    );
    expect(counts).toEqual({ present: 1, absent: 1, excused: 1, unmarked: 1 });
  });

  it('ocupação só das turmas ativas recorrentes', () => {
    const occ = classesOccupancy([
      makeClass({ studentCount: 5, capacity: 6 }),
      makeClass({ id: 'c2', studentCount: 3, capacity: 6 }),
      makeClass({ id: 'c3', status: 'paused', studentCount: 0, capacity: 10 }),
      makeClass({ id: 'c4', weekdays: [], studentCount: 1, capacity: 1 }),
    ]);
    expect(occ).toEqual({ students: 8, capacity: 12, pct: 67 });
  });

  it('aulas por semana e ocupação por professor', () => {
    const stats = teacherStats([
      makeClass({ weekdays: [1, 3], studentCount: 6, capacity: 6 }),
      makeClass({ id: 'c2', weekdays: [2, 4], studentCount: 3, capacity: 6 }),
      makeClass({ id: 'c3', teacherId: 't2', weekdays: [6], studentCount: 9, capacity: 10 }),
    ]);
    expect(stats.get('t1')).toEqual({ teacherId: 't1', classesPerWeek: 4, students: 9, capacity: 12, occupancyPct: 75 });
    expect(stats.get('t2')?.occupancyPct).toBe(90);
  });
});

describe('class.model parse', () => {
  it('turma com valores fora do contrato cai nos padrões', () => {
    const cls = arenaClassFromDoc(fakeDoc('c9', { name: 'X', type: 'outro', level: '??', weekdays: [1, 9, '3'], status: 'x' }));
    expect(cls.type).toBe('turma');
    expect(cls.level).toBe('livre');
    expect(cls.weekdays).toEqual([1, 3]);
    expect(cls.status).toBe('active');
  });

  it('aula descarta marcas inválidas da chamada', () => {
    const s = classSessionFromDoc(
      fakeDoc('class_c1_2026-10-19', {
        attendance: { a: { mark: 'present', name: 'Carla' }, b: { mark: 'talvez' }, c: null },
        status: 'completed',
      }),
    );
    expect(Object.keys(s.attendance)).toEqual(['a']);
    expect(s.status).toBe('completed');
  });
});
