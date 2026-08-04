import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { organizerFirestore } from './firestore';
import {
  DEFAULT_ORGANIZER_SETTINGS,
  parseOrganizerSettings,
  type OrganizerEventDefaults,
  type OrganizerPaymentSettings,
  type OrganizerProfile,
  type OrganizerSettings,
} from './organizer-settings.model';
import { organizerStorage } from './storage';

/** Leitura/escrita dos três mapas de configuração em `users/{uid}` — ver o cabeçalho de
 *  `organizer-settings.model.ts` para o porquê de morarem nesse doc.
 *
 *  Cada card salva o SEU mapa e só ele: o `merge` do Firestore é profundo em mapas, e o
 *  formulário sempre envia o mapa completo, então salvar Pagamentos nunca encosta em Perfil. */

export function watchOrganizerSettings(uid: string, cb: (s: OrganizerSettings) => void): () => void {
  const db = organizerFirestore();
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => cb(parseOrganizerSettings(snap.data() as Record<string, unknown> | undefined)),
    () => cb(DEFAULT_ORGANIZER_SETTINGS),
  );
}

/** Leitura pontual para o wizard. Nunca lança: configuração não pode impedir a criação de um
 *  torneio, então falha de rede cai nos defaults chumbados (que são os do wizard de hoje). */
export async function fetchOrganizerSettings(uid: string): Promise<OrganizerSettings> {
  try {
    const snap = await getDoc(doc(organizerFirestore(), 'users', uid));
    return parseOrganizerSettings(snap.data() as Record<string, unknown> | undefined);
  } catch {
    return DEFAULT_ORGANIZER_SETTINGS;
  }
}

export class OrganizerSettingsError extends Error {}

function wrapError(err: unknown): OrganizerSettingsError {
  const message = err instanceof Error && err.message ? err.message : 'Não foi possível salvar. Tente novamente.';
  return new OrganizerSettingsError(message);
}

/** `displayName` (o responsável) vai junto no mesmo write porque é campo de topo do doc, não do
 *  mapa — quem chama também precisa atualizar o Firebase Auth via `AuthService.updateDisplayName`,
 *  senão o nome no cabeçalho do painel fica dessincronizado. */
export async function saveOrganizerProfile(uid: string, profile: OrganizerProfile, displayName: string): Promise<void> {
  try {
    await setDoc(
      doc(organizerFirestore(), 'users', uid),
      { displayName: displayName.trim(), organizerProfile: profile },
      { merge: true },
    );
  } catch (err) {
    throw wrapError(err);
  }
}

export async function saveOrganizerPayments(uid: string, payments: OrganizerPaymentSettings): Promise<void> {
  try {
    await setDoc(doc(organizerFirestore(), 'users', uid), { organizerPayments: payments }, { merge: true });
  } catch (err) {
    throw wrapError(err);
  }
}

export async function saveOrganizerDefaults(uid: string, defaults: OrganizerEventDefaults): Promise<void> {
  try {
    await setDoc(doc(organizerFirestore(), 'users', uid), { organizerDefaults: defaults }, { merge: true });
  } catch (err) {
    throw wrapError(err);
  }
}

const MAX_LOGO_BYTES = 4 * 1024 * 1024;

/** `null` = arquivo aceito. */
export function validateLogoFile(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'Escolha um arquivo de imagem.';
  if (file.size > MAX_LOGO_BYTES) return 'Imagem muito grande (máximo 4 MB).';
  return null;
}

/** Storage `profiles/{uid}/organizer-logo.jpg`. A rule `profiles/{userId}/{fileName}` já libera o
 *  dono, então — diferente da capa de torneio, cuja rule consulta o doc no Firestore — o upload
 *  pode rodar antes de qualquer gravação. */
export async function uploadOrganizerLogo(uid: string, file: Blob): Promise<string> {
  const logoRef = ref(organizerStorage(), `profiles/${uid}/organizer-logo.jpg`);
  await uploadBytes(logoRef, file, { contentType: file.type || 'image/jpeg' });
  return getDownloadURL(logoRef);
}
