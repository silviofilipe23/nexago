import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { organizerStorage } from './storage';

/** Storage `tournaments/{id}/cabine/{personId}.jpg` — coberto pela rule genérica de
 *  `tournaments/{tournamentId}/**` (gestor do torneio ou admin). A URL de download leva token, então
 *  o overlay público (sem login) consegue exibir. Recebe o JPEG já redimensionado. */
export async function uploadCabinePhoto(tournamentId: string, personId: string, jpeg: Blob): Promise<string> {
  const photoRef = ref(organizerStorage(), `tournaments/${tournamentId}/cabine/${personId}.jpg`);
  await uploadBytes(photoRef, jpeg, { contentType: 'image/jpeg' });
  return getDownloadURL(photoRef);
}
