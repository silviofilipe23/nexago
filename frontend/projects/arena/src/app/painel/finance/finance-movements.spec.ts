import { formatMovementDate } from '../stock/product.model';
import { buildDailyTotals, filterMovementsByPeriod, mergeFinanceMovements, movementStatusLabel, periodRange } from './finance-movements';
import type { ArenaLedgerEntry, ArenaWithdrawalItem, FinanceMovement } from './finance.model';

describe('mergeFinanceMovements', () => {
  const ledgerEntry: ArenaLedgerEntry = {
    id: 'l1',
    bookingId: 'b1',
    grossReais: 100,
    netReais: 95,
    platformFeeReais: 5,
    createdAt: new Date('2026-07-14T09:00:00'),
    booking: { courtName: 'Quadra 1', customerLabel: 'João S.' },
  };

  const withdrawal: ArenaWithdrawalItem = {
    id: 'w1',
    amountReais: 150,
    status: 'pending',
    pixKey: '9b1213f1-3790-4a11-9c00-abcde',
    createdAt: new Date('2026-07-13T14:00:00'),
  };

  it('sorts credits and debits together by date, newest first', () => {
    const result = mergeFinanceMovements([ledgerEntry], [withdrawal]);
    expect(result.map((m) => m.id)).toEqual(['ledger_l1', 'withdrawal_w1']);
  });

  it('labels a credit with the court name and net amount', () => {
    const [credit] = mergeFinanceMovements([ledgerEntry], []);
    expect(credit!.label).toBe('Reserva · Quadra 1');
    expect(credit!.sub).toBe('João S.');
    expect(credit!.amountReais).toBe(95);
    expect(credit!.platformFeeReais).toBe(5);
    expect(credit!.type).toBe('credit');
    expect(credit!.status).toBe('ok');
    expect(credit!.dateLabel).toBe(formatMovementDate(ledgerEntry.createdAt ?? undefined));
  });

  it('falls back to a generic label when the booking is missing', () => {
    const orphan: ArenaLedgerEntry = { ...ledgerEntry, booking: null };
    const [credit] = mergeFinanceMovements([orphan], []);
    expect(credit!.label).toBe('Reserva');
    expect(credit!.sub).toBe('Detalhe indisponível');
  });

  it('maps withdrawal status to movement status and masks the PIX key', () => {
    const [debit] = mergeFinanceMovements([], [withdrawal]);
    expect(debit!.status).toBe('pend');
    expect(debit!.label).toBe('Saque PIX');
    expect(debit!.type).toBe('debit');
    expect(debit!.platformFeeReais).toBe(0);
    expect(debit!.sub).toBe('9b1213f1…');
  });
});

describe('movementStatusLabel', () => {
  it('distinguishes "Recebido" (credit) from "Enviado" (debit) for the same ok status', () => {
    expect(movementStatusLabel({ type: 'credit', status: 'ok' })).toBe('Recebido');
    expect(movementStatusLabel({ type: 'debit', status: 'ok' })).toBe('Enviado');
  });

  it('uses a shared label for pending/failed regardless of type', () => {
    expect(movementStatusLabel({ type: 'credit', status: 'pend' })).toBe('Pendente');
    expect(movementStatusLabel({ type: 'debit', status: 'fail' })).toBe('Falhou');
  });
});

describe('periodRange', () => {
  const now = new Date('2026-07-14T15:00:00');

  it('covers the last 7 days including today for "7d"', () => {
    const { start, end } = periodRange('7d', now);
    expect(start).toEqual(new Date(2026, 6, 8));
    expect(end.getDate()).toBe(14);
  });

  it('covers month-to-date for "month"', () => {
    const { start } = periodRange('month', now);
    expect(start).toEqual(new Date(2026, 6, 1));
  });

  it('covers the whole previous calendar month for "lastMonth"', () => {
    const { start, end } = periodRange('lastMonth', now);
    expect(start).toEqual(new Date(2026, 5, 1));
    expect(end.getMonth()).toBe(5);
    expect(end.getDate()).toBe(30);
  });
});

describe('filterMovementsByPeriod', () => {
  const now = new Date('2026-07-14T15:00:00');
  const inRange: FinanceMovement = {
    id: 'a',
    type: 'credit',
    amountReais: 50,
    platformFeeReais: 2.5,
    label: 'Reserva',
    sub: '',
    dateLabel: '',
    createdAt: new Date('2026-07-10T10:00:00'),
    status: 'ok',
  };
  const outOfRange: FinanceMovement = { ...inRange, id: 'b', createdAt: new Date('2026-05-01T10:00:00') };

  it('keeps only movements inside the period', () => {
    const result = filterMovementsByPeriod([inRange, outOfRange], '30d', now);
    expect(result.map((m) => m.id)).toEqual(['a']);
  });
});

describe('buildDailyTotals', () => {
  const now = new Date('2026-07-14T15:00:00');
  const credit: FinanceMovement = {
    id: 'a',
    type: 'credit',
    amountReais: 60,
    platformFeeReais: 3,
    label: '',
    sub: '',
    dateLabel: '',
    createdAt: new Date('2026-07-14T09:00:00'),
    status: 'ok',
  };
  const debit: FinanceMovement = { ...credit, id: 'b', type: 'debit' };

  it('returns exactly `days` buckets', () => {
    expect(buildDailyTotals([], 7, now).length).toBe(7);
  });

  it('adds credit amounts to the matching day bucket (today = last bucket) and ignores debits', () => {
    const result = buildDailyTotals([credit, debit], 7, now);
    expect(result[6]!.revenue).toBe(60);
    expect(result[6]!.reservations).toBe(1);
  });
});
