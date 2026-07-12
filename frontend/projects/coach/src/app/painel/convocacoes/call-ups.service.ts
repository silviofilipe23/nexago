import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { collection, getFirestore, onSnapshot, type Firestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';

export type CallUpResponseValue = 'confirmado' | 'talvez' | 'nao_vou' | 'aguardando';

export interface CallUp {
  id: string;
  coachName: string;
  squadId: string;
  title: string;
  message: string;
  responseDeadline: string;
  recipients: string[];
  responses: Record<string, CallUpResponseValue>;
}

export interface NewCallUpInput {
  squadId: string;
  title: string;
  message: string;
  responseDeadline: string;
  recipients: string[];
}

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

function readCallUp(id: string, data: Record<string, unknown> | undefined): CallUp {
  return {
    id,
    coachName: typeof data?.['coachName'] === 'string' ? (data['coachName'] as string) : 'Treinador',
    squadId: typeof data?.['squadId'] === 'string' ? (data['squadId'] as string) : '',
    title: typeof data?.['title'] === 'string' ? (data['title'] as string) : '',
    message: typeof data?.['message'] === 'string' ? (data['message'] as string) : '',
    responseDeadline: typeof data?.['responseDeadline'] === 'string' ? (data['responseDeadline'] as string) : '',
    recipients: Array.isArray(data?.['recipients']) ? (data['recipients'] as string[]) : [],
    responses: (data?.['responses'] as Record<string, CallUpResponseValue> | undefined) ?? {},
  };
}

/** `coaches/{uid}/callUps` só permite leitura direta do client (Task 2); escrita é 100% via Cloud Function. */
@Injectable({ providedIn: 'root' })
export class CallUpsService {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  private readonly callUpsState = signal<CallUp[]>([]);
  readonly callUps = computed(() => this.callUpsState());

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      if (!uid) {
        this.callUpsState.set([]);
        return;
      }

      const stop = onSnapshot(
        collection(this.firestore, 'coaches', uid, 'callUps'),
        (snapshot) => {
          this.callUpsState.set(snapshot.docs.map((d) => readCallUp(d.id, d.data())));
        },
        () => this.callUpsState.set([]),
      );

      onCleanup(stop);
    });
  }

  async sendCallUp(input: NewCallUpInput): Promise<string> {
    const fn = httpsCallable<NewCallUpInput, { callUpId: string }>(
      getFunctions(getApps()[0]!),
      'sendCallUp',
    );
    const res = await fn(input);
    return res.data.callUpId;
  }
}
