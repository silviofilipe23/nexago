import { Injectable } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { backofficeFunctions } from '../../data/firebase';
import { companyFinanceFrom, type CompanyFinance, type TransferKind } from './company-finance';

export interface ClassifyTransferInput {
  transferId: string;
  kind: TransferKind;
  /** Só no repasse a organizador. */
  tournamentId: string | null;
  /** Repasse cujo caixa já foi baixado antes: registra sem descontar de novo. */
  alreadySettled: boolean;
  note: string;
}

/**
 * Saldo e resultado da empresa. Tudo vem de um callable porque metade das fontes não é legível
 * pelo admin no cliente e o saldo/extrato vêm da API do Asaas.
 */
@Injectable({ providedIn: 'root' })
export class CompanyFinanceRepository {
  async load(month: string): Promise<CompanyFinance> {
    const result = await httpsCallable(backofficeFunctions(), 'getCompanyFinance')({ month });
    return companyFinanceFrom(result.data);
  }

  /** Classifica a transferência feita à mão no Asaas; valor e data o servidor lê do Asaas. */
  async classifyTransfer(input: ClassifyTransferInput): Promise<void> {
    await httpsCallable(backofficeFunctions(), 'classifyCompanyTransfer')(input);
  }
}
