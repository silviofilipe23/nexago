import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getFunctions, type Functions } from 'firebase/functions';
import { environment } from '../../../environments/environment';

let app: FirebaseApp | null = null;

/** Instância singleton do Cloud Functions client, reaproveitando o FirebaseApp já iniciado. */
export function arenaFunctions(): Functions {
  if (app == null) {
    app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  }
  return getFunctions(app);
}
