import { collection, doc, onSnapshot, query, where, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import {
  chargeFromDoc,
  occurrenceFromDoc,
  planFromDoc,
  settingsFromRaw,
  subscriptionFromDoc,
  waitlistFromDoc,
  type PlanBilling,
  type PlanCycles,
  type PlanOccurrence,
  type PlanRules,
  type PlanWindow,
  type ScheduleCharge,
  type ScheduleCycle,
  type ScheduleManualMethod,
  type SchedulePaymentForm,
  type SchedulePlan,
  type SchedulePlanStatus,
  type ScheduleSettings,
  type ScheduleSubscription,
  type ScheduleWaitlistEntry,
} from './schedule-plan.model';

/** Planos de horário — leitura direto do Firestore (sempre filtrando `arenaId`, como as rules
 *  exigem para a equipe) e escrita só por callable (contrato do spec 2026-11-03). */

export class SchedulePlanError extends Error {}

const GENERIC_ERROR = 'Não foi possível concluir a operação. Tente novamente.';

/** Mensagem do `HttpsError` do servidor (já em português). Código cru (`internal`, `NOT FOUND` de
 *  callable que ainda não subiu) vira a mensagem genérica — nunca mostrar erro técnico. */
export function friendlyCallableError(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  const message = err instanceof Error ? err.message.trim() : '';
  const raw = !message || /^[A-Z_ -]+$/.test(message) || ['internal', 'not-found', 'unavailable'].includes(message.toLowerCase());
  if (!raw) return message;
  return code === 'functions/unavailable' ? 'Sem conexão com o servidor. Tente de novo em instantes.' : GENERIC_ERROR;
}

async function call<In, Out>(functions: Functions, name: string, input: In): Promise<Out> {
  try {
    return (await httpsCallable<In, Out>(functions, name)(input)).data;
  } catch (err) {
    throw new SchedulePlanError(friendlyCallableError(err));
  }
}

// ── Leituras ────────────────────────────────────────────────────────────────

export function watchPlans(db: Firestore, arenaId: string, onChange: (plans: SchedulePlan[]) => void, onError: () => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'arenas', arenaId, 'schedulePlans'),
    (snap) => onChange(snap.docs.map(planFromDoc)),
    onError,
  );
}

export function watchSettings(db: Firestore, arenaId: string, onChange: (s: ScheduleSettings) => void, onError: () => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'arenas', arenaId, 'scheduleSettings', 'rules'),
    (snap) => onChange(settingsFromRaw(snap.exists() ? (snap.data() as Record<string, unknown>) : undefined)),
    onError,
  );
}

/** Assinaturas que seguram horário (canceladas ficam de fora). */
export function watchSubscriptions(
  db: Firestore,
  arenaId: string,
  onChange: (subs: ScheduleSubscription[]) => void,
  onError: () => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'arenaScheduleSubscriptions'),
      where('arenaId', '==', arenaId),
      where('status', 'in', ['active', 'paused', 'suspended']),
    ),
    (snap) => onChange(snap.docs.map(subscriptionFromDoc).sort((a, b) => a.holderName.localeCompare(b.holderName, 'pt-BR'))),
    onError,
  );
}

export function watchOpenCharges(db: Firestore, arenaId: string, onChange: (c: ScheduleCharge[]) => void, onError: () => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'arenaScheduleCharges'), where('arenaId', '==', arenaId), where('status', '==', 'open')),
    (snap) => onChange(snap.docs.map(chargeFromDoc).sort((a, b) => a.dueDate.localeCompare(b.dueDate))),
    onError,
  );
}

export function watchWaitlist(
  db: Firestore,
  arenaId: string,
  onChange: (w: ScheduleWaitlistEntry[]) => void,
  onError: () => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'arenaScheduleWaitlist'), where('arenaId', '==', arenaId), where('status', 'in', ['waiting', 'offered'])),
    (snap) => onChange(snap.docs.map(waitlistFromDoc)),
    onError,
  );
}

/** Todas as mensalidades da assinatura (abertas, pagas e canceladas). */
export function watchSubscriptionCharges(
  db: Firestore,
  arenaId: string,
  subscriptionId: string,
  onChange: (c: ScheduleCharge[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'arenaScheduleCharges'), where('arenaId', '==', arenaId), where('subscriptionId', '==', subscriptionId)),
    (snap) => onChange(snap.docs.map(chargeFromDoc).sort((a, b) => a.payerIndex - b.payerIndex)),
    () => onChange([]),
  );
}

