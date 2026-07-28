import { buildMonthGrid, formatDateKeyPtBr, shiftMonth } from './date-range-picker-math';

describe('buildMonthGrid', () => {
  it('julho/2026 começa na quarta (30/06) e tem 6 linhas x 7 colunas', () => {
    const grid = buildMonthGrid(2026, 7);
    expect(grid.length).toBe(42);
    expect(grid[0].dateKey).toBe('2026-06-29'); // segunda anterior ao 1º (quarta)
    expect(grid[0].inMonth).toBe(false);
  });

  it('marca inMonth true só pros dias do mês pedido', () => {
    const grid = buildMonthGrid(2026, 7);
    const julyDays = grid.filter((d) => d.inMonth);
    expect(julyDays.length).toBe(31);
    expect(julyDays[0].dateKey).toBe('2026-07-01');
    expect(julyDays[julyDays.length - 1].dateKey).toBe('2026-07-31');
  });

  it('fevereiro bissexto tem 29 dias no mês', () => {
    const grid = buildMonthGrid(2028, 2);
    expect(grid.filter((d) => d.inMonth).length).toBe(29);
  });
});

describe('shiftMonth', () => {
  it('avança e atravessa o ano', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });

  it('volta e atravessa o ano', () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('dentro do mesmo ano', () => {
    expect(shiftMonth(2026, 7, 1)).toEqual({ year: 2026, month: 8 });
  });
});

describe('formatDateKeyPtBr', () => {
  it('formata YYYY-MM-DD como DD/MM/AAAA', () => {
    expect(formatDateKeyPtBr('2026-07-28')).toBe('28/07/2026');
  });
});
