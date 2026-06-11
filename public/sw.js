// Service Worker — Cuaderno de Ruta
// Notificaciones push reales desde el servidor
const CACHE = 'cuaderno-v7';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

// ── RECIBIR PUSH DEL SERVIDOR (FCM / Web Push) ──
function parsePushPayload(event) {
  if (!event?.data) return { title: 'Cuaderno de Ruta', body: '', data: {} };
  let raw;
  try {
    raw = event.data.json();
  } catch {
    return { title: 'Cuaderno de Ruta', body: event.data.text() || '', data: {} };
  }
  // FCM HTTP v1 anida title/body en notification; legacy a veces en raíz
  const n = raw.notification || raw;
  const data = raw.data || n.data || {};
  return {
    title: n.title || raw.title || 'Cuaderno de Ruta',
    body: n.body || raw.body || '',
    tag: data.tag || raw.tag || 'cr-notif',
    data: {
      url: data.url || n.click_action || raw.url || '/?tab=servicio',
      ...data,
    },
  };
}

self.addEventListener('push', e => {
  const parsed = parsePushPayload(e);
  console.log('[push-sw] push recibido', {
    title: parsed.title,
    bodyLen: (parsed.body || '').length,
    url: parsed.data?.url,
  });

  e.waitUntil(
    self.registration.showNotification(parsed.title, {
      body: parsed.body,
      tag: parsed.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-96.png',
      requireInteraction: true,
      vibrate: [400, 100, 400, 100, 400],
      silent: false,
      data: parsed.data,
    })
  );
});

// ── NOTIFICACIONES LOCALES (fallback sin push) ──
if (!self._scheduled) self._scheduled = [];
if (!self._timers) self._timers = {};

self.addEventListener('message', e => {
  const { type, payload } = e.data || {};
  if (!self._scheduled) self._scheduled = [];
  if (!self._timers) self._timers = {};

  if (type === 'SCHEDULE_NOTIFICATION') {
    const { title, body, tag, delay = 0 } = payload;
    if (self._timers[tag]) { clearTimeout(self._timers[tag]); delete self._timers[tag]; }
    self._scheduled = self._scheduled.filter(n => n.tag !== tag);
    if (delay <= 0) {
      self.registration.showNotification(title, { body, tag, icon: '/icons/icon-192.png', badge: '/icons/favicon-96.png', requireInteraction: true, vibrate: [400,100,400] });
    } else {
      const fireAt = Date.now() + delay;
      self._scheduled.push({ title, body, tag, fireAt });
      self._timers[tag] = setTimeout(() => {
        self._scheduled = self._scheduled.filter(n => n.tag !== tag);
        self.registration.showNotification(title, { body, tag, icon: '/icons/icon-192.png', badge: '/icons/favicon-96.png', requireInteraction: true, vibrate: [400,100,400] });
      }, delay);
    }
  }
  if (type === 'CANCEL_NOTIFICATION') {
    const { tag } = payload;
    if (self._timers[tag]) { clearTimeout(self._timers[tag]); delete self._timers[tag]; }
    self._scheduled = self._scheduled.filter(n => n.tag !== tag);
    self.registration.getNotifications({ tag }).then(ns => ns.forEach(n => n.close()));
  }
  if (type === 'CANCEL_ALL') {
    Object.values(self._timers || {}).forEach(clearTimeout);
    self._timers = {}; self._scheduled = [];
  }
  if (type === 'KEEPALIVE') {
    checkPending();
    e.source?.postMessage({ type: 'ALIVE', scheduled: self._scheduled.length });
  }
});

function checkPending() {
  const now = Date.now();
  const due = self._scheduled.filter(n => n.fireAt <= now);
  self._scheduled = self._scheduled.filter(n => n.fireAt > now);
  return Promise.all(due.map(n =>
    self.registration.showNotification(n.title, { body: n.body, tag: n.tag, icon: '/icons/icon-192.png', badge: '/icons/favicon-96.png', requireInteraction: true })
  ));
}

self.addEventListener('periodicsync', e => {
  if (e.tag === 'check-notifs') e.waitUntil(checkPending());
});

// ── AL PULSAR NOTIFICACIÓN ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const nData = e.notification?.data || {};
  const fcmData = nData?.FCM_MSG?.data || {};
  const targetUrl = nData.url || fcmData.url || '/?tab=servicio';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        const app = list[0];
        if (app) {
          app.postMessage({ type: 'OPEN_TAB', payload: { tab: 'servicio' } });
          return app.focus();
        }
        return clients.openWindow(targetUrl);
      })
  );
});
