import { Timestamp } from 'firebase/firestore';
import type { Weekday } from '../domain/dates';
import {
  DEFAULT_BILLING,
  DEFAULT_POLICIES,
  type AttendanceMark,
  type AuditEntry,
  type BillingRun,
  type BillingRunItemKind,
  type BillingRunSummary,
  type CenterBilling,
  type ReceivingAccount,
  type ReceivingStatus,
  type CenterInvite,
  type CenterLocation,
  type CenterMember,
  type CenterPolicies,
  type ClassSession,
  type SessionRsvp,
  type SessionTrial,
  type ContractSnapshot,
  type Court,
  type Enrollment,
  type Invoice,
  type InvoiceEvent,
  type Plan,
  type PriceChange,
  type Program,
  type Student,
  type Subscription,
  type SubscriptionMethod,
  type SubscriptionNotice,
  type SubscriptionStatus,
  type TrainingCenter,
  type TrainingClass,
} from '../domain/models';
import type {
  ContractEvent,
  ContractEventType,
  ContractEvidence,
  ContractStatus,
  ContractTemplate,
  StudentContract,
  TemplateVersion,
} from '../domain/contracts';
import { readNotificationSettings } from '../domain/notification-settings';
import { PERMISSION_ORDER, type CenterPermission, type CenterRole } from '../domain/roles';
import { readShowcase } from '../domain/showcase';

/**
 * Leitura defensiva: documento antigo ou incompleto nunca derruba a tela — cada campo cai num
 * padrão seguro.
 */
type Data = Record<string, unknown>;

export function str(d: Data, k: string, fallback = ''): string {
  const v = d[k];
  return typeof v === 'string' ? v : fallback;
}

