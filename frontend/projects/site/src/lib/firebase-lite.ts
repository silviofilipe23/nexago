import { getFirestore } from 'firebase/firestore/lite';
import { app } from './firebase-app';

/**
 * SDK **lite** do Firestore — variante sobre HTTP, sem a máquina de listeners em tempo real
 * (o site público não precisa). Mantém o bundle do navegador pequeno: não importe
 * `firebase/firestore` (completo) em código deste app — ele arrasta o transporte WebChannel
 * inteiro (~114 KB gzip a mais). Ver [[site-client-bundle-firestore-lite]].
 */
export const liteDb = getFirestore(app);
