import { BOOKINGS_LIST_DAYS_AHEAD, bookingsListRange, recentBookingsRange } from './bookings-window';

describe('bookingsListRange', () => {
  it('cobre um mês para trás e dois meses à frente de hoje', () => {
    expect(bookingsListRange(new Date(2026, 10, 5))).toEqual({ fromKey: '2026-10-06', toKey: '2027-01-04' });
  });

  it('inclui os 35 dias de ocorrências do mensalista', () => {
    expect(BOOKINGS_LIST_DAYS_AHEAD).toBeGreaterThanOrEqual(35);
  });

  it('hoje está dentro da janela', () => {
    const today = new Date(2026, 10, 5);
    const { fromKey, toKey } = bookingsListRange(today);
    expect(fromKey <= '2026-11-05' && '2026-11-05' <= toKey).toBeTrue();
  });
});

describe('recentBookingsRange', () => {
  it('Início: de 7 dias atrás até hoje (vira o ano sem quebrar)', () => {
    expect(recentBookingsRange(7, new Date(2027, 0, 3))).toEqual({ fromKey: '2026-12-27', toKey: '2027-01-03' });
  });
});
