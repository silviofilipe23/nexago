import { Injectable, inject } from '@angular/core';
import { collection, doc, getCountFromServer, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { backofficeDb } from '../../../data/firebase';
import { SquadRulesRepository } from '../../niveis-regras/data/squad-rules.repository';
import { rulesFromDoc, type SquadRules, type TierPackage } from '../../niveis-regras/data/squad-rules';
import { commissionFromDoc, type Commission } from '../../comissoes/data/commission';
import { contractFromDoc, type Contract } from '../../data/squad-program.repository';
import { applicationFromDoc, type Application } from '../../candidaturas/data/application';
import { profileContractFromDoc, type ProfileContract } from './profile';

type Raw = Record<string, unknown>;

export interface ProfileState {
  contract: ProfileContract;
  /** Todos os contratos: a posição no Score e o código duplicado saem daqui. */
  contracts: Contract[];
  /** Comissões deste embaixador, qualquer status. */
  commissions: Commission[];
  /** Contas que chegaram pelo link/QR dele. */
  signups: number;
  /** Candidatura que virou este contrato (retrato esportivo + redes conferidas). */
  application: Application | null;
  rules: SquadRules;
  rulesVersion: number;
  /** Pacote do nível na versão congelada no contrato; `null` se a versão não for achada. */
  frozenPackage: TierPackage | null;
}

/** Leitura direto do Firestore; as ações do cabeçalho usam as callables via `SquadProgramRepository`. */
@Injectable({ providedIn: 'root' })
export class ProfileRepository {
  private readonly rulesRepo = inject(SquadRulesRepository);

  /** `null` quando não há contrato para esse uid. */
  async load(uid: string): Promise<ProfileState | null> {
    const db = backofficeDb();
    const snap = await getDoc(doc(db, 'squadAmbassadors', uid));
    if (!snap.exists()) return null;
    const contract = profileContractFromDoc(uid, snap.data() as Raw);
    const [contracts, commissions, signups, application, rules, frozen] = await Promise.all([
      getDocs(collection(db, 'squadAmbassadors')),
      getDocs(query(collection(db, 'squadCommissions'), where('ambassadorId', '==', uid))),
      getCountFromServer(query(collection(db, 'squadAttributions'), where('ambassadorId', '==', uid))),
      this.application(uid),
      this.rulesRepo.load(),
      this.frozenRules(contract.rulesVersion),
    ]);
    return {
      contract,
      contracts: contracts.docs.map((d) => contractFromDoc(d.id, d.data() as Raw)),
      commissions: commissions.docs.map((d) => commissionFromDoc(d.id, d.data() as Raw)),
      signups: signups.data().count,
      application,
      rules: rules.rules,
      rulesVersion: rules.version,
      frozenPackage: (frozen ?? (contract.rulesVersion === rules.version ? rules.rules : null))?.tiers[contract.tier] ?? null,
    };
  }

  /** A candidatura aceita mais recente (convite direto também cria uma, `source: manual`). */
  private async application(uid: string): Promise<Application | null> {
    const snap = await getDocs(query(collection(backofficeDb(), 'squadApplications'), where('athleteId', '==', uid)));
    const apps = snap.docs.map((d) => applicationFromDoc(d.id, d.data() as Raw));
    const accepted = apps.filter((a) => a.archivedReason === 'accepted');
    const pool = accepted.length > 0 ? accepted : apps;
    return pool.sort((a, b) => (b.stageChangedAt?.getTime() ?? 0) - (a.stageChangedAt?.getTime() ?? 0))[0] ?? null;
  }

  /** Retrato da versão das regras do contrato. Sem a versão, o pacote vigente responde (ou nada). */
  private async frozenRules(version: number | null): Promise<SquadRules | null> {
    if (version === null) return null;
    try {
      const col = collection(backofficeDb(), 'squadConfig', 'rules', 'versions');
      const snap = await getDocs(query(col, where('version', '==', version), limit(1)));
      return snap.empty ? null : rulesFromDoc(snap.docs[0]!.data() as Raw);
    } catch {
      return null;
    }
  }
}
