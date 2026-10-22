import type { Weekday } from './dates';
import type { NotificationSettings } from './notification-settings';
import type { CenterPermission, CenterRole, MemberStatus } from './roles';

/**
 * Modelo do Centro de Treinamento no Firestore. Tudo do centro mora embaixo de
 * `trainingCenters/{centerId}` — isolamento entre centros é pelo caminho, e as rules checam o
 * vínculo do usuário com AQUELE centro.
 *
 *   trainingCenters/{centerId}
 *     centerMembers/{uid}      vínculo + papel (collection group: "meus centros")
 *     centerInvites/{id}       convite por e-mail (collection group: "convites pra mim")
 *     programs/{id}            modalidades e níveis
 *     courts/{id}              quadras e recursos
 *     classes/{id}             turmas (regra recorrente)
 *     sessions/{classId_day}   aulas geradas
 *     students/{id}            alunos (com ou sem conta NexaGO)
 *     plans/{id}               planos mensais e pacotes
 *     enrollments/{id}         matrículas (com snapshot do contrato)
 *     invoices/{id}            cobranças do centro aos alunos
 *     auditLogs/{id}           trilha de auditoria (só cria)
 */

export type CenterStatus = 'pending' | 'active' | 'suspended';

export interface CenterPolicies {
  /** Quando a matrícula passa de pendente para ativa. */
  activation: 'after_payment' | 'on_confirmation';
  /** Falta não justificada consome aula/crédito. */
  unexcusedAbsenceConsumes: boolean;
  /** Falta justificada (até N horas antes) gera reposição. */
  excusedAbsenceMakeup: boolean;
  excusedNoticeHours: number;
  makeupValidityDays: number;
  /** Aula cancelada pelo centro gera reposição automática. */
  cancelledClassMakeup: 'auto' | 'manual';
  makeupScope: 'same_level' | 'any_class';
  monthlyCancellation: 'end_of_cycle' | 'immediate';
  allowPause: boolean;
  pauseMaxDaysPerYear: number;
  waitlistEnabled: boolean;
  waitlistAcceptHours: number;
  /** Horas que a vaga fica reservada numa matrícula pendente. */
  pendingHoldHours: number;
  /** Intervalo mínimo entre aulas do mesmo professor em locais diferentes (deslocamento). */
  travelBufferMinutes: number;
}

export const DEFAULT_POLICIES: CenterPolicies = {
  activation: 'after_payment',
  unexcusedAbsenceConsumes: true,
  excusedAbsenceMakeup: true,
  excusedNoticeHours: 4,
  makeupValidityDays: 30,
  cancelledClassMakeup: 'auto',
  makeupScope: 'same_level',
  monthlyCancellation: 'end_of_cycle',
  allowPause: true,
  pauseMaxDaysPerYear: 30,
  waitlistEnabled: true,
  waitlistAcceptHours: 24,
  pendingHoldHours: 48,
  travelBufferMinutes: 30,
};

export interface CenterSubscription {
  plan: string;
  status: 'trial' | 'active' | 'past_due' | 'cancelled';
  openInvoiceCents: number | null;
  dueDate: string | null;
  attempts: string | null;
}

export interface TrainingCenter {
  id: string;
  name: string;
  legalName: string;
  cnpj: string;
  slug: string;
  timezone: string;
  sports: string[];
  status: CenterStatus;
  ownerUid: string;
  ownerName: string;
  contactEmail: string;
  contactPhone: string;
  city: string;
  state: string;
  address: string;
  policies: CenterPolicies;
  /** Cobrança recorrente das mensalidades (Configurações › Cobrança recorrente). */
  billing: CenterBilling;
  /** Preferências de aviso (Configurações › Notificações). */
  notifications: NotificationSettings;
  /** Passos de ativação que dependem de terceiros (marcados pelo backoffice). */
  receivingConnected: boolean;
  subscription: CenterSubscription | null;
  activationRequestedAt: Date | null;
  createdAt: Date | null;
  activatedAt: Date | null;
  suspendedAt: Date | null;
  suspendedReason: string;
}

