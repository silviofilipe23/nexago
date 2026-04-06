import type { FirebaseOptions } from 'firebase/app';

/** Web app configuration from the Firebase console (client keys are not secret). */
export const firebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyCmTZvqMu21GzWrow7rzvs4DQuatP9XLn4",
  authDomain: "volley-track-2dd3b.firebaseapp.com",
  projectId: "volley-track-2dd3b",
  storageBucket: "volley-track-2dd3b.firebasestorage.app",
  messagingSenderId: "194110109319",
  appId: "1:194110109319:web:54d1de7a10e850e08e2a22",
  measurementId: "G-F5ZP0X2NH3",
  // VAPID key do projeto prod - obter em Firebase Console > Project Settings > Cloud Messaging > Web Push certificates
  // messagingVapidKey: "BMbgXMIstf3vSLv5VXL2GinROZZHtd7zE03WofBGJ2R8JR5Heroi5ZOzVt43I40WM27Tvd3Uk7ngu_MDgognLlQ"
};