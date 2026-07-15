import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';

let app: FirebaseApp | null = null;

/** Instância singleton do Firestore, reaproveitando o FirebaseApp já iniciado pelo AuthService
 *  (`auth/auth.service.ts`) — nunca chama `initializeApp` de novo se o app já existe. */
export function organizerFirestore(): Firestore {
  if (app == null) {
    app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  }
  return getFirestore(app);
}