/** Ocorrências da assinatura em `arenaBookings` (as de plano e as reposições). */
export function watchSubscriptionOccurrences(
  db: Firestore,
  arenaId: string,
  subscriptionId: string,
  onChange: (o: PlanOccurrence[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'arenaBookings'), where('arenaId', '==', arenaId), where('scheduleSubscriptionId', '==', subscriptionId)),
    (snap) => onChange(snap.docs.map(occurrenceFromDoc).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startTime.localeCompare(b.startTime))),
    () => onChange([]),
  );
}

// ── Callables (gestor) ──────────────────────────────────────────────────────

export interface SchedulePlanInput {
  arenaId: string;
  planId?: string;
  name: string;
  description: string | null;
  status: SchedulePlanStatus;
  timesPerWeek: number;
  durationMinutes: number;
  windows: PlanWindow[];
  courtIds: string[];
  courtNames: string[];
  capacity: number;
  monthlyPriceReais: number;
  referenceHourlyReais: number | null;
  cycles: PlanCycles;
  billing: PlanBilling;
  rules: PlanRules;
}

export function upsertSchedulePlan(functions: Functions, input: SchedulePlanInput): Promise<{ planId: string }> {
  return call(functions, 'upsertArenaSchedulePlan', input);
}

export interface ScheduleRulesInput {
  arenaId: string;
  primeWindows?: PlanWindow[];
  primeCapPercent?: number;
  waitlistAutoOffer?: boolean;
  waitlistOfferHours?: 12 | 24 | 48;
}

export function saveScheduleRules(functions: Functions, input: ScheduleRulesInput): Promise<unknown> {
  return call(functions, 'saveArenaScheduleRules', input);
}

export interface CreateSubscriptionInput {
  arenaId: string;
  planId: string;
  holderAthleteId?: string;
  holderName?: string;
  holderPhone?: string;
  weekdays: number[];
  startTime: string;
  cycle: ScheduleCycle;
  paymentMethod: SchedulePaymentForm;
  startDate?: string;
}

export function createScheduleSubscription(
  functions: Functions,
  input: CreateSubscriptionInput,
): Promise<{ subscriptionId: string; courtName: string; skippedDates: string[] }> {
  return call(functions, 'createArenaScheduleSubscription', input);
}

export function endScheduleSubscription(
  functions: Functions,
  subscriptionId: string,
  endsOn: string,
  reason?: string,
): Promise<{ status: string; endsOn: string }> {
  return call(functions, 'endArenaScheduleSubscription', { subscriptionId, endsOn, ...(reason ? { reason } : {}) });
}

export function grantScheduleMakeup(functions: Functions, subscriptionId: string, note?: string): Promise<{ creditId: string }> {
  return call(functions, 'grantArenaScheduleMakeup', { subscriptionId, ...(note ? { note } : {}) });
}

export function registerSchedulePayment(
  functions: Functions,
  chargeId: string,
  paymentMethod: ScheduleManualMethod,
  paidOn?: string,
): Promise<{ status: string; reactivated: boolean }> {
  return call(functions, 'registerArenaSchedulePayment', { chargeId, paymentMethod, ...(paidOn ? { paidOn } : {}) });
}

export function cancelScheduleCharge(functions: Functions, chargeId: string): Promise<{ status: string }> {
  return call(functions, 'cancelArenaScheduleCharge', { chargeId });
}

export function offerScheduleWaitlist(functions: Functions, entryId: string): Promise<{ courtName: string; expiresAt: unknown }> {
  return call(functions, 'offerArenaScheduleWaitlist', { entryId });
}

export function removeScheduleWaitlist(functions: Functions, entryId: string): Promise<unknown> {
  return call(functions, 'removeArenaScheduleWaitlist', { entryId });
}

export function applyScheduleHoliday(functions: Functions, arenaId: string, date: string): Promise<{ canceled: number; credits: number }> {
  return call(functions, 'applyArenaScheduleHoliday', { arenaId, date });
}

export function changeScheduleSlots(
  functions: Functions,
  subscriptionId: string,
  weekdays: number[],
  startTime: string,
): Promise<{ courtName: string; skippedDates: string[] }> {
  return call(functions, 'changeArenaScheduleSubscriptionSlots', { subscriptionId, weekdays, startTime });
}

export function pauseScheduleSubscription(functions: Functions, subscriptionId: string, until: string): Promise<{ pausedUntil: string; daysLeft: number }> {
  return call(functions, 'pauseArenaScheduleSubscription', { subscriptionId, until });
}

export function resumeScheduleSubscription(functions: Functions, subscriptionId: string): Promise<{ status: string }> {
  return call(functions, 'resumeArenaScheduleSubscription', { subscriptionId });
}
