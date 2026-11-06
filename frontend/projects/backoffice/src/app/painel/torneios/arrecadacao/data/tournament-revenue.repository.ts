import { Injectable } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { backofficeDb } from '../../../data/firebase';
import { tournamentRowOf, type TournamentRow } from '../../data/tournaments.repository';
import {
  COST_COMMISSION_STATUSES,
  commissionFromRaw,
  ledgerLineFromRaw,
  offPlatformCentsOf,
  type LedgerLine,
  type SquadCommissionCost,
} from './tournament-revenue';

export interface RevenueTournament {
  row: TournamentRow;
  offPlatformCents: number;
}

type Snap = { id: string; exists(): boolean; data(): DocumentData | undefined };

function tournamentOf(snap: Snap): RevenueTournament {
  return { row: tournamentRowOf(snap), offPlatformCents: offPlatformCentsOf(snap.data() ?? {}) };
}

function awaitingCentsOf(data: DocumentData | undefined): number {
  const v = data?.['awaitingSettlementReais'];
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v * 100)) : 0;
}

/**
 * Leitura direto do Firestore: o admin lê `tournamentWallets` (e o extrato) e `squadCommissions`
 * pelas rules, e `tournaments` é público. Nada aqui escreve.
 *
 * O extrato é lido linha a linha, não por agregação: somar vários campos numa agregação só exige
 * índice composto (sem ele o Firestore recusa com FAILED_PRECONDITION), e a tela de detalhe
 * precisa das linhas de qualquer jeito. Com o volume crescendo, o próximo passo é manter os totais
 * no próprio doc do caixa na hora do crédito.
 */
@Injectable({ providedIn: 'root' })
export class TournamentRevenueRepository {
  /** Caixas existentes (só nasce caixa em torneio que recebeu pela plataforma) → "a liberar". */
  async wallets(): Promise<Map<string, number>> {
    const snap = await getDocs(collection(backofficeDb(), 'tournamentWallets'));
    return new Map(snap.docs.map((d) => [d.id, awaitingCentsOf(d.data())]));
  }

  async wallet(tournamentId: string): Promise<{ awaitingCents: number } | null> {
    const snap = await getDoc(doc(backofficeDb(), 'tournamentWallets', tournamentId));
    return snap.exists() ? { awaitingCents: awaitingCentsOf(snap.data()) } : null;
  }

  async ledger(tournamentId: string): Promise<LedgerLine[]> {
    const snap = await getDocs(collection(backofficeDb(), 'tournamentWallets', tournamentId, 'ledger'));
    return snap.docs.map((d) => ledgerLineFromRaw(d.id, d.data())).filter((l): l is LedgerLine => l !== null);
  }

  /**
   * Torneios que arrecadaram alguma coisa: `collectedCents > 0` (o trigger de
   * `tournament-collected-stats.ts` soma os dois canais) mais os que têm caixa e ainda não ganharam
   * o campo. Torneio sem dinheiro nenhum não entra — a tela é de arrecadação.
   */
  async tournamentsWithMoney(walletIds: Iterable<string>): Promise<RevenueTournament[]> {
    const db = backofficeDb();
    const snap = await getDocs(query(collection(db, 'tournaments'), where('collectedCents', '>', 0)));
    const found = new Map(snap.docs.map((d) => [d.id, tournamentOf(d)]));
    const missing = [...walletIds].filter((id) => !found.has(id));
    const extra = await Promise.all(missing.map((id) => getDoc(doc(db, 'tournaments', id))));
    for (const s of extra) {
      if (s.exists()) found.set(s.id, tournamentOf(s));
    }
    return [...found.values()];
  }

  async tournament(id: string): Promise<RevenueTournament | null> {
    const snap = await getDoc(doc(backofficeDb(), 'tournaments', id));
    return snap.exists() ? tournamentOf(snap) : null;
  }

  /** Comissões que já são custo, de todos os torneios (poucas: uma por atleta convertido). */
  async commissions(): Promise<SquadCommissionCost[]> {
    const snap = await getDocs(
      query(collection(backofficeDb(), 'squadCommissions'), where('status', 'in', [...COST_COMMISSION_STATUSES])),
    );
    return snap.docs.map((d) => commissionFromRaw(d.data())).filter((c): c is SquadCommissionCost => c !== null);
  }

  /** Igualdade num campo só (índice automático); o status filtra aqui. */
  async commissionsOf(tournamentId: string): Promise<SquadCommissionCost[]> {
    const snap = await getDocs(
      query(collection(backofficeDb(), 'squadCommissions'), where('tournamentId', '==', tournamentId)),
    );
    return snap.docs.map((d) => commissionFromRaw(d.data())).filter((c): c is SquadCommissionCost => c !== null);
  }
}
