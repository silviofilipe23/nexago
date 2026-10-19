import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import {
  chargeFromDoc,
  creditFromDoc,
  enrollmentFromDoc,
  planFromDoc,
  rulesFromDoc,
  waitlistFromDoc,
  type Charge,
  type ClassPlan,
  type ClassRules,
  type Enrollment,
  type MakeupCredit,
  type PaymentMethod,
  type PlanKind,
  type WaitlistEntry,
} from './billing.model';
import { ArenaClassError } from './classes-repository';

/** Fase 2 de Aulas — leitura direto do Firestore (sempre filtrando `arenaId`, como as rules
 *  exigem) e escrita só por callable (`functions/src/arena-class-billing.ts` e `-makeup.ts`). */

async function call<In, Out>(functions: Functions, name: string, input: In): Promise<Out> {
  try {
    return (await httpsCallable<In, Out>(functions, name)(input)).data;
  } catch (err) {
    throw new ArenaClassError(err instanceof Error && err.message ? err.message : 'Não foi possível concluir a operação.');
  }
}

// ── Leituras ────────────────────────────────────────────────────────────────

export async function fetchPlans(db: Firestore, arenaId: string): Promise<ClassPlan[]> {
  const snap = await getDocs(collection(db, 'arenas', arenaId, 'classPlans'));
  return snap.docs.map(planFromDoc).sort((a, b) => a.priceReais - b.priceReais);
}

export async function fetchRules(db: Firestore, arenaId: string): Promise<ClassRules> {
  const snap = await getDoc(doc(db, 'arenas', arenaId, 'classSettings', 'rules'));
  return rulesFromDoc(snap.exists() ? (snap.data() as Record<string, unknown>) : undefined);
}

export async function fetchEnrollments(db: Firestore, arenaId: string): Promise<Enrollment[]> {
  const snap = await getDocs(query(collection(db, 'arenaClassEnrollments'), where('arenaId', '==', arenaId)));
  return snap.docs.map(enrollmentFromDoc).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function watchEnrollment(db: Firestore, enrollmentId: string, onChange: (e: Enrollment | null) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'arenaClassEnrollments', enrollmentId),
    (snap) => onChange(snap.exists() ? enrollmentFromDoc(snap) : null),
    () => onChange(null),
  );
}

export async function fetchOpenCharges(db: Firestore, arenaId: string): Promise<Charge[]> {
  const snap = await getDocs(
    query(collection(db, 'arenaClassCharges'), where('arenaId', '==', arenaId), where('status', '==', 'open')),
  );
  return snap.docs.map(chargeFromDoc).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Pagas desde `fromKey` (receita do mês). */
export async function fetchPaidChargesSince(db: Firestore, arenaId: string, fromKey: string): Promise<Charge[]> {
  const snap = await getDocs(
    query(
      collection(db, 'arenaClassCharges'),
      where('arenaId', '==', arenaId),
      where('status', '==', 'paid'),
      where('paidOn', '>=', fromKey),
    ),
  );
  return snap.docs.map(chargeFromDoc);
}

export function watchStudentCharges(db: Firestore, arenaId: string, studentId: string, onChange: (c: Charge[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'arenaClassCharges'), where('arenaId', '==', arenaId), where('studentId', '==', studentId)),
    (snap) => onChange(snap.docs.map(chargeFromDoc).sort((a, b) => b.dueDate.localeCompare(a.dueDate))),
    () => onChange([]),
  );
}

export async function fetchAvailableCredits(db: Firestore, arenaId: string): Promise<MakeupCredit[]> {
  const snap = await getDocs(
    query(collection(db, 'arenaClassCredits'), where('arenaId', '==', arenaId), where('status', '==', 'available')),
  );
  return snap.docs.map(creditFromDoc).sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
}

export async function fetchStudentCredits(db: Firestore, arenaId: string, studentId: string): Promise<MakeupCredit[]> {
  const snap = await getDocs(
    query(collection(db, 'arenaClassCredits'), where('arenaId', '==', arenaId), where('studentId', '==', studentId)),
  );
  return snap.docs.map(creditFromDoc).sort((a, b) => b.sourceDate.localeCompare(a.sourceDate));
}

