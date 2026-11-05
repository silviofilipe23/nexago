import { dayMonthLabel } from './blog-post';

/**
 * Comentários e "Ficou dúvida" do blog (só app). Tudo nasce `pending`; a fila do backoffice aprova,
 * recusa, responde ou exclui pela callable `moderateBlogComment` (`functions/src/blog-comments.ts`).
 * Espelha os limites de lá — mudar os dois.
 */
export const BLOG_COMMENT_MIN = 2;
export const BLOG_COMMENT_REPLY_MAX = 600;
export const COMMENTS_PAGE_SIZE = 30;

export const BLOG_COMMENT_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type BlogCommentStatus = (typeof BLOG_COMMENT_STATUSES)[number];
export type BlogCommentKind = 'comment' | 'question';
export type BlogCommentAction = 'approve' | 'reject' | 'delete' | 'reply';

export const COMMENT_TABS: ReadonlyArray<{ id: BlogCommentStatus; label: string }> = [
  { id: 'pending', label: 'Pendentes' },
  { id: 'approved', label: 'Aprovados' },
  { id: 'rejected', label: 'Recusados' },
];

export interface BlogComment {
  id: string;
  postId: string;
  uid: string;
  author: { name: string; photoUrl: string | null };
  text: string;
  kind: BlogCommentKind;
  status: BlogCommentStatus;
  createdAt: Date | null;
  reply: { text: string; byName: string; at: Date | null } | null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function dateOf(v: unknown): Date | null {
  const toDate = (v as { toDate?: unknown } | null)?.toDate;
  return typeof toDate === 'function' ? (toDate.call(v) as Date) : v instanceof Date ? v : null;
}

/** `blogPosts/{postId}/blogComments/{id}` → postId (o collection group não traz o pai no doc). */
export function postIdFromPath(path: string): string | null {
  const parts = path.split('/');
  const i = parts.lastIndexOf('blogComments');
  return i >= 2 && parts[i - 2] === 'blogPosts' ? (parts[i - 1] ?? null) : null;
}

export function blogCommentFromDoc(id: string, postId: string, data: Record<string, unknown>): BlogComment {
  const author = (data['author'] ?? {}) as Record<string, unknown>;
  const reply = data['reply'] as Record<string, unknown> | null | undefined;
  const photo = str(author['photoUrl']);
  return {
    id,
    postId,
    uid: str(data['uid']),
    author: { name: str(author['name']) || 'Atleta', photoUrl: /^https:\/\//.test(photo) ? photo : null },
    text: typeof data['text'] === 'string' ? data['text'] : '',
    kind: data['kind'] === 'question' ? 'question' : 'comment',
    status: BLOG_COMMENT_STATUSES.includes(data['status'] as BlogCommentStatus) ? (data['status'] as BlogCommentStatus) : 'pending',
    createdAt: dateOf(data['createdAt']),
    reply:
      reply && typeof reply === 'object' && str(reply['text'])
        ? {
            text: String(reply['text']),
            byName: str((reply['by'] as Record<string, unknown> | undefined)?.['name']) || 'Equipe nexaGO',
            at: dateOf(reply['at']),
          }
        : null,
  };
}

/** Mesma limpeza do servidor (`cleanCommentText`): espaço sobrando sai, no máximo uma linha em branco. */
export function cleanCommentText(v: string): string {
  return v
    .trim()
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/** O que impede enviar a resposta, ou `null`. */
export function replyIssue(text: string): string | null {
  const clean = cleanCommentText(text);
  if (clean.length < BLOG_COMMENT_MIN) {
    return 'Escreva a resposta.';
  }
  return clean.length > BLOG_COMMENT_REPLY_MAX ? `A resposta passa de ${BLOG_COMMENT_REPLY_MAX} caracteres.` : null;
}

/** Status depois da ação (`null` = excluído). Responder aprova, como no servidor. */
export function statusAfter(action: BlogCommentAction, current: BlogCommentStatus): BlogCommentStatus | null {
  switch (action) {
    case 'approve':
    case 'reply':
      return 'approved';
    case 'reject':
      return 'rejected';
    case 'delete':
      return null;
    default:
      return current;
  }
}

/**
 * Lista depois da ação, antes da resposta do servidor: sai da aba quem mudou de status (ou foi
 * excluído); responder na aba Aprovados atualiza a resposta no lugar.
 */
export function applyModeration(
  list: readonly BlogComment[],
  commentId: string,
  action: BlogCommentAction,
  tab: BlogCommentStatus,
  reply: { text: string; byName: string } | null,
  now: Date,
): BlogComment[] {
  return list.flatMap((c) => {
    if (c.id !== commentId) {
      return [c];
    }
    const status = statusAfter(action, c.status);
    if (status === null || status !== tab) {
      return [];
    }
    return [{ ...c, status, reply: action === 'reply' && reply ? { text: cleanCommentText(reply.text), byName: reply.byName, at: now } : c.reply }];
  });
}

/** Variação da contagem de pendentes que a ação causa (selo do menu). */
export function pendingDelta(action: BlogCommentAction, current: BlogCommentStatus): number {
  if (current !== 'pending') {
    return 0;
  }
  return statusAfter(action, current) === 'pending' ? 0 : -1;
}

/** "agora", "há 5 min", "há 3 h", "ontem", "12 nov". */
export function commentWhen(at: Date | null, now: Date): string {
  if (!at) {
    return '';
  }
  const minutes = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60_000));
  if (minutes < 1) {
    return 'agora';
  }
  if (minutes < 60) {
    return `há ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `há ${hours} h`;
  }
  return hours < 48 ? 'ontem' : dayMonthLabel(at, now);
}

export function initialsOf(name: string): string {
  const parts = name.replace(/\./g, ' ').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase() || '·';
}

export function onlyQuestions(list: readonly BlogComment[], on: boolean): BlogComment[] {
  return on ? list.filter((c) => c.kind === 'question') : [...list];
}
