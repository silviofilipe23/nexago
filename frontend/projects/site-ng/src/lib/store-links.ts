/** Links oficiais das lojas do app nexaGO. */
export const APP_STORE_URL = 'https://apps.apple.com/br/app/nexago/id6775555738';

/** Preencha quando o app estiver publicado no Google Play. */
export const GOOGLE_PLAY_URL = '#';

export const GOOGLE_PLAY_COMING_SOON = 'Em breve no Google Play';

export function isGooglePlayAvailable(): boolean {
  return Boolean(GOOGLE_PLAY_URL && GOOGLE_PLAY_URL !== '#');
}
