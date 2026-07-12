import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import type { Evaluation, EvaluationScores } from './evaluation-stats';

export interface NewEvaluationInput {
  athleteUid: string;
  scores: EvaluationScores;
  notes: string;
}

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

const SCORE_KEYS: (keyof EvaluationScores)[] = [
  'saque', 'recepcao', 'levantamento', 'ataque', 'defesa', 'bloqueio', 'condicionamento', 'comunicacao', 'mental',
];

function readScores(raw: Record<string, unknown> | undefined): EvaluationScores {
  const out = {} as EvaluationScores;
  for (const key of SCORE_KEYS) {
    const v = raw?.[key];
    out[key] = typeof v === 'number' ? v : 0;
  }
  return out;
}

function readEvaluation(id: string, data: Record<string, unknown> | undefined): Evaluation {
  return {
    id,
    athleteUid: typeof data?.['athleteUid'] === 'string' ? (data['athleteUid'] as string) : '',
    date: typeof data?.['date'] === 'string' ? (data['date'] as string) : '',
    scores: readScores(data?.['scores'] as Record<string, unknown> | undefined),
    notes: typeof data?.['notes'] === 'string' ? (data['notes'] as string) : '',
  };
}

/** `coaches/{uid}/evaluations` é ownership-only (Task 2) — leitura/escrita direta do client. */
@Injectable({ providedIn: 'root' })
export class EvaluationsService {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  private readonly evaluationsState = signal<Evaluation[]>([]);
  readonly evaluations = computed(() => this.evaluationsState());

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      if (!uid) {
        this.evaluationsState.set([]);
        return;
      }

      const stop = onSnapshot(
        collection(this.firestore, 'coaches', uid, 'evaluations'),
        (snapshot) => {
          this.evaluationsState.set(snapshot.docs.map((d) => readEvaluation(d.id, d.data())));
        },
        () => this.evaluationsState.set([]),
      );

      onCleanup(stop);
    });
  }

  async createEvaluation(input: NewEvaluationInput): Promise<string> {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }
    const ref = doc(collection(this.firestore, 'coaches', uid, 'evaluations'));
    await setDoc(ref, {
      athleteUid: input.athleteUid,
      date: new Date().toISOString().slice(0, 10),
      scores: input.scores,
      notes: input.notes,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }
}
