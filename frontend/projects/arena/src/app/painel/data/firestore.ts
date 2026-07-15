import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';

let app: FirebaseApp | null = null;

/** Instância singleton do Firestore, reaproveitando o FirebaseApp já iniciado pelo AuthService. */
export function arenaFirestore(): Firestore {
  if (app == null) {
    app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  }
  return getFirestore(app);
}
