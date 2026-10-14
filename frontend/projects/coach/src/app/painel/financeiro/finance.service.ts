import { Injectable, effect, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type CollectionReference,
  type Firestore,
} from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { localIsoDate } from '../treinos/training-rules';
import { readCharge, readEnrollment, readPlan, type Charge, type Enrollment, type Plan } from './finance-model';
import { currentMonth, monthRange, type PlanCycle } from './finance-rules';

export interface PlanInput {
  name: string;
  amountCents: number;
  cycle: PlanCycle;
  description: string;
}

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

/** Traduz o erro do Firestore numa mensagem útil — regra/índice não publicados não podem virar "lista vazia". */
function describeError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: string }).code) : '';
  if (code === 'permission-denied') {
    return 'Sem permissão para acessar o financeiro. As regras do Firestore podem não estar publicadas.';
  }
  if (code === 'failed-precondition') {
    return 'O índice do Firestore ainda está sendo criado. Tente de novo em alguns minutos.';
  }
  return 'Não foi possível carregar o financeiro.';
}

/**
 * Financeiro do treinador (livro-caixa manual). `coaches/{uid}/{plans,enrollments,charges}` são
 * owner-only: leitura e escrita direto do client, sem Cloud Function.
 * Planos e matrículas são pequenos e ouvidos inteiros; parcelas em dois listeners — o mês
 * visível e as pendentes vencidas (qualquer mês).
 */
@Injectable({ providedIn: 'root' })
export class FinanceService {
  private readonly auth = inject(AuthService);
  protected readonly firestore = createFirestore();

  private readonly plansState = signal<Plan[]>([]);
  private readonly enrollmentsState = signal<Enrollment[]>([]);
  private readonly monthChargesState = signal<Charge[]>([]);
  private readonly overdueState = signal<Charge[]>([]);
  private readonly readyState = signal(false);
  private readonly errorState = signal<string | null>(null);

  readonly plans = this.plansState.asReadonly();
  readonly enrollments = this.enrollmentsState.asReadonly();
  readonly monthCharges = this.monthChargesState.asReadonly();
  readonly overdueCharges = this.overdueState.asReadonly();
  /** `true` depois do primeiro snapshot de planos e matrículas (ou de um erro). */
  readonly ready = this.readyState.asReadonly();
  readonly error = this.errorState.asReadonly();
  /** Mês visível em Pagamentos (`YYYY-MM`). */
  readonly month = signal(currentMonth());

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      if (!uid) {
        this.plansState.set([]);
        this.enrollmentsState.set([]);
        this.readyState.set(false);
        this.errorState.set(null);
        return;
      }
      let plansReady = false;
      let enrollmentsReady = false;
      const markReady = () => {
        if (plansReady && enrollmentsReady) {
          this.readyState.set(true);
        }
      };
      const fail = (error: unknown) => {
        this.errorState.set(describeError(error));
        this.readyState.set(true);
      };
      this.errorState.set(null);
      const stopPlans = onSnapshot(
        collection(this.firestore, 'coaches', uid, 'plans'),
        (snap) => {
          this.plansState.set(snap.docs.map((d) => readPlan(d.id, d.data())));
          plansReady = true;
          markReady();
        },
        fail,
      );
      const stopEnrollments = onSnapshot(
        collection(this.firestore, 'coaches', uid, 'enrollments'),
        (snap) => {
          this.enrollmentsState.set(snap.docs.map((d) => readEnrollment(d.id, d.data())));
          enrollmentsReady = true;
          markReady();
        },
        fail,
      );
      onCleanup(() => {
        stopPlans();
        stopEnrollments();
      });
    });

    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      const { start, end } = monthRange(this.month());
      if (!uid) {
        this.monthChargesState.set([]);
        return;
      }
      const stop = onSnapshot(
        query(collection(this.firestore, 'coaches', uid, 'charges'), where('dueDate', '>=', start), where('dueDate', '<=', end)),
        (snap) => this.monthChargesState.set(snap.docs.map((d) => readCharge(d.id, d.data()))),
        (error) => this.errorState.set(describeError(error)),
      );
      onCleanup(stop);
    });

    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      if (!uid) {
        this.overdueState.set([]);
        return;
      }
      const stop = onSnapshot(
        query(
          collection(this.firestore, 'coaches', uid, 'charges'),
          where('status', '==', 'pendente'),
          where('dueDate', '<', localIsoDate()),
        ),
        (snap) => this.overdueState.set(snap.docs.map((d) => readCharge(d.id, d.data()))),
        (error) => this.errorState.set(describeError(error)),
      );
      onCleanup(stop);
    });
  }

  protected requireUid(): string {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }
    return uid;
  }

  protected col(name: 'plans' | 'enrollments' | 'charges'): CollectionReference {
    return collection(this.firestore, 'coaches', this.requireUid(), name);
  }

  async createPlan(input: PlanInput): Promise<string> {
    const ref = doc(this.col('plans'));
    await setDoc(ref, {
      name: input.name.trim(),
      amountCents: input.amountCents,
      cycle: input.cycle,
      description: input.description.trim(),
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async updatePlan(id: string, input: PlanInput): Promise<void> {
    await updateDoc(doc(this.col('plans'), id), {
      name: input.name.trim(),
      amountCents: input.amountCents,
      cycle: input.cycle,
      description: input.description.trim(),
      updatedAt: serverTimestamp(),
    });
  }

  async setPlanActive(id: string, active: boolean): Promise<void> {
    await updateDoc(doc(this.col('plans'), id), { active, updatedAt: serverTimestamp() });
  }
}
