import { Injectable } from '@angular/core';
import {
  Timestamp,
  average,
  collection,
  count,
  getAggregateFromServer,
  getCountFromServer,
  query,
  where,
  type Query,
} from 'firebase/firestore';
import { backofficeDb } from '../../../data/firebase';
import { metricsWindow, type BlogPostMetrics, type BlogWindowMetrics } from './blog-metrics';

const total = async (q: Query): Promise<number> => (await getCountFromServer(q)).data().count;

/**
 * Agregações sobre `blogReads`/`blogReaders` (admin lê; rules em `firestore.rules`). Nunca baixa os
 * docs: só `count()` e `average('seconds')` no servidor. Os índices compostos estão em
 * `firestore.indexes.json` (`at+seconds`, `finished+at`, `ctaClicked+at`, `postId+seconds`,
 * `firstReadAt+lastReadAt`).
 */
@Injectable({ providedIn: 'root' })
export class BlogMetricsRepository {
  /** Cards da lista: janela dos últimos 30 dias e os 30 antes, tudo em paralelo. */
  async window(now: Date): Promise<BlogWindowMetrics> {
    const db = backofficeDb();
    const reads = collection(db, 'blogReads');
    const readers = collection(db, 'blogReaders');
    const { start, prevStart } = metricsWindow(now);
    const from = Timestamp.fromDate(start);
    const prevFrom = Timestamp.fromDate(prevStart);

    const [current, prevReads, finished, ctaClicks, readerCount, returningReaders] = await Promise.all([
      getAggregateFromServer(query(reads, where('at', '>=', from)), { reads: count(), avgSeconds: average('seconds') }),
      total(query(reads, where('at', '>=', prevFrom), where('at', '<', from))),
      total(query(reads, where('finished', '==', true), where('at', '>=', from))),
      total(query(reads, where('ctaClicked', '==', true), where('at', '>=', from))),
      total(query(readers, where('lastReadAt', '>=', from))),
      total(query(readers, where('firstReadAt', '<', from), where('lastReadAt', '>=', from))),
    ]);
    const data = current.data();
    return {
      reads: data.reads,
      prevReads,
      avgSeconds: data.avgSeconds ?? null,
      finished,
      ctaClicks,
      readers: readerCount,
      returningReaders,
    };
  }

  /** "Resultado do post" no editor: todas as leituras do post (sem janela). */
  async post(postId: string): Promise<BlogPostMetrics> {
    const reads = collection(backofficeDb(), 'blogReads');
    const ofPost = where('postId', '==', postId);
    const [current, finished, ctaClicks] = await Promise.all([
      getAggregateFromServer(query(reads, ofPost), { reads: count(), avgSeconds: average('seconds') }),
      total(query(reads, ofPost, where('finished', '==', true))),
      total(query(reads, ofPost, where('ctaClicked', '==', true))),
    ]);
    const data = current.data();
    return { reads: data.reads, avgSeconds: data.avgSeconds ?? null, finished, ctaClicks };
  }
}
