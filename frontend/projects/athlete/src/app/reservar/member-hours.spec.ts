import { formatMemberHours, memberHoursBalanceLabel, memberHoursBlockedNotice } from './member-hours';

describe('banco de horas do mensalista (rótulos)', () => {
  it('formata as horas', () => {
    expect(formatMemberHours(90)).toBe('1h30');
    expect(formatMemberHours(60)).toBe('1h');
    expect(formatMemberHours(30)).toBe('30min');
    expect(formatMemberHours(125)).toBe('2h05');
  });

  it('saldo da semana desconta esta reserva', () => {
    expect(memberHoursBalanceLabel(180, 60, 180)).toBe('Restam 2h de 3h nesta semana');
    expect(memberHoursBalanceLabel(90, 60, 180)).toBe('Restam 30min de 3h nesta semana');
    expect(memberHoursBalanceLabel(60, 60, 180)).toBe('Esta reserva usa o que restava das suas 3h desta semana.');
    expect(memberHoursBalanceLabel(0, 0, 0)).toBeNull();
  });

  it('avisa mensalidade em aberto e horas esgotadas', () => {
    expect(memberHoursBlockedNotice('overdue')).toBe('Mensalidade em aberto: esta reserva sai pelo preço normal até você pagar.');
    expect(memberHoursBlockedNotice('exhausted')).toBe('Suas horas desta semana acabaram: esta reserva sai pelo preço normal.');
    expect(memberHoursBlockedNotice('coupon_cheaper')).toBeNull();
    expect(memberHoursBlockedNotice(null)).toBeNull();
  });
});
