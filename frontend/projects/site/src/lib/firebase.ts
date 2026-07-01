import { initializeApp, getApps, getApp, type FirebaseOptions } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

/**
 * Config de cliente do Firebase (projeto volley-track-dev-4596c).
 * Espelha frontend/shared/firebase/firebase.config.ts. Chaves de cliente não são
 * secretas; a segurança vive nas firestore.rules. O site faz apenas leitura pública.
 */
const firebaseConfig: FirebaseOptions = {
  apiKey: 'AIzaSyCLRzJdSwFEq8c5M57zxrQPLPxgkomxbjk',
  authDomain: 'volley-track-dev-4596c.firebaseapp.com',
  projectId: 'volley-track-dev-4596c',
  storageBucket: 'volley-track-dev-4596c.firebasestorage.app',
  messagingSenderId: '735357850346',
  appId: '1:735357850346:web:ec87a9f780091e0564bd93',
  measurementId: 'G-DN6EKLYG54',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
