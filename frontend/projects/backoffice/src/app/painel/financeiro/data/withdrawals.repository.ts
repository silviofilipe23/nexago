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

/**
 * Nome do evento de onde o dinheiro sai, para exibir. Cai no aviso quando
 * falta `tournamentName` (saques anteriores a 16/09/2026, que não gravavam
 * o campo) — nunca inventa um nome.
 */
export function withdrawalEventName(row: PendingWithdrawal): string {
  return row.tournamentName?.trim() || 'Evento não identificado';
}

/** Contexto da linha na fila de aprovação. É aqui que um humano decide sobre
 *  dinheiro, então a linha diz de qual evento o dinheiro sai e quem pediu —
 *  antes mostrava só o nome do organizador, mesmo quando o pedido era de um
 *  gestor da equipe. */
export function withdrawalQueueSubtitle(row: PendingWithdrawal): string {
  if (row.kind !== 'organizer') return row.requesterName;
  const quem = row.requestedByStaff
    ? `pedido por ${row.requestedByName?.trim() || 'gestor da equipe'} (gestor da equipe)`
    : 'pedido pelo dono';
  return `${withdrawalEventName(row)} · ${quem}`;
}

/**
 * Nome de quem de fato pediu, só quando é um gestor da equipe — `null`
 * quando foi o próprio dono (aí "Solicitante" já é a resposta completa) ou
 * quando é saque de arena (não existe esse conceito lá). Nunca cai no nome
 * do dono quando falta o nome de quem pediu: diria que ele pediu pra si
 * mesmo, o que seria falso — mesma regra de `withdrawalQueueSubtitle`.
 */
export function withdrawalRequestedByStaffName(row: PendingWithdrawal): string | null {
  if (row.kind !== 'organizer' || !row.requestedByStaff) {
    return null;
  }
  return row.requestedByName?.trim() || 'gestor da equipe';
}

/**
 * Texto da linha "Solicitante" do diálogo de aprovação (saques de
 * organizador — o diálogo de arena não usa esta função, o campo "Solicitante"
 * dele já é a resposta completa). Nunca fica em branco: quando foi o próprio
 * dono, diz isso explicitamente. Omitir a linha era seguro enquanto o campo
 * do dono ainda se chamava "Solicitante"; virou "Organizador", e uma linha
 * ausente vira pergunta sem resposta, não mais implicação óbvia.
 */
export function withdrawalRequesterLine(row: PendingWithdrawal): string {
  const staffName = withdrawalRequestedByStaffName(row);
  return staffName ? `${staffName} (gestor da equipe)` : 'O próprio organizador';
}

/**
 * Mensagem de retorno depois de uma decisão na fila. `value` já vem
 * formatado em reais pelo chamador — esta função só compõe o texto, não
 * formata dinheiro.
 *
 * Saque de arena identifica pelo nome de quem pediu, como sempre — não tem
 * evento, e nada aqui muda o texto que já existia. Saque de organizador
 * passa a identificar pelo EVENTO (`Saque de R$ X do evento Copa Goiás...`),
 * não mais só pelo dono: dois saques do mesmo organizador em torneios
 * diferentes não podem gerar a mesma frase. Quando um gestor da equipe
 * pediu, o texto ainda diz isso — e, no caso aprovado, diz pra quem o PIX
 * foi de verdade, não finge que foi pro dono.
 */
/**
 * Trecho "do evento X" das mensagens de decisão. Sem nome gravado, a frase
 * muda de forma em vez de encaixar o rótulo cru: "do evento Evento não
 * identificado" é texto de máquina, não de gente. O rótulo solto continua
 * valendo na linha da fila, onde ele é o sujeito e lê bem.
 */
function eventClause(row: PendingWithdrawal): string {
  const name = row.tournamentName?.trim();
  return name ? `do evento ${name}` : 'de um evento não identificado';
}

export function withdrawalDecisionMessage(
  row: PendingWithdrawal,
  decision: WithdrawalDecision,
  value: string,
): string {
  const who = row.requesterName;
  if (row.kind !== 'organizer') {
    if (decision === 'rejected') {
      return `Saque de ${value} de ${who} recusado — o valor voltou para a carteira.`;
    }
    if (decision === 'approved_manual') {
      return `Saque de ${value} de ${who} marcado como pago por fora.`;
    }
    return `PIX de ${value} enviado para ${who}.`;
  }

  // Dinheiro de organizador não tem mais "carteira": desde 16/09/2026 ele mora
  // no caixa do evento, e recusar devolve para lá. Arena continua com carteira
  // de verdade, e é por isso que o ramo acima fala outra língua.
  const evento = eventClause(row);
  const requester = withdrawalRequestedByStaffName(row);
  if (decision === 'rejected') {
    return `Saque de ${value} ${evento} recusado${requester ? ` (pedido por ${requester})` : ''} — o valor voltou para o caixa do evento.`;
  }
  if (decision === 'approved_manual') {
    return `Saque de ${value} ${evento} marcado como pago por fora${requester ? ` (pedido por ${requester})` : ''}.`;
  }
  return requester
    ? `PIX de ${value} ${evento} enviado para ${requester} (gestor da equipe).`
    : `PIX de ${value} ${evento} enviado para ${who}.`;
}

/**
 * Fila de saques pendentes do backoffice.
 *
 * `approved` dispara o PIX de verdade (Asaas); `approved_manual` só registra que
 * o repasse saiu por fora; `rejected` devolve o valor reservado — para o caixa
 * do evento, no caso de organizador, e para a carteira, no caso de arena.
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
