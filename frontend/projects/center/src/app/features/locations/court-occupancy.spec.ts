import type { TrainingClass } from '../../domain/models';
import { courtOccupancy, OPEN_MINUTES_PER_WEEK } from './court-occupancy';

type C = Pick<TrainingClass, 'courtId' | 'status' | 'weekdays' | 'startTime' | 'durationMin'>;

const cls = (p: Partial<C>): C => ({ courtId: 'q1', status: 'active', weekdays: [2, 4], startTime: '19:00', durationMin: 60, ...p });

describe('courtOccupancy', () => {
  it('soma horas/semana das turmas ativas da quadra', () => {
    const r = courtOccupancy([cls({}), cls({ courtId: 'q2' }), cls({ status: 'draft' })], 'q1');
    expect(r.minutes).toBe(120);
    expect(r.pct).toBe(Math.round((120 / OPEN_MINUTES_PER_WEEK) * 100));
  });

  it('corta o que passa da janela 06–22h', () => {
    expect(courtOccupancy([cls({ weekdays: [1], startTime: '21:30', durationMin: 60 })], 'q1').minutes).toBe(30);
    expect(courtOccupancy([cls({ weekdays: [1], startTime: '05:00', durationMin: 90 })], 'q1').minutes).toBe(30);
  });

  it('quadra sem turma = 0%', () => {
    expect(courtOccupancy([], 'q1')).toEqual({ minutes: 0, pct: 0 });
  });
});
