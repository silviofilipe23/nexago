import { Injectable } from '@angular/core';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { CENTERS, db } from '../../data/firebase';
import { readSession } from '../../data/mappers';
import type { ClassSession } from '../../domain/models';

/**
 * Aulas de um período arbitrário. O `CenterStore` só mantém ~6 semanas ao vivo; relatório de
 * trimestre/semestre precisa de uma leitura pontual (sem listener — é um retrato).
 */
@Injectable({ providedIn: 'root' })
export class ReportsService {
  async sessionsBetween(centerId: string, from: string, to: string): Promise<ClassSession[]> {
    const q = query(collection(db(), CENTERS, centerId, 'sessions'), where('date', '>=', from), where('date', '<=', to));
    const snap = await getDocs(q);
    return snap.docs.map((d) => readSession(d.id, d.data()));
  }
}
