export const MAX_PHOTOS = 10;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MIN_PHOTO_SIDE = 1200;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface PhotoItem {
  id: string;
  url: string;
  path: string;
  colorValueId: string | null;
  /** 0–100 enquanto sobe; `null` quando já está no servidor. */
  progress: number | null;
  error: string | null;
}

/** Erro de arquivo antes de gastar upload. Dimensão é conferida à parte (precisa decodificar a imagem). */
export function fileError(file: { type: string; size: number }, currentCount: number): string | null {
  if (currentCount >= MAX_PHOTOS) {
    return `Máximo de ${MAX_PHOTOS} fotos.`;
  }
  if (!PHOTO_TYPES.includes(file.type)) {
    return 'Use JPG, PNG ou WebP.';
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return 'A foto passa de 10 MB.';
  }
  return null;
}

export function dimensionError(width: number, height: number): string | null {
  return width < MIN_PHOTO_SIDE || height < MIN_PHOTO_SIDE
    ? `Mínimo de ${MIN_PHOTO_SIDE}×${MIN_PHOTO_SIDE} px (esta tem ${width}×${height}).`
    : null;
}

/** Arrastar `from` para a posição `to`. Índice fora da lista não muda nada. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** O que vai para o servidor: só o que já subiu. */
export function persistable(items: PhotoItem[]) {
  return items
    .filter((p) => p.progress === null && p.error === null)
    .map(({ id, url, path, colorValueId }) => ({ id, url, path, colorValueId }));
}

/** Galeria para uma cor: as fotos ligadas a ela vêm primeiro; a ordem relativa se mantém. */
export function galleryForColor<T extends { colorValueId: string | null }>(items: T[], colorId: string): T[] {
  return [...items.filter((p) => p.colorValueId === colorId), ...items.filter((p) => p.colorValueId !== colorId)];
}
