import { ATHLETE_AVATAR_MAX_BYTES, isAllowedAvatarFile } from './athlete-avatar-upload';

/**
 * Foto da conta (login com Google) como ponto de partida da foto de perfil no
 * onboarding — espelho de `account_photo_fetcher.dart` do app. Quem entra com
 * Google já tem foto, e exigir outra era o motivo mais comum de cadastro parado
 * no último passo. O atleta pode trocar; o envio pro Storage é o mesmo de uma
 * foto escolhida.
 */

export const ACCOUNT_PHOTO_FETCH_TIMEOUT_MS = 8000;

/** Lado da foto pedida ao Google (a URL do login vem com 96 px). */
export const ACCOUNT_PHOTO_SIZE = 512;

/** URL pronta para baixar, ou `null`. A do Google é pedida em 512 px. */
export function accountPhotoUrl(photoURL: string | null | undefined): string | null {
  const raw = (photoURL ?? '').trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (!url.hostname.endsWith('googleusercontent.com')) return raw;
  return raw.replace(/=s\d+(-c)?$/, `=s${ACCOUNT_PHOTO_SIZE}-c`);
}

/**
 * Baixa a foto e devolve um `File` que passa em `isAllowedAvatarFile`, ou `null`
 * em qualquer falha (rede, prazo, tipo, tamanho): o passo continua pedindo a
 * foto como sempre pediu.
 */
export async function fetchAccountPhotoFile(
  url: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = ACCOUNT_PHOTO_FETCH_TIMEOUT_MS,
): Promise<File | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal, credentials: 'omit' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size === 0 || blob.size > ATHLETE_AVATAR_MAX_BYTES) return null;
    const type = blob.type.split(';')[0]!.trim().toLowerCase();
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
    const file = new File([blob], `foto-da-conta.${ext}`, { type });
    return isAllowedAvatarFile(file) == null ? file : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
