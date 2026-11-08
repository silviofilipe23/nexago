import { Injectable, inject } from '@angular/core';
import { Timestamp, collection, getCountFromServer, getDocs, query, where } from 'firebase/firestore';
import { AthletesRepository, type AthleteBaseSummary } from '../../atletas/data/athletes.repository';
import { backofficeDb } from '../../data/firebase';
import { WithdrawalsRepository, type WithdrawalKind } from '../../financeiro/data/withdrawals.repository';
import { statusFrom } from '../../torneios/data/tournaments.repository';

export interface ArenaCounts {
  total: number;
  /** Com conta na plataforma (não é pré-cadastro do comercial). */
  registered: number;
  preRegistered: number;
}

export interface TournamentCounts {
  total: number;
  /** Inscrições abertas, encerradas aguardando o dia ou em andamento (sem rascunho). */
  active: number;
  completed: number;
}

/** `null` = a leitura falhou: o card mostra "—" em vez de um número inventado. */
export interface DashboardData {
  athletes: AthleteBaseSummary | null;
  arenas: ArenaCounts | null;
  tournaments: TournamentCounts | null;
  pendingWithdrawals: { count: number; totalReais: number } | null;
}

const WITHDRAWAL_KINDS: readonly WithdrawalKind[] = ['organizer', 'arena', 'professor'];

async function settle<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

/** Números reais do dashboard inicial. Cada fonte falha sozinha, sem derrubar as outras. */
@Injectable({ providedIn: 'root' })
export class DashboardRepository {
  private readonly athletesRepo = inject(AthletesRepository);
  private readonly withdrawalsRepo = inject(WithdrawalsRepository);

  async load(): Promise<DashboardData> {
    const [athletes, arenas, tournaments, pendingWithdrawals] = await Promise.all([
      settle(this.athletesRepo.athleteBase(false).then((b) => b.summary)),
      settle(this.arenaCounts()),
      settle(this.tournamentCounts()),
      settle(this.pendingWithdrawals()),
    ]);
    return { athletes, arenas, tournaments, pendingWithdrawals };
  }

  private async arenaCounts(): Promise<ArenaCounts> {
    const arenas = collection(backofficeDb(), 'arenas');
    const [total, pre] = await Promise.all([
      getCountFromServer(arenas),
      getCountFromServer(query(arenas, where('unclaimed', '==', true))),
    ]);
    const t = total.data().count;
    const p = pre.data().count;
    return { total: t, registered: t - p, preRegistered: p };
  }

  /** Mesma derivação de status da tela de Torneios (`statusFrom`), para os números baterem. */
  private async tournamentCounts(): Promise<TournamentCounts> {
    const snap = await getDocs(collection(backofficeDb(), 'tournaments'));
    let active = 0;
    let completed = 0;
    let total = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      const raw = String(data['listingStatus'] ?? data['status'] ?? '');
      if (String(data['status'] ?? '') === 'draft') continue;
      total++;
      const startAt = data['startAt'] instanceof Timestamp ? data['startAt'].toDate() : null;
      const status = statusFrom(raw, startAt);
      if (status === 'concluido') completed++;
      else if (status !== 'cancelado') active++;
    }
    return { total, active, completed };
  }

  private async pendingWithdrawals(): Promise<{ count: number; totalReais: number }> {
    const lists = await Promise.all(WITHDRAWAL_KINDS.map((kind) => this.withdrawalsRepo.listPending(kind)));
    const all = lists.flat();
    return { count: all.length, totalReais: all.reduce((sum, w) => sum + w.amountReais, 0) };
  }
}
