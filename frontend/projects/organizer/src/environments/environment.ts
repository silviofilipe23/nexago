import { firebaseConfig } from '@nexago/firebase-config';

export const environment = {
  production: false,
  firebase: firebaseConfig,
  /** Host onde a página pública de links é servida (site Next.js). */
  publicSiteUrl: 'https://nexago.com.br',
  /** Host do portal do atleta — destino do link de inscrição compartilhado. */
  athleteAppUrl: 'https://atleta.nexago.com.br',
};
