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

/** Região das Cloud Functions.
 *
 *  O Firestore vive em `southamerica-east1`; sem este argumento o SDK chama Iowa e cada
 *  operação atravessa o continente duas vezes. Este projeto é um Next.js à parte e não enxerga
 *  o `@nexago/firebase-config` do workspace Angular, então a constante mora aqui — se o valor
 *  mudar lá, muda aqui junto. */
export const FUNCTIONS_REGION = 'southamerica-east1';
