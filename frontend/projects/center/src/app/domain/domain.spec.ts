import { addDays, startOfWeek, wallClock, weekdayOf } from './dates';
import { activationSteps, buildContract, canTransition, invoiceDisplayStatus, priceOn, seatDelta, waitlistOf } from './enrollment';
import { moneySplit, occupancy } from './metrics';
import { DEFAULT_POLICIES, type Enrollment, type Invoice, type Plan, type TrainingCenter } from './models';
import { formatBRL, parseBRL } from './money';
import { canAccessArea, canManageMember, invitableRoles, type MemberAccess } from './roles';

const m = (role: MemberAccess['role'], extraPerms: MemberAccess['extraPerms'] = [], status: MemberAccess['status'] = 'active'): MemberAccess => ({
  role,
  status,
  extraPerms,
});

describe('roles', () => {
  it('professor não vê financeiro; com view_finance passa a ver', () => {
    expect(canAccessArea(m('coach'), 'finance')).toBeFalse();
    expect(canAccessArea(m('coach', ['view_finance']), 'finance')).toBeTrue();
    expect(canAccessArea(m('coach'), 'schedule')).toBeTrue();
  });

  it('vínculo revogado não acessa nada', () => {
    expect(canAccessArea(m('center_owner', [], 'revoked'), 'dashboard')).toBeFalse();
  });

  it('admin gere professor/recepção, mas não owner nem outro admin', () => {
    expect(canManageMember(m('center_admin'), 'coach')).toBeTrue();
    expect(canManageMember(m('center_admin'), 'center_admin')).toBeFalse();
    expect(canManageMember(m('center_owner'), 'center_admin')).toBeTrue();
    expect(canManageMember(m('center_owner'), 'center_owner')).toBeFalse();
    expect(invitableRoles(m('center_admin'))).toEqual(['coach', 'receptionist']);
  });
});

describe('dates (parede no fuso do centro)', () => {
  it('meia-noite UTC ainda é o dia anterior em São Paulo', () => {
    const w = wallClock(new Date('2026-10-23T02:30:00Z'), 'America/Sao_Paulo');
    expect(w.dayKey).toBe('2026-10-22');
    expect(w.time).toBe('23:30');
    expect(w.weekday).toBe(4);
  });

  it('aritmética de dia e semana começando na segunda', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(weekdayOf('2026-10-22')).toBe(4);
    expect(startOfWeek('2026-10-25')).toBe('2026-10-19');
    expect(startOfWeek('2026-10-19')).toBe('2026-10-19');
  });
});

describe('money', () => {
  it('formata e lê BRL em centavos', () => {
    expect(formatBRL(32000)).toBe('R$ 320');
    expect(formatBRL(18050)).toBe('R$ 180,50');
    expect(parseBRL('1.234,56')).toBe(123456);
    expect(parseBRL('350')).toBe(35000);
    expect(parseBRL('abc')).toBeNull();
  });
});

const plan: Plan = {
  id: 'm2',
  name: 'Mensal 2x/semana',
  type: 'monthly',
  priceCents: 32000,
  classesPerWeek: 2,
  makeupsPerMonth: 2,
  credits: null,
  validityDays: null,
  programIds: [],
  status: 'active',
  featured: true,
  priceHistory: [],
  scheduledPrice: { priceCents: 35000, effectiveFrom: '2026-11-01', byName: 'Renata', at: null },
};

describe('enrollment', () => {
  it('preço agendado só vale a partir da data (contratos antigos preservados)', () => {
    expect(priceOn(plan, '2026-10-31')).toBe(32000);
    expect(priceOn(plan, '2026-11-01')).toBe(35000);
    const c = buildContract(plan, DEFAULT_POLICIES, '2026-10-22');
    expect(c.priceCents).toBe(32000);
    expect(c.policies).not.toBe(DEFAULT_POLICIES);
  });

  it('vaga: só pendente/ativa/pausada ocupam', () => {
    expect(seatDelta(null, 'pending')).toBe(1);
    expect(seatDelta(null, 'waitlisted')).toBe(0);
    expect(seatDelta('active', 'paused')).toBe(0);
    expect(seatDelta('paused', 'cancelled')).toBe(-1);
    expect(canTransition('cancelled', 'active')).toBeFalse();
    expect(canTransition('waitlisted', 'pending')).toBeTrue();
  });

  it('fila de espera por ordem de chegada', () => {
    const e = (id: string, t: number): Enrollment =>
      ({ id, classId: 'c1', status: 'waitlisted', waitlistedAt: new Date(t) }) as Enrollment;
    expect(waitlistOf([e('b', 2), e('a', 1), { ...e('x', 0), classId: 'c2' }], 'c1').map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('pendente vencida aparece como vencido', () => {
    expect(invoiceDisplayStatus({ status: 'pending', dueDate: '2026-10-12' }, '2026-10-22')).toBe('late');
    expect(invoiceDisplayStatus({ status: 'pending', dueDate: '2026-10-22' }, '2026-10-22')).toBe('pending');
    expect(invoiceDisplayStatus({ status: 'approved', dueDate: '2026-10-01' }, '2026-10-22')).toBe('approved');
  });

  it('checklist de ativação marca o primeiro passo pendente como "agora"', () => {
    const center = {
      name: 'CT',
      legalName: 'CT LTDA',
      cnpj: '1',
      contactEmail: 'a@b.com',
      ownerName: 'Renata',
      policies: DEFAULT_POLICIES,
      receivingConnected: false,
      status: 'pending',
    } as TrainingCenter;
    const steps = activationSteps(center, { programs: 2 }, true);
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done', 'now', 'todo']);
  });
});

describe('metrics', () => {
  const inv = (amountCents: number, status: Invoice['status'], dueDate: string, refundedCents = 0) =>
    ({ amountCents, status, dueDate, refundedCents }) as Invoice;

  it('recebido = só aprovado; pendente vencido conta como vencido', () => {
    const s = moneySplit(
      [inv(32000, 'approved', '2026-10-05'), inv(18000, 'pending', '2026-10-25'), inv(20000, 'pending', '2026-10-12'), inv(36000, 'approved', '2026-10-10', 9000), inv(5000, 'cancelled', '2026-10-01'), inv(99999, 'approved', '2026-09-30')],
      '2026-10',
      '2026-10-22',
    );
    expect(s.approvedCents).toBe(32000 + 27000);
    expect(s.pendingCents).toBe(18000);
    expect(s.lateCents).toBe(20000);
    expect(s.refundedCents).toBe(9000);
    expect(s.chargedCents).toBe(32000 + 18000 + 20000 + 36000);
  });

  it('ocupação considera só turmas ativas', () => {
    expect(occupancy([{ status: 'active', capacity: 8, seatsTaken: 8 }, { status: 'active', capacity: 6, seatsTaken: 3 }, { status: 'draft', capacity: 12, seatsTaken: 0 }])).toEqual({
      taken: 11,
      capacity: 14,
      pct: 79,
    });
  });
});
