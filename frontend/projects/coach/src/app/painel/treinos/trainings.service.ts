import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { CoachContextService } from '../access/coach-context.service';

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
  /** Mesmo valor em todos os treinos gerados juntos por "Repetir"; `null` em treino avulso. */
  seriesId: string | null;
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
    seriesId: typeof data?.['seriesId'] === 'string' ? (data['seriesId'] as string) : null,
  };
}

/** `coaches/{uid}/trainings` é ownership-only (Task 2) — leitura/escrita direta do client. */
@Injectable({ providedIn: 'root' })
export class TrainingsService {
  private readonly ctx = inject(CoachContextService);
  private readonly firestore = createFirestore();

  private readonly trainingsState = signal<Training[]>([]);
  readonly trainings = computed(() => this.trainingsState());
  /** `true` depois do primeiro snapshot (ou erro): distingue "carregando" de "não existe". */
  readonly ready = signal(false);

  constructor() {
    effect((onCleanup) => {
      const uid = this.ctx.activeCoachUid();
      // Reset ANTES de reassinar: os treinos do treinador anterior não sobrevivem à troca.
      // untracked: o reset não pode virar dependência do effect (setSquads lê activeSquadId => loop).
      untracked(() => {
        this.trainingsState.set([]);
        this.ready.set(false);
      });
      if (!uid) {
        return;
      }
      // Deps rastreadas (de propósito): activeCoachUid e role (via can). Cargo sem 'treinos' não abre
      // o listener: a lista fica vazia e `ready` true (não fica "carregando" para sempre).
      if (!this.ctx.can('treinos')) {
        untracked(() => this.ready.set(true));
        return;
      }

      const stop = onSnapshot(
        collection(this.firestore, 'coaches', uid, 'trainings'),
        (snapshot) => {
          this.trainingsState.set(snapshot.docs.map((d) => readTraining(d.id, d.data())));
          this.ready.set(true);
        },
        () => {
          this.trainingsState.set([]);
          this.ready.set(true);
        },
      );

      onCleanup(stop);
    });
  }

  async createTraining(input: NewTrainingInput): Promise<string> {
    const uid = this.ctx.activeCoachUid();
    if (!uid) {
      throw new Error('Nenhum painel de treinador ativo.');
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

  /** Cria vários treinos de uma vez (série recorrente), atomicamente, todos com o mesmo `seriesId`. */
  async createTrainings(inputs: NewTrainingInput[]): Promise<string> {
    const uid = this.requireUid();
    const col = collection(this.firestore, 'coaches', uid, 'trainings');
    const seriesId = doc(col).id;
    const batch = writeBatch(this.firestore);
    for (const input of inputs) {
      batch.set(doc(col), {
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
        seriesId,
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
    return seriesId;
  }

  async setAttendance(trainingId: string, attendance: Record<string, AttendanceStatus>): Promise<void> {
    const uid = this.ctx.activeCoachUid();
    if (!uid) {
      throw new Error('Nenhum painel de treinador ativo.');
    }
    const current = this.trainingsState().find((t) => t.id === trainingId);
    // Treino cancelado continua cancelado — salvar presença não pode "ressuscitá-lo".
    const status: TrainingStatus = current?.status === 'cancelado' ? 'cancelado' : 'realizado';
    await setDoc(
      doc(this.firestore, 'coaches', uid, 'trainings', trainingId),
      { attendance, status },
      { merge: true },
    );
  }

  /** Edita os dados do treino; `attendance`, `status` e `squadId` ficam intactos.
   *  `updateDoc` (e não `setDoc` com merge) pra falhar se o treino não existe, em vez de criar um doc fantasma. */
  async updateTraining(trainingId: string, input: Omit<NewTrainingInput, 'squadId'>): Promise<void> {
    await updateDoc(
      doc(this.firestore, 'coaches', this.requireUid(), 'trainings', trainingId),
      {
        title: input.title,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        location: input.location,
        materials: input.materials,
        exercises: input.exercises,
        updatedAt: serverTimestamp(),
      },
    );
  }

  /** Cancelar é lógico (`cancelado`); quem chama decide o status de volta ao reativar. */
  async setTrainingStatus(trainingId: string, status: TrainingStatus): Promise<void> {
    await updateDoc(doc(this.firestore, 'coaches', this.requireUid(), 'trainings', trainingId), { status });
  }

  /** Aplica os mesmos campos (menos a data — cada treino mantém a sua) a vários treinos, atomicamente. */
  async updateTrainings(ids: string[], input: Omit<NewTrainingInput, 'squadId' | 'date'>): Promise<void> {
    const col = collection(this.firestore, 'coaches', this.requireUid(), 'trainings');
    const batch = writeBatch(this.firestore);
    for (const id of ids) {
      batch.update(doc(col, id), {
        title: input.title,
        startTime: input.startTime,
        endTime: input.endTime,
        location: input.location,
        materials: input.materials,
        exercises: input.exercises,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  async setTrainingsStatus(ids: string[], status: TrainingStatus): Promise<void> {
    const col = collection(this.firestore, 'coaches', this.requireUid(), 'trainings');
    const batch = writeBatch(this.firestore);
    for (const id of ids) {
      batch.update(doc(col, id), { status });
    }
    await batch.commit();
  }

  async deleteTraining(trainingId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'coaches', this.requireUid(), 'trainings', trainingId));
  }

  private requireUid(): string {
    const uid = this.ctx.activeCoachUid();
    if (!uid) {
      throw new Error('Nenhum painel de treinador ativo.');
    }
    return uid;
  }
}
