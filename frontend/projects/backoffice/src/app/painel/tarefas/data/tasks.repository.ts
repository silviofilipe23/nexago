import { Injectable, inject } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { AuthService } from '../../../auth/auth.service';
import { backofficeDb } from '../../data/firebase';
import { normalizeDraft, taskFromDoc, type Task, type TaskDraft, type TaskStatus } from './task';

const COLLECTION = 'backofficeTasks';

/**
 * `backofficeTasks`: leitura e escrita direto do cliente, só a equipe do backoffice (rules).
 * O quadro escuta ao vivo; os arquivados são lidos sob demanda.
 */
@Injectable({ providedIn: 'root' })
export class TasksRepository {
  private readonly auth = inject(AuthService);

  /** Quadro ao vivo (sem arquivados). Devolve o `unsubscribe`. */
  watchBoard(next: (tasks: Task[]) => void, fail: (error: unknown) => void): () => void {
    const q = query(collection(backofficeDb(), COLLECTION), where('archived', '==', false));
    return onSnapshot(q, (snap) => next(snap.docs.map((d) => taskFromDoc(d.id, d.data()))), fail);
  }

  async archived(): Promise<Task[]> {
    const snap = await getDocs(query(collection(backofficeDb(), COLLECTION), where('archived', '==', true)));
    return snap.docs
      .map((d) => taskFromDoc(d.id, d.data()))
      .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
  }

  /** Tarefas atribuídas a mim (para o número da sidebar). */
  async mine(uid: string): Promise<Task[]> {
    const snap = await getDocs(query(collection(backofficeDb(), COLLECTION), where('assigneeUid', '==', uid)));
    return snap.docs.map((d) => taskFromDoc(d.id, d.data()));
  }

  async create(draft: TaskDraft, order: number): Promise<string> {
    const clean = normalizeDraft(draft);
    const ref = await addDoc(collection(backofficeDb(), COLLECTION), {
      ...clean,
      order,
      archived: false,
      createdBy: this.uid(),
      createdByName: this.name(),
      createdAt: serverTimestamp(),
      ...this.touched(),
      doneAt: clean.status === 'done' ? serverTimestamp() : null,
    });
    return ref.id;
  }

  /** Grava o painel lateral. `previous` é a etapa lida, para marcar/limpar `doneAt`. */
  update(id: string, draft: TaskDraft, previous: TaskStatus, order?: number): Promise<void> {
    const clean = normalizeDraft(draft);
    return updateDoc(doc(backofficeDb(), COLLECTION, id), {
      ...clean,
      ...(order === undefined ? {} : { order }),
      ...this.touched(),
      ...this.doneAt(previous, clean.status),
    });
  }

  /** Arrastar: só etapa e posição. */
  move(id: string, status: TaskStatus, order: number, previous: TaskStatus): Promise<void> {
    return updateDoc(doc(backofficeDb(), COLLECTION, id), {
      status,
      order,
      ...this.touched(),
      ...this.doneAt(previous, status),
    });
  }

  setArchived(id: string, archived: boolean): Promise<void> {
    return updateDoc(doc(backofficeDb(), COLLECTION, id), { archived, ...this.touched() });
  }

  /** Tira as concluídas do quadro (lotes de 400, abaixo do limite de 500 do batch). */
  async archiveAll(ids: string[]): Promise<void> {
    const db = backofficeDb();
    for (let i = 0; i < ids.length; i += 400) {
      const batch = writeBatch(db);
      for (const id of ids.slice(i, i + 400)) {
        batch.update(doc(db, COLLECTION, id), { archived: true, ...this.touched() });
      }
      await batch.commit();
    }
  }

  remove(id: string): Promise<void> {
    return deleteDoc(doc(backofficeDb(), COLLECTION, id));
  }

  private doneAt(previous: TaskStatus, next: TaskStatus): Record<string, unknown> {
    if (previous === next) return {};
    return { doneAt: next === 'done' ? serverTimestamp() : null };
  }

  private touched(): Record<string, unknown> {
    return { updatedBy: this.uid(), updatedByName: this.name(), updatedAt: serverTimestamp() };
  }

  private uid(): string {
    return this.auth.user()?.uid ?? '';
  }

  private name(): string {
    const user = this.auth.user();
    return (this.auth.displayName() ?? user?.email ?? '').trim() || 'Equipe';
  }
}