export interface CenterMember {
  uid: string;
  centerId: string;
  centerName: string;
  role: CenterRole;
  status: MemberStatus;
  displayName: string;
  email: string;
  extraPerms: CenterPermission[];
  programIds: string[];
  joinedAt: Date | null;
  revokedAt: Date | null;
  inviteId: string | null;
}

export interface CenterInvite {
  id: string;
  centerId: string;
  centerName: string;
  email: string;
  displayName: string;
  role: CenterRole;
  programIds: string[];
  classIds: string[];
  status: 'pending' | 'accepted' | 'cancelled' | 'declined';
  invitedByUid: string;
  invitedByName: string;
  createdAt: Date | null;
}

export interface Program {
  id: string;
  name: string;
  color: string;
  levels: string[];
  order: number;
}

export type LocationType = 'own' | 'partner' | 'adhoc';

/** Janela contratada num local parceiro (ex.: Ter/Qui 18:00–22:00). */
export interface ContractWindow {
  weekdays: Weekday[];
  start: string;
  end: string;
}

/**
 * Onde as aulas acontecem (`locations/{id}`). Próprio: o CT administra o espaço e as quadras
 * (`courts.locationId`). Parceiro: arena de terceiros, só vale dentro da janela contratada.
 * Avulso: só um endereço (aulão). Nunca excluído — arquivado, para aula passada mostrar onde foi.
 */
export interface CenterLocation {
  id: string;
  name: string;
  type: LocationType;
  address: string;
  /** Observações para os alunos (entrada, estacionamento). */
  notes: string;
  isPrimary: boolean;
  status: 'active' | 'archived';
  windows: ContractWindow[];
  /** Parceiro: quadras disponíveis na janela (texto livre, ex.: "A, B"). */
  courtsLabel: string;
  contactName: string;
  contactPhone: string;
  archivedAt: Date | null;
}

export interface Court {
  id: string;
  /** Local próprio a que a quadra pertence (vazio = quadra antiga, antes dos locais). */
  locationId: string;
  name: string;
  description: string;
  status: 'active' | 'maintenance';
  maintenanceUntil: string | null;
}

export type ClassStatus = 'draft' | 'active' | 'closed' | 'cancelled';

export interface TrainingClass {
  id: string;
  name: string;
  programId: string;
  level: string;
  coachUid: string;
  coachName: string;
  weekdays: Weekday[];
  startTime: string;
  durationMin: number;
  /** Local padrão da turma (a aula pode sobrescrever só na data). */
  locationId: string;
  locationName: string;
  courtId: string;
  courtName: string;
  capacity: number;
  /** Vagas ocupadas (matrículas ativas, pendentes ou pausadas) — mantido em transação. */
  seatsTaken: number;
  /** Alunos que ocupam vaga (lista da chamada) — ver `rosterAfter`. */
  rosterStudentIds: string[];
  startDate: string;
  endDate: string | null;
  status: ClassStatus;
  /** Último dia com aula materializada em `sessions`. */
  generatedUntil: string | null;
}

export type SessionStatus = 'scheduled' | 'cancelled' | 'done';
export type AttendanceMark = 'present' | 'excused' | 'absent';

export interface ClassSession {
  id: string;
  classId: string;
  className: string;
  programId: string;
  date: string;
  startTime: string;
  durationMin: number;
  coachUid: string;
  coachName: string;
  locationId: string;
  locationName: string;
  /** Endereço copiado do local na geração/troca — é o que o aluno vê e o push leva. */
  locationAddress: string;
  courtId: string;
  courtName: string;
  status: SessionStatus;
  /** Alterada só nesta data (horário, professor ou quadra diferentes da regra). */
  changed: boolean;
  changeReason: string;
  attendance: Record<string, AttendanceMark>;
  makeupStudentIds: string[];
  finalizedAt: Date | null;
  finalizedByName: string;
  /** Correções feitas depois de finalizada (P6/P7). */
  attendanceLog: AttendanceCorrection[];
  /** Créditos que o servidor já aplicou por esta chamada (só leitura no client). */
  effectsApplied: Record<string, { credit: number; makeup: number }>;
}

