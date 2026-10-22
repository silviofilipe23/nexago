import { Injectable } from '@angular/core';
import { doc, onSnapshot } from 'firebase/firestore';
import type { ReceivingAccount, ReceivingStatus } from '../../domain/models';
import { CENTERS, db } from '../firebase';
import { readReceivingAccount } from '../mappers';
import { CenterActionsBase } from './actor';
import { callCenterFunction } from './invoices.actions';

export interface ReceivingAccountInput {
  personType: 'company' | 'person';
  companyType: string;
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

/**
 * Conta de recebimento (subconta Asaas). Criar e consultar vão por callable — o `walletId` e a
 * chave da subconta nunca passam pelo navegador.
 */
@Injectable({ providedIn: 'root' })
export class ReceivingActions extends CenterActionsBase {
  /** Situação e documentos pendentes (owner/admin). */
  watch(onData: (account: ReceivingAccount | null) => void, onError: (e: unknown) => void): () => void {
    return onSnapshot(
      doc(db(), CENTERS, this.centerId(), 'receivingAccount', 'current'),
      (snap) => onData(snap.exists() ? readReceivingAccount(snap.data()) : null),
      onError,
    );
  }

  create(input: ReceivingAccountInput): Promise<{ status: ReceivingStatus }> {
    this.assertWritable();
    return callCenterFunction('createTrainingCenterReceivingAccount', { centerId: this.centerId(), ...input });
  }

  refresh(): Promise<{ status: ReceivingStatus | null; documents: number }> {
    return callCenterFunction('refreshTrainingCenterReceivingStatus', { centerId: this.centerId() });
  }
}
