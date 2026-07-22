import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { organizerFirestore } from './firestore';

/** Histórico de `sendCategoryCommunication`, gravado pela Cloud Function em
 *  `tournaments/{tournamentId}/categoryCommunications` — leitura direta
 *  autorizada por `canManageTournament` no `firestore.rules`. */

export type CommunicationAudience = 'all' | 'paid' | 'pending';

export interface CategoryCommunicationEntry {
  id: string;
  categoryId: string;
  message: string;
  audience: CommunicationAudience;
  sendPush: boolean;
  pushCount: number;
  pushNoChannel: number;
  pushFailed: number;
  createdAt: Date;
  createdBy: string;
}

export interface CategoryCommunicationsPage {
  items: CategoryCommunicationEntry[];
  lastCursor: QueryDocumentSnapshot | null;
}

function toDate(v: unknown): Date {
  const t = v as { toDate?: () => Date } | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : new Date();
}

export async function listCategoryCommunicationsPage(
  tournamentId: string,
  pageSize: number,
  afterCursor?: QueryDocumentSnapshot,
): Promise<CategoryCommunicationsPage> {
  const db = organizerFirestore();
  const base = collection(db, 'tournaments', tournamentId, 'categoryCommunications');

  const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];
  if (afterCursor) constraints.push(startAfter(afterCursor));
  constraints.push(limit(pageSize));

  const snap = await getDocs(query(base, ...constraints));
  const items: CategoryCommunicationEntry[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      categoryId: (data['categoryId'] as string) ?? '',
      message: (data['message'] as string) ?? '',
      audience: (data['audience'] as CommunicationAudience) ?? 'all',
      sendPush: data['sendPush'] !== false,
      pushCount: (data['pushCount'] as number) ?? 0,
      pushNoChannel: (data['pushNoChannel'] as number) ?? 0,
      pushFailed: (data['pushFailed'] as number) ?? 0,
      createdAt: toDate(data['createdAt']),
      createdBy: (data['createdBy'] as string) ?? '',
    };
  });

  const lastCursor = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1]! : null;
  return { items, lastCursor };
}
