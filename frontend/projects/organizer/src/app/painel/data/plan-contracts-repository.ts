import { collection, doc, getDoc, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { organizerFirestore } from './firestore';
import { organizerFunctions } from './functions';
import {
  catalogFromRaw,
  contractFromRaw,
  planSponsorFromRaw,
  type PlanCatalog,
  type PlanContract,
  type PlanSponsor,
} from './plan-contracts';
import { organizerStorage } from './storage';

const CONTRACTS = 'tournamentPlanContracts';

export class PlanContractError extends Error {}

/** Callable que ainda não foi deployada chega como `not-found` com a mensagem crua do SDK —
 *  texto de infraestrutura que não pode ir pra tela. Mensagem do servidor é em português e
 *  nunca colide com o próprio código. */
export function planCallableMessage(err: unknown): string {
  const fallback = 'Não foi possível concluir agora. Tente de novo em instantes.';
  if (!(err instanceof Error) || !err.message) return fallback;
  const code = String((err as { code?: unknown }).code ?? '').replace(/^functions\//, '');
  const norm = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '');
  if (code && norm(err.message) === norm(code)) return fallback;
  return err.message;
}

async function call<T>(name: string, data: Record<string, unknown>): Promise<T> {
  try {
    const result = await httpsCallable<Record<string, unknown>, T>(organizerFunctions(), name)(data);
    return result.data;
  } catch (err) {
    throw new PlanContractError(planCallableMessage(err));
  }
}

/** Catálogo vigente (planos ativos + cotas à venda + comissão deste organizador). */
export async function loadPlanCatalog(): Promise<PlanCatalog> {
  return catalogFromRaw(await call<unknown>('getTournamentPlanCatalog', {}));
}

export function requestPlanContract(tournamentId: string, planId: string, expectedPriceCents: number): Promise<unknown> {
  return call('manageTournamentPlanContract', { action: 'request', tournamentId, planId, expectedPriceCents });
}

export function cancelPlanContract(tournamentId: string): Promise<unknown> {
  return call('manageTournamentPlanContract', { action: 'cancel', tournamentId });
}

/** Contratos do organizador. Ordenação em memória: são poucos e assim não pede índice. */
export function watchMyPlanContracts(
  uid: string,
  onChange: (list: PlanContract[]) => void,
  onError: (err: unknown) => void,
): Unsubscribe {
  const q = query(collection(organizerFirestore(), CONTRACTS), where('organizerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => contractFromRaw(d.id, d.data())).filter((c): c is PlanContract => c != null)),
    onError,
  );
}

/** O contrato do evento — `null` quando o evento não tem (a rule deixa ler o id vazio). */
export function watchPlanContract(
  tournamentId: string,
  onChange: (c: PlanContract | null) => void,
  onError: (err: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    doc(organizerFirestore(), CONTRACTS, tournamentId),
    (snap) => onChange(snap.exists() ? contractFromRaw(snap.id, snap.data()) : null),
    onError,
  );
}

export function watchPlanSponsors(
  tournamentId: string,
  onChange: (list: PlanSponsor[]) => void,
  onError: (err: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    collection(organizerFirestore(), CONTRACTS, tournamentId, 'sponsors'),
    (snap) => {
      const list = snap.docs.map((d) => planSponsorFromRaw(d.id, d.data())).filter((s): s is PlanSponsor => s != null);
      onChange(list.sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)));
    },
    onError,
  );
}

/** Id do patrocinador gerado antes do cadastro: o logo sobe primeiro, no caminho com este id. */
export function newPlanSponsorId(): string {
  return doc(collection(organizerFirestore(), CONTRACTS)).id;
}

function logoPath(tournamentId: string, sponsorId: string): string {
  return `tournaments/${tournamentId}/plan-sponsors/${sponsorId}`;
}

/** Sobe no `tournaments/{id}/**` (rule de Storage: dono do torneio grava) e devolve a URL que a
 *  callable confere — ela só aceita o arquivo deste patrocinador, neste caminho. */
export async function uploadPlanSponsorLogo(tournamentId: string, sponsorId: string, file: File): Promise<string> {
  const fileRef = ref(organizerStorage(), logoPath(tournamentId, sponsorId));
  try {
    await uploadBytes(fileRef, file, { contentType: file.type });
    return await getDownloadURL(fileRef);
  } catch {
    throw new PlanContractError('Não foi possível enviar a logo. Tente de novo.');
  }
}

export function addPlanSponsor(input: {
  tournamentId: string;
  sponsorId: string;
  name: string;
  tierId: string;
  logoUrl: string | null;
}): Promise<unknown> {
  return call('savePlanContractSponsor', { action: 'add', ...input });
}

export function setPlanSponsorLogo(tournamentId: string, sponsorId: string, logoUrl: string): Promise<unknown> {
  return call('savePlanContractSponsor', { action: 'logo', tournamentId, sponsorId, logoUrl });
}

export async function removePlanSponsor(tournamentId: string, sponsorId: string): Promise<void> {
  await call('savePlanContractSponsor', { action: 'remove', tournamentId, sponsorId });
  try {
    await deleteObject(ref(organizerStorage(), logoPath(tournamentId, sponsorId)));
  } catch {
    // Sem logo enviada (ou já apagada): o cadastro saiu, que é o que importa.
  }
}

/** `appConfig/tournamentPlans.enabled` — só acende o item do menu; a rota funciona sem ela. */
export async function loadPlansMenuFlag(): Promise<boolean> {
  try {
    const snap = await getDoc(doc(organizerFirestore(), 'appConfig', 'tournamentPlans'));
    return snap.exists() && snap.data()['enabled'] === true;
  } catch {
    return false;
  }
}
