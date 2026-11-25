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
    if (isAllowedAvatarFile(file) != null) return null;
    // Conta Google sem foto devolve a inicial num fundo liso: não identifica
    // ninguém, então o passo segue pedindo uma foto de verdade.
    return (await isGenericAccountAvatar(blob)) ? null : file;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Quem não pôs foto na conta Google recebe um avatar gerado: a inicial em
 * branco sobre um fundo de cor só. A URL é igual à de uma foto de verdade, então
 * só a imagem denuncia. Pré-preenchido no onboarding, ele cumpria a foto
 * obrigatória sem identificar ninguém.
 *
 * Regra: um fundo liso cobre quase tudo, e todo pixel está na mistura entre
 * esse fundo e o branco (a letra e a borda suavizada dela). Foto nenhuma tem
 * isso; um logo de duas cores não tem fundo tão dominante; uma imagem lisa
 * também cai aqui, e tudo bem: ela também não identifica ninguém.
 *
 * Espelho de `generic_account_avatar.dart` do app (mesmos limites).
 */
export const GENERIC_AVATAR_SAMPLE_SIDE = 64;
export const GENERIC_AVATAR_MIN_BACKGROUND_SHARE = 0.8;
export const GENERIC_AVATAR_MIN_BLEND_SHARE = 0.99;
/** Quanto um canal pode se afastar do fundo e ainda contar como fundo (ruído de JPEG). */
const BACKGROUND_TOLERANCE = 8;
/** Quanto um canal pode se afastar da linha fundo→branco. */
const BLEND_TOLERANCE = 16;

/**
 * `true` quando a imagem é o avatar genérico de inicial. O que não decodifica
 * devolve `false`: na dúvida, não se descarta a foto.
 */
export async function isGenericAccountAvatar(blob: Blob): Promise<boolean> {
  try {
    const bitmap = await createImageBitmap(blob);
    const side = GENERIC_AVATAR_SAMPLE_SIDE;
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(bitmap, 0, 0, side, side);
    bitmap.close();
    return isMonogramPixels(ctx.getImageData(0, 0, side, side).data);
  } catch {
    return false;
  }
}

/** O núcleo da regra, sobre pixels RGBA já reduzidos. */
export function isMonogramPixels(rgba: ArrayLike<number>): boolean {
  const total = Math.floor(rgba.length / 4);
  if (total === 0) return false;
  const background = mostCommonColor(rgba, total);
  let onBackground = 0;
  let onBlend = 0;
  for (let i = 0; i < total; i++) {
    const pixel: Rgb = [rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!];
    if (maxChannelGap(pixel, background) <= BACKGROUND_TOLERANCE) onBackground++;
    if (distanceToBlend(pixel, background) <= BLEND_TOLERANCE) onBlend++;
  }
  return (
    onBackground / total >= GENERIC_AVATAR_MIN_BACKGROUND_SHARE &&
    onBlend / total >= GENERIC_AVATAR_MIN_BLEND_SHARE
  );
}

type Rgb = readonly [number, number, number];

function mostCommonColor(rgba: ArrayLike<number>, total: number): Rgb {
  const counts = new Map<number, number>();
  let best = 0;
  let bestCount = 0;
  for (let i = 0; i < total; i++) {
    const key = (rgba[i * 4]! << 16) | (rgba[i * 4 + 1]! << 8) | rgba[i * 4 + 2]!;
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return [(best >> 16) & 0xff, (best >> 8) & 0xff, best & 0xff];
}

function maxChannelGap(a: Rgb, b: Rgb): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

/** Maior desvio por canal entre o pixel e o ponto mais próximo do segmento fundo→branco. */
function distanceToBlend(pixel: Rgb, background: Rgb): number {
  const d: Rgb = [255 - background[0], 255 - background[1], 255 - background[2]];
  const length = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const t =
    length === 0
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            ((pixel[0] - background[0]) * d[0] +
              (pixel[1] - background[1]) * d[1] +
              (pixel[2] - background[2]) * d[2]) /
              length,
          ),
        );
  return Math.max(
    Math.abs(pixel[0] - (background[0] + t * d[0])),
    Math.abs(pixel[1] - (background[1] + t * d[1])),
    Math.abs(pixel[2] - (background[2] + t * d[2])),
  );
}
