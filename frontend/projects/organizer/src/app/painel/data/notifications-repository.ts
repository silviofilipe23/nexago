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

/** `users/{uid}/notifications/{id}` — criadas só por Cloud Functions; o organizador pode ler e
 *  marcar como lida (`allow update` em firestore.rules). Mesma coleção do app e do atleta. */
export interface OrganizerNotification {
  id: string;
  title: string;
  body: string;
  type: string | null;
  createdAt: Date | null;
  read: boolean;
  dismissed: boolean;
  /** Paridade com o app (`isUnread = !read && !dismissed`). */
  unread: boolean;
  /** Deep link opcional: `data.webUrl` (rota do portal) ou, sem ele, `data.url`. Ex.:
   *  `/painel/eventos/{id}/inscricoes?registrationId=...`. */
  url: string | null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Destino do toque na notificação. `webUrl` existe quando o mesmo push também vai pro app, que
 *  usa `url` com uma rota dele (ex.: `tournament_review_closed`). */
export function notificationTargetUrl(data: Record<string, unknown> | undefined): string | null {
  return str(data?.['webUrl']) ?? str(data?.['url']);
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

function fromDoc(snap: QueryDocumentSnapshot<DocumentData>): OrganizerNotification {
  const data = snap.data();
  const read = data['read'] === true;
  const dismissed = data['dismissed'] === true;
  const notifData = data['data'] as Record<string, unknown> | undefined;
  return {
    id: snap.id,
    title: str(data['title']) ?? 'Atualização do torneio',
    body: str(data['body']) ?? str(data['message']) ?? '',
    type: str(data['type']),
    createdAt: toDate(data['createdAt']),
    read,
    dismissed,
    unread: !read && !dismissed,
    url: notificationTargetUrl(notifData),
  };
}

export function watchNotifications(
  db: Firestore,
  uid: string,
  onChange: (items: OrganizerNotification[]) => void,
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
