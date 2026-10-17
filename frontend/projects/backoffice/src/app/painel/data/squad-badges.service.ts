import { Injectable, signal } from '@angular/core';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { backofficeDb } from './firebase';

/**
 * Contador do Squad na sidebar: embaixadores com comissão liberada esperando repasse.
 * Lê uma vez por sessão, como os da Loja; a tela de Comissões publica o número fresco.
 */
@Injectable({ providedIn: 'root' })
export class SquadBadgesService {
  readonly ambassadorsToPay = signal<number | null>(null);
  private loading: Promise<void> | null = null;

  load(): Promise<void> {
    this.loading ??= getDocs(query(collection(backofficeDb(), 'squadCommissions'), where('status', '==', 'released')))
      .then((snap) => {
        if (this.ambassadorsToPay() === null) {
          this.ambassadorsToPay.set(new Set(snap.docs.map((d) => d.data()['ambassadorId'])).size);
        }
      })
      .catch(() => {
        // Sem badge é melhor que badge errado.
      });
    return this.loading;
  }

  set(count: number): void {
    this.ambassadorsToPay.set(count);
  }
}
