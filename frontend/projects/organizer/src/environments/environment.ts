import { firebaseConfig } from '@nexago/firebase-config';

export const environment = {
  production: false,
  firebase: firebaseConfig,
  /** Host onde a página pública de links é servida (site Next.js). */
  publicSiteUrl: 'https://site-3fbe8.web.app',
  /** Host do portal do atleta — destino do link de inscrição compartilhado. */
  athleteAppUrl: 'https://athlete-dev2.web.app',
};
