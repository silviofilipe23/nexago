import { Injectable } from '@angular/core';
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { backofficeDb, backofficeFunctions, backofficeStorage } from '../../../data/firebase';
import {
  contractFromRaw,
  isOpen,
  sponsorFromRaw,
  type ContractStatus,
  type PlanContract,
  type PlanSponsor,
  type SponsorLogoStatus,
} from './plan-contracts';

const CONTRACTS = 'tournamentPlanContracts';

/** Teto da fila: os contratos ainda são poucos; acima disto a tela avisa. */
export const CONTRACTS_CAP = 500;

export interface OrganizerContact {
  orgName: string | null;
  email: string | null;
  phone: string | null;
}

type Raw = Record<string, unknown>;

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function logoPath(tournamentId: string, sponsorId: string): string {
  return `tournaments/${tournamentId}/plan-sponsors/${sponsorId}`;
}

/**
 * Leitura direto do Firestore (as rules deixam o admin ler contratos e cotas); escrita só pelas
 * callables de `functions/src/tournament-plan-contracts-admin.ts`, que guardam o histórico.
 */
@Injectable({ providedIn: 'root' })
export class PlanContractsRepository {
  async list(): Promise<PlanContract[]> {
    const snap = await getDocs(query(collection(backofficeDb(), CONTRACTS), orderBy('startDate'), limit(CONTRACTS_CAP)));
    return snap.docs.map((d) => contractFromRaw(d.id, d.data())).filter((c): c is PlanContract => c !== null);
  }

  /** `null` = não existe (id inventado ou contrato apagado). */
  async get(id: string): Promise<PlanContract | null> {
    const snap = await getDoc(doc(backofficeDb(), CONTRACTS, id));
    return snap.exists() ? contractFromRaw(id, snap.data()) : null;
  }

  async sponsors(id: string): Promise<PlanSponsor[]> {
    const snap = await getDocs(collection(backofficeDb(), CONTRACTS, id, 'sponsors'));
    return snap.docs.map((d) => sponsorFromRaw(d.id, d.data())).filter((s): s is PlanSponsor => s !== null);
  }

  /**
   * Logos em análise por contrato em aberto com cotas (a fila mostra quantas esperam). Uma leitura
   * por contrato: sem rule de collectionGroup em `sponsors`, e a fila é pequena.
   */
  async logosInReview(contracts: readonly PlanContract[]): Promise<Map<string, number>> {
    const open = contracts.filter((c) => isOpen(c.status) && c.sponsors.enabled);
    const counts = await Promise.all(
      open.map(async (c) => [c.id, (await this.sponsors(c.id)).filter((s) => s.logoStatus === 'review').length] as const),
    );
    return new Map(counts.filter(([, n]) => n > 0));
  }

  /** Contato do organizador para cobrar à mão; doc ausente ou negado vira campo vazio. */
  async organizerContact(uid: string): Promise<OrganizerContact> {
    try {
      const snap = await getDoc(doc(backofficeDb(), 'users', uid));
      const user = (snap.data() ?? {}) as Raw;
      const profile = (user['organizerProfile'] ?? {}) as Raw;
      return {
        orgName: text(profile['orgName']),
        email: text(profile['contactEmail']) ?? text(user['email']),
        phone: text(profile['contactPhone']) ?? text(user['phone']),
      };
    } catch {
      return { orgName: null, email: null, phone: null };
    }
  }

  async setStatus(input: { tournamentId: string; from: ContractStatus; to: ContractStatus; note: string | null }): Promise<ContractStatus> {
    const r = await httpsCallable<typeof input, { status: ContractStatus }>(
      backofficeFunctions(),
      'setTournamentPlanContractStatus',
    )(input);
    return r.data.status;
  }

  async reviewLogo(input: {
    tournamentId: string;
    sponsorId: string;
    decision: 'approve' | 'reject';
    logoUrl: string;
    reason: string | null;
  }): Promise<SponsorLogoStatus> {
    const r = await httpsCallable<typeof input, { logoStatus: SponsorLogoStatus }>(
      backofficeFunctions(),
      'reviewPlanContractSponsorLogo',
    )(input);
    return r.data.logoStatus;
  }

  /** Id do patrocinador gerado antes do cadastro: a logo sobe primeiro, no caminho com este id. */
  newSponsorId(tournamentId: string): string {
    return doc(collection(backofficeDb(), CONTRACTS, tournamentId, 'sponsors')).id;
  }

  /** Sobe em `tournaments/{id}/**` (rule de Storage: admin grava) e devolve a URL que a callable confere. */
  async uploadLogo(tournamentId: string, sponsorId: string, file: File): Promise<string> {
    const fileRef = ref(backofficeStorage(), logoPath(tournamentId, sponsorId));
    await uploadBytes(fileRef, file, { contentType: file.type });
    return getDownloadURL(fileRef);
  }

  async addNexagoSponsor(input: { tournamentId: string; sponsorId: string; name: string; tierId: string; logoUrl: string | null }): Promise<void> {
    await httpsCallable(backofficeFunctions(), 'saveNexagoPlanContractSponsor')({ action: 'add', ...input });
  }

  async setNexagoSponsorLogo(tournamentId: string, sponsorId: string, logoUrl: string): Promise<void> {
    await httpsCallable(backofficeFunctions(), 'saveNexagoPlanContractSponsor')({ action: 'logo', tournamentId, sponsorId, logoUrl });
  }

  async removeNexagoSponsor(tournamentId: string, sponsorId: string): Promise<void> {
    await httpsCallable(backofficeFunctions(), 'saveNexagoPlanContractSponsor')({ action: 'remove', tournamentId, sponsorId });
    try {
      await deleteObject(ref(backofficeStorage(), logoPath(tournamentId, sponsorId)));
    } catch {
      // Sem logo enviada (ou já apagada): o cadastro saiu, que é o que importa.
    }
  }
}
