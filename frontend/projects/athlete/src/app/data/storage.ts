import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { environment } from '../../environments/environment';

let app: FirebaseApp | null = null;

/** Storage singleton, reaproveitando o FirebaseApp do AuthService quando já existir. */
export function athleteStorage(): FirebaseStorage {
  if (app == null) {
    app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  }
  return getStorage(app);
}
