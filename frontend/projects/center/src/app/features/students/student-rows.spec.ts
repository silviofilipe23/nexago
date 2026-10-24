import type { ClassSession, Enrollment, Invoice, Student } from '../../domain/models';
import { ageOn, buildStudentRows, financeOf, matchesFilter, matchesSearch, recentAttendance } from './student-rows';

function student(p: Partial<Student> = {}): Student {
  return {
    id: 's1', uid: null, name: 'José Silva', email: 'jose@x.com', phone: '', status: 'active', isMinor: false,
    birthDate: null, guardian: null, lgpdConsentAt: null, imageUseAllowed: false, notifyClasses: true,
    emergencyName: '', emergencyPhone: '', medicalNotes: '', makeupCredits: 0, billingHold: false, createdAt: null, ...p,
  };
}

function invoice(p: Partial<Invoice>): Invoice {
  return {
    id: 'i', studentId: 's1', enrollmentId: null, payerName: '', reference: '', amountCents: 100, dueDate: '2026-10-10',
    status: 'pending', method: null, providerRef: '', providerUrl: '', providerStatus: '', providerApproved: false, events: [], approvedAt: null, refundedCents: 0, subscriptionId: null, cycle: '', createdAt: null, ...p,
  };
}

function session(p: Partial<ClassSession>): ClassSession {
  return {
    id: 'x', classId: 'c1', className: 'BT A', programId: 'p', date: '2026-10-20', startTime: '19:00', durationMin: 60,
    coachUid: '', coachName: '', locationId: '', locationName: '', locationAddress: '', courtId: '', courtName: '', status: 'done', changed: false, changeReason: '',
    attendance: {}, makeupStudentIds: [], finalizedAt: null, finalizedByName: '', attendanceLog: [], effectsApplied: {}, rsvps: {}, attendanceByStudent: {}, trials: [], ...p,
  };
}

function enrollment(p: Partial<Enrollment>): Enrollment {
  return {
    id: 'e', studentId: 's1', studentName: '', classId: 'c1', className: 'BT A', planId: null, contract: null, status: 'active',
    startDate: '2026-10-01', holdUntil: null, pausedUntil: null, pauseReason: '', creditsLeft: null, waitlistedAt: null,
    offeredAt: null, offeredAuto: false, notifyOnSeat: false, seatReleased: false, awaitingSeat: false, endedAt: null, createdAt: null, createdByName: '', ...p,
  };
}

describe('student-rows', () => {
  it('financeOf: atrasado vence aguardando, que vence em dia', () => {
    const today = '2026-10-22';
    expect(financeOf([], today)).toBeNull();
    expect(financeOf([invoice({ status: 'approved' })], today)?.state).toBe('ok');
    expect(financeOf([invoice({ dueDate: '2026-11-05' })], today)?.state).toBe('pending');
    const late = financeOf([invoice({ dueDate: '2026-11-05' }), invoice({ dueDate: '2026-10-12' })], today);
    expect(late?.state).toBe('late');
    expect(late?.note).toBe('Venceu 12 out');
    expect(financeOf([invoice({ status: 'cancelled', dueDate: '2026-01-01' })], today)).toBeNull();
  });

  it('buildStudentRows: turma e plano das matrículas que ocupam vaga; sem financeiro sem permissão', () => {
    const rows = buildStudentRows(
      [student()],
      [enrollment({ status: 'cancelled', className: 'Velha' }), enrollment({ className: 'BT B' })],
      [session({ attendance: { s1: 'present' } }), session({ attendance: { s1: 'absent' } })],
      null,
      '2026-10-22',
    );
    expect(rows[0]!.className).toBe('BT B');
    expect(rows[0]!.planName).toBe('—');
    expect(rows[0]!.freq).toBe(50);
    expect(rows[0]!.finance).toBeNull();
  });

  it('filtros e busca sem acento', () => {
    const [row] = buildStudentRows([student({ isMinor: true, makeupCredits: 2 })], [], [], [], '2026-10-22');
    expect(matchesFilter(row!, 'minors')).toBeTrue();
    expect(matchesFilter(row!, 'credits')).toBeTrue();
    expect(matchesFilter(row!, 'invited')).toBeFalse();
    expect(matchesSearch(row!.student, 'jose')).toBeTrue();
    expect(matchesSearch(row!.student, 'JOSE@X')).toBeTrue();
    expect(matchesSearch(row!.student, 'maria')).toBeFalse();
  });

  it('recentAttendance: últimos 30 dias, sem canceladas, em ordem', () => {
    const cells = recentAttendance(
      [
        session({ date: '2026-10-20', attendance: { s1: 'excused' } }),
        session({ date: '2026-10-01', attendance: { s1: 'present' } }),
        session({ date: '2026-09-01', attendance: { s1: 'present' } }),
        session({ date: '2026-10-15', status: 'cancelled', attendance: { s1: 'present' } }),
      ],
      's1',
      '2026-10-22',
    );
    expect(cells.map((c) => c.mark)).toEqual(['present', 'excused']);
  });

  it('ageOn conta aniversário', () => {
    expect(ageOn('2016-10-23', '2026-10-22')).toBe(9);
    expect(ageOn('2016-10-22', '2026-10-22')).toBe(10);
    expect(ageOn(null, '2026-10-22')).toBeNull();
  });
});
