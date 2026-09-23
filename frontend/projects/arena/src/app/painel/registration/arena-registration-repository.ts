import { deleteField, doc, getDoc, GeoPoint, setDoc, type Firestore } from 'firebase/firestore';
import { normalizeCpfCnpj } from '@nexago/br-documents';
import {
  composeArenaAddress,
  onlyDigits,
  validateArenaAddress,
  validateArenaCompany,
  type ArenaAddressParts,
  type ArenaCompanyRegistration,
} from './arena-registration.model';

/** Identidade da empresa mora em `arenas/{id}/registration/data` (leitura restrita ao dono/admin,
 *  escrita só do dono — ver firestore.rules). O endereço mora no doc público `arenas/{id}`,
 *  porque é o que o app, o site e o mini-site precisam mostrar. */

export interface ArenaCoords {
  latitude: number;
  longitude: number;
}

export interface ArenaAddressRead {
  parts: ArenaAddressParts;
  city: string;
  state: string;
  coords: ArenaCoords | null;
  /** `address` de arena cadastrada antes desta tela: texto livre, sem partes. Vira referência
   *  na tela para o gestor reescrever — sem isso ele perderia o endereço de vista ao migrar. */
  legacyAddress: string;
}

const EMPTY_PARTS: ArenaAddressParts = { cep: '', logradouro: '', numero: '', complemento: '', bairro: '' };

function readString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  return typeof value === 'string' ? value : '';
}

function readNumber(data: Record<string, unknown>, key: string): number | null {
  const value = data[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function arenaCompanyFromDoc(data: Record<string, unknown> | undefined): ArenaCompanyRegistration {
  if (!data) {
    return { cpfCnpj: '', razaoSocial: '', nomeFantasia: '', inscricaoMunicipal: '' };
  }
  return {
    cpfCnpj: readString(data, 'cpfCnpj'),
    razaoSocial: readString(data, 'razaoSocial'),
    nomeFantasia: readString(data, 'nomeFantasia'),
    inscricaoMunicipal: readString(data, 'inscricaoMunicipal'),
  };
}

export function arenaAddressFromDoc(data: Record<string, unknown>): ArenaAddressRead {
  const raw = data['addressParts'];
  const partsData = raw != null && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const storedAddress = readString(data, 'address');
  const city = readString(data, 'city');
  const state = readString(data, 'state');

  const candidate: ArenaAddressParts | null = partsData
    ? {
        cep: onlyDigits(readString(partsData, 'cep')),
        logradouro: readString(partsData, 'logradouro'),
        numero: readString(partsData, 'numero'),
        complemento: readString(partsData, 'complemento'),
        bairro: readString(partsData, 'bairro'),
      }
    : null;

  // `ArenaProfileEditService` (Flutter) grava `address` em texto livre e não conhece
  // `addressParts`. Quando a linha gravada não bate com as partes, quem escreveu por último
  // foi o app — usar as partes aqui mostraria o endereço velho e, ao salvar, desfaria a
  // edição feita lá. Nesse caso as partes viram nada e a linha vira referência.
  const partsAreCurrent =
    candidate != null && (!storedAddress || composeArenaAddress(candidate, city, state) === storedAddress);
  const parts = partsAreCurrent ? candidate! : { ...EMPTY_PARTS };

  const latitude = readNumber(data, 'latitude');
  const longitude = readNumber(data, 'longitude');

  return {
    parts,
    city,
    state,
    // Meia coordenada não posiciona nada — trata como ausente, igual ao serviço do Flutter.
    coords: latitude != null && longitude != null ? { latitude, longitude } : null,
    legacyAddress: partsAreCurrent ? '' : storedAddress,
  };
}

/** Campos do doc público. `address` segue sendo gravado — derivado das partes — porque app,
 *  site e mini-site leem essa linha; as partes é que passam a ser a fonte. */
export function buildArenaAddressUpdate(
  parts: ArenaAddressParts,
  city: string,
  state: string,
  coords: ArenaCoords | null,
): Record<string, unknown> {
  const normalized: ArenaAddressParts = {
    cep: onlyDigits(parts.cep),
    logradouro: parts.logradouro.trim(),
    numero: parts.numero.trim(),
    complemento: parts.complemento.trim(),
    bairro: parts.bairro.trim(),
  };
  const trimmedCity = city.trim();
  const trimmedState = state.trim().toUpperCase();

  return {
    addressParts: normalized,
    address: composeArenaAddress(normalized, trimmedCity, trimmedState),
    city: trimmedCity,
    state: trimmedState,
    // Endereço novo sem coordenada apaga a antiga: manter a de antes deixaria a arena
    // aparecendo no mapa num lugar em que ela não está mais.
    ...(coords
      ? { latitude: coords.latitude, longitude: coords.longitude, location: new GeoPoint(coords.latitude, coords.longitude) }
      : { latitude: deleteField(), longitude: deleteField(), location: deleteField() }),
  };
}

export function buildArenaCompanyUpdate(company: ArenaCompanyRegistration): Record<string, unknown> {
  return {
    cpfCnpj: normalizeCpfCnpj(company.cpfCnpj),
    razaoSocial: company.razaoSocial.trim(),
    nomeFantasia: company.nomeFantasia.trim(),
    inscricaoMunicipal: company.inscricaoMunicipal.trim(),
  };
}

export async function fetchArenaCompany(db: Firestore, arenaId: string): Promise<ArenaCompanyRegistration> {
  const snap = await getDoc(doc(db, 'arenas', arenaId, 'registration', 'data'));
  return arenaCompanyFromDoc(snap.exists() ? (snap.data() as Record<string, unknown>) : undefined);
}

export async function saveArenaCompany(db: Firestore, arenaId: string, company: ArenaCompanyRegistration): Promise<void> {
  const error = validateArenaCompany(company);
  if (error) {
    throw new Error(error);
  }
  await setDoc(doc(db, 'arenas', arenaId, 'registration', 'data'), buildArenaCompanyUpdate(company), { merge: true });
}

export async function saveArenaAddress(
  db: Firestore,
  arenaId: string,
  parts: ArenaAddressParts,
  city: string,
  state: string,
  coords: ArenaCoords | null,
): Promise<void> {
  const error = validateArenaAddress(parts, city, state);
  if (error) {
    throw new Error(error);
  }
  await setDoc(doc(db, 'arenas', arenaId), buildArenaAddressUpdate(parts, city, state, coords), { merge: true });
}
