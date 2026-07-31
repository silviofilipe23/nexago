import { Injectable } from '@angular/core';
import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { arenaFirestore } from './firestore';
import { arenaFunctions } from './functions';
import {
  arenaStaffInviteFromDoc,
  arenaStaffMemberFromDoc,
  type ArenaStaffInvite,
  type ArenaStaffMember,
} from './arena-staff.model';
import type { ArenaStaffRole } from './arena-roles.model';

interface InviteResult {
  inviteId: string | null;
  status: 'active' | 'pending';
}

/** Leitura ao vivo da equipe e chamadas dos callables. Escrita direta é negada
 *  pelas rules de propósito — assento e plano são validados no servidor. */
@Injectable({ providedIn: 'root' })
export class ArenaStaffService {
  watchMembers(arenaId: string, onChange: (members: ArenaStaffMember[]) => void): Unsubscribe {
    return onSnapshot(
      collection(arenaFirestore(), 'arenas', arenaId, 'staff'),
      (snap) => onChange(snap.docs.map(arenaStaffMemberFromDoc).filter((m) => m != null)),
      () => onChange([]),
    );
  }

  watchInvites(arenaId: string, onChange: (invites: ArenaStaffInvite[]) => void): Unsubscribe {
    return onSnapshot(
      query(
        collection(arenaFirestore(), 'arenaStaffInvites'),
        where('arenaId', '==', arenaId),
        where('status', '==', 'pending'),
      ),
      (snap) => onChange(snap.docs.map(arenaStaffInviteFromDoc).filter((i) => i != null)),
      () => onChange([]),
    );
  }

  async invite(arenaId: string, email: string, role: ArenaStaffRole): Promise<InviteResult> {
    const call = httpsCallable<
      { arenaId: string; email: string; role: ArenaStaffRole },
      InviteResult
    >(arenaFunctions(), 'inviteArenaStaff');
    return (await call({ arenaId, email, role })).data;
  }

  async updateRole(arenaId: string, staffUserId: string, role: ArenaStaffRole): Promise<void> {
    const call = httpsCallable(arenaFunctions(), 'updateArenaStaffRole');
    await call({ arenaId, staffUserId, role });
  }

  async remove(arenaId: string, staffUserId: string): Promise<void> {
    const call = httpsCallable(arenaFunctions(), 'removeArenaStaff');
    await call({ arenaId, staffUserId });
  }

  async revokeInvite(inviteId: string): Promise<void> {
    const call = httpsCallable(arenaFunctions(), 'revokeArenaStaffInvite');
    await call({ inviteId });
  }
}
