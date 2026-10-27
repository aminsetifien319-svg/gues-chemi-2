// يجعل Gues Chemi قابلاً للتثبيت كتطبيق على الهاتف. لا يخزّن الدروس هنا (تُحفظ عبر Firebase بعد الدخول).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
