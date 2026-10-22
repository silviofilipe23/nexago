import type { Enrollment, Invoice, Plan, TrainingClass } from '../../domain/models';
import {
  addMonthsToDay,
  alternativeClasses,
  enrollmentDetail,
  paidUntil,
  payerNameFor,
  plansForProgram,
  queuePositions,
  statusCounts,
  waitlistGroups,
} from './enrollment-view';

function enr(p: Partial<Enrollment>): Enrollment {
  return {
    id: 'e1',
    studentId: 's1',
    studentName: 'Ana',
    classId: 'c1',
    className: 'BT A',
    planId: 'p1',
    contract: null,
    status: 'active',
    startDate: '2026-10-01',
    holdUntil: null,
    pausedUntil: null,
    pauseReason: '',
    creditsLeft: null,
    waitlistedAt: null,
    notifyOnSeat: false,
    endedAt: null,
    createdAt: null,
    createdByName: '',
    ...p,
  };
}

function inv(p: Partial<Invoice>): Invoice {
  return {
    id: 'i1',
    studentId: 's1',
    enrollmentId: 'e1',
    payerName: 'Ana',
    reference: 'Mensal',
    amountCents: 32000,
    dueDate: '2026-10-05',
    status: 'approved',
    method: 'pix',
    providerRef: '', providerUrl: '', providerStatus: '', providerApproved: false,
    events: [],
    approvedAt: null,
    refundedCents: 0,
    createdAt: null,
    ...p,
  };
}

function cls(p: Partial<TrainingClass>): TrainingClass {
  return {
    id: 'c1',
    name: 'BT A',
    programId: 'bt',
    level: 'Iniciante',
    coachUid: '',
    coachName: '',
    weekdays: [1],
    startTime: '08:00',
    durationMin: 60,
    courtId: '',
    courtName: '',
    capacity: 8,
    seatsTaken: 8,
    startDate: '2026-01-01',
    endDate: null,
    status: 'active',
    generatedUntil: null,
    ...p,
  };
}

describe('enrollment-view', () => {
  it('addMonthsToDay segura o fim do mês', () => {
    expect(addMonthsToDay('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsToDay('2026-10-05', 1)).toBe('2026-11-05');
    expect(addMonthsToDay('2026-12-10', 1)).toBe('2027-01-10');
  });

  it('paidUntil usa só cobrança aprovada mais recente da matrícula', () => {
    const list = [
      inv({ dueDate: '2026-09-05' }),
      inv({ id: 'i2', dueDate: '2026-10-05' }),
      inv({ id: 'i3', dueDate: '2026-11-05', status: 'pending' }),
      inv({ id: 'i4', dueDate: '2026-12-05', enrollmentId: 'outra' }),
    ];
    expect(paidUntil({ id: 'e1' }, list)).toBe('2026-11-05');
    expect(paidUntil({ id: 'e9' }, list)).toBeNull();
  });

  it('detalhe por situação', () => {
    const now = new Date('2026-10-22T12:00:00Z');
    const o = { invoices: [inv({})], queuePosition: 2, now };
    expect(enrollmentDetail(enr({ status: 'waitlisted' }), o).text).toBe('2º da fila');
    expect(enrollmentDetail(enr({}), o).text).toBe('Pago até 05 nov');
    expect(enrollmentDetail(enr({ id: 'x' }), o).text).toBe('Sem pagamento aprovado');
    expect(enrollmentDetail(enr({ status: 'pending', holdUntil: new Date('2026-10-21T00:00:00Z') }), o)).toEqual({ text: 'Reserva vencida', tone: 'red' });
    expect(enrollmentDetail(enr({ status: 'pending', holdUntil: new Date('2026-10-23T19:02:00Z') }), o).text).toBe(
      'Aguardando pagamento · reserva até 23 out 16:02',
    );
    expect(enrollmentDetail(enr({ status: 'paused', pausedUntil: '2026-11-03', pauseReason: 'viagem' }), o).text).toBe('Pausa até 03 nov · viagem');
  });

  it('posição na fila por turma, mais antigo primeiro', () => {
    const list = [
      enr({ id: 'b', status: 'waitlisted', waitlistedAt: new Date(2000) }),
      enr({ id: 'a', status: 'waitlisted', waitlistedAt: new Date(1000) }),
      enr({ id: 'z', status: 'waitlisted', classId: 'c2', waitlistedAt: new Date(5000) }),
    ];
    const pos = queuePositions(list);
    expect(pos.get('a')).toBe(1);
    expect(pos.get('b')).toBe(2);
    expect(pos.get('z')).toBe(1);
    expect(statusCounts(list).waitlisted).toBe(3);
    const groups = waitlistGroups([cls({}), cls({ id: 'c2', name: 'BT B', seatsTaken: 5 })], list);
    expect(groups.map((g) => g.cls.id)).toEqual(['c1', 'c2']);
    expect(groups[1]!.free).toBe(3);
  });

  it('pagador é o responsável quando menor', () => {
    expect(payerNameFor({ name: 'Isa', isMinor: true, guardian: { name: 'Patrícia', relation: '', email: '', phone: '' } })).toBe('Patrícia');
    expect(payerNameFor({ name: 'Isa', isMinor: false, guardian: null })).toBe('Isa');
    expect(payerNameFor({ name: 'Isa', isMinor: true, guardian: null })).toBe('Isa');
  });

  it('alternativas: mesma modalidade e nível, ativas e com vaga', () => {
    const list = [
      cls({}),
      cls({ id: 'c2', seatsTaken: 4 }),
      cls({ id: 'c3', seatsTaken: 4, level: 'Avançado' }),
      cls({ id: 'c4', seatsTaken: 4, status: 'draft' }),
      cls({ id: 'c5', seatsTaken: 8 }),
    ];
    expect(alternativeClasses(list, list[0]!).map((c) => c.id)).toEqual(['c2']);
  });

  it('planos da modalidade (sem modalidade = todas)', () => {
    const base = { status: 'active', programIds: [] } as unknown as Plan;
    const plans = [
      { ...base, id: 'a' },
      { ...base, id: 'b', programIds: ['bt'] },
      { ...base, id: 'c', programIds: ['vp'] },
      { ...base, id: 'd', status: 'archived' as const },
    ];
    expect(plansForProgram(plans, 'bt').map((p) => p.id)).toEqual(['a', 'b']);
  });
});
