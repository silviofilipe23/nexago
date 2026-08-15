import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import type { LiveScoringContext } from '@nexago/live-scoring';
import { environment } from '../../environments/environment';

/** Firestore do portal, reaproveitando o FirebaseApp já iniciado pelo `AuthService` — mesmo par
 *  de `athleteFunctions()` (`functions.ts`). Devolve `null` quando não há config (mesma guarda
 *  que as telas já faziam localmente), pra a tela mostrar estado vazio em vez de estourar. */
export function athleteFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

export function athleteProjectId(): string {
  return environment.firebase.projectId ?? '';
}

/** Contexto da mesa ao vivo compartilhada (`@nexago/live-scoring`) — o mesário faz daqui as
 *  MESMAS escritas que o organizador faz do portal dele. */
export function athleteLiveScoringContext(): LiveScoringContext | null {
  const db = athleteFirestore();
  const projectId = athleteProjectId();
  return db && projectId ? { db, projectId } : null;
}
