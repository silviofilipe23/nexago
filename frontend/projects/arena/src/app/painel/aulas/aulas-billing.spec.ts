import { usableCredits } from './aula-extra-modal.component';
import {
  billingTotals,
  chargeState,
  planDetail,
  slotsLabel,
  studentPayState,
  whatsappChargeLink,
  type Charge,
  type Enrollment,
  type MakeupCredit,
} from './billing.model';
import type { ArenaClass, ClassSession, ClassStudent } from './class.model';
import { buildSlotRows, slotSelectionError } from './panel-aula-enrollment.component';
import { spotsByWeekday } from './panel-aula-class-detail.component';
import { studentAttendance } from './panel-aula-student-detail.component';
import { buildStudentRows, filterStudentRows } from './panel-aulas-students.component';

// 2026-10-19 é segunda (ISO 1); 20 = terça, 22 = quinta.
const TODAY = '2026-10-19';

function charge(over: Partial<Charge>): Charge {
  return {
    id: 'c1',
    enrollmentId: 'e1',
    studentId: 's1',
    athleteId: null,
    name: 'Marina Lopes',
    phone: '11999990000',
    description: 'Mensal 2x · outubro',
    period: '2026-10',
    amountReais: 320,
    dueDate: TODAY,
    status: 'open',
    paidOn: null,
    paymentMethod: 'pix',
    ...over,
  };
}

function enrollment(over: Partial<Enrollment>): Enrollment {
  return {
    id: 'e1',
    arenaId: 'a1',
    studentId: 's1',
    athleteId: null,
    name: 'Marina Lopes',
    phone: '11999990000',
    plan: { planId: 'p1', name: 'Mensal 2x', kind: 'monthly', priceReais: 320, classesPerWeek: 2, makeupsPerMonth: 1, credits: null, validityDays: null, description: null },
    slots: [
      { classId: 'k1', className: 'Intermediário B', weekday: 2, startTime: '19:00', teacherId: 't1' },
      { classId: 'k1', className: 'Intermediário B', weekday: 4, startTime: '19:00', teacherId: 't1' },
    ],
    status: 'active',
    dueDay: 5,
    paymentMethod: 'pix',
    startDate: '2026-10-01',
    creditsLeft: null,
    expiresOn: null,
    createdAt: null,
    canceledAt: null,
    ...over,
  };
}

function credit(over: Partial<MakeupCredit>): MakeupCredit {
  return {
    id: 'cr1',
    studentId: 's1',
    athleteId: null,
    name: 'Marina Lopes',
    enrollmentId: 'e1',
    reason: 'excused',
    sourceDate: '2026-10-14',
    status: 'available',
    expiresOn: '2026-11-13',
    ...over,
  };
}

function cls(over: Partial<ArenaClass>): ArenaClass {
  return {
    id: 'k1',
    arenaId: 'a1',
    name: 'Intermediário B',
    type: 'turma',
    sport: 'beach_tennis',
    level: 'intermediario',
    teacherId: 't1',
    teacherName: 'Diego Ramos',
    teacherColor: '#FF6A1A',
    weekdays: [2, 4],
    startTime: '19:00',
    endTime: '20:00',
    courtId: 'q2',
    courtName: 'Quadra 2',
    capacity: 2,
    studentCount: 0,
    startDate: '2026-10-01',
    endDate: null,
    status: 'active',
    notes: null,
    conflictDates: [],
    createdAt: null,
    ...over,
  };
}

function student(id: string, over: Partial<ClassStudent> = {}): ClassStudent {
  return {
    id,
    athleteId: null,
    name: id,
    phone: null,
    photoUrl: null,
    status: 'active',
    enrolledAt: null,
    enrollmentId: null,
    weekdays: null,
    planName: null,
    ...over,
  };
}

