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

/**
 * Estados de matrícula "em curso" (contrato vigente). Ocupam vaga em `seatsTaken`, exceto a pausada
 * por trancamento que liberou a vaga (`seatReleased`) — para vaga, use `occupiesSeat`.
 */
export const SEAT_STATUSES: EnrollmentStatus[] = ['pending', 'active', 'paused'];

export function holdsSeat(status: EnrollmentStatus): boolean {
  return SEAT_STATUSES.includes(status);
}

/** A matrícula conta agora em `seatsTaken`/chamada (trancamento com vaga liberada não conta). */
export function occupiesSeat(e: Pick<Enrollment, 'status' | 'seatReleased'>): boolean {
  return holdsSeat(e.status) && !(e.status === 'paused' && e.seatReleased);
}

/**
 * Lista da chamada da turma (`classes.rosterStudentIds`): quem ocupa vaga. Muda nos mesmos pontos
 * que `seatsTaken`, na mesma transação — o professor não lê matrículas, só esta lista.
 */
export function rosterAfter(current: readonly string[] | undefined, studentId: string, delta: number): string[] {
  const list = (current ?? []).filter((id) => id !== studentId);
  return delta > 0 ? [...list, studentId] : delta < 0 ? list : [...(current ?? [])];
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

/** Complemento do status "Pausada" quando o trancamento liberou a vaga ('' nos demais casos). */
export function seatNote(e: Pick<Enrollment, 'status' | 'seatReleased' | 'awaitingSeat'>): string {
  if (e.status !== 'paused' || !e.seatReleased) return '';
  return e.awaitingSeat ? 'turma cheia · volta na primeira vaga' : 'vaga liberada';
}

/**
 * Variação de vagas numa transição manual a partir da matrícula real: pausada com a vaga liberada
 * não devolve vaga ao cancelar/concluir (já devolveu) e precisa ocupar uma ao reativar (+1).
 * A pausa manual do portal sempre reserva (active → paused = 0).
 */
export function seatDeltaFor(e: Pick<Enrollment, 'status' | 'seatReleased'>, to: EnrollmentStatus): number {
  const before = occupiesSeat(e);
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
const RECEIVING_STEP_DETAIL: Partial<Record<TrainingCenter['receivingStatus'], string>> = {
  none: 'Criar a conta de recebimento do centro (Asaas)',
  failed: 'A criação da conta não foi concluída · tentar de novo',
  creating: 'Criando a conta no Asaas',
  pending: 'Em análise no Asaas · envie os documentos pedidos',
  rejected: 'Conta recusada pelo Asaas · fale com o time NexaGO',
  approved: 'Conta de recebimento ativa',
};

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
    { key: 'receiving', title: 'Recebimento', detail: RECEIVING_STEP_DETAIL[center.receivingStatus] ?? 'Conta de recebimento do centro' },
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