export async function fetchWaitlistEntry(db: Firestore, classId: string, entryId: string): Promise<WaitlistEntry | null> {
  const snap = await getDoc(doc(db, 'arenaClasses', classId, 'classWaitlist', entryId));
  return snap.exists() ? waitlistFromDoc(snap) : null;
}

export function watchWaitlist(db: Firestore, arenaId: string, classId: string, onChange: (w: WaitlistEntry[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'arenaClasses', classId, 'classWaitlist'), where('arenaId', '==', arenaId)),
    (snap) =>
      onChange(
        snap.docs
          .map(waitlistFromDoc)
          .filter((w) => w.status === 'waiting')
          .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)),
      ),
    () => onChange([]),
  );
}

// ── Callables ───────────────────────────────────────────────────────────────

export interface PlanInput {
  arenaId: string;
  planId?: string;
  name: string;
  kind: PlanKind;
  priceReais: number;
  classesPerWeek?: number | null;
  makeupsPerMonth?: number | null;
  credits?: number | null;
  validityDays?: number | null;
  description?: string | null;
  status?: 'active' | 'archived';
}

export function upsertPlan(functions: Functions, input: PlanInput): Promise<{ planId: string }> {
  return call(functions, 'upsertArenaClassPlan', input);
}

export function saveRules(functions: Functions, arenaId: string, rules: ClassRules): Promise<ClassRules> {
  return call(functions, 'saveArenaClassRules', { arenaId, ...rules });
}

export interface EnrollmentInput {
  arenaId: string;
  planId: string;
  slots: Array<{ classId: string; weekday: number }>;
  dueDay: number;
  paymentMethod: PaymentMethod;
  waiveFee: boolean;
  athleteId?: string;
  studentId?: string;
  name?: string;
  phone?: string;
  waitlistClassId?: string;
  waitlistEntryId?: string;
}

export interface EnrollmentPreview {
  charges: Array<{ description: string; amountReais: number; dueDate: string }>;
  totalReais: number;
  enrollmentFeeReais: number;
}

export function previewEnrollment(functions: Functions, input: EnrollmentInput): Promise<EnrollmentPreview> {
  return call(functions, 'previewArenaClassEnrollment', input);
}

export function createEnrollment(
  functions: Functions,
  input: EnrollmentInput,
): Promise<{ enrollmentId: string; studentId: string; chargeIds: string[] }> {
  return call(functions, 'createArenaClassEnrollment', input);
}

export function setEnrollmentStatus(
  functions: Functions,
  enrollmentId: string,
  status: 'active' | 'paused' | 'canceled',
): Promise<{ status: string; canceledCharges: number }> {
  return call(functions, 'setArenaClassEnrollmentStatus', { enrollmentId, status });
}

export function setChargeStatus(
  functions: Functions,
  chargeId: string,
  status: 'paid' | 'open' | 'canceled',
  paymentMethod?: PaymentMethod,
  paidOn?: string,
): Promise<{ chargeId: string; status: string }> {
  return call(functions, 'setArenaClassChargeStatus', { chargeId, status, paymentMethod, paidOn });
}

export function addExtra(
  functions: Functions,
  input: { sessionId: string; kind: 'makeup' | 'trial'; creditId?: string; athleteId?: string; name?: string; phone?: string },
): Promise<{ studentId: string }> {
  return call(functions, 'addArenaClassExtra', input);
}

export function removeExtra(functions: Functions, sessionId: string, studentId: string): Promise<unknown> {
  return call(functions, 'removeArenaClassExtra', { sessionId, studentId });
}

export function addWaitlist(
  functions: Functions,
  input: { classId: string; athleteId?: string; name?: string; phone?: string; note?: string },
): Promise<{ entryId: string }> {
  return call(functions, 'addArenaClassWaitlist', input);
}

export function removeWaitlist(functions: Functions, classId: string, entryId: string): Promise<unknown> {
  return call(functions, 'removeArenaClassWaitlist', { classId, entryId });
}
