import { Injectable } from '@angular/core';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { athleteFirestore } from '../../data/firestore';
import { athleteFunctions } from '../../data/functions';
import {
  availabilityFromDoc,
  availabilityPayload,
  parseArenaClasses,
  parseBlock,
  parseOwnClass,
  parsePrivateLesson,
  type AvailabilitySettings,
  type AvailabilityState,
  type BusyBlock,
  type OwnClassSlot,
  type PrivateLesson,
} from './professor-availability.model';

/**
 * Dados da tela "Disponibilidade". Provido pela TELA (não root): o arquivo só entra no chunk
 * preguiçoso da rota, então o SDK do Firestore pode ser importado no topo sem pesar no inicial.
 *
 * Leituras liberadas ao próprio professor pelas rules: `professorAvailability/{uid}`,
 * `professorPrivateLessons where professorUid == uid`, `professors/{uid}/ownClasses` e
 * `users/{uid}/professorBlocks`. As turmas da ARENA vêm da callable `getMyProfessorStudents`
 * (a rule de `arenaClasses` só libera a equipe da arena que vê a agenda).
 *
 * Escrita só pelas callables.
 */
@Injectable()
export class ProfessorAvailabilityService {
  private readonly db = athleteFirestore();

  async loadAvailability(uid: string): Promise<AvailabilityState> {
    if (!this.db) return availabilityFromDoc(null);
    const snap = await getDoc(doc(this.db, 'professorAvailability', uid));
    return availabilityFromDoc(snap.exists() ? snap.data() : null);
  }

  async loadOwnClasses(uid: string): Promise<OwnClassSlot[]> {
    if (!this.db) return [];
    const snap = await getDocs(
      query(collection(this.db, 'professors', uid, 'ownClasses'), where('status', '==', 'active')),
    );
    return snap.docs.map((d) => parseOwnClass(d.id, d.data())).filter((c): c is OwnClassSlot => c !== null);
  }

  /** Turmas da arena pela mesma callable do app (`getMyProfessorStudents`): a rule de
   *  `arenaClasses` não libera o professor, e o servidor já aplica o vínculo. */
  async loadArenaClasses(): Promise<OwnClassSlot[]> {
    return parseArenaClasses(await this.call('getMyProfessorStudents', {}));
  }

  async loadBlocks(uid: string, fromMs: number): Promise<BusyBlock[]> {
    if (!this.db) return [];
    const snap = await getDocs(
      query(collection(this.db, 'users', uid, 'professorBlocks'), where('endAt', '>', Timestamp.fromMillis(fromMs))),
    );
    return snap.docs.map((d) => parseBlock(d.id, d.data())).filter((b): b is BusyBlock => b !== null);
  }

  /** Particulares a partir de `fromMs` (início da semana), ao vivo — pedidos chegam com a tela aberta. */
  watchLessons(
    uid: string,
    fromMs: number,
    onChange: (lessons: PrivateLesson[]) => void,
    onError: () => void,
  ): () => void {
    if (!this.db) {
      onChange([]);
      return () => undefined;
    }
    return onSnapshot(
      query(
        collection(this.db, 'professorPrivateLessons'),
        where('professorUid', '==', uid),
        where('startAt', '>=', Timestamp.fromMillis(fromMs)),
        orderBy('startAt', 'asc'),
      ),
      (snap) =>
        onChange(
          snap.docs.map((d) => parsePrivateLesson(d.id, d.data())).filter((l): l is PrivateLesson => l !== null),
        ),
      () => onError(),
    );
  }

  async publish(settings: AvailabilitySettings): Promise<void> {
    await this.call('saveProfessorAvailability', availabilityPayload(settings));
  }

  async respondLesson(lessonId: string, accept: boolean): Promise<void> {
    await this.call('respondPrivateLesson', { lessonId, accept });
  }

  async cancelLesson(lessonId: string): Promise<void> {
    await this.call('cancelPrivateLesson', { lessonId });
  }

  async respondReschedule(lessonId: string, accept: boolean): Promise<void> {
    await this.call('respondLessonReschedule', { lessonId, accept });
  }

  private async call(name: string, payload: Record<string, unknown>): Promise<unknown> {
    const res = await httpsCallable(athleteFunctions(), name)(payload);
    return res.data;
  }
}
