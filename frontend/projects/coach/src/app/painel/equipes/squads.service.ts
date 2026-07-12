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
  private readonly auth = inject(AuthService);
  private readonly squadContext = inject(SquadContextService);
  private readonly firestore = createFirestore();

  private readonly squadsState = signal<Squad[]>([]);
  readonly squads = computed(() => this.squadsState());

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      if (!uid) {
        this.squadsState.set([]);
        this.squadContext.setSquads([]);
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
    const uid = this.auth.user()?.uid;
    if (!uid) {
      throw new Error('Usuário não autenticado.');
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
}
