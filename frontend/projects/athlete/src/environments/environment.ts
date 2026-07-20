import { firebaseConfig } from '@nexago/firebase-config';

export const environment = {
  production: false,
  devAuthBypass: true,
  firebase: firebaseConfig,
  trustedReturnOrigins: [] as string[],
  /** Maps Embed API key (Google Cloud Console) — vazio = usa o embed do OpenStreetMap. */
  googleMapsApiKey: '',
};
