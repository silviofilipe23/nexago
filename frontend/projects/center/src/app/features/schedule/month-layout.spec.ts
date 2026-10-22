import { monthCells, monthRange, monthWeeks } from './month-layout';

describe('month-layout', () => {
  it('cobre o mês em semanas de segunda a domingo', () => {
    // Outubro/2026: dia 1 é quinta; dia 31 é sábado.
    const w = monthWeeks('2026-10-22');
    expect(w.length).toBe(5);
    expect(w[0]![0]).toBe('2026-09-28');
    expect(w[4]![6]).toBe('2026-11-01');
    expect(monthRange('2026-10-01')).toEqual({ first: '2026-09-28', last: '2026-11-01' });
  });

  it('mês que começa na segunda não ganha semana vazia antes', () => {
    // Fevereiro/2027 começa na segunda e tem 4 semanas cheias.
    const w = monthWeeks('2027-02-10');
    expect(w[0]![0]).toBe('2027-02-01');
    expect(w.length).toBe(4);
  });

  it('ordena por horário, corta em 3 e conta o resto', () => {
    const it = (date: string, startTime: string) => ({ date, startTime });
    const cells = monthCells('2026-10-22', [it('2026-10-22', '19:00'), it('2026-10-22', '07:00'), it('2026-10-22', '08:00'), it('2026-10-22', '20:00'), it('2026-09-28', '07:00')]);
    const thu = cells.flat().find((c) => c.day === '2026-10-22')!;
    expect(thu.items.map((x) => x.startTime)).toEqual(['07:00', '08:00', '19:00']);
    expect(thu.more).toBe(1);
    expect(cells[0]![0]!.outside).toBeTrue();
    expect(cells[0]![0]!.items.length).toBe(1);
  });
});
