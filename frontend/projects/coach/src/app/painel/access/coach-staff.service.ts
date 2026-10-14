import { Injectable } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { collection, getFirestore, onSnapshot, query, where, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { FUNCTIONS_REGION } from '@nexago/firebase-config';
import { environment } from '../../../environments/environment';
import { isCoachStaffRole, type CoachStaffRole } from './coach-roles.model';

export interface StaffMember {
  uid: string;
  displayName: string;
  email: string;
  role: CoachStaffRole;
}

export interface StaffInvite {
  id: string;
  emailLower: string;
  role: CoachStaffRole;
  expiresAtMs: number | null;
}

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

/** Link que o treinador manda ao convidado. Tolera barra final na origem. */
export function inviteLink(origin: string, inviteId: string): string {
  return `${origin.replace(/\/+$/, '')}/convite-equipe/${inviteId}`;
}

/** Leitura ao vivo da comissão e chamadas dos callables (a escrita direta é negada pelas rules). */
@Injectable({ providedIn: 'root' })
export class CoachStaffService {
  private readonly firestore = createFirestore();

  private call<Req, Res = unknown>(name: string) {
    return httpsCallable<Req, Res>(getFunctions(getApps()[0]!, FUNCTIONS_REGION), name);
  }

  watchMembers(coachUid: string, onChange: (members: StaffMember[]) => void): Unsubscribe {
    return onSnapshot(
      collection(this.firestore, 'coaches', coachUid, 'staff'),
      (snap) => {
        const members: StaffMember[] = [];
        for (const d of snap.docs) {
          const data = d.data();
          const role: unknown = data['role'];
          if (!isCoachStaffRole(role)) {
            continue;
          }
          members.push({
            uid: d.id,
            displayName: String(data['displayName'] ?? ''),
            email: String(data['email'] ?? ''),
            role,
          });
        }
        onChange(members);
      },
      () => onChange([]),
    );
  }

  watchInvites(coachUid: string, onChange: (invites: StaffInvite[]) => void): Unsubscribe {
    return onSnapshot(
      query(
        collection(this.firestore, 'coachStaffInvites'),
        where('coachUid', '==', coachUid),
        where('status', '==', 'pending'),
      ),
      (snap) => {
        const now = Date.now();
        const invites: StaffInvite[] = [];
        for (const d of snap.docs) {
          const data = d.data();
          const role: unknown = data['role'];
          if (!isCoachStaffRole(role)) {
            continue;
          }
          const expiresAtMs: number | null = data['expiresAt']?.toMillis?.() ?? null;
          if (expiresAtMs !== null && expiresAtMs <= now) {
            continue; // o servidor não encerra os vencidos
          }
          invites.push({ id: d.id, emailLower: String(data['emailLower'] ?? ''), role, expiresAtMs });
        }
        onChange(invites);
      },
      () => onChange([]),
    );
  }

  async invite(email: string, role: CoachStaffRole): Promise<string> {
    const res = await this.call<{ email: string; role: CoachStaffRole }, { inviteId: string }>(
      'createCoachStaffInvite',
    )({ email, role });
    return res.data.inviteId;
  }

  async changeRole(staffUserId: string, role: CoachStaffRole): Promise<void> {
    await this.call('changeCoachStaffRole')({ staffUserId, role });
  }

  async remove(staffUserId: string): Promise<void> {
    await this.call('removeCoachStaff')({ staffUserId });
  }

  async revokeInvite(inviteId: string): Promise<void> {
    await this.call('revokeCoachStaffInvite')({ inviteId });
  }

  async leave(coachUid: string): Promise<void> {
    await this.call('leaveCoachStaff')({ coachUid });
  }
}
