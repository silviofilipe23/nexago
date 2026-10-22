import { Injectable } from '@angular/core';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { CENTERS, db } from '../../data/firebase';
import { readBillingRun } from '../../data/mappers';
import type { BillingRun } from '../../domain/models';

/**
 * Rodadas diárias (`billingRuns/{YYYY-MM-DD}`). Não ficam no `CenterStore`: são um retrato que só
 * a tela da rodada lê, sob demanda.
 */
@Injectable({ providedIn: 'root' })
export class BillingRunsService {
  async latest(centerId: string, max = 14): Promise<BillingRun[]> {
    const q = query(collection(db(), CENTERS, centerId, 'billingRuns'), orderBy('date', 'desc'), limit(max));
    const snap = await getDocs(q);
    return snap.docs.map((d) => readBillingRun(d.id, d.data()));
  }
}
