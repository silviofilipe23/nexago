import { firebaseConfig } from '@nexago/firebase-config';

export const environment = {
  production: false,
  firebase: firebaseConfig,
  /** Host onde a página pública de links é servida (site Next.js). */
  publicSiteUrl: 'https://nexago.com.br',
  /** Portal do atleta (mesmo valor do organizador): a página da arena lá tem o "Você é professor?". */
  athleteAppUrl: 'https://atleta.nexago.com.br',
};
