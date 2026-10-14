import {
  centsToInput,
  currentMonth,
  formatBRL,
  formatDate,
  formatShortDate,
  fromCents,
  monthRange,
  shiftMonth,
  toCents,
} from './finance-rules';

describe('toCents', () => {
  it('converte formatos comuns de reais', () => {
    expect(toCents('180')).toBe(18000);
    expect(toCents('180,50')).toBe(18050);
    expect(toCents('R$ 1.234,56')).toBe(123456);
    expect(toCents('19.90')).toBe(1990);
    expect(toCents('1.234')).toBe(123400);
    expect(toCents('0,1')).toBe(10);
  });

  it('recusa o que não é valor', () => {
    expect(toCents('')).toBeNull();
    expect(toCents('abc')).toBeNull();
    expect(toCents('12,345')).toBeNull();
    expect(toCents('-5')).toBeNull();
  });

  it('não acumula erro de ponto flutuante', () => {
    expect(toCents('0,10')! + toCents('0,20')!).toBe(30);
    expect(toCents('19,90')).toBe(1990);
  });
});

describe('fromCents / formatBRL / centsToInput', () => {
  it('formata centavos em reais', () => {
    expect(fromCents(18050)).toBe('180,50');
    expect(fromCents(123456)).toBe('1.234,56');
    expect(fromCents(5)).toBe('0,05');
    expect(formatBRL(1990)).toBe('R$ 19,90');
  });

  it('centsToInput não usa separador de milhar', () => {
    expect(centsToInput(123456)).toBe('1234,56');
  });
});

describe('datas', () => {
  it('formatDate e formatShortDate', () => {
    expect(formatDate('2026-11-05')).toBe('05/11/2026');
    expect(formatShortDate('2026-11-05')).toBe('05/11');
  });

  it('currentMonth usa o dia local', () => {
    expect(currentMonth(new Date(2026, 9, 14, 23, 30))).toBe('2026-10');
  });

  it('shiftMonth atravessa o ano', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('monthRange vale até fevereiro (comparação é de texto)', () => {
    expect(monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-31' });
  });
});
