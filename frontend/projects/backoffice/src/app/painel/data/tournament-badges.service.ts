import { Injectable, signal } from '@angular/core';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { backofficeDb } from './firebase';

/**
 * Contador de Torneios › Contratos na sidebar: pedidos de plano que ainda esperam a NexaGO
 * confirmar o sinal. Lê uma vez por sessão, como os da Loja; a tela publica o número fresco.
 */
@Injectable({ providedIn: 'root' })
export class TournamentBadgesService {
  readonly requestedContracts = signal<number | null>(null);
  private loading: Promise<void> | null = null;

  load(): Promise<void> {
    // Sem badge é melhor que badge errado: a falha só deixa o item sem número.
    this.loading ??= getDocs(query(collection(backofficeDb(), 'tournamentPlanContracts'), where('status', '==', 'requested')))
      .then((snap) => {
        if (this.requestedContracts() === null) this.requestedContracts.set(snap.size);
      })
      .catch(() => undefined);
    return this.loading;
  }

  setRequestedContracts(count: number): void {
    this.requestedContracts.set(count);
  }
}
