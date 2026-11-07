self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { title: 'QuizX', body: 'Tu as reçu une invitation.' }; }
  event.waitUntil(self.registration.showNotification(payload.title || 'QuizX', {
    body: payload.body || 'Tu as reçu une invitation à un duel.', icon: '/favicon.ico', badge: '/favicon.ico',
    tag: payload.data?.invitationId || 'quizx-duel-invitation', renotify: false, data: payload.data || {}, vibrate: payload.vibrate || [], silent: !!payload.silent,
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const invitationId = event.notification.data?.invitationId;
  const target = `${self.location.origin}/?invitation=${encodeURIComponent(invitationId || '')}`;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus(); client.postMessage({ kind: 'duel_invitation', invitationId }); return;
      }
    }
    await clients.openWindow(target);
  })());
});
