import { Injectable } from '@angular/core';
import { httpsCallable, type FunctionsError } from 'firebase/functions';

import { firebaseFunctions } from '../../firebase';

export type WithdrawalStatus = 'pending' | 'approved' | 'rejected';

export type PayoutStatus = 'pending' | 'sent' | 'failed' | 'manual';

export interface ArenaWithdrawalRow {
  id: string;
  arenaId: string;
  arenaName: string;
  managerUserId: string;
  amountReais: number;
  pixKey: string;
  status: WithdrawalStatus;
  payoutStatus: PayoutStatus | null;
  payoutError: string | null;
  asaasTransferId: string | null;
  mercadopagoPayoutId: string | null;
  createdAt: Date | null;
}

@Injectable({ providedIn: 'root' })
export class ArenaWithdrawalsService {
  private readonly listPendingFn = httpsCallable<
    Record<string, never>,
    { items: Array<Record<string, unknown>> }
  >(firebaseFunctions, 'listPendingArenaWithdrawals');

  private readonly reviewFn = httpsCallable<
    { withdrawalId: string; decision: string; note?: string },
    { status: string }
  >(firebaseFunctions, 'reviewArenaWithdrawal');

  async listPending(): Promise<ArenaWithdrawalRow[]> {
    try {
      const result = await this.listPendingFn({});
      const items = result.data?.items;
      if (!Array.isArray(items)) return [];
      return items.map(mapWithdrawalRow);
    } catch (e) {
      throw new Error(mapCallableError(e));
    }
  }

  async review(
    withdrawalId: string,
    decision: 'approved' | 'approved_manual' | 'rejected',
    note = '',
  ): Promise<void> {
    try {
      await this.reviewFn({ withdrawalId, decision, note });
    } catch (e) {
      throw new Error(mapCallableError(e));
    }
  }
}

function mapWithdrawalRow(raw: Record<string, unknown>): ArenaWithdrawalRow {
  const createdRaw = raw['createdAt'];
  let createdAt: Date | null = null;
  if (typeof createdRaw === 'string') {
    createdAt = new Date(createdRaw);
    if (Number.isNaN(createdAt.getTime())) createdAt = null;
  }

  return {
    id: typeof raw['id'] === 'string' ? raw['id'] : '',
    arenaId: typeof raw['arenaId'] === 'string' ? raw['arenaId'] : '',
    arenaName:
      typeof raw['arenaName'] === 'string'
        ? raw['arenaName']
        : typeof raw['arenaId'] === 'string'
          ? raw['arenaId']
          : '',
    managerUserId: typeof raw['managerUserId'] === 'string' ? raw['managerUserId'] : '',
    amountReais: Number(raw['amountReais']) || 0,
    pixKey: typeof raw['pixKey'] === 'string' ? raw['pixKey'] : '',
    status: ((raw['status'] as string) ?? 'pending') as WithdrawalStatus,
    payoutStatus: parsePayoutStatus(raw['payoutStatus']),
    payoutError: typeof raw['payoutError'] === 'string' ? raw['payoutError'] : null,
    asaasTransferId:
      typeof raw['asaasTransferId'] === 'string' ? raw['asaasTransferId'] : null,
    mercadopagoPayoutId:
      typeof raw['mercadopagoPayoutId'] === 'string' ? raw['mercadopagoPayoutId'] : null,
    createdAt,
  };
}

function parsePayoutStatus(raw: unknown): PayoutStatus | null {
  if (raw === 'pending' || raw === 'sent' || raw === 'failed' || raw === 'manual') {
    return raw;
  }
  return null;
}

function mapCallableError(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const fe = err as FunctionsError;
    if (fe.message?.trim()) return fe.message;
    switch (fe.code) {
      case 'functions/permission-denied':
        return 'Sem permissão. Use uma conta com papel admin da plataforma.';
      case 'functions/unauthenticated':
        return 'Faça login novamente.';
      case 'functions/failed-precondition':
        return (
          fe.message?.trim() ||
          'Índice do Firestore em construção. Aguarde alguns minutos e clique em Atualizar.'
        );
      case 'functions/not-found':
        return 'Função não encontrada. Faça deploy de listPendingArenaWithdrawals.';
      default:
        return fe.code;
    }
  }
  return err instanceof Error ? err.message : 'Falha ao comunicar com o servidor.';
}
