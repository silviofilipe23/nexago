import { getDownloadURL, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';

/** Limite anunciado na UI do onboarding (arquivo escolhido). */
export const ATHLETE_AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function isAllowedAvatarFile(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) {
    return 'Use JPG, PNG ou WebP.';
  }
  if (file.size > ATHLETE_AVATAR_MAX_BYTES) {
    return 'A foto deve ter no máximo 2 MB.';
  }
  return null;
}

/**
 * Redimensiona para no máx. 1024px (lado maior) e exporta JPEG —
 * mesmo teto do app (`ProfileImageCropTarget.avatar.maxOutputWidth`).
 */
export async function prepareAvatarJpeg(file: File, maxSide = 1024): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!blob) throw new Error('toBlob');
    return blob;
  } finally {
    bitmap.close();
  }
}

/** Upload em `profiles/{uid}/avatar.jpg` (storage.rules) e retorna a URL pública. */
export async function uploadAthleteAvatar(
  storage: FirebaseStorage,
  uid: string,
  bytes: Blob,
  contentType = 'image/jpeg',
): Promise<string> {
  const fileRef = ref(storage, `profiles/${uid}/avatar.jpg`);
  await uploadBytes(fileRef, bytes, { contentType });
  return getDownloadURL(fileRef);
}

/** Upload em `profiles/{uid}/cover.jpg` (mesma regra de storage.rules do avatar) e retorna a URL pública. */
export async function uploadAthleteCoverPhoto(
  storage: FirebaseStorage,
  uid: string,
  bytes: Blob,
  contentType = 'image/jpeg',
): Promise<string> {
  const fileRef = ref(storage, `profiles/${uid}/cover.jpg`);
  await uploadBytes(fileRef, bytes, { contentType });
  return getDownloadURL(fileRef);
}
