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

/** Chave pública VAPID (par com `WEB_PUSH_PRIVATE_KEY` nos secrets das Cloud Functions) — não é
 *  secreta por natureza, é feita pra ir no cliente. Usada por `@nexago/push-notifications`. */
export const webPushVapidPublicKey =
  "BGwZQk2ch54b0ObGnM52ddGFRu2tZ-HFIHcUxPo-f9nDDYFZvb5Ywjpmx5h-giJFn0qwHC5pr8oxtOr4_LfjSBY";

/**
 * Região das Cloud Functions que os portais chamam.
 *
 * O Firestore do projeto vive em `southamerica-east1`, mas o SDK pede a callable em
 * `us-central1` quando ninguém diz o contrário. Nesse padrão cada clique atravessa o continente
 * duas vezes — uma para chegar na função em Iowa, e de novo a cada leitura que ela faz no banco
 * em São Paulo. No portal do organizador isso colocava um piso de ~800 ms em operações que fazem
 * duas leituras e uma escrita.
 *
 * Passe SEMPRE como segundo argumento de `getFunctions(app, FUNCTIONS_REGION)`. As funções
 * atendem nas duas regiões durante a travessia (`functions/src/function-regions.ts`), então
 * bundle antigo em cache e o app Flutter continuam funcionando em Iowa enquanto os portais vêm.
 */
export const FUNCTIONS_REGION = 'southamerica-east1';
