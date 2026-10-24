import { Timestamp, type DocumentSnapshot } from 'firebase/firestore';

/** Chat das Aulas: gestão da arena ↔ aluno com conta NexaGO, no lugar do WhatsApp. Backend:
 *  `functions/src/arena-class-messages.ts` + `kind: "arena_student"` em `professor-messages.ts`.
 *
 *  - Conversa `conversations/s_{arenaId}_{staffUid}_{athleteUid}`: uma por pessoa da gestão, com
 *    `professorUid` = quem é da gestão. Membros leem; abrir/enviar/marcar lido só pelos callables.
 *  - Sem conta (só telefone), segue o WhatsApp.
 *
 *  Tudo aqui é puro para as telas serem testáveis sem Firebase. */

export interface AulaConversation {
  id: string;
  arenaId: string;
  /** Lado da gestão (quem abriu). */
  staffUid: string;
  athleteUid: string;
  athleteName: string;
  athletePhotoUrl: string | null;
  arenaName: string;
  memberIds: string[];
  closed: boolean;
  lastAt: Date | null;
  lastMessage: { text: string; senderUid: string } | null;
  unread: Record<string, number>;
}

/** Aluno com conta NexaGO fala pelo chat do app. */
export function hasAulaChat(athleteId: string | null | undefined): athleteId is string {
  return typeof athleteId === 'string' && athleteId.trim().length > 0;
}

export function aulaConversationFromDoc(snap: Pick<DocumentSnapshot, 'id' | 'data'>): AulaConversation | null {
  const d = snap.data();
  if (!d || d['kind'] !== 'arena_student') return null;
  const athleteUid = str(d['athleteUid']);
  const names = record(d['memberNames']);
  const photos = record(d['memberPhotos']);
  const last = d['lastMessage'] as Record<string, unknown> | undefined;
  return {
    id: snap.id,
    arenaId: str(d['arenaId']),
    staffUid: str(d['professorUid']),
    athleteUid,
    athleteName: str(names[athleteUid]) || 'Aluno',
    athletePhotoUrl: str(photos[athleteUid]) || null,
    arenaName: str(d['arenaName']) || str(d['title']) || 'Arena',
    memberIds: Array.isArray(d['memberIds']) ? d['memberIds'].filter((m): m is string => typeof m === 'string') : [],
    closed: d['closed'] === true,
    lastAt: d['lastAt'] instanceof Timestamp ? d['lastAt'].toDate() : null,
    lastMessage: last && str(last['text']) ? { text: str(last['text']), senderUid: str(last['senderUid']) } : null,
    unread: Object.fromEntries(
      Object.entries(record(d['unread'])).filter(([, n]) => typeof n === 'number' && Number.isFinite(n)),
    ) as Record<string, number>,
  };
}

/** As conversas que quem está logado abriu nesta arena, a mais recente primeiro. */
export function myAulaConversations(list: readonly AulaConversation[], arenaId: string, uid: string | null): AulaConversation[] {
  if (!uid) return [];
  return list
    .filter((c) => c.arenaId === arenaId && c.staffUid === uid)
    .sort((a, b) => (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0));
}

export function aulaUnread(c: AulaConversation, uid: string | null): number {
  return uid ? Math.max(0, c.unread[uid] ?? 0) : 0;
}

export function aulaUnreadTotal(list: readonly AulaConversation[], uid: string | null): number {
  return list.reduce((sum, c) => sum + aulaUnread(c, uid), 0);
}

/** Resumo na lista: "Você: …" quando a última é minha. */
export function aulaPreview(c: AulaConversation, uid: string | null): string {
  if (!c.lastMessage) return 'Nenhuma mensagem ainda';
  return c.lastMessage.senderUid === uid ? `Você: ${c.lastMessage.text}` : c.lastMessage.text;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function record(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
