import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { environment } from '../../../environments/environment';
import { FUNCTIONS_REGION } from '@nexago/firebase-config';

/** Reaproveita o FirebaseApp já iniciado pelo AuthService (mesmo padrão dos outros portais). */
function backofficeApp(): FirebaseApp {
  return getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
}

export function backofficeFunctions(): Functions {
  return getFunctions(backofficeApp(), FUNCTIONS_REGION);
}

export function backofficeDb(): Firestore {
  return getFirestore(backofficeApp());
}
