import { IMAGE_LOADER, type ImageLoaderConfig } from '@angular/common';
import type { Provider } from '@angular/core';

/**
 * Fotos e pôsteres da home ficam em `public/img/home/{nome}-{largura}.webp`. O loader monta esse
 * endereço a partir do nome curto (`ngSrc="ecossistema"`) e da largura que o `ngSrcset` pedir; sem
 * largura (o `src` de reserva) usa `loaderParams.fallback`.
 *
 * Entra no `providers` da página, não no app: as outras rotas usam `<img>` com endereço completo
 * (capas e logos vindos do Firestore) e não podem passar por aqui.
 */
export function homeImageLoader(config: ImageLoaderConfig): string {
  const fallback = config.loaderParams?.['fallback'] as number | undefined;
  return `img/home/${config.src}-${config.width ?? fallback ?? 1280}.webp`;
}

export const HOME_IMAGE_LOADER: Provider = { provide: IMAGE_LOADER, useValue: homeImageLoader };
