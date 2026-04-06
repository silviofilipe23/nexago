import { Injectable } from '@angular/core';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { Observable } from 'rxjs';

import { firestore } from '../../firebase';

import { TORNEIO_STATUS, type Torneio, type TorneioStatus } from './torneio.types';

const COLECAO_TORNEIOS = 'torneios';

function asDate(value: unknown): Date {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date(0);
}

function mapDoc(docSnap: QueryDocumentSnapshot): Torneio {
  const data = docSnap.data() as DocumentData;
  const status = data['status'] as TorneioStatus | undefined;
  return {
    id: docSnap.id,
    nome: typeof data['nome'] === 'string' ? data['nome'] : '',
    arenaNome: typeof data['arenaNome'] === 'string' ? data['arenaNome'] : '',
    dataInicio: asDate(data['dataInicio']),
    dataFim: asDate(data['dataFim']),
    status:
      status === TORNEIO_STATUS.EM_ANDAMENTO ||
      status === TORNEIO_STATUS.ATRASADO ||
      status === TORNEIO_STATUS.FINALIZADO
        ? status
        : TORNEIO_STATUS.EM_ANDAMENTO,
    totalPartidas: typeof data['totalPartidas'] === 'number' ? data['totalPartidas'] : 0,
    partidasConcluidas:
      typeof data['partidasConcluidas'] === 'number' ? data['partidasConcluidas'] : 0,
    updatedAt: asDate(data['updatedAt']),
  };
}

@Injectable({ providedIn: 'root' })
export class TorneiosService {
  /**
   * Torneios operacionais em tempo real: em andamento ou atrasados, mais recentemente atualizados primeiro.
   * Equivalente a `valueChanges` do AngularFire — usa `onSnapshot` do SDK modular.
   */
  watchTorneiosAtivos(): Observable<Torneio[]> {
    const ref = collection(firestore, COLECAO_TORNEIOS);
    const q = query(
      ref,
      where('status', 'in', [TORNEIO_STATUS.EM_ANDAMENTO, TORNEIO_STATUS.ATRASADO]),
      orderBy('updatedAt', 'desc'),
    );

    return new Observable((subscriber) => {
      const stop = onSnapshot(
        q,
        (snap) => subscriber.next(snap.docs.map(mapDoc)),
        (err) => subscriber.error(err),
      );
      return () => stop();
    });
  }
}
