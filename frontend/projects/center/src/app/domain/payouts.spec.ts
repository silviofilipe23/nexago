import type { ClassSession, Invoice, TrainingClass } from './models';
import { computePayout, monthRangeOf, payRuleError, readPayRule, type PayRule } from './payouts';

const s = (id: string, p: Partial<ClassSession>): ClassSession =>
  ({ id, classId: 'k1', className: 'BT A', date: '2026-10-10', startTime: '19:00', coachUid: 'ana', status: 'done', ...p }) as ClassSession;
const inv = (id: string, p: Partial<Invoice>): Invoice =>
  ({ id, enrollmentId: 'e1', payerName: 'Bia', reference: 'Mensal · out', amountCents: 32000, refundedCents: 0, status: 'approved', approvedAt: new Date('2026-10-05T15:00:00Z'), ...p }) as Invoice;
const classes = [{ id: 'k1', coachUid: 'ana' }, { id: 'k2', coachUid: 'rui' }] as TrainingClass[];
const enrollments = [{ id: 'e1', classId: 'k1', studentName: 'Bia' }, { id: 'e2', classId: 'k2', studentName: 'Caio' }];
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

function calc(rule: PayRule, sessions: ClassSession[] = [], invoices: Invoice[] = []) {
  return computePayout({ coachUid: 'ana', rule, month: '2026-10', today: '2026-10-22', sessions, classes, enrollments, invoices, dayOf });
}

describe('repasse ao professor', () => {
  const sessions = [
    s('a', {}),
    s('b', { date: '2026-10-12' }),
    s('c', { date: '2026-10-14', status: 'cancelled' }),
    s('d', { date: '2026-10-20', status: 'scheduled' }),
    s('e', { date: '2026-10-25', status: 'scheduled' }),
    s('f', { date: '2026-10-15', coachUid: 'rui' }),
    s('g', { date: '2026-09-30' }),
    // Substituta: Ana deu a aula da turma do Rui.
    s('h', { classId: 'k2', date: '2026-10-16' }),
  ];

  it('por aula: conta só aulas dela com chamada finalizada no mês (substituição inclusa)', () => {
    const r = calc({ kind: 'per_class', amountCents: 8000, percent: 0 }, sessions);
    expect(r.classesGiven).toBe(3);
    expect(r.totalCents).toBe(24000);
    expect(r.pendingAttendance).toBe(1);
    expect(r.lines.map((l) => l.ref)).toEqual(['a', 'b', 'h']);
  });

  it('percentual: pagamentos do mês das turmas em que é titular, menos estorno', () => {
    const r = calc({ kind: 'percent', amountCents: 0, percent: 40 }, [], [
      inv('i1', {}),
      inv('i2', { refundedCents: 12000, status: 'refunded' }),
      inv('i3', { status: 'pending' }),
      inv('i4', { enrollmentId: 'e2' }),
      inv('i5', { approvedAt: new Date('2026-09-30T15:00:00Z') }),
      inv('i6', { enrollmentId: null }),
    ]);
    expect(r.baseCents).toBe(52000);
    expect(r.totalCents).toBe(20800);
    expect(r.lines.map((l) => l.ref)).toEqual(['i1', 'i2']);
  });

  it('fixo mensal e sem regra', () => {
    expect(calc({ kind: 'monthly', amountCents: 150000, percent: 0 }, sessions).totalCents).toBe(150000);
    expect(calc({ kind: 'none', amountCents: 0, percent: 0 }, sessions).totalCents).toBe(0);
  });

  it('regra lida e validada', () => {
    expect(readPayRule({ kind: 'percent', percent: 150 })).toEqual({ kind: 'percent', amountCents: 0, percent: 0 });
    expect(payRuleError({ kind: 'per_class', amountCents: 0, percent: 0 })).toContain('valor');
    expect(monthRangeOf('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});
