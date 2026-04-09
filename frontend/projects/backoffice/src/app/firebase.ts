import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

import { firebaseConfig } from './firebase.config';

/** Single Firebase app instance for the whole Angular app. */
export const firebaseApp = initializeApp(firebaseConfig);

/** Google Analytics (GA4) — only meaningful in the browser. */
export const firebaseAnalytics = getAnalytics(firebaseApp);

/** Firebase Authentication (email/senha e outros provedores). */
export const firebaseAuth = getAuth(firebaseApp);

/** Firestore database (default), aligned with `firebase.json` / `firestore.rules`. */
export const firestore = getFirestore(firebaseApp);

/** Cloud Functions (callable HTTPS v2 — mesma região do deploy padrão). */
export const firebaseFunctions = getFunctions(firebaseApp, 'us-central1');
