import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { environment } from '../../../environments/environment';

let app: FirebaseApp | null = null;

/** Instância singleton do Storage, reaproveitando o FirebaseApp já iniciado pelo AuthService
 *  (`auth/auth.service.ts`) — nunca chama `initializeApp` de novo se o app já existe. */
export function organizerStorage(): FirebaseStorage {
  if (app == null) {
    app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  }
  return getStorage(app);
}
