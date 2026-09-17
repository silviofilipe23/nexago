import { Injectable } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { backofficeFunctions } from '../../data/firebase';

/** Origem do saque — cada uma tem seu par de callables, com o mesmo contrato. */
export type WithdrawalKind = 'organizer' | 'arena';

/** Decisões aceitas por `review*Withdrawal`. */
export type WithdrawalDecision = 'approved' | 'approved_manual' | 'rejected';

export interface PendingWithdrawal {
  id: string;
  kind: WithdrawalKind;
  /** Nome do organizador ou da arena, já resolvido pelo callable. */
  requesterName: string;
  requesterId: string;
  /**
   * Nome do evento de onde o dinheiro sai. Só existe para `kind: 'organizer'`;
   * vem vazio em saques anteriores a 16/09/2026, que não gravavam este campo.
   */
  tournamentName: string;
  /**
   * Nome de quem de fato pediu o saque — pode ser um gestor da equipe, não o
   * dono do evento. Cai no uid cru quando o doc de `users` não tem nome. Só
   * existe para `kind: 'organizer'`.
   */
  requestedByName: string;
  /**
   * `true` quando quem pediu é um gestor da equipe, não o dono do evento. Vem
   * pronto do backend — não é derivado de comparação de uid.
   */
  requestedByStaff: boolean;
  amountReais: number;
  pixKey: string;
  /** Falha de repasse de uma tentativa anterior, quando houver. */
  payoutStatus: string | null;
  payoutError: string | null;
  createdAt: Date | null;
}

interface ListResponse {
  items?: unknown;
}

const CALLABLES: Record<WithdrawalKind, { list: string; review: string }> = {
  organizer: {
    list: 'listPendingOrganizerWithdrawals',
    review: 'reviewOrganizerWithdrawal',
  },
  arena: {
    list: 'listPendingArenaWithdrawals',
    review: 'reviewArenaWithdrawal',
  },
};

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullableStr(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function toWithdrawal(raw: unknown, kind: WithdrawalKind): PendingWithdrawal | null {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const id = str(row['id']);
  if (!id) {
    return null;
  }
  const createdAtRaw = str(row['createdAt']);
  const createdAt = createdAtRaw ? new Date(createdAtRaw) : null;
  return {
    id,
    kind,
    requesterName: str(kind === 'arena' ? row['arenaName'] : row['organizerName']) || id,
    requesterId: str(kind === 'arena' ? row['arenaId'] : row['organizerId']),
    tournamentName: str(row['tournamentName']),
    requestedByName: str(row['requestedByName']),
    requestedByStaff: row['requestedByStaff'] === true,
    amountReais: Number(row['amountReais']) || 0,
    pixKey: str(row['pixKey']),
    payoutStatus: nullableStr(row['payoutStatus']),
    payoutError: nullableStr(row['payoutError']),
    createdAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null,
  };
}

/** Contexto da linha na fila de aprovação. É aqui que um humano decide sobre
 *  dinheiro, então a linha diz de qual evento o dinheiro sai e quem pediu —
 *  antes mostrava só o nome do organizador, mesmo quando o pedido era de um
 *  gestor da equipe. */
export function withdrawalQueueSubtitle(row: PendingWithdrawal): string {
  if (row.kind !== 'organizer') return row.requesterName;
  const evento = row.tournamentName?.trim() || 'Evento não identificado';
  const quem = row.requestedByStaff
    ? `pedido por ${row.requestedByName?.trim() || 'gestor da equipe'} (gestor da equipe)`
    : 'pedido pelo dono';
  return `${evento} · ${quem}`;
}

/**
 * Fila de saques pendentes do backoffice.
 *
 * `approved` dispara o PIX de verdade (Asaas); `approved_manual` só registra que
 * o repasse saiu por fora; `rejected` devolve o valor reservado para a carteira.
 */
@Injectable({ providedIn: 'root' })
export class WithdrawalsRepository {
  async listPending(kind: WithdrawalKind): Promise<PendingWithdrawal[]> {
    const callable = httpsCallable<Record<string, unknown>, ListResponse>(
      backofficeFunctions(),
      CALLABLES[kind].list,
    );
    const result = await callable({});
    const items = result.data?.items;
    if (!Array.isArray(items)) {
      return [];
    }
    return items
      .map((item) => toWithdrawal(item, kind))
      .filter((w): w is PendingWithdrawal => w != null)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }

  async review(
    kind: WithdrawalKind,
    withdrawalId: string,
    decision: WithdrawalDecision,
    note: string,
  ): Promise<void> {
    const callable = httpsCallable<Record<string, unknown>, unknown>(
      backofficeFunctions(),
      CALLABLES[kind].review,
    );
    await callable({ withdrawalId, decision, note });
  }
}
