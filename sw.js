// يجعل Gues Chemi قابلاً للتثبيت كتطبيق. لا يخزّن الدروس (تُحفظ عبر Firebase بعد الدخول).
// صفحات الموقع تُطلب دائماً من الخادم أولاً، حتى يحصل كل طالب على آخر نسخة.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || r.mode !== 'navigate') return;
  e.respondWith(fetch(r.url, { cache: 'no-cache', credentials: 'same-origin' }).catch(() => fetch(r)));
});
