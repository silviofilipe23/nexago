import { Injectable } from '@angular/core';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import type { Payout } from '../../domain/payouts';
import { CENTERS, db } from '../firebase';
import { bool, date, str } from '../mappers';
import { CenterActionsBase } from './actor';
import { callCenterFunction } from './invoices.actions';
import { readPayout } from './payouts.actions';

/** `professorPayoutAccounts/{uid}` — a conta de recebimento do professor (a mesma do app). */
export interface CoachAccount {
  status: 'creating' | 'failed' | 'pending' | 'approved' | 'rejected';
  name: string;
  email: string;
  cpfMasked: string;
  statusCheckedAt: Date | null;
  hasWallet: boolean;
}

export interface CoachAccountInput {
  name: string;
  email: string;
  cpfCnpj: string;
  mobilePhone: string;
  birthDate: string;
  incomeValue: number;
  postalCode: string;
  address: string;
  addressNumber: string;
  complement: string;
  province: string;
}

/** O professor vê os próprios repasses e cuida da própria conta de recebimento. */
@Injectable({ providedIn: 'root' })
export class MyPayoutsActions extends CenterActionsBase {
  watchPayouts(onData: (p: Payout[]) => void, onError: (e: unknown) => void): () => void {
    const uid = this.actor().uid;
    return onSnapshot(
      query(collection(db(), CENTERS, this.centerId(), 'payouts'), where('coachUid', '==', uid)),
      (snap) => onData(snap.docs.map((d) => readPayout(d.id, d.data())).sort((a, b) => b.month.localeCompare(a.month))),
      onError,
    );
  }

  watchAccount(onData: (a: CoachAccount | null) => void, onError: (e: unknown) => void): () => void {
    return onSnapshot(
      doc(db(), 'professorPayoutAccounts', this.actor().uid),
      (snap) => {
        if (!snap.exists()) {
          onData(null);
          return;
        }
        const d = snap.data();
        const st = str(d, 'status');
        onData({
          status: (['creating', 'failed', 'pending', 'approved', 'rejected'].includes(st) ? st : 'pending') as CoachAccount['status'],
          name: str(d, 'name'),
          email: str(d, 'email'),
          cpfMasked: str(d, 'cpfMasked'),
          statusCheckedAt: date(d['statusCheckedAt']),
          hasWallet: !!str(d, 'walletId') || bool(d, 'hasWallet'),
        });
      },
      onError,
    );
  }

  createAccount(input: CoachAccountInput): Promise<{ status: string }> {
    return callCenterFunction('createProfessorPayoutAccount', { ...input });
  }

  refreshAccount(): Promise<{ status: string | null }> {
    return callCenterFunction('refreshProfessorPayoutAccountStatus', {});
  }
}
