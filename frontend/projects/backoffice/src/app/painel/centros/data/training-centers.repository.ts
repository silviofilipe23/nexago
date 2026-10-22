import { Injectable } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { backofficeFunctions } from '../../data/firebase';
import type { CenterDetail, CenterRow, CenterStatus, CenterSubscription } from './training-centers';

/**
 * Centros de Treinamento pelo backoffice. Tudo por callable: as rules não liberam
 * `trainingCenters` ao admin da plataforma, e `trainingCenterReceiving` é só servidor.
 */
@Injectable({ providedIn: 'root' })
export class TrainingCentersRepository {
  private call<I, O>(name: string, data: I): Promise<O> {
    return httpsCallable<I, O>(backofficeFunctions(), name)(data).then((r) => r.data);
  }

  async list(): Promise<CenterRow[]> {
    return (await this.call<Record<string, never>, { centers: CenterRow[] }>('listTrainingCentersBackoffice', {})).centers;
  }

  get(centerId: string): Promise<CenterDetail> {
    return this.call('getTrainingCenterBackoffice', { centerId });
  }

  setStatus(centerId: string, status: CenterStatus, reason: string): Promise<{ status: CenterStatus }> {
    return this.call('setTrainingCenterStatus', { centerId, status, reason });
  }

  setReceiving(centerId: string, walletId: string, asaasEnv: string, feePercent: number | null): Promise<{ connected: boolean }> {
    return this.call('setTrainingCenterReceiving', { centerId, walletId, asaasEnv, feePercent });
  }

  setSubscription(centerId: string, sub: CenterSubscription): Promise<{ ok: true }> {
    return this.call('setTrainingCenterSubscription', { centerId, ...sub });
  }
}
