import { Injectable, signal } from '@angular/core';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { backofficeDb } from './firebase';

/**
 * Contadores da Loja na sidebar. Lê uma vez por sessão: o shell monta em toda
 * tela, e recontar a cada navegação custaria uma consulta por clique.
 */
@Injectable({ providedIn: 'root' })
export class StoreBadgesService {
  /** SKUs abaixo do alerta (soma de `lowStockSkuCount` dos produtos não arquivados). */
  readonly lowStock = signal<number | null>(null);
  /** Trocas & devoluções esperando análise. */
  readonly returnsToReview = signal<number | null>(null);
  /** Pedidos pagos esperando separação (aba "Para separar"). */
  readonly ordersToPick = signal<number | null>(null);
  /** Artes de personalizados esperando aprovação. */
  readonly customToApprove = signal<number | null>(null);
  private loading: Promise<void> | null = null;
  private loadingCustom: Promise<void> | null = null;
  private loadingReturns: Promise<void> | null = null;
  private loadingOrders: Promise<void> | null = null;

  load(): Promise<void> {
    this.loading ??= getDocs(collection(backofficeDb(), 'storeProducts'))
      .then((snap) => {
        const total = snap.docs
          .map((d) => d.data() as Record<string, unknown>)
          .filter((d) => d['status'] !== 'arquivado')
          .reduce((n, d) => n + (typeof d['lowStockSkuCount'] === 'number' ? d['lowStockSkuCount'] : 0), 0);
        // A tela de Estoque pode ter publicado um número mais fresco enquanto isto carregava.
        if (this.lowStock() === null) {
          this.lowStock.set(total);
        }
      })
      .catch(() => {
        // Sem badge é melhor que badge errado.
      });
    return this.loading;
  }

  loadReturns(): Promise<void> {
    this.loadingReturns ??= getDocs(query(collection(backofficeDb(), 'storeReturns'), where('status', '==', 'analisar')))
      .then((snap) => {
        if (this.returnsToReview() === null) {
          this.returnsToReview.set(snap.size);
        }
      })
      .catch(() => {
        // Sem badge é melhor que badge errado.
      });
    return this.loadingReturns;
  }

  loadOrders(): Promise<void> {
    this.loadingOrders ??= getDocs(query(collection(backofficeDb(), 'storeOrders'), where('status', '==', 'sep')))
      .then((snap) => {
        if (this.ordersToPick() === null) {
          this.ordersToPick.set(snap.size);
        }
      })
      .catch(() => {
        // Sem badge é melhor que badge errado.
      });
    return this.loadingOrders;
  }

  /** A tela de Pedidos conta da lista que acabou de ler. */
  setOrders(count: number): void {
    this.ordersToPick.set(count);
  }

  loadCustom(): Promise<void> {
    this.loadingCustom ??= getDocs(query(collection(backofficeDb(), 'storeCustomItems'), where('status', '==', 'aprovar')))
      .then((snap) => {
        if (this.customToApprove() === null) {
          this.customToApprove.set(snap.size);
        }
      })
      .catch(() => {
        // Sem badge é melhor que badge errado.
      });
    return this.loadingCustom;
  }

  /** A fila de arte conta direto ao carregar e a cada decisão. */
  setCustom(count: number): void {
    this.customToApprove.set(count);
  }

  setReturns(count: number): void {
    this.returnsToReview.set(count);
  }

  /** A tela de Estoque conta direto dos SKUs: vale mais que o desnormalizado. */
  set(count: number): void {
    this.lowStock.set(count);
  }
}
