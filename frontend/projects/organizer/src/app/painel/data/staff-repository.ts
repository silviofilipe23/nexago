import { collection, deleteDoc, doc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { organizerFirestore } from './firestore';

/** `tournaments/{id}/staff/{uid}` — equipe do torneio (gestor/mesário). Espelha
 *  `tournament_staff_repository.dart` (Flutter): os campos de exibição (`displayName`,
 *  `nickname`, `photoUrl`) são gravados no próprio doc no momento da adição, então listar não
 *  precisa de join com `public_profiles`. As rules só deixam o dono do torneio criar/atualizar/
 *  remover, `role` só aceita 'manager'|'scorer' e `status` só 'active' na escrita — sem
 *  convite/aceite, o acesso é imediato. */

export type TournamentStaffRole = 'manager' | 'scorer';

export const TOURNAMENT_STAFF_ROLE_LABEL: Record<TournamentStaffRole, string> = {
  manager: 'Gestor',
  scorer: 'Mesário',
};

/** Mesmo texto de `TournamentStaffRole.description` (Flutter) — paridade entre plataformas. */
export const TOURNAMENT_STAFF_ROLE_DESCRIPTION: Record<TournamentStaffRole, string> = {
  manager: 'Opera inscrições, chaves, agenda e placar.',
  scorer: 'Lança placar das partidas.',
};

export interface TournamentStaffMember {
  uid: string;
  role: TournamentStaffRole;
  displayName: string;
  nickname: string;
  photoUrl: string | null;
  addedAt: Date | null;
}

export interface StaffCandidate {
  uid: string;
  displayName: string;
  nickname: string;
  photoUrl: string | null;
}

/** Apelido primeiro, senão nome completo (mesma regra de `displayLabel` no Flutter). */
export function staffDisplayName(m: Pick<TournamentStaffMember | StaffCandidate, 'displayName' | 'nickname'>): string {
  return m.nickname.trim() || m.displayName.trim() || 'Usuário';
}

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
}

function roleFromRaw(raw: unknown): TournamentStaffRole {
  return raw === 'scorer' ? 'scorer' : 'manager';
}

function staffFromDoc(id: string, data: Record<string, unknown>): TournamentStaffMember {
  return {
    uid: id,
    role: roleFromRaw(data['role']),
    displayName: optionalStr(data['displayName']) ?? '',
    nickname: optionalStr(data['nickname']) ?? '',
    photoUrl: optionalStr(data['photoUrl']),
    addedAt: toDate(data['addedAt']),
  };
}

export async function listTournamentStaff(tournamentId: string): Promise<TournamentStaffMember[]> {
  const db = organizerFirestore();
  const snap = await getDocs(collection(db, 'tournaments', tournamentId, 'staff'));
  const members = snap.docs.map((d) => staffFromDoc(d.id, d.data() as Record<string, unknown>));
  members.sort((a, b) => (a.addedAt?.getTime() ?? Infinity) - (b.addedAt?.getTime() ?? Infinity));
  return members;
}

function candidateFromDoc(id: string, data: Record<string, unknown>): StaffCandidate {
  return {
    uid: id,
    displayName: optionalStr(data['fullName']) ?? optionalStr(data['name']) ?? 'Usuário',
    nickname: optionalStr(data['nickname']) ?? '',
    photoUrl: optionalStr(data['profilePhotoUrl']) ?? optionalStr(data['avatarUrl']) ?? optionalStr(data['photoURL']),
  };
}

function normalizeSearchTerm(term: string): string {
  return term
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Busca por prefixo em `public_profiles` (`hasAthleteRole` + `keywords array-contains`) — mesmo
 *  índice composto que `searchUsersByNicknameOrName` usa no app pra convidar staff. */
export async function searchStaffCandidates(term: string, excludeUids: readonly string[]): Promise<StaffCandidate[]> {
  const normalized = normalizeSearchTerm(term);
  if (normalized.length < 2) return [];
  const db = organizerFirestore();
  const snap = await getDocs(
    query(collection(db, 'public_profiles'), where('hasAthleteRole', '==', true), where('keywords', 'array-contains', normalized), limit(20)),
  );
  const excluded = new Set(excludeUids);
  return snap.docs.map((d) => candidateFromDoc(d.id, d.data() as Record<string, unknown>)).filter((c) => !excluded.has(c.uid));
}

export async function addTournamentStaff(tournamentId: string, addedBy: string, candidate: StaffCandidate, role: TournamentStaffRole): Promise<void> {
  const db = organizerFirestore();
  await setDoc(doc(db, 'tournaments', tournamentId, 'staff', candidate.uid), {
    role,
    status: 'active',
    displayName: candidate.displayName,
    nickname: candidate.nickname,
    photoUrl: candidate.photoUrl,
    addedBy,
    addedAt: serverTimestamp(),
  });
}

export async function updateTournamentStaffRole(tournamentId: string, uid: string, role: TournamentStaffRole): Promise<void> {
  const db = organizerFirestore();
  await setDoc(doc(db, 'tournaments', tournamentId, 'staff', uid), { role, status: 'active' }, { merge: true });
}

export async function removeTournamentStaff(tournamentId: string, uid: string): Promise<void> {
  const db = organizerFirestore();
  await deleteDoc(doc(db, 'tournaments', tournamentId, 'staff', uid));
}
