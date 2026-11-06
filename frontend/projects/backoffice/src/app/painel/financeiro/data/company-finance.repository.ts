import { Injectable } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { backofficeFunctions } from '../../data/firebase';
import { companyFinanceFrom, type CompanyFinance } from './company-finance';

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
}
