// Service worker de Web Push do portal do organizador — só cuida de push/notificationclick,
// não faz cache nem offline (não é um service worker de PWA completo).
//
// Payload vem de deliverNotificationToUser (functions/src/notification-delivery.ts) via
// web-push (VAPID), no formato:
// { notification: { title, body }, data: { ...campos, type, url, webUrl? }, requireInteraction }
//
// O mesmo `data` vai pro app (FCM): `url` é a rota do APP e `webUrl` a do portal. Notificação
// sem `webUrl` (as do atleta, ou gravadas antes) segue no `url`.

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const title = payload.notification?.title ?? 'nexaGO';
  const options = {
    body: payload.notification?.body ?? '',
    data: payload.data ?? {},
    requireInteraction: payload.requireInteraction === true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.webUrl ?? event.notification.data?.url;
  const target = url ? new URL(url, self.location.origin).href : self.location.origin;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientsList) => {
      for (const client of clientsList) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    }),
  );
});
