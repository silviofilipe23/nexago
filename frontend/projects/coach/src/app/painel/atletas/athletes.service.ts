import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  documentId,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  setDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { initialsOf } from '../ui/initials';
import type { AthleteStatus } from '../ui/athlete-avatar.component';

export interface AthleteLink {
  athleteUid: string;
  squadId: string | null;
  status: AthleteStatus;
  position: string;
  dominantHand: string;
  heightCm: number | null;
  weightKg: number | null;
  emergencyContact: string;
  notes: string;
}

export interface AthletePublicProfile {
  displayName: string;
  initials: string;
  category: string;
}

export interface RosterAthlete extends AthleteLink, AthletePublicProfile {}

export interface AthleteSearchHit {
  uid: string;
  displayName: string;
  initials: string;
}

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

function firstNonEmptyString(data: Record<string, unknown> | undefined, keys: string[]): string {
  if (!data) {
    return '';
  }
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function readAthleteLink(athleteUid: string, data: Record<string, unknown> | undefined): AthleteLink {
  return {
    athleteUid,
    squadId: typeof data?.['squadId'] === 'string' ? (data['squadId'] as string) : null,
    status: (data?.['status'] as AthleteStatus | undefined) ?? 'ativo',
    position: typeof data?.['position'] === 'string' ? (data['position'] as string) : '',
    dominantHand: typeof data?.['dominantHand'] === 'string' ? (data['dominantHand'] as string) : '',
    heightCm: typeof data?.['heightCm'] === 'number' ? (data['heightCm'] as number) : null,
    weightKg: typeof data?.['weightKg'] === 'number' ? (data['weightKg'] as number) : null,
    emergencyContact:
      typeof data?.['emergencyContact'] === 'string' ? (data['emergencyContact'] as string) : '',
    notes: typeof data?.['notes'] === 'string' ? (data['notes'] as string) : '',
  };
}

function readPublicProfile(data: Record<string, unknown> | undefined): AthletePublicProfile {
  const displayName = firstNonEmptyString(data, ['fullName', 'name', 'nickname']) || 'Atleta';
  const category = firstNonEmptyString(data, ['category', 'level', 'nivel']);
  return { displayName, initials: initialsOf(displayName), category };
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
}

/**
 * `coaches/{uid}/athletes` (o vínculo) é ownership-only — client lê/escreve
 * direto. `public_profiles` é lido pra exibição (não duplicado no vínculo).
 * Convite e busca por e-mail passam por Cloud Function (Task 8) porque
 * cruzam dados de outro usuário.
 */
@Injectable({ providedIn: 'root' })
export class AthletesService {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  private readonly linksState = signal<AthleteLink[]>([]);
  private readonly profilesState = signal<Map<string, AthletePublicProfile>>(new Map());

  readonly roster = computed<RosterAthlete[]>(() => {
    const profiles = this.profilesState();
    return this.linksState().map((link) => ({
      ...link,
      ...(profiles.get(link.athleteUid) ?? { displayName: 'Atleta', initials: '·', category: '' }),
    }));
  });

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      if (!uid) {
        this.linksState.set([]);
        this.profilesState.set(new Map());
        return;
      }

      const stop = onSnapshot(
        collection(this.firestore, 'coaches', uid, 'athletes'),
        (snapshot) => {
          const links = snapshot.docs.map((d) => readAthleteLink(d.id, d.data()));
          this.linksState.set(links);
          void this.loadProfiles(links.map((l) => l.athleteUid));
        },
        () => {
          this.linksState.set([]);
          this.profilesState.set(new Map());
        },
      );

      onCleanup(stop);
    });
  }

  private async loadProfiles(athleteUids: string[]): Promise<void> {
    if (athleteUids.length === 0) {
      this.profilesState.set(new Map());
      return;
    }
    const map = new Map<string, AthletePublicProfile>();
    for (const group of chunk(athleteUids, 30)) {
      const snap = await getDocs(
        query(collection(this.firestore, 'public_profiles'), where(documentId(), 'in', group)),
      );
      snap.docs.forEach((d) => map.set(d.id, readPublicProfile(d.data())));
    }
    this.profilesState.set(map);
  }

  async searchAthleteByEmail(email: string): Promise<AthleteSearchHit | null> {
    const fn = httpsCallable<{ email: string }, { result: AthleteSearchHit | null }>(
      getFunctions(getApps()[0]!),
      'searchAthleteForCoachInvite',
    );
    const res = await fn({ email });
    return res.data.result;
  }

  async inviteAthlete(athleteUid: string, athleteName: string, squadId: string | null): Promise<string> {
    const fn = httpsCallable<
      { athleteUid: string; athleteName: string; squadId?: string },
      { inviteId: string }
    >(getFunctions(getApps()[0]!), 'sendCoachAthleteInvite');
    const res = await fn({ athleteUid, athleteName, ...(squadId ? { squadId } : {}) });
    return res.data.inviteId;
  }

  async updateAthleteLink(athleteUid: string, patch: Partial<Omit<AthleteLink, 'athleteUid'>>): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }
    await setDoc(doc(this.firestore, 'coaches', uid, 'athletes', athleteUid), patch, { merge: true });
  }
}