export interface AttendanceCorrection {
  at: Date | null;
  byName: string;
  studentId: string;
  from: AttendanceMark | null;
  to: AttendanceMark | null;
  reason: string;
}

export type StudentStatus = 'active' | 'invited' | 'inactive' | 'blocked';

export interface Guardian {
  name: string;
  relation: string;
  email: string;
  phone: string;
}

export interface Student {
  id: string;
  /** Conta NexaGO vinculada (mesma do atleta nos torneios); null = só convidado por e-mail. */
  uid: string | null;
  name: string;
  email: string;
  phone: string;
  status: StudentStatus;
  isMinor: boolean;
  birthDate: string | null;
  guardian: Guardian | null;
  lgpdConsentAt: Date | null;
  imageUseAllowed: boolean;
  notifyClasses: boolean;
  emergencyName: string;
  emergencyPhone: string;
  medicalNotes: string;
  /** Créditos de reposição disponíveis. */
  makeupCredits: number;
  /** Mensalidade atrasada além do limite: check-in mostra pendência (só o servidor grava). */
  billingHold: boolean;
  createdAt: Date | null;
}

export type PlanType = 'monthly' | 'class_pack';

export interface PriceChange {
  priceCents: number;
  effectiveFrom: string;
  byName: string;
  at: Date | null;
}

export interface Plan {
  id: string;
  name: string;
  type: PlanType;
  priceCents: number;
  /** Mensal: aulas por semana e reposições por mês. */
  classesPerWeek: number | null;
  makeupsPerMonth: number | null;
  /** Pacote: créditos e validade em dias. */
  credits: number | null;
  validityDays: number | null;
  programIds: string[];
  status: 'active' | 'archived';
  featured: boolean;
  priceHistory: PriceChange[];
  /** Preço novo agendado (vale para contratações a partir de `effectiveFrom`). */
  scheduledPrice: PriceChange | null;
}

export type EnrollmentStatus = 'pending' | 'active' | 'paused' | 'cancelled' | 'completed' | 'waitlisted';

/** O que foi contratado — congelado na matrícula; mudar o plano depois não altera isto. */
export interface ContractSnapshot {
  planName: string;
  planType: PlanType;
  priceCents: number;
  classesPerWeek: number | null;
  makeupsPerMonth: number | null;
  credits: number | null;
  validityDays: number | null;
  policies: CenterPolicies;
  contractedAt: string;
}

export interface Enrollment {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  planId: string | null;
  contract: ContractSnapshot | null;
  status: EnrollmentStatus;
  startDate: string;
  holdUntil: Date | null;
  pausedUntil: string | null;
  pauseReason: string;
  creditsLeft: number | null;
  waitlistedAt: Date | null;
  /** Vaga oferecida pela fila (automática pelo servidor ou manual). */
  offeredAt: Date | null;
  offeredAuto: boolean;
  notifyOnSeat: boolean;
  endedAt: Date | null;
  createdAt: Date | null;
  createdByName: string;
}

export type InvoiceStatus = 'pending' | 'approved' | 'disputed' | 'refunded' | 'failed' | 'cancelled';
export type PaymentMethod = 'pix' | 'card' | 'cash' | 'transfer' | 'other';

export interface InvoiceEvent {
  at: Date | null;
  type: 'created' | 'provider' | 'webhook' | 'duplicate' | 'query' | 'manual_confirm' | 'refund' | 'cancel' | 'note';
  title: string;
  detail: string;
  byName: string;
}

export interface Invoice {
  id: string;
  studentId: string | null;
  enrollmentId: string | null;
  payerName: string;
  reference: string;
  amountCents: number;
  dueDate: string;
  status: InvoiceStatus;
  method: PaymentMethod | null;
  /** Fatura no provedor (Asaas): id, link para pagar (Pix ou cartão) e último status visto. Só o servidor grava. */
  providerRef: string;
  providerUrl: string;
  providerStatus: string;
  /** Aprovada pelo provedor (webhook/consulta), não por baixa manual. */
  providerApproved: boolean;
  events: InvoiceEvent[];
  approvedAt: Date | null;
  refundedCents: number;
  /** Cobrança gerada pela assinatura (ciclo `YYYY-MM`); null nas avulsas. */
  subscriptionId: string | null;
  cycle: string;
  createdAt: Date | null;
}

