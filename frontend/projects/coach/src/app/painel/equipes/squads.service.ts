import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { CoachContextService } from '../access/coach-context.service';
import { initialsOf } from '../ui/initials';
import { SquadContextService, type SquadSummary } from '../ui/squad-context.service';

export interface Squad {
  id: string;
  name: string;
  category: string;
  gender: string;
  description: string;
}

export interface NewSquadInput {
  name: string;
  category: string;
  gender: string;
  description: string;
}

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

function readSquad(id: string, data: Record<string, unknown> | undefined): Squad {
  return {
    id,
    name: typeof data?.['name'] === 'string' ? (data['name'] as string) : '',
    category: typeof data?.['category'] === 'string' ? (data['category'] as string) : '',
    gender: typeof data?.['gender'] === 'string' ? (data['gender'] as string) : '',
    description: typeof data?.['description'] === 'string' ? (data['description'] as string) : '',
  };
}

function toSummary(squad: Squad): SquadSummary {
  return { id: squad.id, name: squad.name, initials: initialsOf(squad.name) };
}

/** `coaches/{uid}/squads` é ownership-only (Task 2) — leitura/escrita direta do client, sem Cloud Function. */
@Injectable({ providedIn: 'root' })
export class SquadsService {
  private readonly ctx = inject(CoachContextService);
  private readonly squadContext = inject(SquadContextService);
  private readonly firestore = createFirestore();

  private readonly squadsState = signal<Squad[]>([]);
  readonly squads = computed(() => this.squadsState());

  constructor() {
    effect((onCleanup) => {
      const uid = this.ctx.activeCoachUid();
      // Reset ANTES de reassinar: a lista e a equipe ativa do treinador anterior não sobrevivem à troca.
      this.squadsState.set([]);
      this.squadContext.setSquads([]);
      if (!uid) {
        return;
      }

      const stop = onSnapshot(
        collection(this.firestore, 'coaches', uid, 'squads'),
        (snapshot) => {
          const list = snapshot.docs.map((d) => readSquad(d.id, d.data()));
          this.squadsState.set(list);
          this.squadContext.setSquads(list.map(toSummary));
        },
        () => {
          this.squadsState.set([]);
          this.squadContext.setSquads([]);
        },
      );

      onCleanup(stop);
    });
  }

  async createSquad(input: NewSquadInput): Promise<string> {
    const uid = this.ctx.activeCoachUid();
    if (!uid) {
      throw new Error('Nenhum painel de treinador ativo.');
    }
    const ref = doc(collection(this.firestore, 'coaches', uid, 'squads'));
    await setDoc(ref, {
      name: input.name.trim(),
      category: input.category,
      gender: input.gender,
      description: input.description.trim(),
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  async updateSquad(squadId: string, input: NewSquadInput): Promise<void> {
    await setDoc(
      doc(this.firestore, 'coaches', this.requireUid(), 'squads', squadId),
      {
        name: input.name.trim(),
        category: input.category,
        gender: input.gender,
        description: input.description.trim(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  async deleteSquad(squadId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'coaches', this.requireUid(), 'squads', squadId));
  }

  private requireUid(): string {
    const uid = this.ctx.activeCoachUid();
    if (!uid) {
      throw new Error('Nenhum painel de treinador ativo.');
    }
    return uid;
  }
}
