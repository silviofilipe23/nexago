import type { FirebaseOptions } from 'firebase/app';

/**
 * Config de cliente do Firebase (projeto volley-track-dev-4596c).
 * Espelha frontend/shared/firebase/firebase.config.ts. Chaves de cliente não são
 * secretas; a segurança vive nas firestore.rules. O site faz apenas leitura pública.
 *
 * Mora num módulo próprio para que `firebase.ts` (SDK completo, usado no build) e
 * `firebase-lite.ts` (SDK lite, usado no navegador) compartilhem a config sem que um
 * import transitivo arraste o SDK completo para o bundle do cliente.
 */
export const firebaseConfig: FirebaseOptions = {
  apiKey: 'AIzaSyCLRzJdSwFEq8c5M57zxrQPLPxgkomxbjk',
  authDomain: 'volley-track-dev-4596c.firebaseapp.com',
  projectId: 'volley-track-dev-4596c',
  storageBucket: 'volley-track-dev-4596c.firebasestorage.app',
  messagingSenderId: '735357850346',
  appId: '1:735357850346:web:ec87a9f780091e0564bd93',
  measurementId: 'G-DN6EKLYG54',
};
