import { Injectable } from '@angular/core';
import {
  collection,
  collectionGroup,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { backofficeDb, backofficeFunctions } from '../../../data/firebase';
import {
  COMMENTS_PAGE_SIZE,
  blogCommentFromDoc,
  postIdFromPath,
  type BlogComment,
  type BlogCommentAction,
  type BlogCommentStatus,
} from './blog-comments';

export interface CommentPage {
  comments: BlogComment[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

/**
 * Fila de moderação: admin lê `blogComments` por collection group (índice `status + createdAt desc`
 * no escopo COLLECTION_GROUP) ou só de um post (mesmo índice no escopo COLLECTION). Escrita só pela
 * callable `moderateBlogComment`.
 */
@Injectable({ providedIn: 'root' })
export class BlogCommentsRepository {
  async page(
    status: BlogCommentStatus,
    cursor: QueryDocumentSnapshot<DocumentData> | null,
    postId: string | null,
  ): Promise<CommentPage> {
    const db = backofficeDb();
    const source = postId ? collection(db, 'blogPosts', postId, 'blogComments') : collectionGroup(db, 'blogComments');
    const constraints: QueryConstraint[] = [where('status', '==', status), orderBy('createdAt', 'desc')];
    if (cursor) {
      constraints.push(startAfter(cursor));
    }
    constraints.push(limit(COMMENTS_PAGE_SIZE));
    const snap = await getDocs(query(source, ...constraints));
    return {
      comments: snap.docs.flatMap((d) => {
        const owner = postIdFromPath(d.ref.path);
        return owner ? [blogCommentFromDoc(d.id, owner, d.data())] : [];
      }),
      cursor: snap.docs[snap.docs.length - 1] ?? null,
      hasMore: snap.docs.length === COMMENTS_PAGE_SIZE,
    };
  }

  /** Selo do menu: pendentes de todos os posts, contados no servidor. */
  async pendingCount(): Promise<number> {
    const snap = await getCountFromServer(query(collectionGroup(backofficeDb(), 'blogComments'), where('status', '==', 'pending')));
    return snap.data().count;
  }

  async moderate(input: { postId: string; commentId: string; action: BlogCommentAction; reply?: string }): Promise<void> {
    await httpsCallable<typeof input, unknown>(backofficeFunctions(), 'moderateBlogComment')(input);
  }
}
