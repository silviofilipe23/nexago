import { amenitiesFromFirestore, ARENA_AMENITIES_EMPTY, courtTypeCodesFor } from '@nexago/arena-discovery';
import { deleteField, doc, setDoc, type Firestore } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { arenaImagePath } from '../data/arena-image-path';
import { validateArenaBasicInfo, validateArenaContacts, type ArenaProfile } from '../data/arena-profile.model';
import { PICKED_IMAGE_MAX_BYTES, shrinkImageFile, type ImageTarget } from '../data/image-shrink';

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

/** Perfil a partir do doc `arenas/{arenaId}` já em memória — as telas leem o doc do
 *  `ArenaContextService`, que o mantém ao vivo, em vez de refazer a mesma leitura. */
export function arenaProfileFromDoc(data: Record<string, unknown>): ArenaProfile {
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
    // Rótulo legado vira código — é o que o perfil grava (multiesporte fase 5b).
    courtTypes: courtTypeCodesFor(readStringArray(data, 'courtTypes')),
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

  // Esporte em CÓDIGO do catálogo (multiesporte 5b); fora do catálogo segue cru.
  const uniqueTypes = courtTypeCodesFor(input.courtTypes);
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

export type ArenaImageKind = 'cover' | 'logo';

/** Tipos que o storage.rules aceita do gestor da equipe na capa/logo (`arenas/{id}/{cover|logo}`). */
const ARENA_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Valida a imagem ESCOLHIDA: JPG, PNG ou WebP de até 25 MB. Ela é reduzida no navegador antes
 *  de subir (`shrinkImageFile`), e o teto de 5 MB do storage.rules vale para o arquivo reduzido. */
export function validateArenaImageFile(file: File): string | null {
  if (!ARENA_IMAGE_TYPES.includes(file.type)) {
    return 'Selecione um arquivo de imagem (JPG, PNG ou WebP).';
  }
  if (file.size >= PICKED_IMAGE_MAX_BYTES) {
    return 'Imagem muito grande — o limite é 25 MB.';
  }
  return null;
}

/** Valida, reduz e sobe a imagem; devolve a download URL. Todos os uploads de imagem do painel
 *  passam por aqui, então nenhum manda a foto crua da câmera pro Storage. */
export async function uploadArenaImageFile(storage: FirebaseStorage, path: string, file: File, target: ImageTarget): Promise<string> {
  const error = validateArenaImageFile(file);
  if (error) {
    throw new Error(error);
  }
  const blob = await shrinkImageFile(file, target);
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, blob, { contentType: blob.type || file.type });
  return getDownloadURL(fileRef);
}

/** Sobe a capa/logo para `arenas/{arenaId}/{cover|logo}-{ms}` (storage.rules libera escrita para
 *  o dono da arena e para o gestor ativo com plano em dia) e retorna a download URL. Nome novo a
 *  cada envio (`arenaImagePath`): o upload acontece ao ESCOLHER a imagem, mas a URL só vai pro
 *  Firestore no "Salvar" (`saveArenaBasicInfo`). Sobrescrever o arquivo trocaria o token e
 *  quebraria a capa publicada de quem escolhe outra e sai sem salvar. O arquivo anterior fica no
 *  Storage: o espelho da equipe e o mini-site publicado guardam cópias da URL. */
export async function uploadArenaImage(storage: FirebaseStorage, arenaId: string, kind: ArenaImageKind, file: File): Promise<string> {
  return uploadArenaImageFile(storage, arenaImagePath(arenaId, kind), file, kind === 'logo' ? 'logo' : 'wide');
}

export type ArenaContactsInput = Pick<ArenaProfile, 'phone' | 'whatsapp'>;

/** Campos da tela Contatos. Endereço, cidade e UF ficaram de fora de propósito: quem manda
 *  neles é a tela "Dados cadastrais", e um `address: ''` vindo daqui apagaria o endereço
 *  estruturado — o `merge` só protege o que a gravação não menciona. */
export function buildArenaContactsUpdate(input: ArenaContactsInput): Record<string, unknown> {
  const wa = input.whatsapp.trim();
  return {
    phone: input.phone.trim(),
    whatsapp: wa || deleteField(),
  };
}

/** Salva telefone e WhatsApp (tela Contatos). */
export async function saveArenaContacts(db: Firestore, arenaId: string, input: ArenaContactsInput): Promise<void> {
  const error = validateArenaContacts(input);
  if (error) {
    throw new Error(error);
  }
  await setDoc(doc(db, 'arenas', arenaId), buildArenaContactsUpdate(input), { merge: true });
}
