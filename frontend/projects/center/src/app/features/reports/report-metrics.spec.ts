import type { ClassSession, Enrollment, Invoice, TrainingClass } from '../../domain/models';
import { classRows, compactBRL, delinquency, monthlySeries, periodRange, reportsCsv, sessionStats } from './report-metrics';

const inv = (p: Partial<Invoice>) =>
  ({ id: 'i', studentId: null, enrollmentId: null, payerName: 'A', reference: '', amountCents: 10000, dueDate: '2026-10-05', status: 'approved', method: null, providerRef: '', providerUrl: '', providerStatus: '', providerApproved: false, events: [], approvedAt: null, refundedCents: 0, subscriptionId: null, cycle: '', createdAt: null, ...p }) as Invoice;
const ses = (p: Partial<ClassSession>) => ({ id: 's', classId: 'c1', date: '2026-10-10', status: 'done', attendance: {}, ...p }) as ClassSession;

describe('report-metrics', () => {
  it('período: início e meses tocados', () => {
    expect(periodRange('30d', '2026-10-22')).toEqual({ from: '2026-09-23', to: '2026-10-22', months: ['2026-09', '2026-10'] });
    expect(periodRange('6m', '2026-10-22').months).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  });

  it('série cobrado × recebido só conta aprovado', () => {
    const s = monthlySeries(
      [inv({}), inv({ status: 'pending', dueDate: '2026-10-30' }), inv({ refundedCents: 2000 }), inv({ dueDate: '2026-09-05' }), inv({ status: 'cancelled' })],
      ['2026-09', '2026-10'],
      '2026-10-22',
    );
    expect(s[0]).toEqual({ month: '2026-09', label: 'Set', chargedCents: 10000, receivedCents: 10000 });
    expect(s[1]!.chargedCents).toBe(30000);
    expect(s[1]!.receivedCents).toBe(18000);
  });

  it('estatísticas de aula ignoram futuro', () => {
    const st = sessionStats(
      [
        ses({ attendance: { a: 'present', b: 'absent' } }),
        ses({ status: 'cancelled' }),
        ses({ status: 'scheduled', date: '2026-10-30' }),
        ses({ attendance: { a: 'present', b: 'excused' } }),
      ],
      '2026-10-22',
    );
    expect(st).toEqual({ planned: 3, done: 2, cancelled: 1, presence: 50, excusedPct: 25, absentPct: 25 });
  });

  it('inadimplência do mês com uma casa', () => {
    expect(delinquency([inv({ status: 'pending', dueDate: '2026-10-01' }), inv({}), inv({})], '2026-10', '2026-10-22')).toBe(33.3);
    expect(delinquency([], '2026-10', '2026-10-22')).toBeNull();
  });

  it('por turma: ocupação, presença e receita do mês via matrícula', () => {
    const classes = [
      { id: 'c1', name: 'BT A', status: 'active', capacity: 8, seatsTaken: 6 },
      { id: 'c2', name: 'Velha', status: 'closed', capacity: 8, seatsTaken: 0 },
    ] as TrainingClass[];
    const enrollments = [{ id: 'e1', classId: 'c1' }] as Enrollment[];
    const rows = classRows(
      classes,
      [ses({ attendance: { a: 'present' } })],
      enrollments,
      [inv({ enrollmentId: 'e1' }), inv({ enrollmentId: 'e1', dueDate: '2026-09-05' }), inv({ enrollmentId: 'e1', status: 'pending' })],
      '2026-10',
      '2026-10-22',
    );
    expect(rows.length).toBe(1);
    expect(rows[0]).toEqual(jasmine.objectContaining({ occupancy: 75, presence: 100, revenueCents: 10000 }));
    const csv = reportsCsv([{ month: '2026-10', label: 'Out', chargedCents: 100, receivedCents: 50 }], rows, 'Outubro 2026');
    expect(csv[1]).toEqual(['2026-10', '1,00', '0,50']);
    expect(csv[4]).toEqual(['BT A', '75%', '100%', '100,00']);
  });

  it('rótulo compacto', () => {
    expect(compactBRL(32000)).toBe('R$ 320');
    expect(compactBRL(386400)).toBe('3,9 mil');
  });
});
