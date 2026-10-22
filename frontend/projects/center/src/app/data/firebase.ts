import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';

/** App Firebase único do portal (mesmo config DEV de todos os portais). */
export function firebaseApp(): FirebaseApp {
  return getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
}

export function db(): Firestore {
  return getFirestore(firebaseApp());
}

export function auth(): Auth {
  return getAuth(firebaseApp());
}

export const CENTERS = 'trainingCenters';
