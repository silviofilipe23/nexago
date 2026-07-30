import { weekDatesFor } from './agenda-week-math';

describe('weekDatesFor', () => {
  it('quinta no meio da semana retorna segunda a domingo da mesma semana', () => {
    const week = weekDatesFor(new Date(2026, 6, 30)); // quinta 30/07/2026
    expect(week.map((d) => d.dateKey)).toEqual([
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ]);
  });

  it('já sendo segunda, retorna ela mesma como primeiro dia', () => {
    const week = weekDatesFor(new Date(2026, 6, 27)); // segunda 27/07/2026
    expect(week[0].dateKey).toBe('2026-07-27');
    expect(week[6].dateKey).toBe('2026-08-02');
  });

  it('já sendo domingo, retorna ela mesma como último dia', () => {
    const week = weekDatesFor(new Date(2026, 7, 2)); // domingo 02/08/2026
    expect(week[0].dateKey).toBe('2026-07-27');
    expect(week[6].dateKey).toBe('2026-08-02');
  });

  it('vira o ano corretamente', () => {
    const week = weekDatesFor(new Date(2026, 11, 31)); // quinta 31/12/2026
    expect(week.map((d) => d.dateKey)).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
  });

  it('marca isToday só no dia que bate com a data atual real', () => {
    const today = new Date();
    const week = weekDatesFor(today);
    const todayEntries = week.filter((d) => d.isToday);
    expect(todayEntries.length).toBe(1);
    const expectedKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(todayEntries[0].dateKey).toBe(expectedKey);
  });
});
