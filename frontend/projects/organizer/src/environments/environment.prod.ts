import { firebaseConfig } from '@nexago/firebase-config';

export const environment = {
  production: true,
  firebase: firebaseConfig,
  /** Host onde a página pública de links é servida (site Next.js). */
  publicSiteUrl: 'https://nexago.com.br',
  /** Host do portal do atleta — destino do link de inscrição compartilhado. Mesmo host que o
   *  CTA "Inscreva-se" do site já usa (`site/src/app/torneios/[id]/page.tsx`). */
  athleteAppUrl: 'https://atleta.nexago.com.br',
};
