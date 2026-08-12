import { addDoc, collection, deleteDoc, getDocs, query, where, type Firestore } from 'firebase/firestore';
import { webPushVapidPublicKey } from '../firebase/firebase.config';

/** Escopo raiz do site — cada portal tem seu próprio `push-sw.js` em `public/`. */
const SW_PATH = '/push-sw.js';

export function isPushSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

export function pushPermissionStatus(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
  const subscription = await registration?.pushManager.getSubscription();
  return subscription != null;
}

/** Pede permissão (se ainda não decidida), assina o push e grava a assinatura em
 *  `users/{uid}/webPushSubscriptions` — mesmo formato que `notification-delivery.ts` já lê
 *  (`endpoint` + `keys.p256dh`/`keys.auth`). Nunca lança: falha de permissão, navegador sem
 *  suporte (Safari fora de PWA instalada) ou erro de rede viram `false`. */
export async function subscribeToPush(db: Firestore, uid: string): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    if (Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      if (result !== 'granted') return false;
    } else if (Notification.permission !== 'granted') {
      return false;
    }

    const registration = await navigator.serviceWorker.register(SW_PATH);
    await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(webPushVapidPublicKey),
    });

    const keys = subscription.toJSON().keys;
    if (!keys?.['p256dh'] || !keys?.['auth']) return false;

    await addDoc(collection(db, 'users', uid, 'webPushSubscriptions'), {
      endpoint: subscription.endpoint,
      keys: { p256dh: keys['p256dh'], auth: keys['auth'] },
    });
    return true;
  } catch {
    return false;
  }
}

/** Cancela a assinatura deste navegador e apaga só o doc correspondente — outros
 *  dispositivos/navegadores do mesmo usuário continuam recebendo. */
export async function unsubscribeFromPush(db: Firestore, uid: string): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => undefined);

  const snap = await getDocs(
    query(collection(db, 'users', uid, 'webPushSubscriptions'), where('endpoint', '==', endpoint)),
  );
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64Safe);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}