export function num(d: Data, k: string, fallback = 0): number {
  const v = d[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function numOrNull(d: Data, k: string): number | null {
  const v = d[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function strOrNull(d: Data, k: string): string | null {
  const v = d[k];
  return typeof v === 'string' && v ? v : null;
}

export function bool(d: Data, k: string, fallback = false): boolean {
  const v = d[k];
  return typeof v === 'boolean' ? v : fallback;
}

function strings(d: Data, k: string): string[] {
  const v = d[k];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function date(v: unknown): Date | null {
  if (v instanceof Timestamp) {
    return v.toDate();
  }
  if (v instanceof Date) {
    return v;
  }
  return null;
}

function obj(d: Data, k: string): Data | null {
  const v = d[k];
  return v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Timestamp) ? (v as Data) : null;
}

const ROLES: CenterRole[] = ['center_owner', 'center_admin', 'coach', 'receptionist'];

function role(v: unknown): CenterRole {
  return ROLES.includes(v as CenterRole) ? (v as CenterRole) : 'coach';
}

export function readPolicies(raw: Data | null): CenterPolicies {
  if (!raw) {
    return { ...DEFAULT_POLICIES };
  }
  const p = { ...DEFAULT_POLICIES };
  for (const key of Object.keys(DEFAULT_POLICIES) as (keyof CenterPolicies)[]) {
    const v = raw[key];
    if (typeof v === typeof DEFAULT_POLICIES[key]) {
      (p as Record<string, unknown>)[key] = v;
    }
  }
  return p;
}

export function readCenter(id: string, d: Data): TrainingCenter {
  const sub = obj(d, 'subscription');
  const status = str(d, 'status');
  return {
    id,
    name: str(d, 'name', 'Centro'),
    legalName: str(d, 'legalName'),
    cnpj: str(d, 'cnpj'),
    slug: str(d, 'slug', id),
    timezone: str(d, 'timezone', 'America/Sao_Paulo'),
    sports: strings(d, 'sports'),
    status: status === 'active' || status === 'suspended' ? status : 'pending',
    ownerUid: str(d, 'ownerUid'),
    ownerName: str(d, 'ownerName'),
    contactEmail: str(d, 'contactEmail'),
    contactPhone: str(d, 'contactPhone'),
    city: str(d, 'city'),
    state: str(d, 'state'),
    address: str(d, 'address'),
    policies: readPolicies(obj(d, 'policies')),
    billing: readBilling(obj(d, 'billing')),
    notifications: readNotificationSettings(obj(d, 'notifications')),
    showcase: readShowcase(obj(d, 'showcase')),
    receivingConnected: bool(d, 'receivingConnected'),
    receivingStatus: readReceivingStatus(d['receivingStatus'], bool(d, 'receivingConnected')),
    joinCode: strOrNull(d, 'joinCode'),
    joinCodeEnabled: bool(d, 'joinCodeEnabled'),
    subscription: sub
      ? {
          plan: str(sub, 'plan', 'NexaGO Centro'),
          status: (['trial', 'active', 'past_due', 'cancelled'].includes(str(sub, 'status'))
            ? str(sub, 'status')
            : 'trial') as 'trial' | 'active' | 'past_due' | 'cancelled',
          openInvoiceCents: numOrNull(sub, 'openInvoiceCents'),
          dueDate: strOrNull(sub, 'dueDate'),
          attempts: strOrNull(sub, 'attempts'),
        }
      : null,
    activationRequestedAt: date(d['activationRequestedAt']),
    createdAt: date(d['createdAt']),
    activatedAt: date(d['activatedAt']),
    suspendedAt: date(d['suspendedAt']),
    suspendedReason: str(d, 'suspendedReason'),
  };
}

export function readMember(uid: string, d: Data): CenterMember {
  const status = str(d, 'status');
  return {
    uid,
    centerId: str(d, 'centerId'),
    centerName: str(d, 'centerName'),
    role: role(d['role']),
    status: status === 'invited' || status === 'revoked' ? status : 'active',
    displayName: str(d, 'displayName', 'Membro'),
    email: str(d, 'email'),
    extraPerms: strings(d, 'extraPerms').filter((p): p is CenterPermission =>
      PERMISSION_ORDER.includes(p as CenterPermission),
    ),
    programIds: strings(d, 'programIds'),
    joinedAt: date(d['joinedAt']),
    revokedAt: date(d['revokedAt']),
    inviteId: strOrNull(d, 'inviteId'),
  };
}

export function readInvite(id: string, d: Data): CenterInvite {
  const status = str(d, 'status');
  return {
    id,
    centerId: str(d, 'centerId'),
    centerName: str(d, 'centerName'),
    email: str(d, 'email'),
    displayName: str(d, 'displayName'),
    role: role(d['role']),
    programIds: strings(d, 'programIds'),
    classIds: strings(d, 'classIds'),
    status: status === 'accepted' || status === 'cancelled' || status === 'declined' ? status : 'pending',
    invitedByUid: str(d, 'invitedByUid'),
    invitedByName: str(d, 'invitedByName'),
    createdAt: date(d['createdAt']),
  };
}

export function readProgram(id: string, d: Data): Program {
  return {
    id,
    name: str(d, 'name', 'Modalidade'),
    color: str(d, 'color', '#FF8A4A'),
    levels: strings(d, 'levels'),
    order: num(d, 'order'),
  };
}

export function readLocation(id: string, d: Data): CenterLocation {
  const type = str(d, 'type');
  const windows = Array.isArray(d['windows'])
    ? (d['windows'] as unknown[])
        .filter((x): x is Data => !!x && typeof x === 'object')
        .map((w) => ({
          weekdays: (Array.isArray(w['weekdays']) ? w['weekdays'] : []).filter(
            (x: unknown): x is Weekday => typeof x === 'number' && x >= 0 && x <= 6,
          ),
          start: str(w, 'start', '00:00'),
          end: str(w, 'end', '23:59'),
        }))
    : [];
  return {
    id,
    name: str(d, 'name', 'Local'),
    type: type === 'partner' || type === 'adhoc' ? type : 'own',
    address: str(d, 'address'),
    notes: str(d, 'notes'),
    isPrimary: bool(d, 'isPrimary'),
    status: str(d, 'status') === 'archived' ? 'archived' : 'active',
    windows,
    courtsLabel: str(d, 'courtsLabel'),
    contactName: str(d, 'contactName'),
    contactPhone: str(d, 'contactPhone'),
    archivedAt: date(d['archivedAt']),
  };
}

export function readCourt(id: string, d: Data): Court {
  return {
    id,
    locationId: str(d, 'locationId'),
    name: str(d, 'name', 'Quadra'),
    description: str(d, 'description'),
    status: str(d, 'status') === 'maintenance' ? 'maintenance' : 'active',
    maintenanceUntil: strOrNull(d, 'maintenanceUntil'),
  };
}

export function readClass(id: string, d: Data): TrainingClass {
  const status = str(d, 'status');
  const weekdays = Array.isArray(d['weekdays'])
    ? (d['weekdays'] as unknown[]).filter((x): x is Weekday => typeof x === 'number' && x >= 0 && x <= 6)
    : [];
  return {
    id,
    name: str(d, 'name', 'Turma'),
    programId: str(d, 'programId'),
    level: str(d, 'level'),
    coachUid: str(d, 'coachUid'),
    coachName: str(d, 'coachName'),
    weekdays,
    startTime: str(d, 'startTime', '08:00'),
    durationMin: num(d, 'durationMin', 60),
    locationId: str(d, 'locationId'),
    locationName: str(d, 'locationName'),
    courtId: str(d, 'courtId'),
    courtName: str(d, 'courtName'),
    capacity: num(d, 'capacity', 1),
    seatsTaken: num(d, 'seatsTaken'),
    rosterStudentIds: strings(d, 'rosterStudentIds'),
    startDate: str(d, 'startDate'),
    endDate: strOrNull(d, 'endDate'),
    status: status === 'active' || status === 'closed' || status === 'cancelled' ? status : 'draft',
    generatedUntil: strOrNull(d, 'generatedUntil'),
  };
}

/** `rsvps.{aluno} = {response, at}` → só a resposta. */
function readRsvps(raw: Data | null): Record<string, SessionRsvp> {
  const out: Record<string, SessionRsvp> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    const r = v && typeof v === 'object' ? (v as Data)['response'] : null;
    if (r === 'going' || r === 'not_going') out[k] = r;
  }
  return out;
}

export function readSession(id: string, d: Data): ClassSession {
  const status = str(d, 'status');
  const att = obj(d, 'attendance') ?? {};
  const attendance: Record<string, AttendanceMark> = {};
  for (const [k, v] of Object.entries(att)) {
    if (v === 'present' || v === 'excused' || v === 'absent') {
      attendance[k] = v;
    }
  }
  return {
    id,
    classId: str(d, 'classId'),
    className: str(d, 'className'),
    programId: str(d, 'programId'),
    date: str(d, 'date'),
    startTime: str(d, 'startTime', '08:00'),
    durationMin: num(d, 'durationMin', 60),
    coachUid: str(d, 'coachUid'),
    coachName: str(d, 'coachName'),
    locationId: str(d, 'locationId'),
    locationName: str(d, 'locationName'),
    locationAddress: str(d, 'locationAddress'),
    courtId: str(d, 'courtId'),
    courtName: str(d, 'courtName'),
    status: status === 'cancelled' || status === 'done' ? status : 'scheduled',
    changed: bool(d, 'changed'),
    changeReason: str(d, 'changeReason'),
    attendance,
    makeupStudentIds: strings(d, 'makeupStudentIds'),
    finalizedAt: date(d['finalizedAt']),
    finalizedByName: str(d, 'finalizedByName'),
    attendanceLog: Array.isArray(d['attendanceLog'])
      ? (d['attendanceLog'] as unknown[]).filter((x): x is Data => !!x && typeof x === 'object').map((x) => ({
          at: date(x['at']),
          byName: str(x, 'byName'),
          studentId: str(x, 'studentId'),
          from: isMark(x['from']) ? x['from'] : null,
          to: isMark(x['to']) ? x['to'] : null,
          reason: str(x, 'reason'),
        }))
      : [],
    effectsApplied: readEffects(obj(d, 'effectsApplied')),
    rsvps: readRsvps(obj(d, 'rsvps')),
    attendanceByStudent: Object.fromEntries(
      Object.entries(obj(d, 'attendanceByStudent') ?? {}).filter(([, v]) => v === true).map(([k]) => [k, true]),
    ),
    trials: readTrials(obj(d, 'trials')),
  };
}

/** Espelho das experimentais na aula (`trials.{athleteId}`), por nome. */
export function readTrials(raw: Data | null): SessionTrial[] {
  const out: SessionTrial[] = [];
  for (const [athleteId, v] of Object.entries(raw ?? {})) {
    if (!v || typeof v !== 'object') continue;
    const t = v as Data;
    out.push({
      athleteId,
      bookingId: str(t, 'bookingId'),
      name: str(t, 'name') || 'Atleta',
      photoUrl: str(t, 'photoUrl') || null,
      status: str(t, 'status') === 'confirmed' ? 'confirmed' : 'pending',
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function isMark(v: unknown): v is AttendanceMark {
  return v === 'present' || v === 'excused' || v === 'absent';
}

function readEffects(raw: Data | null): Record<string, { credit: number; makeup: number }> {
  const out: Record<string, { credit: number; makeup: number }> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (v && typeof v === 'object') {
      out[k] = { credit: num(v as Data, 'credit'), makeup: num(v as Data, 'makeup') };
    }
  }
  return out;
}

export function readStudent(id: string, d: Data): Student {
  const status = str(d, 'status');
  const g = obj(d, 'guardian');
  return {
    id,
    uid: strOrNull(d, 'uid'),
    name: str(d, 'name', 'Aluno'),
    email: str(d, 'email'),
    phone: str(d, 'phone'),
    status: status === 'invited' || status === 'inactive' || status === 'blocked' ? status : 'active',
    isMinor: bool(d, 'isMinor'),
    birthDate: strOrNull(d, 'birthDate'),
    guardian: g
      ? { name: str(g, 'name'), relation: str(g, 'relation'), email: str(g, 'email'), phone: str(g, 'phone') }
      : null,
    lgpdConsentAt: date(d['lgpdConsentAt']),
    imageUseAllowed: bool(d, 'imageUseAllowed'),
    notifyClasses: bool(d, 'notifyClasses', true),
    emergencyName: str(d, 'emergencyName'),
    emergencyPhone: str(d, 'emergencyPhone'),
    medicalNotes: str(d, 'medicalNotes'),
    makeupCredits: num(d, 'makeupCredits'),
    billingHold: bool(d, 'billingHold'),
    createdAt: date(d['createdAt']),
  };
}

function readPriceChange(raw: unknown): PriceChange | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const d = raw as Data;
  return {
    priceCents: num(d, 'priceCents'),
    effectiveFrom: str(d, 'effectiveFrom'),
    byName: str(d, 'byName'),
    at: date(d['at']),
  };
}

export function readPlan(id: string, d: Data): Plan {
  const history = Array.isArray(d['priceHistory'])
    ? (d['priceHistory'] as unknown[]).map(readPriceChange).filter((x): x is PriceChange => x != null)
    : [];
  return {
    id,
    name: str(d, 'name', 'Plano'),
    type: str(d, 'type') === 'class_pack' ? 'class_pack' : 'monthly',
    priceCents: num(d, 'priceCents'),
    classesPerWeek: numOrNull(d, 'classesPerWeek'),
    makeupsPerMonth: numOrNull(d, 'makeupsPerMonth'),
    credits: numOrNull(d, 'credits'),
    validityDays: numOrNull(d, 'validityDays'),
    programIds: strings(d, 'programIds'),
    status: str(d, 'status') === 'archived' ? 'archived' : 'active',
    featured: bool(d, 'featured'),
    priceHistory: history,
    scheduledPrice: readPriceChange(d['scheduledPrice']),
  };
}

function readContractSnapshot(raw: Data | null): ContractSnapshot | null {
  if (!raw) {
    return null;
  }
  return {
    planName: str(raw, 'planName'),
    planType: str(raw, 'planType') === 'class_pack' ? 'class_pack' : 'monthly',
    priceCents: num(raw, 'priceCents'),
    classesPerWeek: numOrNull(raw, 'classesPerWeek'),
    makeupsPerMonth: numOrNull(raw, 'makeupsPerMonth'),
    credits: numOrNull(raw, 'credits'),
    validityDays: numOrNull(raw, 'validityDays'),
    policies: readPolicies(obj(raw, 'policies')),
    contractedAt: str(raw, 'contractedAt'),
  };
}

export function readEnrollment(id: string, d: Data): Enrollment {
  const status = str(d, 'status');
  const known = ['pending', 'active', 'paused', 'cancelled', 'completed', 'waitlisted'];
  return {
    id,
    studentId: str(d, 'studentId'),
    studentName: str(d, 'studentName', 'Aluno'),
    classId: str(d, 'classId'),
    className: str(d, 'className'),
    planId: strOrNull(d, 'planId'),
    contract: readContractSnapshot(obj(d, 'contract')),
    status: (known.includes(status) ? status : 'pending') as Enrollment['status'],
    startDate: str(d, 'startDate'),
    holdUntil: date(d['holdUntil']),
    pausedUntil: strOrNull(d, 'pausedUntil'),
    pauseReason: str(d, 'pauseReason'),
    creditsLeft: numOrNull(d, 'creditsLeft'),
    waitlistedAt: date(d['waitlistedAt']),
    offeredAt: date(d['offeredAt']),
    offeredAuto: str(d, 'offeredBy') === 'auto',
    notifyOnSeat: bool(d, 'notifyOnSeat'),
    endedAt: date(d['endedAt']),
    createdAt: date(d['createdAt']),
    createdByName: str(d, 'createdByName'),
  };
}

function readEvent(raw: unknown): InvoiceEvent | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const d = raw as Data;
  const types = ['created', 'provider', 'webhook', 'duplicate', 'query', 'manual_confirm', 'refund', 'cancel', 'note'];
  const type = str(d, 'type');
  return {
    at: date(d['at']),
    type: (types.includes(type) ? type : 'note') as InvoiceEvent['type'],
    title: str(d, 'title'),
    detail: str(d, 'detail'),
    byName: str(d, 'byName'),
  };
}

export function readInvoice(id: string, d: Data): Invoice {
  const status = str(d, 'status');
  const known = ['pending', 'approved', 'disputed', 'refunded', 'failed', 'cancelled'];
  const method = str(d, 'method');
  return {
    id,
    studentId: strOrNull(d, 'studentId'),
    enrollmentId: strOrNull(d, 'enrollmentId'),
    payerName: str(d, 'payerName', 'Pagador'),
    reference: str(d, 'reference'),
    amountCents: num(d, 'amountCents'),
    dueDate: str(d, 'dueDate'),
    status: (known.includes(status) ? status : 'pending') as Invoice['status'],
    method: (['pix', 'card', 'cash', 'transfer', 'other'].includes(method) ? method : null) as Invoice['method'],
    providerRef: str(d, 'providerRef'),
    providerUrl: str(d, 'providerUrl'),
    providerStatus: str(d, 'providerStatus'),
    providerApproved: d['providerApprovedAt'] != null,
    events: Array.isArray(d['events'])
      ? (d['events'] as unknown[]).map(readEvent).filter((x): x is InvoiceEvent => x != null)
      : [],
    approvedAt: date(d['approvedAt']),
    refundedCents: num(d, 'refundedCents'),
    subscriptionId: strOrNull(d, 'subscriptionId'),
    cycle: str(d, 'cycle'),
    createdAt: date(d['createdAt']),
  };
}

export function readAudit(id: string, d: Data): AuditEntry {
  return {
    id,
    at: date(d['at']),
    actorUid: str(d, 'actorUid'),
    actorName: str(d, 'actorName', 'Sistema'),
    action: str(d, 'action'),
    entity: str(d, 'entity'),
    entityId: str(d, 'entityId'),
    detail: str(d, 'detail'),
    reason: str(d, 'reason'),
  };
}

/** Mesmos limites do servidor (`readBilling` em training-center-subscription-model.ts). */
export function readBilling(raw: Data | null): CenterBilling {
  const d = raw ?? {};
  const n = (k: keyof CenterBilling, min: number, max: number): number => {
    const v = d[k];
    return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : (DEFAULT_BILLING[k] as number);
  };
  return {
    billingDayMode: d['billingDayMode'] === 'enrollment' ? 'enrollment' : 'fixed',
    billingDay: n('billingDay', 1, 28),
    firstMonth: d['firstMonth'] === 'full' ? 'full' : 'prorata',
    lateFees: d['lateFees'] !== false,
    blockAfterDays: n('blockAfterDays', 0, 90),
    suspendAfterDays: n('suspendAfterDays', 0, 180),
    suspendAction: d['suspendAction'] === 'notify' ? 'notify' : 'suspend',
  };
}

function readNotice(raw: unknown): SubscriptionNotice | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const d = raw as Data;
  return {
    at: date(d['at']),
    stage: num(d, 'stage'),
    cycle: str(d, 'cycle'),
    invoiceId: str(d, 'invoiceId'),
    title: str(d, 'title'),
    channel: str(d, 'channel', 'push'),
    delivered: bool(d, 'delivered'),
  };
}

const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ['active', 'past_due', 'paused', 'canceling', 'cancelled', 'suspended'];

export function readSubscription(id: string, d: Data): Subscription {
  const status = str(d, 'status');
  const method = str(d, 'method');
  const change = obj(d, 'pendingPlanChange');
  const fees = obj(d, 'lateFees');
  return {
    id,
    enrollmentId: str(d, 'enrollmentId', id),
    studentId: str(d, 'studentId'),
    studentName: str(d, 'studentName', 'Aluno'),
    payerName: str(d, 'payerName') || str(d, 'studentName', 'Aluno'),
    classId: str(d, 'classId'),
    className: str(d, 'className'),
    planId: strOrNull(d, 'planId'),
    planName: str(d, 'planName'),
    priceCents: num(d, 'priceCents'),
    billingDay: num(d, 'billingDay', 5),
    method: (method === 'card' || method === 'pix_auto' ? method : 'pix_manual') as SubscriptionMethod,
    status: (SUBSCRIPTION_STATUSES as string[]).includes(status) ? (status as SubscriptionStatus) : 'active',
    startDate: str(d, 'startDate'),
    nextChargeDate: str(d, 'nextChargeDate'),
    lastDueDate: strOrNull(d, 'lastDueDate'),
    pausedUntil: strOrNull(d, 'pausedUntil'),
    cancelAt: strOrNull(d, 'cancelAt'),
    pendingPlanChange: change
      ? {
          planId: str(change, 'planId'),
          planName: str(change, 'planName'),
          priceCents: num(change, 'priceCents'),
          byName: str(change, 'byName'),
          requestedAt: date(change['requestedAt']),
        }
      : null,
    lateFees: fees ? { finePercent: num(fees, 'finePercent'), interestPercent: num(fees, 'interestPercent') } : null,
    dunningStage: num(d, 'dunningStage'),
    overdueSince: strOrNull(d, 'overdueSince'),
    checkinBlocked: bool(d, 'checkinBlocked'),
    skippedCycles: strings(d, 'skippedCycles'),
    notices: Array.isArray(d['notices'])
      ? (d['notices'] as unknown[]).map(readNotice).filter((x): x is SubscriptionNotice => x != null)
      : [],
    createdAt: date(d['createdAt']),
    endedAt: date(d['endedAt']),
    endReason: str(d, 'endReason'),
  };
}

const RUN_KINDS: BillingRunItemKind[] = [
  'generated',
  'skipped',
  'issued',
  'issue_failed',
  'reminder',
  'notice',
  'blocked',
  'suspended',
  'resumed',
  'pack_completed',
  'cancelled',
];

export function readBillingRun(id: string, d: Data): BillingRun {
  const s = obj(d, 'summary') ?? {};
  const k = (key: keyof BillingRunSummary): number => num(s, key);
  return {
    id,
    date: str(d, 'date', id),
    ranAt: date(d['ranAt']),
    runs: num(d, 'runs'),
    online: bool(d, 'online'),
    summary: {
      generated: k('generated'),
      generatedCents: k('generatedCents'),
      issued: k('issued'),
      issueFailed: k('issueFailed'),
      skippedPaused: k('skippedPaused'),
      reminders: k('reminders'),
      notices: k('notices'),
      blocked: k('blocked'),
      suspended: k('suspended'),
      resumed: k('resumed'),
      packsCompleted: k('packsCompleted'),
      cancelledAtCycleEnd: k('cancelledAtCycleEnd'),
      errors: k('errors'),
    },
    items: Array.isArray(d['items'])
      ? (d['items'] as unknown[])
          .filter((x): x is Data => !!x && typeof x === 'object')
          .map((x) => ({
            subscriptionId: str(x, 'subscriptionId'),
            name: str(x, 'name'),
            kind: ((RUN_KINDS as string[]).includes(str(x, 'kind')) ? str(x, 'kind') : 'generated') as BillingRunItemKind,
            detail: str(x, 'detail'),
            cents: num(x, 'cents'),
          }))
      : [],
  };
}

const RECEIVING_STATUSES: ReceivingStatus[] = ['creating', 'failed', 'pending', 'approved', 'rejected'];

/** Centro conectado pelo script/backoffice antigo não tem `receivingStatus`: conta como ativa. */
export function readReceivingStatus(raw: unknown, connected: boolean): ReceivingStatus {
  if (typeof raw === 'string' && (RECEIVING_STATUSES as string[]).includes(raw)) {
    return raw as ReceivingStatus;
  }
  return connected ? 'approved' : 'none';
}

export function readReceivingAccount(d: Data): ReceivingAccount {
  return {
    status: readReceivingStatus(d['status'], false),
    source: d['source'] === 'manual' ? 'manual' : 'self',
    personType: d['personType'] === 'person' ? 'person' : 'company',
    name: str(d, 'name'),
    email: str(d, 'email'),
    document: str(d, 'document'),
    documents: Array.isArray(d['documents'])
      ? (d['documents'] as unknown[])
          .filter((x): x is Data => !!x && typeof x === 'object')
          .map((x) => ({ title: str(x, 'title', 'Documento'), status: str(x, 'status'), url: str(x, 'url') }))
      : [],
    manualFollowUp: bool(d, 'manualFollowUp'),
    createdAt: date(d['createdAt']),
    createdByName: str(d, 'createdByName'),
    statusCheckedAt: date(d['statusCheckedAt']),
  };
}

const TEMPLATE_STATUSES = ['draft', 'published', 'archived'];

function readTemplateVersion(raw: unknown): TemplateVersion | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const d = raw as Data;
  return { version: num(d, 'version'), body: str(d, 'body'), publishedAt: date(d['publishedAt']), byName: str(d, 'byName') };
}

/** `contractTemplates/{id}` — modelo de contrato (o gestor escreve pelo portal). */
export function readContractTemplate(id: string, d: Data): ContractTemplate {
  const status = str(d, 'status');
  const audience = str(d, 'audience');
  return {
    id,
    name: str(d, 'name', 'Modelo'),
    kind: str(d, 'kind') === 'enrollment' ? 'enrollment' : 'term',
    audience: audience === 'adult' || audience === 'minor' ? audience : 'any',
    optional: bool(d, 'optional'),
    status: (TEMPLATE_STATUSES.includes(status) ? status : 'draft') as ContractTemplate['status'],
    version: num(d, 'version'),
    body: str(d, 'body'),
    draftBody: str(d, 'draftBody'),
    draftUpdatedAt: date(d['draftUpdatedAt']),
    draftUpdatedByName: str(d, 'draftUpdatedByName'),
    publishedAt: date(d['publishedAt']),
    publishedByName: str(d, 'publishedByName'),
    versions: Array.isArray(d['versions'])
      ? (d['versions'] as unknown[])
          .map(readTemplateVersion)
          .filter((x): x is TemplateVersion => x != null)
          .sort((a, b) => b.version - a.version)
      : [],
    createdAt: date(d['createdAt']),
    createdByName: str(d, 'createdByName'),
  };
}

const CONTRACT_STATUSES: ContractStatus[] = ['sent', 'viewed', 'signed', 'declined', 'terminated', 'cancelled'];
const CONTRACT_EVENT_TYPES: ContractEventType[] = ['sent', 'viewed', 'reminded', 'signed', 'declined', 'terminated', 'cancelled'];

function readContractEvent(raw: unknown): ContractEvent | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const d = raw as Data;
  const type = str(d, 'type') as ContractEventType;
  return {
    at: date(d['at']),
    type: CONTRACT_EVENT_TYPES.includes(type) ? type : 'sent',
    title: str(d, 'title'),
    byName: str(d, 'byName'),
    detail: str(d, 'detail'),
  };
}

function readEvidence(raw: Data | null): ContractEvidence | null {
  if (!raw) {
    return null;
  }
  return {
    method: str(raw, 'method'),
    uid: str(raw, 'uid'),
    email: str(raw, 'email'),
    ip: str(raw, 'ip'),
    userAgent: str(raw, 'userAgent'),
    platform: str(raw, 'platform'),
    appVersion: str(raw, 'appVersion'),
    readSeconds: num(raw, 'readSeconds'),
    sha256: str(raw, 'sha256'),
  };
}

/** `contracts/{id}` — contrato de um aluno (só o servidor grava). */
export function readContract(id: string, d: Data): StudentContract {
  const status = str(d, 'status') as ContractStatus;
  const signer = obj(d, 'signer');
  const centerSig = obj(d, 'centerSignature');
  const decision = str(d, 'decision');
  const isMinor = bool(d, 'isMinor');
  return {
    id,
    number: str(d, 'number'),
    centerName: str(d, 'centerName'),
    studentId: str(d, 'studentId'),
    studentName: str(d, 'studentName', 'Aluno'),
    studentUid: strOrNull(d, 'studentUid'),
    isMinor,
    signer: {
      role: signer ? (str(signer, 'role') === 'guardian' ? 'guardian' : 'student') : isMinor ? 'guardian' : 'student',
      name: signer ? str(signer, 'name') : '',
      relation: signer ? str(signer, 'relation') : '',
    },
    templateId: str(d, 'templateId'),
    templateName: str(d, 'templateName'),
    templateVersion: num(d, 'templateVersion', 1),
    kind: str(d, 'kind') === 'enrollment' ? 'enrollment' : 'term',
    optional: bool(d, 'optional'),
    title: str(d, 'title') || str(d, 'templateName', 'Contrato'),
    body: str(d, 'body'),
    sha256: str(d, 'sha256'),
    essentials: Array.isArray(d['essentials'])
      ? (d['essentials'] as unknown[])
          .filter((x): x is Data => !!x && typeof x === 'object')
          .map((x) => ({ label: str(x, 'label'), value: str(x, 'value') }))
      : [],
    enrollmentId: strOrNull(d, 'enrollmentId'),
    classId: strOrNull(d, 'classId'),
    className: str(d, 'className'),
    planName: str(d, 'planName'),
    priceCents: numOrNull(d, 'priceCents'),
    startDate: strOrNull(d, 'startDate'),
    endDate: strOrNull(d, 'endDate'),
    requireBeforePayment: bool(d, 'requireBeforePayment'),
    status: CONTRACT_STATUSES.includes(status) ? status : 'sent',
    decision: decision === 'accepted' || decision === 'declined' ? decision : null,
    sentAt: date(d['sentAt']),
    sentByName: str(d, 'sentByName'),
    viewCount: num(d, 'viewCount'),
    viewedAt: date(d['viewedAt']),
    lastViewedAt: date(d['lastViewedAt']),
    signedAt: date(d['signedAt']),
    evidence: readEvidence(obj(d, 'evidence')),
    centerSignature: centerSig ? { name: str(centerSig, 'name'), at: date(centerSig['at']) } : null,
    reminderCount: num(d, 'reminderCount'),
    remindedAt: date(d['remindedAt']),
    terminatedAt: date(d['terminatedAt']),
    terminatedByName: str(d, 'terminatedByName'),
    terminateReason: str(d, 'terminateReason'),
    events: Array.isArray(d['events'])
      ? (d['events'] as unknown[]).map(readContractEvent).filter((x): x is ContractEvent => x != null)
      : [],
    createdAt: date(d['createdAt']),
  };
}
