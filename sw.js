// Gues Chemi: يجعل الموقع قابلاً للتثبيت ويفتح دون إنترنت.
// - صفحات الموقع: من الخادم أولاً (آخر نسخة دائماً)، ومن الذاكرة إن لم يوجد إنترنت.
// - ملفات الموقع ذات رقم النسخة (?v=N) ومكتبات Firebase والخطوط: من الذاكرة أولاً.
// - الدروس نفسها تُحفظ عبر Firebase (ذاكرة الجهاز) وليس هنا.
const SHELL = 'gc-shell-v2';
const LIBS = 'gc-libs-v1';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icon.png', 'icon-192.png', 'apple-touch-icon.png', 'logo.webp'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL).then((c) => Promise.all(CORE.map((u) => c.add(new Request(u, { cache: 'no-cache' })).catch(() => {})))));
});
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const keep = [SHELL, LIBS];
  for (const k of await caches.keys()) if (keep.indexOf(k) < 0 && k.indexOf('gc-') === 0) await caches.delete(k);
  await self.clients.claim();
})()));

async function putVersioned(cache, req, res) {
  // نحذف النسخ القديمة من نفس الملف حتى لا تكبر الذاكرة
  const u = new URL(req.url);
  for (const k of await cache.keys()) { const ku = new URL(k.url); if (ku.pathname === u.pathname && ku.search !== u.search) await cache.delete(k); }
  await cache.put(req, res);
}

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);

  // الصفحات: الخادم أولاً، ثم الذاكرة
  if (r.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(r.url, { cache: 'no-cache', credentials: 'same-origin' });
        if (res.ok && u.origin === location.origin) { const c = await caches.open(SHELL); c.put(u.pathname.endsWith('admin.html') ? 'admin.html' : 'index.html', res.clone()); }
        return res;
      } catch (err) {
        const c = await caches.open(SHELL);
        return (await c.match(u.pathname.endsWith('admin.html') ? 'admin.html' : 'index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  // ملفات الموقع
  if (u.origin === location.origin) {
    if (u.pathname.endsWith('version.json')) {   // للتحقق من التحديث: من الخادم دائماً
      e.respondWith(fetch(r).catch(async () => (await caches.match(r)) || new Response('{"v":0}', { headers: { 'Content-Type': 'application/json' } })));
      return;
    }
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      const hit = await c.match(r);
      if (hit && u.search) return hit;   // ملف برقم نسخة: لا يتغيّر
      try {
        const res = await fetch(r);
        if (res.ok) await putVersioned(c, r, res.clone());
        return res;
      } catch (err) { return hit || (await c.match(r, { ignoreSearch: true })) || Response.error(); }
    })());
    return;
  }

  // مكتبات Firebase والخطوط: ثابتة (رقم النسخة في الرابط)
  if ((u.hostname === 'www.gstatic.com' && u.pathname.indexOf('/firebasejs/') === 0) || u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const c = await caches.open(LIBS);
      const hit = await c.match(r);
      if (hit) return hit;
      try { const res = await fetch(r); if (res.ok || res.type === 'opaque') await c.put(r, res.clone()); return res; }
      catch (err) { return Response.error(); }
    })());
  }
});
