import type { CenterInvite, ClassSession, Enrollment, Invoice, TrainingClass } from '../../domain/models';
import { buildPendencies, todayHeadcount, todayState } from './dashboard.utils';

function session(over: Partial<ClassSession> = {}): ClassSession {
  return {
    id: 's1', classId: 'c1', className: 'BT A', programId: 'p', date: '2026-10-22', startTime: '18:00', durationMin: 60,
    coachUid: 'u', coachName: 'Tiago M', courtId: 'q', courtName: 'Quadra 1', status: 'scheduled', changed: false,
    changeReason: '', attendance: {}, makeupStudentIds: [], finalizedAt: null, finalizedByName: '', attendanceLog: [], effectsApplied: {}, ...over,
  };
}

const cls = { capacity: 8, seatsTaken: 7 } as TrainingClass;

describe('dashboard.utils', () => {
  it('todayState segue a hora de parede', () => {
    expect(todayState(session(), '17:59')).toBe('next');
    expect(todayState(session(), '18:00')).toBe('live');
    expect(todayState(session(), '18:59')).toBe('live');
    expect(todayState(session(), '19:00')).toBe('missed');
    expect(todayState(session({ status: 'done' }), '10:00')).toBe('done');
    expect(todayState(session({ status: 'cancelled' }), '18:30')).toBe('cancelled');
  });

  it('todayHeadcount usa presença só com chamada feita', () => {
    expect(todayHeadcount(session(), cls)).toBe('7/8');
    expect(todayHeadcount(session({ makeupStudentIds: ['x'] }), cls)).toBe('7/8 + 1 rep.');
    expect(todayHeadcount(session({ status: 'done', attendance: { a: 'present', b: 'absent', c: 'present' } }), cls)).toBe('2/3');
    expect(todayHeadcount(session(), undefined)).toBe('—');
  });

  it('buildPendencies respeita fontes ocultas (null) e conta cada tipo', () => {
    const base = { today: '2026-10-22', now: new Date('2026-10-22T15:00:00Z'), formatDay: () => '18 out', classById: () => cls };
    expect(buildPendencies({ ...base, enrollments: null, invoices: null, invites: null, sessions: null })).toEqual([]);

    const enrollments = [
      { status: 'waitlisted', classId: 'c1', className: 'BT A' },
      { status: 'waitlisted', classId: 'c1', className: 'BT A' },
      { status: 'pending', holdUntil: new Date('2026-10-21T00:00:00Z') },
    ] as unknown as Enrollment[];
    const invoices = [
      { status: 'pending', dueDate: '2026-10-10', amountCents: 1000, createdAt: new Date('2026-10-01') },
      { status: 'pending', dueDate: '2026-10-30', amountCents: 500, createdAt: new Date('2026-10-22T10:00:00Z') },
    ] as unknown as Invoice[];
    const invites = [{ status: 'pending', displayName: 'Paula', email: 'p@x.com', role: 'coach', createdAt: null }] as unknown as CenterInvite[];
    const sessions = [session({ date: '2026-10-20' }), session({ date: '2026-10-22' })];

    const out = buildPendencies({ ...base, enrollments, invoices, invites, sessions });
    expect(out.map((p) => p.path)).toEqual(['matriculas', 'matriculas', 'financeiro', 'financeiro', 'equipe', 'agenda']);
    expect(out[0]!.title).toBe('2 alunos na lista de espera');
    expect(out[0]!.sub).toBe('BT A · 7/8');
    expect(out[3]!.title).toBe('1 cobrança vencida');
    expect(out[4]!.sub).toContain('Paula · Professor');
    expect(out[5]!.title).toBe('1 aula sem chamada');
  });
});
