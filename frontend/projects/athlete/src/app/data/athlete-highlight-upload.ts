import { deleteObject, getDownloadURL, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';

/**
 * Fotos de destaque do perfil — paridade com o app mobile
 * (`maxHighlightPhotos` em athlete_profile.dart e
 * `ProfileImageCropTarget.highlight` em profile_image_crop_config.dart).
 * Mudar qualquer um destes números aqui sem mudar lá desalinha as duas UIs.
 */
export const MAX_HIGHLIGHT_PHOTOS = 6;
export const HIGHLIGHT_ASPECT_RATIO = 1;
export const HIGHLIGHT_MAX_OUTPUT_WIDTH = 1600;

/** Mesma qualidade do `encodeJpg(quality: 88)` do app. */
export const HIGHLIGHT_JPEG_QUALITY = 0.88;

/**
 * Id do arquivo dentro de `profiles/{uid}/highlights/`. Timestamp + índice
 * reproduz o esquema do app (`microsecondsSinceEpoch_index`) e evita colisão
 * quando o atleta sobe duas fotos no mesmo milissegundo.
 */
export function buildHighlightPhotoId(index: number, now = Date.now()): string {
  return `${now}_${index}`;
}

/** Upload em `profiles/{uid}/highlights/{photoId}.jpg` (storage.rules) e retorna a URL pública. */
export async function uploadAthleteHighlightPhoto(
  storage: FirebaseStorage,
  uid: string,
  photoId: string,
  bytes: Blob,
  contentType = 'image/jpeg',
): Promise<string> {
  const fileRef = ref(storage, `profiles/${uid}/highlights/${photoId}.jpg`);
  await uploadBytes(fileRef, bytes, { contentType });
  return getDownloadURL(fileRef);
}

/**
 * Apaga o arquivo do Storage a partir da URL de download. É best-effort de
 * propósito: o que tira a foto do perfil é a URL sair de `highlightPhotoUrls`,
 * então falhar aqui (URL de outro bucket, arquivo já removido) não pode
 * derrubar a remoção — no pior caso sobra um órfão no Storage.
 */
export async function deleteAthleteHighlightPhoto(storage: FirebaseStorage, url: string): Promise<void> {
  try {
    await deleteObject(ref(storage, url));
  } catch {
    // órfão no Storage é aceitável; a foto já saiu do perfil.
  }
}
