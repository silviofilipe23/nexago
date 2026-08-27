import { getFirestore } from 'firebase/firestore';
import { app } from './firebase-app';

/**
 * SDK completo do Firestore — usado pelos Server Components, ou seja, só durante o `next build`.
 * O que roda no navegador do visitante usa o SDK lite (`firebase-lite.ts`).
 */
export { app };

export const db = getFirestore(app);