describe('cobrança de aulas (billing.model)', () => {
  it('situação da cobrança pela data de hoje', () => {
    expect(chargeState(charge({ dueDate: '2026-10-18' }), TODAY)).toBe('overdue');
    expect(chargeState(charge({ dueDate: TODAY }), TODAY)).toBe('due_today');
    expect(chargeState(charge({ dueDate: '2026-11-05' }), TODAY)).toBe('upcoming');
    expect(chargeState(charge({ dueDate: '2026-10-01', status: 'paid' }), TODAY)).toBe('paid');
  });

  it('aluno atrasado manda sobre "vence hoje"; pausado ignora as cobranças', () => {
    const open = [charge({ dueDate: TODAY }), charge({ id: 'c2', dueDate: '2026-10-10' })];
    expect(studentPayState({ status: 'active' }, open, TODAY)).toBe('late');
    expect(studentPayState({ status: 'active' }, [open[0]!], TODAY)).toBe('today');
    expect(studentPayState({ status: 'paused' }, open, TODAY)).toBe('paused');
  });

  it('totais: atraso por aluno e o que vence em 7 dias', () => {
    const totals = billingTotals(
      [
        charge({ id: 'a', studentId: 's1', dueDate: '2026-10-05', amountReais: 320 }),
        charge({ id: 'b', studentId: 's1', dueDate: '2026-10-10', amountReais: 50 }),
        charge({ id: 'c', studentId: 's2', dueDate: '2026-10-25', amountReais: 160.5 }),
        charge({ id: 'd', studentId: 's3', dueDate: '2026-11-05', amountReais: 999 }),
      ],
      TODAY,
    );
    expect(totals).toEqual({ overdueReais: 370, overdueStudents: 1, next7Reais: 160.5, next7Count: 1 });
  });

  it('link de cobrança no WhatsApp: DDI 55 e mensagem pronta; sem telefone, sem link', () => {
    const link = whatsappChargeLink('(11) 99999-0000', 'Marina Lopes', charge({ dueDate: '2026-11-05' }), 'Arena Sol');
    expect(link).toContain('https://wa.me/5511999990000?text=');
    expect(decodeURIComponent(link!.split('text=')[1]!)).toContain('Olá, Marina! Aqui é da Arena Sol');
    expect(decodeURIComponent(link!.split('text=')[1]!)).toContain('05/11/2026');
    expect(whatsappChargeLink(null, 'Marina', charge({}), 'Arena Sol')).toBeNull();
    expect(whatsappChargeLink('1234', 'Marina', charge({}), 'Arena Sol')).toBeNull();
  });

  it('rótulos de horários e plano', () => {
    expect(slotsLabel([{ weekday: 4, startTime: '19:00' }, { weekday: 2, startTime: '19:00' }])).toBe('Ter e Qui · 19:00');
    expect(slotsLabel([{ weekday: 1, startTime: '07:00' }, { weekday: 3, startTime: '08:00' }])).toBe('Seg e Qua');
    expect(planDetail({ kind: 'monthly', classesPerWeek: 2, makeupsPerMonth: 1, credits: null, validityDays: null })).toBe('8 aulas/mês · 1 reposição');
    expect(planDetail({ kind: 'package', classesPerWeek: null, makeupsPerMonth: null, credits: 10, validityDays: 60 })).toBe('10 créditos · validade 60 dias');
  });
});

describe('Alunos (07)', () => {
  const rows = buildStudentRows(
    [
      enrollment({ id: 'e1', studentId: 's1', name: 'Marina Lopes' }),
      enrollment({ id: 'e2', studentId: 's2', name: 'João Pereira', phone: null }),
      enrollment({ id: 'e3', studentId: 's3', name: 'Ana Souza', status: 'paused' }),
      enrollment({ id: 'e4', studentId: 's4', name: 'Bia Lima', status: 'canceled' }),
    ],
    [
      charge({ id: 'x', enrollmentId: 'e1', dueDate: '2026-10-05' }),
      charge({ id: 'y', enrollmentId: 'e2', studentId: 's2', dueDate: '2026-10-24' }),
    ],
    [credit({ studentId: 's2' }), credit({ id: 'cr2', studentId: 's2' })],
    TODAY,
  );

  it('situação, próxima cobrança e créditos por matrícula', () => {
    const byId = new Map(rows.map((r) => [r.enrollment.id, r]));
    expect(byId.get('e1')!.state).toBe('late');
    expect(byId.get('e2')!.state).toBe('ok');
    expect(byId.get('e2')!.nextCharge?.dueDate).toBe('2026-10-24');
    expect(byId.get('e2')!.credits).toBe(2);
    expect(byId.get('e3')!.state).toBe('paused');
  });

  it('filtros: "todos" esconde encerrados; busca ignora acento', () => {
    const ids = (f: Parameters<typeof filterStudentRows>[1], term = '') =>
      filterStudentRows(rows, f, term, TODAY).map((r) => r.enrollment.id);
    expect(ids('todos')).toEqual(['e1', 'e2', 'e3']);
    expect(ids('atraso')).toEqual(['e1']);
    expect(ids('vencendo')).toEqual(['e2']);
    expect(ids('creditos')).toEqual(['e2']);
    expect(ids('pausados')).toEqual(['e3']);
    expect(ids('encerrados')).toEqual(['e4']);
    expect(ids('todos', 'joao')).toEqual(['e2']);
  });
});

