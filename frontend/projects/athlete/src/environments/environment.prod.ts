import { firebaseConfig } from '@nexago/firebase-config';

export const environment = {
  production: true,
  devAuthBypass: false,
  firebase: firebaseConfig,
  trustedReturnOrigins: [] as string[],
  /** Maps Embed API key (Google Cloud Console) — vazio = usa o embed do OpenStreetMap. */
  googleMapsApiKey: 'AIzaSyDUup-s3jzwnsJIsRRXllel8Q3cnMe1do0',
};
