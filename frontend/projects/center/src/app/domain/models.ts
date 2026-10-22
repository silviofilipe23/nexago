import type { Weekday } from './dates';
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

export interface Court {
  id: string;
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
