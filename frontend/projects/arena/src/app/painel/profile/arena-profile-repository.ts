import { amenitiesFromFirestore, ARENA_AMENITIES_EMPTY } from '@nexago/arena-discovery';
import { deleteField, doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { validateArenaBasicInfo, validateArenaContacts, type ArenaProfile } from '../data/arena-profile.model';

/** Espelha `ArenaProfileEditService` (Flutter) — mesmo doc `arenas/{arenaId}`, mesmos campos.
 *  Client pode escrever esses campos direto (firestore.rules só congela
 *  planTier/planStatus/planActiveUntil). Dividido em duas gravações (básico / contatos) porque
 *  o painel arena divide o que no Flutter é um formulário único em duas telas — cada `setDoc`
 *  usa `merge:true` e só toca nos campos que a tela realmente edita. */

function readString(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  return typeof v === 'string' ? v : '';
}

function readStringArray(data: Record<string, unknown>, key: string): string[] {
  const v = data[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

export async function fetchArenaProfile(db: Firestore, arenaId: string): Promise<ArenaProfile | null> {
  const snap = await getDoc(doc(db, 'arenas', arenaId));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;

  return {
    name: readString(data, 'name'),
    description: readString(data, 'description'),
    phone: readString(data, 'phone'),
    whatsapp: readString(data, 'whatsapp'),
    address: readString(data, 'address'),
    city: readString(data, 'city'),
    state: readString(data, 'state'),
    coverUrl: readString(data, 'coverUrl'),
    logoUrl: readString(data, 'logoUrl'),
    courtTypes: readStringArray(data, 'courtTypes'),
    surfaces: readStringArray(data, 'surfaces'),
    amenities: data['amenities'] != null ? amenitiesFromFirestore(data['amenities']) : ARENA_AMENITIES_EMPTY,
    onlinePaymentEnabled: data['onlinePaymentEnabled'] !== false,
    onsitePaymentEnabled: data['onsitePaymentEnabled'] !== false,
    ratingAverage: typeof data['ratingAverage'] === 'number' ? data['ratingAverage'] : 0,
    reviewsCount: typeof data['reviewsCount'] === 'number' ? data['reviewsCount'] : 0,
  };
}

export type ArenaBasicInfoInput = Pick<
  ArenaProfile,
  'name' | 'description' | 'coverUrl' | 'logoUrl' | 'courtTypes' | 'surfaces' | 'amenities' | 'onlinePaymentEnabled' | 'onsitePaymentEnabled'
>;

/** Salva nome/descrição/modalidades/superfícies/comodidades/pagamento/capa/logo (tela Perfil). */
export async function saveArenaBasicInfo(db: Firestore, arenaId: string, input: ArenaBasicInfoInput): Promise<void> {
  const error = validateArenaBasicInfo(input);
  if (error) {
    throw new Error(error);
  }

  const uniqueTypes = [...new Set(input.courtTypes.map((t) => t.trim()).filter(Boolean))];
  const uniqueSurfaces = [...new Set(input.surfaces.map((t) => t.trim()).filter(Boolean))];

  await setDoc(
    doc(db, 'arenas', arenaId),
    {
      name: input.name.trim(),
      description: input.description.trim(),
      coverUrl: input.coverUrl.trim() || deleteField(),
      logoUrl: input.logoUrl.trim() || deleteField(),
      courtTypes: uniqueTypes,
      surfaces: uniqueSurfaces,
      amenities: input.amenities,
      onlinePaymentEnabled: input.onlinePaymentEnabled,
      onsitePaymentEnabled: input.onsitePaymentEnabled,
    },
    { merge: true },
  );
}

export type ArenaContactsInput = Pick<ArenaProfile, 'phone' | 'whatsapp' | 'address' | 'city' | 'state'>;

/** Salva telefone/whatsapp/endereço/cidade/estado (tela Contatos). */
export async function saveArenaContacts(db: Firestore, arenaId: string, input: ArenaContactsInput): Promise<void> {
  const error = validateArenaContacts(input);
  if (error) {
    throw new Error(error);
  }

  const wa = input.whatsapp.trim();
  await setDoc(
    doc(db, 'arenas', arenaId),
    {
      phone: input.phone.trim(),
      whatsapp: wa || deleteField(),
      address: input.address.trim(),
      city: input.city.trim(),
      state: input.state.trim().toUpperCase(),
    },
    { merge: true },
  );
}
