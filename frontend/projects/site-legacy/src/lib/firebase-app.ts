import { initializeApp, getApps, getApp } from 'firebase/app';
import { firebaseConfig } from './firebase-config';

/**
 * Instância única do Firebase, sem nenhum produto acoplado.
 *
 * Fica separada de `firebase.ts` porque aquele módulo chama `getFirestore` do SDK completo:
 * quem só precisa do app (ex.: `track-link-event.ts`, que usa Functions) importaria o
 * Firestore inteiro junto — ~114 KB gzip de transporte WebChannel no bundle do cliente.
 */
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
