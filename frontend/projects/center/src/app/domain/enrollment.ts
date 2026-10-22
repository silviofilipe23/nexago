import type {
  CenterPolicies,
  ContractSnapshot,
  Enrollment,
  EnrollmentStatus,
  Invoice,
  InvoiceStatus,
  Plan,
  TrainingCenter,
  TrainingClass,
} from './models';

/** Estados que ocupam vaga na turma (entram em `seatsTaken`). */
export const SEAT_STATUSES: EnrollmentStatus[] = ['pending', 'active', 'paused'];

export function holdsSeat(status: EnrollmentStatus): boolean {
  return SEAT_STATUSES.includes(status);
}

export function freeSeats(c: Pick<TrainingClass, 'capacity' | 'seatsTaken'>): number {
  return Math.max(0, c.capacity - c.seatsTaken);
}

export function isFull(c: Pick<TrainingClass, 'capacity' | 'seatsTaken'>): boolean {
  return c.seatsTaken >= c.capacity;
}

/** Preço que vale numa contratação feita em `day` (preço agendado só a partir da data). */
export function priceOn(plan: Pick<Plan, 'priceCents' | 'scheduledPrice'>, day: string): number {
  const next = plan.scheduledPrice;
  return next && next.effectiveFrom <= day ? next.priceCents : plan.priceCents;
}

/** Congela plano + políticas do dia da contratação. */
export function buildContract(plan: Plan, policies: CenterPolicies, day: string): ContractSnapshot {
  return {
    planName: plan.name,
    planType: plan.type,
    priceCents: priceOn(plan, day),
    classesPerWeek: plan.classesPerWeek,
    makeupsPerMonth: plan.makeupsPerMonth,
    credits: plan.credits,
    validityDays: plan.validityDays,
    policies: { ...policies },
    contractedAt: day,
  };
}

/** Transições que a UI oferece (o resto é bloqueado). */
const TRANSITIONS: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  waitlisted: ['pending', 'cancelled'],
  pending: ['active', 'cancelled'],
  active: ['paused', 'cancelled', 'completed'],
  paused: ['active', 'cancelled'],
  cancelled: [],
  completed: [],
};

export function canTransition(from: EnrollmentStatus, to: EnrollmentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Variação de vagas ocupadas numa transição (+1, 0, -1). */
export function seatDelta(from: EnrollmentStatus | null, to: EnrollmentStatus): number {
  const before = from ? holdsSeat(from) : false;
  const after = holdsSeat(to);
  return before === after ? 0 : after ? 1 : -1;
}

/** Fila de espera de uma turma: mais antigo primeiro. */
export function waitlistOf(enrollments: Enrollment[], classId: string): Enrollment[] {
  return enrollments
    .filter((e) => e.classId === classId && e.status === 'waitlisted')
    .sort((a, b) => (a.waitlistedAt?.getTime() ?? 0) - (b.waitlistedAt?.getTime() ?? 0));
}

/** Pendente com reserva vencida — a vaga deveria voltar para a fila. */
export function holdExpired(e: Pick<Enrollment, 'status' | 'holdUntil'>, now = new Date()): boolean {
  return e.status === 'pending' && e.holdUntil != null && e.holdUntil.getTime() < now.getTime();
}

/** Situação exibida da cobrança: pendente com vencimento passado vira "vencido". */
export function invoiceDisplayStatus(inv: Pick<Invoice, 'status' | 'dueDate'>, today: string): InvoiceStatus | 'late' {
  return inv.status === 'pending' && inv.dueDate < today ? 'late' : inv.status;
}

/** Pendente há mais de 2h sem confirmação — destaque "aguardando provedor". */
export function awaitingTooLong(inv: Pick<Invoice, 'status' | 'createdAt'>, now = new Date()): boolean {
  return inv.status === 'pending' && inv.createdAt != null && now.getTime() - inv.createdAt.getTime() > 2 * 3600_000;
}

export interface ActivationStep {
  key: 'data' | 'owner' | 'programs' | 'policies' | 'receiving' | 'subscription';
  title: string;
  detail: string;
  state: 'done' | 'now' | 'todo';
}

/**
 * Checklist de ativação (W3). Os 4 primeiros passos o owner conclui no próprio painel;
 * "Recebimento" e "Assinatura" dependem do backoffice NexaGO (conta do provedor e contrato
 * SaaS), por isso o owner só consegue SOLICITAR a ativação.
 */
export function activationSteps(
  center: TrainingCenter,
  counts: { programs: number },
  ownerEmailVerified: boolean,
): ActivationStep[] {
  const raw: Omit<ActivationStep, 'state'>[] = [
    { key: 'data', title: 'Dados do centro', detail: 'Nome, CNPJ, contato e endereço' },
    { key: 'owner', title: 'Responsável principal', detail: `${center.ownerName} · Owner` },
    { key: 'programs', title: 'Modalidades', detail: 'Pelo menos uma modalidade com níveis' },
    { key: 'policies', title: 'Políticas comerciais', detail: 'Ativação, faltas, reposição e cancelamento' },
    { key: 'receiving', title: 'Recebimento', detail: 'Conta de recebimento do centro' },
    { key: 'subscription', title: 'Assinatura NexaGO', detail: 'Plano do centro · liberado pelo time NexaGO' },
  ];
  const done: Record<ActivationStep['key'], boolean> = {
    data: Boolean(center.name && center.legalName && center.cnpj && center.contactEmail),
    owner: ownerEmailVerified,
    programs: counts.programs > 0,
    policies: Boolean(center.policies),
    receiving: center.receivingConnected,
    subscription: center.status === 'active',
  };
  let nowAssigned = false;
  return raw.map((s) => {
    if (done[s.key]) {
      return { ...s, state: 'done' as const };
    }
    if (!nowAssigned) {
      nowAssigned = true;
      return { ...s, state: 'now' as const };
    }
    return { ...s, state: 'todo' as const };
  });
}
