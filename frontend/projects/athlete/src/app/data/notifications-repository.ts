import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

/** `users/{uid}/notifications/{id}` — criadas só por Cloud Functions; o atleta pode ler e
 *  marcar como lida (`allow update` em firestore.rules). Mesma fonte do preview do painel. */
export interface AthleteNotification {
  id: string;
  title: string;
  body: string;
  type: string | null;
  createdAt: Date | null;
  read: boolean;
  dismissed: boolean;
  /** Paridade com o app (`isUnread = !read && !dismissed`). */
  unread: boolean;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toDate(value: unknown): Date | null {
  const t = value as { toDate?: () => Date } | undefined;
  if (typeof t?.toDate === 'function') return t.toDate();
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}

function fromDoc(snap: QueryDocumentSnapshot<DocumentData>): AthleteNotification {
  const data = snap.data();
  const read = data['read'] === true;
  const dismissed = data['dismissed'] === true;
  return {
    id: snap.id,
    title: str(data['title']) ?? 'Atualização da conta',
    body: str(data['body']) ?? str(data['message']) ?? '',
    type: str(data['type']),
    createdAt: toDate(data['createdAt']),
    read,
    dismissed,
    unread: !read && !dismissed,
  };
}

export function watchNotifications(
  db: Firestore,
  uid: string,
  onChange: (items: AthleteNotification[]) => void,
  onError?: () => void,
  max = 50,
): Unsubscribe {
  const q = query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(max));
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map(fromDoc)),
    () => onError?.(),
  );
}

export async function markNotificationRead(db: Firestore, uid: string, id: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid, 'notifications', id), { read: true });
}

export async function markAllNotificationsRead(db: Firestore, uid: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const batch = writeBatch(db);
  for (const id of ids.slice(0, 400)) {
    batch.update(doc(db, 'users', uid, 'notifications', id), { read: true });
  }
  await batch.commit();
}
