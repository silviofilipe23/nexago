import { attendanceRate } from './attendance-stats';
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
