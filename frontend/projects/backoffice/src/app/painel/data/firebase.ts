import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { environment } from '../../../environments/environment';

/** Reaproveita o FirebaseApp já iniciado pelo AuthService (mesmo padrão dos outros portais). */
function backofficeApp(): FirebaseApp {
  return getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
}

export function backofficeFunctions(): Functions {
  return getFunctions(backofficeApp());
}

export function backofficeDb(): Firestore {
  return getFirestore(backofficeApp());
}
