import { doc, onSnapshot, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import { mapFiscalConfig, type ArenaFiscalConfigView, type FiscalMode, type FiscalServiceView } from './fiscal.model';

/** Espelha `functions/src/fiscal/arena-fiscal-config.ts` (Task 7) — as três únicas
 *  Cloud Functions do módulo fiscal hoje, mais a leitura ao vivo do doc que elas gravam. */

export type FiscalRegimeTributario = 'simples_nacional' | 'lucro_presumido' | 'lucro_real' | 'mei';

export interface FiscalAddressInput {
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  /** Código IBGE de 7 dígitos. */
  codigoIbge: string;
}

export interface SaveArenaFiscalConfigInput {
  arenaId: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  inscricaoMunicipal: string;
  regimeTributario: FiscalRegimeTributario;
  enderecoFiscal: FiscalAddressInput;
  services: FiscalServiceView[];
  defaultServiceIdBooking?: string;
  defaultServiceIdClub?: string;
  /** Certificado A1 em base64. Passa em trânsito — a nexaGO não guarda o arquivo, só o emissor. */
  certificadoBase64?: string;
  senhaCertificado?: string;
  authorizationAccepted: boolean;
  authorizationTermVersion: string;
}

export interface MunicipalRequirementView {
  field: string;
  label: string;
  required: boolean;
  type: 'text' | 'password' | 'file';
}

/** Leitura ao vivo de `arenas/{arenaId}/fiscal/config` — reflete no mesmo instante o que as
 *  Cloud Functions gravam (inclusive o `status` avançando de `testing` para `active`). */
export function watchArenaFiscalConfig(
  db: Firestore,
  arenaId: string,
  onChange: (config: ArenaFiscalConfigView | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'arenas', arenaId, 'fiscal', 'config'),
    (snap) => onChange(mapFiscalConfig(snap.data() as Record<string, unknown> | undefined)),
    () => onChange(null),
  );
}

function mapFunctionsError(err: unknown, fallback: string): Error {
  const message = err instanceof Error && err.message ? err.message : fallback;
  return new Error(message);
}

export async function saveArenaFiscalConfig(functions: Functions, input: SaveArenaFiscalConfigInput): Promise<void> {
  const call = httpsCallable(functions, 'saveArenaFiscalConfig');
  try {
    await call(input);
  } catch (err) {
    throw mapFunctionsError(err, 'Não foi possível salvar os dados fiscais.');
  }
}

export async function setArenaFiscalMode(functions: Functions, arenaId: string, mode: FiscalMode): Promise<void> {
  const call = httpsCallable(functions, 'setArenaFiscalMode');
  try {
    await call({ arenaId, mode });
  } catch (err) {
    throw mapFunctionsError(err, 'Não foi possível alterar o modo de emissão.');
  }
}

export async function getArenaFiscalRequirements(functions: Functions, codigoIbge: string): Promise<MunicipalRequirementView[]> {
  const call = httpsCallable<{ codigoIbge: string }, { requirements: MunicipalRequirementView[] }>(
    functions,
    'getArenaFiscalRequirements',
  );
  try {
    const result = await call({ codigoIbge });
    return result.data.requirements ?? [];
  } catch (err) {
    throw mapFunctionsError(err, 'Não foi possível consultar as exigências do município.');
  }
}

export async function emitActivationTestInvoice(functions: Functions, arenaId: string): Promise<void> {
  const call = httpsCallable(functions, 'emitActivationTestInvoice');
  try {
    await call({ arenaId });
  } catch (err) {
    throw mapFunctionsError(err, 'Não foi possível emitir a nota de teste.');
  }
}

export async function retryFiscalInvoice(functions: Functions, arenaId: string, invoiceId: string): Promise<void> {
  const call = httpsCallable(functions, 'retryFiscalInvoice');
  try {
    await call({ arenaId, invoiceId });
  } catch (err) {
    throw mapFunctionsError(err, 'Não foi possível reemitir a nota.');
  }
}
