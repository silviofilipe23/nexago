import { getApps, getApp, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@nexago/firebase-config';

/**
 * Instância única do Firebase, sem nenhum produto acoplado. Config compartilhada com o resto
 * do workspace via `@nexago/firebase-config` (mesmo projeto usado pelo site Next.js legado).
 */
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
