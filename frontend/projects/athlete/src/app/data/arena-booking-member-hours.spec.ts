import { memberHoursFromQuote } from './arena-bookings-repository';

describe('banco de horas na cotação (portal do atleta)', () => {
  it('lê o banco aplicado', () => {
    expect(
      memberHoursFromQuote({
        memberHoursWeeklyMinutes: 180,
        memberHoursAvailableMinutes: 120,
        memberHoursMinutes: 60,
        memberHoursDiscountReais: 150,
        memberHoursPlanName: ' Mensal 3h ',
        memberHoursBlockedReason: null,
      }),
    ).toEqual({
      memberHoursWeeklyMinutes: 180,
      memberHoursAvailableMinutes: 120,
      memberHoursMinutes: 60,
      memberHoursDiscountReais: 150,
      memberHoursPlanName: 'Mensal 3h',
      memberHoursBlockedReason: null,
    });
  });

  it('lê o motivo de não ter coberto', () => {
    const overdue = memberHoursFromQuote({ memberHoursWeeklyMinutes: 180, memberHoursAvailableMinutes: 180, memberHoursBlockedReason: 'overdue' });
    expect(overdue.memberHoursBlockedReason).toBe('overdue');
    expect(overdue.memberHoursMinutes).toBe(0);
    expect(memberHoursFromQuote({ memberHoursWeeklyMinutes: 180, memberHoursBlockedReason: 'exhausted' }).memberHoursBlockedReason).toBe(
      'exhausted',
    );
    expect(memberHoursFromQuote({ memberHoursWeeklyMinutes: 180, memberHoursBlockedReason: 'outro' }).memberHoursBlockedReason).toBeNull();
  });

  it('sem banco na semana ou servidor antigo: tudo zerado', () => {
    const empty = {
      memberHoursWeeklyMinutes: 0,
      memberHoursAvailableMinutes: 0,
      memberHoursMinutes: 0,
      memberHoursDiscountReais: 0,
      memberHoursPlanName: null,
      memberHoursBlockedReason: null,
    };
    expect(memberHoursFromQuote({})).toEqual(empty);
    expect(memberHoursFromQuote({ memberHoursWeeklyMinutes: 0, memberHoursMinutes: 60, memberHoursBlockedReason: 'overdue' })).toEqual(empty);
  });
});
