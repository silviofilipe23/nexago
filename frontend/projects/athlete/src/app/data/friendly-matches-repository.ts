import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';

/** Bora Jogar (`friendlyMatches`) — modelo ATUAL do backend (slots/vagas, ver
 *  functions/src/friendly-match-invite.ts): `organizerUid`, `slots[]`, `participantUids`,
 *  `pendingSlotUids`, status de partida `filling|confirmed|completed|cancelled|no_show|unfilled`.
 *  Escrita é 100% via callables; as rules só deixam LER quem é organizador, participante ou
 *  convidado pendente — não existe descoberta pública client-side. Kill-switch:
 *  `appConfig/friendlyMatch.enabled` (default false). */
export type FriendlyMatchStatus = 'filling' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'unfilled' | 'unknown';

export interface FriendlyMatchSlot {
  uid: string;
  name: string | null;
  status: string;
}

export interface FriendlyMatch {
  id: string;
  organizerUid: string;
  organizerName: string | null;
  arenaName: string | null;
  sport: string | null;
  objective: string | null;
  freeText: string | null;
  status: FriendlyMatchStatus;
  slotsTotal: number;
  slots: FriendlyMatchSlot[];
  participantUids: string[];
  pendingSlotUids: string[];
  scheduledAt: Date | null;
  createdAt: Date | null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
}

function statusOf(raw: unknown): FriendlyMatchStatus {
  const v = str(raw)?.toLowerCase();
  return v === 'filling' || v === 'confirmed' || v === 'completed' || v === 'cancelled' || v === 'no_show' || v === 'unfilled'
    ? v
    : 'unknown';
}

function fromDoc(id: string, data: DocumentData): FriendlyMatch {
  const slots = Array.isArray(data['slots'])
    ? (data['slots'] as unknown[])
        .filter((s): s is Record<string, unknown> => s != null && typeof s === 'object')
        .map((s) => ({ uid: str(s['uid']) ?? '', name: str(s['name']) ?? str(s['displayName']), status: str(s['status']) ?? '' }))
    : [];
  return {
    id,
    organizerUid: str(data['organizerUid']) ?? '',
    organizerName: str(data['organizerName']),
    arenaName: str(data['arenaName']),
    sport: str(data['sport']),
    objective: str(data['objective']),
    freeText: str(data['freeText']),
    status: statusOf(data['status']),
    slotsTotal: typeof data['slotsTotal'] === 'number' ? data['slotsTotal'] : slots.length,
    slots,
    participantUids: strArray(data['participantUids']),
    pendingSlotUids: strArray(data['pendingSlotUids']),
    scheduledAt: toDate(data['scheduledAt']),
    createdAt: toDate(data['createdAt']),
  };
}

/** Habilitação da feature — mesmo doc que o app lê (`appConfig/friendlyMatch`). */
export async function fetchFriendlyMatchEnabled(db: Firestore): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'appConfig', 'friendlyMatch'));
    return snap.data()?.['enabled'] === true;
  } catch {
    return false;
  }
}

/** Minhas partidas: organizador ∪ participante ∪ convidado pendente (3 queries, merge por id) —
 *  exatamente o que as rules deixam ler. */
export async function fetchMyFriendlyMatches(db: Firestore, uid: string): Promise<FriendlyMatch[]> {
  const col = collection(db, 'friendlyMatches');
  const [asOrganizer, asParticipant, asPending] = await Promise.all([
    getDocs(query(col, where('organizerUid', '==', uid))),
    getDocs(query(col, where('participantUids', 'array-contains', uid))),
    getDocs(query(col, where('pendingSlotUids', 'array-contains', uid))),
  ]);
  const byId = new Map<string, FriendlyMatch>();
  for (const d of [...asOrganizer.docs, ...asParticipant.docs, ...asPending.docs]) {
    byId.set(d.id, fromDoc(d.id, d.data()));
  }
  return [...byId.values()].sort(
    (a, b) => (b.scheduledAt?.getTime() ?? b.createdAt?.getTime() ?? 0) - (a.scheduledAt?.getTime() ?? a.createdAt?.getTime() ?? 0),
  );
}

export async function acceptFriendlyMatchSlot(functions: Functions, matchId: string): Promise<void> {
  await httpsCallable(functions, 'acceptFriendlyMatchInviteSlot')({ matchId });
}

export async function declineFriendlyMatchSlot(functions: Functions, matchId: string): Promise<void> {
  await httpsCallable(functions, 'declineFriendlyMatchInviteSlot')({ matchId });
}

export async function cancelFriendlyMatch(functions: Functions, matchId: string): Promise<void> {
  await httpsCallable(functions, 'cancelFriendlyMatch')({ matchId });
}

export async function checkInFriendlyMatch(functions: Functions, matchId: string): Promise<void> {
  await httpsCallable(functions, 'checkInFriendlyMatch')({ matchId });
}
