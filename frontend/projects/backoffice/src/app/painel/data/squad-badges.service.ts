import { Injectable, signal, type WritableSignal } from '@angular/core';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { backofficeDb } from './firebase';

/**
 * Contadores do Squad na sidebar: embaixadores com comissão liberada esperando repasse, contratos
 * ativos (Embaixadores) e candidaturas na coluna Novas (Candidaturas). Lê uma vez por sessão, como
 * os da Loja; cada tela publica o número fresco quando carrega.
 */
@Injectable({ providedIn: 'root' })
export class SquadBadgesService {
  readonly ambassadorsToPay = signal<number | null>(null);
  readonly activeContracts = signal<number | null>(null);
  readonly newApplications = signal<number | null>(null);
  private loading: Promise<void> | null = null;

  load(): Promise<void> {
    const db = backofficeDb();
    // Sem badge é melhor que badge errado: cada leitura falha sozinha.
    const count = (
      target: WritableSignal<number | null>,
      run: () => Promise<number>,
    ): Promise<void> =>
      run()
        .then((n) => {
          if (target() === null) target.set(n);
        })
        .catch(() => undefined);
    this.loading ??= Promise.all([
      count(this.ambassadorsToPay, async () => {
        const snap = await getDocs(query(collection(db, 'squadCommissions'), where('status', '==', 'released')));
        return new Set(snap.docs.map((d) => d.data()['ambassadorId'])).size;
      }),
      count(this.activeContracts, async () => {
        // Pausado segue com contrato (e vaga): só o encerrado sai da conta, como nas abas da tela.
        const snap = await getDocs(query(collection(db, 'squadAmbassadors'), where('status', 'in', ['active', 'paused'])));
        return snap.size;
      }),
      count(this.newApplications, async () => {
        const snap = await getDocs(query(collection(db, 'squadApplications'), where('stage', '==', 'new')));
        return snap.size;
      }),
    ]).then(() => undefined);
    return this.loading;
  }

  set(count: number): void {
    this.ambassadorsToPay.set(count);
  }

  setActiveContracts(count: number): void {
    this.activeContracts.set(count);
  }

  setNewApplications(count: number): void {
    this.newApplications.set(count);
  }
}
