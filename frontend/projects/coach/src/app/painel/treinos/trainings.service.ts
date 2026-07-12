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

export type TrainingStatus = 'agendado' | 'realizado' | 'cancelado';
export type AttendanceStatus = 'presente' | 'ausente' | 'atrasado' | 'justificado';

export interface TrainingExercise {
  label: string;
  durationMin: number;
  order: number;
}

export interface Training {
  id: string;
  squadId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  materials: string;
  exercises: TrainingExercise[];
  status: TrainingStatus;
  attendance: Record<string, AttendanceStatus>;
}

export interface NewTrainingInput {
  squadId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  materials: string;
  exercises: TrainingExercise[];
}

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

function readTraining(id: string, data: Record<string, unknown> | undefined): Training {
  const rawExercises = Array.isArray(data?.['exercises']) ? (data!['exercises'] as unknown[]) : [];
  return {
    id,
    squadId: typeof data?.['squadId'] === 'string' ? (data['squadId'] as string) : '',
    title: typeof data?.['title'] === 'string' ? (data['title'] as string) : '',
    date: typeof data?.['date'] === 'string' ? (data['date'] as string) : '',
    startTime: typeof data?.['startTime'] === 'string' ? (data['startTime'] as string) : '',
    endTime: typeof data?.['endTime'] === 'string' ? (data['endTime'] as string) : '',
    location: typeof data?.['location'] === 'string' ? (data['location'] as string) : '',
    materials: typeof data?.['materials'] === 'string' ? (data['materials'] as string) : '',
    exercises: rawExercises.map((e) => {
      const rec = (e ?? {}) as Record<string, unknown>;
      return {
        label: typeof rec['label'] === 'string' ? (rec['label'] as string) : '',
        durationMin: typeof rec['durationMin'] === 'number' ? (rec['durationMin'] as number) : 0,
        order: typeof rec['order'] === 'number' ? (rec['order'] as number) : 0,
      };
    }),
    status: (data?.['status'] as TrainingStatus | undefined) ?? 'agendado',
    attendance: (data?.['attendance'] as Record<string, AttendanceStatus> | undefined) ?? {},
  };
}

/** `coaches/{uid}/trainings` é ownership-only (Task 2) — leitura/escrita direta do client. */
@Injectable({ providedIn: 'root' })
export class TrainingsService {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  private readonly trainingsState = signal<Training[]>([]);
  readonly trainings = computed(() => this.trainingsState());

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      if (!uid) {
        this.trainingsState.set([]);
        return;
      }

      const stop = onSnapshot(
        collection(this.firestore, 'coaches', uid, 'trainings'),
        (snapshot) => {
          this.trainingsState.set(snapshot.docs.map((d) => readTraining(d.id, d.data())));
        },
        () => this.trainingsState.set([]),
      );

      onCleanup(stop);
    });
  }

  async createTraining(input: NewTrainingInput): Promise<string> {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }
    const ref = doc(collection(this.firestore, 'coaches', uid, 'trainings'));
    await setDoc(ref, {
      squadId: input.squadId,
      title: input.title,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      location: input.location,
      materials: input.materials,
      exercises: input.exercises,
      status: 'agendado',
      attendance: {},
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  async setAttendance(trainingId: string, attendance: Record<string, AttendanceStatus>): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }
    await setDoc(
      doc(this.firestore, 'coaches', uid, 'trainings', trainingId),
      { attendance, status: 'realizado' },
      { merge: true },
    );
  }
}
