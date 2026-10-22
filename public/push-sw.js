// عامل الخدمة لإشعارات الويب: يعرض الإشعار حتى والتطبيق مغلق، والضغط عليه يفتح التطبيق على الموعد.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { title: event.data?.text() || 'مِقص' }; }
  const data = payload.data || {};
  event.waitUntil(self.registration.showNotification(payload.title || 'مِقص', {
    body: payload.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    dir: 'auto',
    tag: data.appointmentId || undefined,
    data,
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find(w => new URL(w.url).origin === self.location.origin);
    if (open) { await open.focus(); open.postMessage({ type: 'push-open', data }); return; }
    const params = new URLSearchParams();
    if (data.appointmentId) params.set('open', data.appointmentId);
    if (data.kind) params.set('kind', data.kind);
    await self.clients.openWindow(`/${params.toString() ? `?${params}` : ''}`);
  })());
});
