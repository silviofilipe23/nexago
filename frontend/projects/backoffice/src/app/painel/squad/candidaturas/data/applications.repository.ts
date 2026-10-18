import { Injectable, inject } from '@angular/core';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { backofficeDb } from '../../../data/firebase';
import { SquadRulesRepository } from '../../niveis-regras/data/squad-rules.repository';
import type { SquadRules } from '../../niveis-regras/data/squad-rules';
import { contractFromDoc, SquadProgramRepository, type Contract } from '../../data/squad-program.repository';
import type { Cycle } from '../../data/squad-program';
import { applicationFromDoc, inviteFromDoc, type Application, type Invite } from './application';

export interface BoardState {
  applications: Application[];
  invites: Invite[];
  contracts: Contract[];
  rules: SquadRules;
  rulesVersion: number;
  cycle: Cycle;
  outstandingInvites: number;
}

type Raw = Record<string, unknown>;

/**
 * Leitura direto do Firestore; escrita pelas callables de `functions/src/squad-applications.ts`
 * (via `SquadProgramRepository`). Arquivadas só carregam quando alguém abre "Ver arquivadas".
 */
@Injectable({ providedIn: 'root' })
export class ApplicationsRepository {
  private readonly program = inject(SquadProgramRepository);
  private readonly rulesRepo = inject(SquadRulesRepository);

  async board(): Promise<BoardState> {
    const db = backofficeDb();
    const [apps, invites, contracts, rules, cycle] = await Promise.all([
      getDocs(query(collection(db, 'squadApplications'), where('stage', 'in', ['new', 'review', 'invited', 'contract']))),
      getDocs(query(collection(db, 'squadInvites'), where('status', 'in', ['scheduled', 'sent', 'opened']))),
      getDocs(query(collection(db, 'squadAmbassadors'), where('status', 'in', ['active', 'paused']))),
      this.rulesRepo.load(),
      this.program.cycle(),
    ]);
    const inviteList = invites.docs.map((d) => inviteFromDoc(d.id, d.data() as Raw));
    return {
      applications: apps.docs.map((d) => applicationFromDoc(d.id, d.data() as Raw)),
      invites: inviteList,
      contracts: contracts.docs.map((d) => contractFromDoc(d.id, d.data() as Raw)),
      rules: rules.rules,
      rulesVersion: rules.version,
      cycle,
      outstandingInvites: inviteList.filter((i) => i.status === 'sent' || i.status === 'opened').length,
    };
  }

  /** Recusadas, lista de espera, expiradas e canceladas (assinadas viram embaixador na tela 02). */
  async archived(): Promise<Application[]> {
    const snap = await getDocs(query(collection(backofficeDb(), 'squadApplications'), where('stage', '==', 'archived')));
    return snap.docs
      .map((d) => applicationFromDoc(d.id, d.data() as Raw))
      .filter((a) => a.archivedReason !== 'accepted')
      .sort((a, b) => (b.stageChangedAt?.getTime() ?? 0) - (a.stageChangedAt?.getTime() ?? 0));
  }

  /** Convites de cards arquivados (para reenviar um expirado). */
  async invitesFor(ids: string[]): Promise<Invite[]> {
    if (ids.length === 0) return [];
    const out: Invite[] = [];
    for (let i = 0; i < ids.length; i += 30) {
      const snap = await getDocs(
        query(collection(backofficeDb(), 'squadInvites'), where('applicationId', 'in', ids.slice(i, i + 30))),
      );
      out.push(...snap.docs.map((d) => inviteFromDoc(d.id, d.data() as Raw)));
    }
    return out;
  }
}
