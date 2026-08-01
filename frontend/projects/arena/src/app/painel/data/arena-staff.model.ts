import type { DocumentSnapshot } from 'firebase/firestore';
import { isArenaStaffRole, type ArenaStaffRole } from './arena-roles.model';

export interface ArenaStaffMember {
  uid: string;
  role: ArenaStaffRole;
  email: string;
  displayName: string;
  photoUrl: string | null;
}

export interface ArenaStaffInvite {
  id: string;
  email: string;
  role: ArenaStaffRole;
}

function str(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  return typeof value === 'string' ? value : '';
}

export function arenaStaffMemberFromDoc(snap: DocumentSnapshot): ArenaStaffMember | null {
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const role = data['role'];
  if (!isArenaStaffRole(role) || data['status'] !== 'active') return null;
  const email = str(data, 'email');
  return {
    uid: snap.id,
    role,
    email,
    displayName: str(data, 'displayName') || email.split('@')[0] || 'Membro',
    photoUrl: str(data, 'photoUrl') || null,
  };
}

export function arenaStaffInviteFromDoc(snap: DocumentSnapshot): ArenaStaffInvite | null {
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const role = data['role'];
  if (!isArenaStaffRole(role) || data['status'] !== 'pending') return null;
  return { id: snap.id, email: str(data, 'emailLower'), role };
}

/** Link que o dono copia/compartilha. O convite é aceito dentro do próprio portal. */
export function arenaInviteLink(origin: string, inviteId: string): string {
  return `${origin}/convite/${inviteId}`;
}

export function arenaInviteWhatsAppUrl(link: string, arenaName: string): string {
  const text = `Você foi convidado para a equipe da ${arenaName} no NexaGO. Acesse: ${link}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
