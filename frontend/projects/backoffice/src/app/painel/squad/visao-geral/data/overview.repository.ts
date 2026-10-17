import { Injectable, inject } from '@angular/core';
import { collection, getCountFromServer, getDocs, query, where } from 'firebase/firestore';
import { backofficeDb } from '../../../data/firebase';
import { SquadRulesRepository } from '../../niveis-regras/data/squad-rules.repository';
import type { SquadRules } from '../../niveis-regras/data/squad-rules';
import { CommissionsRepository } from '../../comissoes/data/commissions.repository';
import {
  commissionFromDoc,
  lastDoneKey,
  openPayoutDate,
  spDateKey,
  type Commission,
} from '../../comissoes/data/commission';
import { SquadProgramRepository, contractFromDoc, type Contract } from '../../data/squad-program.repository';
import type { Cycle } from '../../data/squad-program';

type Raw = Record<string, unknown>;

export interface OverviewState {
  contracts: Contract[];
  /** Todas as comissões (qualquer status): inscrições, conversões e origem saem daqui. */
  commissions: Commission[];
  rules: SquadRules;
  rulesVersion: number;
  cycle: Cycle;
  outstandingInvites: number;
  /** Contas que chegaram por link/QR de algum embaixador. */
  signups: number;
  newApplications: number;
  /** Próximo repasse em aberto (dia 6/20), como a faixa da tela 05. */
  payoutDate: string | null;
}

/** Leitura direto do Firestore; a tela só lê (as ações levam às telas 02, 04 e 05). */
@Injectable({ providedIn: 'root' })
export class OverviewRepository {
  private readonly program = inject(SquadProgramRepository);
  private readonly rulesRepo = inject(SquadRulesRepository);
  private readonly commissionsRepo = inject(CommissionsRepository);

  async load(now = new Date()): Promise<OverviewState> {
    const db = backofficeDb();
    const [contracts, commissions, rules, cycle, invites, signups, applications, payoutDate] = await Promise.all([
      getDocs(collection(db, 'squadAmbassadors')),
      getDocs(collection(db, 'squadCommissions')),
      this.rulesRepo.load(),
      this.program.cycle(),
      this.program.outstandingInvites(),
      getCountFromServer(collection(db, 'squadAttributions')),
      getCountFromServer(query(collection(db, 'squadApplications'), where('stage', '==', 'new'))),
      this.payoutDate(now),
    ]);
    return {
      contracts: contracts.docs.map((d) => contractFromDoc(d.id, d.data() as Raw)),
      commissions: commissions.docs.map((d) => commissionFromDoc(d.id, d.data() as Raw)),
      rules: rules.rules,
      rulesVersion: rules.version,
      cycle,
      outstandingInvites: invites,
      signups: signups.data().count,
      newApplications: applications.data().count,
      payoutDate,
    };
  }

  /** Sem data é melhor que data errada: falhou a leitura do repasse, o alerta sai sem ela. */
  private async payoutDate(now: Date): Promise<string | null> {
    try {
      const s = await this.commissionsRepo.payoutState();
      return openPayoutDate(spDateKey(now), lastDoneKey(s.payouts), s.config.days);
    } catch {
      return null;
    }
  }
}
