import { Injectable } from '@angular/core';
import type { CenterTrialBooking, TrialStatus } from '../../features/trials/trial-view';
import { CenterActionsBase } from './actor';
import { callCenterFunction } from './invoices.actions';

/**
 * Experimentais pedidas pelo app. A coleção `trialBookings` é só do servidor (rules: catch-all):
 * leitura e decisão pelas callables de `functions/src/class-trial-booking.ts`.
 */
@Injectable({ providedIn: 'root' })
export class TrialsActions extends CenterActionsBase {
  async load(): Promise<CenterTrialBooking[]> {
    const r = await callCenterFunction<{ bookings: CenterTrialBooking[] }>('getCenterTrialBookings', { centerId: this.centerId() });
    return r.bookings ?? [];
  }

  decide(bookingId: string, decision: 'confirm' | 'decline', note: string): Promise<{ bookingId: string; status: TrialStatus }> {
    return callCenterFunction('decideCenterTrialBooking', { centerId: this.centerId(), bookingId, decision, note });
  }
}