describe('Matrícula (09–12)', () => {
  it('vaga é por dia da semana e o próprio aluno não conta', () => {
    const rows = buildSlotRows(
      [cls({}), cls({ id: 'k2', name: 'Kids', weekdays: [], status: 'active' }), cls({ id: 'k3', status: 'paused' })],
      new Map([
        ['k1', [student('s1', { weekdays: [2] }), student('s2', { weekdays: [2] }), student('s9', { status: 'paused' })]],
      ]),
      's1',
    );
    expect(rows.map((r) => r.key)).toEqual(['k1:2', 'k1:4']);
    expect(rows.find((r) => r.weekday === 2)!.spotsLeft).toBe(1);
    expect(rows.find((r) => r.weekday === 4)!.spotsLeft).toBe(2);
    expect(rows.every((r) => !r.enrolled)).toBeTrue();
  });

  it('marca a turma em que o aluno já tem matrícula e põe a turma pedida primeiro', () => {
    const rows = buildSlotRows(
      [cls({ id: 'k1', weekdays: [1] }), cls({ id: 'k2', name: 'Avançado', weekdays: [5] })],
      new Map([['k1', [student('s1', { enrollmentId: 'e1' })]]]),
      's1',
      'k2',
    );
    expect(rows[0]!.classId).toBe('k2');
    expect(rows.find((r) => r.classId === 'k1')!.enrolled).toBeTrue();
  });

  it('mensal exige exatamente as aulas por semana; pacote, ao menos uma', () => {
    expect(slotSelectionError({ kind: 'monthly', classesPerWeek: 2 }, 1)).toContain('1 de 2');
    expect(slotSelectionError({ kind: 'monthly', classesPerWeek: 2 }, 2)).toBeNull();
    expect(slotSelectionError({ kind: 'package', classesPerWeek: null }, 0)).toContain('ao menos 1');
    expect(slotSelectionError({ kind: 'package', classesPerWeek: null }, 3)).toBeNull();
    expect(slotSelectionError(null, 2)).toBe('Escolha um plano.');
  });
});

describe('Turma e chamada (fase 2)', () => {
  it('vagas por dia: aluno sem dias definidos ocupa todos', () => {
    const spots = spotsByWeekday(cls({ capacity: 3 }), [
      student('a'),
      student('b', { weekdays: [2] }),
      student('c', { weekdays: [4], status: 'paused' }),
    ]);
    expect(spots).toEqual([{ weekday: 2, left: 1 }, { weekday: 4, left: 2 }]);
  });

  it('encaixe: só créditos válidos na data e de quem não está na lista', () => {
    const list = usableCredits(
      [
        credit({ id: 'ok', studentId: 's1', expiresOn: '2026-10-30' }),
        credit({ id: 'vencido', studentId: 's2', expiresOn: '2026-10-21' }),
        credit({ id: 'na-lista', studentId: 's3' }),
        credit({ id: 'usado', studentId: 's4', status: 'used' }),
      ],
      '2026-10-22',
      new Set(['s3']),
    );
    expect(list.map((c) => c.id)).toEqual(['ok']);
  });

  it('frequência do aluno: só as turmas e dias da matrícula, sem aula cancelada nem futura', () => {
    const base = { attendance: {}, extras: {}, status: 'completed' } as unknown as ClassSession;
    const sessions = [
      { ...base, id: '1', classId: 'k1', date: '2026-10-13', attendance: { s1: { mark: 'present', name: '' } } },
      { ...base, id: '2', classId: 'k1', date: '2026-10-15', attendance: { s1: { mark: 'excused', name: '' } } },
      { ...base, id: '3', classId: 'k1', date: '2026-10-14' },
      { ...base, id: '4', classId: 'k9', date: '2026-10-13' },
      { ...base, id: '5', classId: 'k1', date: '2026-10-08', status: 'canceled' },
      { ...base, id: '6', classId: 'k1', date: '2026-10-20', status: 'scheduled' },
    ] as ClassSession[];
    const cells = studentAttendance(sessions, enrollment({}), TODAY);
    expect(cells).toEqual([
      { date: '2026-10-13', mark: 'present' },
      { date: '2026-10-15', mark: 'excused' },
    ]);
  });
});