export interface AuditEntry {
  id: string;
  at: Date | null;
  actorUid: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  detail: string;
  reason: string;
}

export const ENROLLMENT_STATUS: Record<EnrollmentStatus, [string, string]> = {
  active: ['Ativa', 'green'],
  pending: ['Pendente', 'yellow'],
  paused: ['Pausada', 'dim'],
  cancelled: ['Cancelada', 'red'],
  completed: ['Concluída', 'dim'],
  waitlisted: ['Espera', 'orange'],
};

export const STUDENT_STATUS: Record<StudentStatus, [string, string]> = {
  active: ['Ativo', 'green'],
  invited: ['Convidado', 'orange'],
  inactive: ['Inativo', 'dim'],
  blocked: ['Bloqueado', 'red'],
};

export const INVOICE_STATUS: Record<InvoiceStatus | 'late', [string, string]> = {
  approved: ['Aprovado', 'green'],
  pending: ['Pendente', 'yellow'],
  late: ['Vencido', 'red'],
  disputed: ['Contestado', 'red'],
  refunded: ['Estornado', 'dim'],
  failed: ['Recusado', 'red'],
  cancelled: ['Cancelado', 'dim'],
};

export const CLASS_STATUS: Record<ClassStatus, [string, string]> = {
  active: ['Ativa', 'green'],
  draft: ['Rascunho', 'dim'],
  closed: ['Encerrada', 'dim'],
  cancelled: ['Cancelada', 'red'],
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'Pix',
  card: 'Cartão',
  cash: 'Dinheiro',
  transfer: 'Transferência',
  other: 'Outro',
};

/** Paleta das modalidades (protótipo). */
export const LOCATION_TYPES: Record<LocationType, { label: string; tone: string; color: string; hint: string }> = {
  own: { label: 'Próprio', tone: 'orange', color: '#FF8A4A', hint: 'O CT administra o espaço e as quadras' },
  partner: { label: 'Parceiro', tone: 'blue', color: '#5B9BFF', hint: 'Arena de terceiros · janela contratada' },
  adhoc: { label: 'Avulso', tone: 'dim', color: '#9AA0A6', hint: 'Endereço usado em poucas aulas' },
};

export const PROGRAM_COLORS = ['#FF8A4A', '#5B9BFF', '#C08CFF', '#2BD17E', '#F4C543', '#FF6B8A'];

/** Gradientes do avatar do centro, escolhido de forma estável pelo id. */
const CENTER_GRADIENTS = [
  'linear-gradient(135deg,#FF8A4A 0%,#2260B8 100%)',
  'linear-gradient(135deg,#2BD17E 0%,#14532d 100%)',
  'linear-gradient(135deg,#C08CFF 0%,#3b1d6e 100%)',
  'linear-gradient(135deg,#F4C543 0%,#7a4a00 100%)',
];

export function centerGradient(id: string): string {
  let h = 0;
  for (const ch of id) {
    h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return CENTER_GRADIENTS[h % CENTER_GRADIENTS.length]!;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '·';
  }
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : (parts[0]![1] ?? '');
  return (first + last).toUpperCase();
}

/** Cor estável por pessoa (avatar). */
const PERSON_COLORS = ['#FF6A1A', '#FF8A4A', '#5B9BFF', '#2BD17E', '#C08CFF', '#F4C543', '#9AA0A6'];

export function personColor(key: string): string {
  let h = 0;
  for (const ch of key) {
    h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  }
  return PERSON_COLORS[h % PERSON_COLORS.length]!;
}

export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** Política da cobrança recorrente — espelho de `functions/src/training-center-subscription-model.ts`. */
export interface CenterBilling {
  /** `fixed`: todos vencem no `billingDay`; `enrollment`: no dia em que o aluno entrou. */
  billingDayMode: 'fixed' | 'enrollment';
  billingDay: number;
  firstMonth: 'prorata' | 'full';
  /** Multa de 2% + juros de 1% ao mês, somados pelo provedor no pagamento atrasado. */
  lateFees: boolean;
  /** Dias de atraso até o check-in mostrar pendência (0 = nunca). */
  blockAfterDays: number;
  suspendAfterDays: number;
  suspendAction: 'suspend' | 'notify';
}

