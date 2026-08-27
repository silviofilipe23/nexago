import { getFirestore } from 'firebase/firestore/lite';
import { app } from './firebase-app';

/**
 * SDK **lite** do Firestore — a variante feita sobre HTTP, sem a máquina de listeners em tempo
 * real, que o site não usa. É o que roda no navegador do visitante (ver `firestore/public-writes.ts`).
 *
 * Não importe `firebase/firestore` (completo) em código de cliente: ele arrasta o transporte
 * WebChannel inteiro para o bundle e pesa várias vezes mais.
 */
export const liteDb = getFirestore(app);
