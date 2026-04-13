import type { FirebaseOptions } from 'firebase/app';

/**
 * Única fonte de verdade da configuração web do Firebase para todos os apps Angular do workspace.
 * Chaves de cliente não são secretas; regras de segurança ficam no Firebase (Auth, Firestore, etc.).
 */
export const firebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyCLRzJdSwFEq8c5M57zxrQPLPxgkomxbjk",
  authDomain: "volley-track-dev-4596c.firebaseapp.com",
  projectId: "volley-track-dev-4596c",
  storageBucket: "volley-track-dev-4596c.firebasestorage.app",
  messagingSenderId: "735357850346",
  appId: "1:735357850346:web:ec87a9f780091e0564bd93",
  measurementId: "G-DN6EKLYG54"
};