export const DEFAULT_BILLING: CenterBilling = {
  billingDayMode: 'fixed',
  billingDay: 5,
  firstMonth: 'prorata',
  lateFees: true,
  blockAfterDays: 20,
  suspendAfterDays: 45,
  suspendAction: 'suspend',
};

export type SubscriptionStatus = 'active' | 'past_due' | 'paused' | 'canceling' | 'cancelled' | 'suspended';

export const SUBSCRIPTION_STATUS: Record<SubscriptionStatus, [string, string]> = {
  active: ['Em dia', 'green'],
  past_due: ['Em atraso', 'red'],
  paused: ['Pausada', 'dim'],
  canceling: ['Cancela no fim do ciclo', 'dim'],
  cancelled: ['Encerrada', 'dim'],
  suspended: ['Suspensa', 'red'],
};

export type SubscriptionMethod = 'pix_manual' | 'card' | 'pix_auto';

export const SUBSCRIPTION_METHOD: Record<SubscriptionMethod, string> = {
  pix_manual: 'Pix mensal',
  card: 'Cartão recorrente',
  pix_auto: 'Pix Automático',
};

export interface SubscriptionNotice {
  at: Date | null;
  /** 0 lembrete D−3 · 1 não pago D+1 · 2 lembrete D+7 · 3 aviso de bloqueio · 4 bloqueio · 5 suspensão. */
  stage: number;
  cycle: string;
  invoiceId: string;
  title: string;
  channel: string;
  delivered: boolean;
}

export interface PendingPlanChange {
  planId: string;
  planName: string;
  priceCents: number;
  byName: string;
  requestedAt: Date | null;
}

/** `subscriptions/{enrollmentId}` — uma por matrícula mensal; só o servidor cria e anda. */
export interface Subscription {
  id: string;
  enrollmentId: string;
  studentId: string;
  studentName: string;
  payerName: string;
  classId: string;
  className: string;
  planId: string | null;
  planName: string;
  priceCents: number;
  billingDay: number;
  method: SubscriptionMethod;
  status: SubscriptionStatus;
  startDate: string;
  /** Vencimento do próximo ciclo ainda não gerado (a cobrança nasce 3 dias antes). */
  nextChargeDate: string;
  lastDueDate: string | null;
  pausedUntil: string | null;
  cancelAt: string | null;
  pendingPlanChange: PendingPlanChange | null;
  lateFees: { finePercent: number; interestPercent: number } | null;
  dunningStage: number;
  overdueSince: string | null;
  checkinBlocked: boolean;
  skippedCycles: string[];
  notices: SubscriptionNotice[];
  createdAt: Date | null;
  endedAt: Date | null;
  endReason: string;
}

export interface BillingRunSummary {
  generated: number;
  generatedCents: number;
  issued: number;
  issueFailed: number;
  skippedPaused: number;
  reminders: number;
  notices: number;
  blocked: number;
  suspended: number;
  resumed: number;
  packsCompleted: number;
  cancelledAtCycleEnd: number;
  errors: number;
}

export type BillingRunItemKind =
  | 'generated'
  | 'skipped'
  | 'issued'
  | 'issue_failed'
  | 'reminder'
  | 'notice'
  | 'blocked'
  | 'suspended'
  | 'resumed'
  | 'pack_completed'
  | 'cancelled';

export interface BillingRunItem {
  subscriptionId: string;
  name: string;
  kind: BillingRunItemKind;
  detail: string;
  cents: number;
}

/** `billingRuns/{YYYY-MM-DD}` — resumo da rodada diária das 06:00. */
export interface BillingRun {
  id: string;
  date: string;
  ranAt: Date | null;
  runs: number;
  online: boolean;
  summary: BillingRunSummary;
  items: BillingRunItem[];
}
