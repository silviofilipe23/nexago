import { billingError, changedBilling } from '../features/settings/billing-fields';
import { blockDate, cycleTitle, dunningLadder, firstInvoiceCents, nextLabel, planChangeProration, shiftMonths } from './billing';
import { DEFAULT_BILLING, type Subscription } from './models';

const sub = (p: Partial<Subscription>): Subscription =>
  ({
    id: 'e1',
    status: 'active',
    nextChargeDate: '2026-11-05',
    overdueSince: null,
    pausedUntil: null,
    cancelAt: null,
    priceCents: 32000,
    ...p,
  }) as Subscription;

describe('cobrança recorrente (mesmas contas do servidor)', () => {
  it('proporcional do 1º mês até o vencimento fixo', () => {
    const f = firstInvoiceCents(32000, DEFAULT_BILLING, '2026-10-20');
    expect(f).toEqual({ cents: Math.round((32000 * 16) / 31), prorated: true, days: 16, cycleDays: 31, nextCharge: '2026-11-05' });
    expect(firstInvoiceCents(32000, { ...DEFAULT_BILLING, firstMonth: 'full' }, '2026-10-20').cents).toBe(32000);
    expect(firstInvoiceCents(32000, { ...DEFAULT_BILLING, billingDayMode: 'enrollment' }, '2026-10-20').nextCharge).toBe('2026-11-20');
  });

  it('troca de plano: (420 − 320) × 15/31; downgrade não devolve', () => {
    expect(planChangeProration(32000, 42000, '2026-10-21', '2026-11-05', 5)).toEqual({ cents: 4839, days: 15, cycleDays: 31 });
    expect(planChangeProration(42000, 32000, '2026-10-21', '2026-11-05', 5).cents).toBe(0);
    expect(shiftMonths('2026-01-31', 1, 31)).toBe('2026-02-28');
  });

  it('régua segue a política (sem bloqueio, avisar só)', () => {
    expect(dunningLadder(DEFAULT_BILLING).map((s) => s.day)).toEqual(['D−3', 'D0', 'D+1', 'D+7', 'D+15', 'D+20', 'D+45']);
    const noBlock = dunningLadder({ ...DEFAULT_BILLING, blockAfterDays: 0, suspendAction: 'notify' });
    expect(noBlock.map((s) => s.day)).toEqual(['D−3', 'D0', 'D+1', 'D+7', 'D+45']);
    expect(noBlock[4]!.title).toBe('Aviso final');
    expect(blockDate(DEFAULT_BILLING, '2026-10-05')).toBe('2026-10-25');
  });

  it('"Próxima" da lista por situação', () => {
    expect(nextLabel(sub({}), '2026-10-22')).toEqual({ text: '05 nov', tone: '' });
    expect(nextLabel(sub({}), '2026-11-02').tone).toBe('yellow');
    expect(nextLabel(sub({ status: 'past_due', overdueSince: '2026-10-05' }), '2026-10-22')).toEqual({ text: 'Venceu 05 out', tone: 'red' });
    expect(nextLabel(sub({ status: 'canceling', cancelAt: '2026-11-05' }), '2026-10-22').text).toBe('Encerra 05 nov');
    expect(cycleTitle('2026-11')).toBe('Nov 2026');
  });

  it('aba de configurações valida como o servidor', () => {
    expect(billingError(DEFAULT_BILLING)).toBeNull();
    expect(billingError({ ...DEFAULT_BILLING, billingDay: 31 })).toContain('1 a 28');
    expect(billingError({ ...DEFAULT_BILLING, suspendAfterDays: 15 })).toContain('depois do bloqueio');
    expect(changedBilling(DEFAULT_BILLING, { ...DEFAULT_BILLING, lateFees: false })).toEqual(['lateFees']);
  });
});
