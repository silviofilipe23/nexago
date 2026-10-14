import { attendanceRate, defaultAttendance, isPresent, sameAttendance, summarizeAttendance } from './attendance-stats';
import type { Training } from './trainings.service';

function training(overrides: Partial<Training> = {}): Training {
  return {
    id: 't1',
    squadId: 's1',
    title: 'Treino',
    date: '2026-07-01',
    startTime: '19:00',
    endTime: '21:00',
    location: '',
    materials: '',
    exercises: [],
    status: 'realizado',
    attendance: {},
    seriesId: null,
    ...overrides,
  };
}

describe('attendanceRate', () => {
  it('returns null when the athlete has no completed training recorded', () => {
    const trainings = [training({ status: 'agendado', attendance: {} })];
    expect(attendanceRate('a1', trainings)).toBeNull();
  });

  it('returns 100 when the athlete was present in every completed training', () => {
    const trainings = [
      training({ id: 't1', attendance: { a1: 'presente' } }),
      training({ id: 't2', attendance: { a1: 'presente' } }),
    ];
    expect(attendanceRate('a1', trainings)).toBe(100);
  });

  it('counts atrasado as attendance and ausente/justificado as absence', () => {
    const trainings = [
      training({ id: 't1', attendance: { a1: 'presente' } }),
      training({ id: 't2', attendance: { a1: 'atrasado' } }),
      training({ id: 't3', attendance: { a1: 'ausente' } }),
      training({ id: 't4', attendance: { a1: 'justificado' } }),
    ];
    expect(attendanceRate('a1', trainings)).toBe(50);
  });

  it('ignores completed trainings where the athlete has no attendance entry', () => {
    const trainings = [
      training({ id: 't1', attendance: { a1: 'presente' } }),
      training({ id: 't2', attendance: { a2: 'presente' } }),
    ];
    expect(attendanceRate('a1', trainings)).toBe(100);
  });

  it('ignores trainings that are not realizado, even if attendance is present', () => {
    const trainings = [training({ status: 'agendado', attendance: { a1: 'presente' } })];
    expect(attendanceRate('a1', trainings)).toBeNull();
  });
});

describe('isPresent', () => {
  it('conta presente e atrasado', () => {
    expect(isPresent('presente')).toBe(true);
    expect(isPresent('atrasado')).toBe(true);
  });
  it('não conta ausente nem justificado', () => {
    expect(isPresent('ausente')).toBe(false);
    expect(isPresent('justificado')).toBe(false);
  });
});

describe('defaultAttendance', () => {
  it('marca todo o elenco como presente', () => {
    expect(defaultAttendance(['a1', 'a2'])).toEqual({ a1: 'presente', a2: 'presente' });
  });
  it('elenco vazio dá chamada vazia', () => expect(defaultAttendance([])).toEqual({}));
});

describe('summarizeAttendance', () => {
  it('conta por status e quem ficou sem marcação', () => {
    const summary = summarizeAttendance({ a1: 'presente', a2: 'ausente', a3: 'atrasado' }, ['a1', 'a2', 'a3', 'a4']);
    expect(summary).toEqual({ presente: 1, ausente: 1, atrasado: 1, justificado: 0, semMarcacao: 1 });
  });
  it('ignora quem não está mais no elenco', () => {
    const summary = summarizeAttendance({ a1: 'presente', velho: 'ausente' }, ['a1']);
    expect(summary).toEqual({ presente: 1, ausente: 0, atrasado: 0, justificado: 0, semMarcacao: 0 });
  });
});

describe('sameAttendance', () => {
  it('ignora a ordem das chaves', () => {
    expect(sameAttendance({ a: 'presente', b: 'ausente' }, { b: 'ausente', a: 'presente' })).toBe(true);
  });
  it('detecta diferença de status ou de chaves', () => {
    expect(sameAttendance({ a: 'presente' }, { a: 'ausente' })).toBe(false);
    expect(sameAttendance({ a: 'presente' }, {})).toBe(false);
  });
});
