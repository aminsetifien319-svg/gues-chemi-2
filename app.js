// Gues Chemi: دخول Google ← القبول ← حد الأجهزة ← الدروس نصاً، الكيسيام، الامتحان التجريبي، المراجعة، البحث، التقدّم.
import {
  watchUser, signIn, signOutUser, getAccess, sendRequest, loadManifest, getImage,
  loadProgress, saveProgress, getDevices, addDevice, configMissing
} from './firebase.js?v=6';

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const VIEW = $('#view'), GATE = $('#gate'), SIDE = $('#side');
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const now = () => Date.now();
const DAY = 86400000;
const norm = (s) => String(s || '').split('').sort().join('');
const KIND_AR = { official: 'رسمي', proposed: 'مقترح' };
const SR_DAYS = [1, 2, 4, 8, 16];
const EXAM_MAX = { 20: 30, 40: 60, 60: 90, 80: 120, 100: 150 };   // minutes
const PERQ = [30, 60, 90, 120, 150, 180, 240, 300];                 // seconds per question

let me = null, isAdmin = false, M = null, prog = null, KEY = '', ready = false;
let FLOW = {}, ITEMS = {}, SETKEYS = {};
let quizSel = {}, revRes = {}, revLists = {};
let CUR = null, cloud = 'off', pushTimer = 0, tick = 0, installEvt = null, renderId = 0;
const TXT = {};
let viewMode = 'text';
try { viewMode = localStorage.getItem('gueschemi.view') === 'orig' ? 'orig' : 'text'; } catch (e) {}

/* =================================================================
   التقدّم: محفوظ في المتصفح + في حساب الطالب
   ================================================================= */
function blank() { return { v: 4, r: {}, a: {}, f: {}, sr: {}, last: '', lastT: 0, exam: null, hist: [] }; }
function upgrade(p) {
  if (!p || typeof p !== 'object') return blank();
  const out = blank();
  if (p.v >= 3) return Object.assign(out, p, { v: 4, r: p.r || {}, a: p.a || {}, f: p.f || {}, sr: p.sr || {}, hist: p.hist || [] });
  out.r = p.r || {}; out.last = p.last || '';
  Object.keys(p.q || {}).forEach((s) => Object.keys(p.q[s] || {}).forEach((n) => { const x = p.q[s][n]; if (x && x.s) out.a[s + n] = { s: x.s, ok: !!x.ok, t: 1 }; }));
  return out;
}
function readLocal() {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem('gueschemi.v3:' + me.email) || localStorage.getItem('gueschemi.v2:' + me.email);
    return raw ? upgrade(JSON.parse(raw)) : blank();
  } catch (e) { return blank(); }
}
function tOf(x) { return x && typeof x === 'object' ? (x.t || 0) : (x ? 1 : 0); }
function mergeMap(a, b) {
  const o = Object.assign({}, a);
  Object.keys(b || {}).forEach((k) => { if (!(k in o) || tOf(b[k]) > tOf(o[k])) o[k] = b[k]; });
  return o;
}
function merge(a, b) {
  if (!b) return a;
  const o = blank();
  o.r = mergeMap(a.r, b.r); o.a = mergeMap(a.a, b.a); o.f = mergeMap(a.f, b.f); o.sr = mergeMap(a.sr, b.sr);
  const L = (a.lastT || 0) >= (b.lastT || 0) ? a : b; o.last = L.last; o.lastT = L.lastT || 0;
  const H = {}; (a.hist || []).concat(b.hist || []).forEach((h) => { if (h && h.id) H[h.id] = h; });
  o.hist = Object.keys(H).map((k) => H[k]).sort((x, y) => y.end - x.end).slice(0, 20);
  const E = [a.exam, b.exam].filter(Boolean).sort((x, y) => (y.t || y.start) - (x.t || x.start))[0] || null;
  o.exam = E && !H[E.id] ? E : null;
  return o;
}
function save(immediate) {
  try { localStorage.setItem(KEY, JSON.stringify(prog)); } catch (e) {}
  if (cloud === 'off') return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, immediate ? 0 : 2500);
}
async function push() {
  clearTimeout(pushTimer); pushTimer = 0;
  if (!me || cloud === 'off') return;
  try { await saveProgress(me.email, JSON.stringify(prog)); cloud = 'on'; } catch (e) { cloud = 'err'; }
  const s = $('[data-cloud]'); if (s) s.outerHTML = cloudBadge();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && pushTimer) push(); });
function cloudBadge() {
  return cloud === 'on' ? '<small data-cloud class="cl on">☁ محفوظ في حسابك على كل أجهزتك</small>'
    : cloud === 'err' ? '<small data-cloud class="cl err">⚠ تعذّرت المزامنة، التقدّم محفوظ على هذا الجهاز</small>'
      : '<small data-cloud class="cl">محفوظ على هذا الجهاز</small>';
}

const res = (key) => { const x = prog.a[key]; return x && !x.d && x.s ? x : null; };
const isFav = (id) => { const x = prog.f[id]; return !!(x && x.on); };
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
function srUpdate(key, ok, reviewing) {
  const cur = prog.sr[key];
  if (!ok) { prog.sr[key] = { b: 0, due: startOfDay(now()) + DAY, t: now() }; return; }
  if (!cur || cur.done) return;
  if (!reviewing && cur.due > now()) return;
  const b = cur.b + 1;
  prog.sr[key] = b >= SR_DAYS.length ? { b: b, done: 1, t: now() } : { b: b, due: startOfDay(now()) + SR_DAYS[b] * DAY, t: now() };
}
function setRes(key, s, reviewing) {
  const ok = s === norm(ITEMS[key].q.ans);
  prog.a[key] = { s: s, ok: ok, t: now() };
  srUpdate(key, ok, reviewing);
  return ok;
}
function clearRes(key) { if (prog.a[key]) prog.a[key] = { d: 1, t: now() }; }
const dueKeys = () => Object.keys(prog.sr).filter((k) => ITEMS[k] && prog.sr[k] && !prog.sr[k].done && prog.sr[k].due <= now());
const readP = (n) => !!prog.r[n];
const sk = (cid, kind) => 'c' + cid + kind[0];
function chStats(ch) {
  const pages = FLOW[ch.id], read = pages.filter((p) => readP(p.n)).length;
  let qn = 0, qa = 0, qok = 0;
  ch.qcm.forEach((set) => SETKEYS[sk(ch.id, set.key)].forEach((k) => { qn++; const x = res(k); if (x) { qa++; if (x.ok) qok++; } }));
  return { pages: pages.length, read: read, qn: qn, qa: qa, qok: qok };
}
const wrongKeys = (cid) => Object.keys(ITEMS).filter((k) => (!cid || ITEMS[k].ch.id === cid) && res(k) && !res(k).ok);
const favKeys = () => Object.keys(ITEMS).filter((k) => isFav(k));
const favPages = () => { const out = []; M.chapters.forEach((ch) => FLOW[ch.id].forEach((p) => { if (isFav('p' + p.n)) out.push({ ch: ch, p: p }); })); return out; };

/* =================================================================
   النصوص (دروس + كيسيام) تُحمَّل عند الحاجة
   ================================================================= */
function chText(ch) {
  if (!ch.text) return Promise.resolve(null);
  if (!TXT[ch.id]) TXT[ch.id] = getImage(ch.text).then((s) => JSON.parse(s)).catch((e) => { delete TXT[ch.id]; throw e; });
  return TXT[ch.id];
}
function qText(key) { return chText(ITEMS[key].ch).then((t) => t && t.q[key]); }

/* =================================================================
   شاشات الدخول
   ================================================================= */
function gate(inner) {
  ready = false; VIEW.hidden = true; VIEW.innerHTML = ''; SIDE.hidden = true; $('#menuBtn').hidden = true; $('#searchBtn').hidden = true; closeSide();
  GATE.hidden = false;
  GATE.innerHTML = '<div class="gate"><div class="card"><img class="gate-logo" src="logo.webp" alt="" width="96" height="96"><p class="kick">GUES CHEMI</p>' + inner + '</div></div>';
  window.scrollTo(0, 0);
}
const acts = (a) => '<p class="acts">' + a + '</p>';
function gLogin(msg) {
  if (configMissing) return gate('<h1>الموقع غير مُهيّأ بعد</h1><p>الصق إعدادات Firebase في الملف <b class="lat">firebase-config.js</b>.</p>');
  gate('<h1>الكيمياء العامة · السنة الأولى صيدلة</h1><p>الدروس والكيسيام متاحة للطلبة المقبولين فقط. سجّل الدخول بحساب Google.</p>' +
    (msg ? '<p class="err" role="alert">' + esc(msg) + '</p>' : '') +
    acts('<button type="button" class="btn pri g" data-act="login"><svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>الدخول بحساب Google</button>'));
}
function gRequest(u) {
  gate('<h1>مرحباً ' + esc((u.name || '').split(' ')[0]) + '</h1><p>حسابك <bdi class="lat">' + esc(u.email) + '</bdi> غير مقبول بعد. أرسل طلب وصول ليراجعه المشرف.</p>' +
    acts('<button type="button" class="btn pri" data-act="request">إرسال طلب الوصول</button><button type="button" class="btn" data-act="logout">خروج</button>'));
}
function gPending(u) {
  gate('<h1>طلبك قيد المراجعة</h1><p>أُرسل طلب الحساب <bdi class="lat">' + esc(u.email) + '</bdi>. ستتمكن من الدخول عندما يقبله المشرف.</p>' +
    acts('<button type="button" class="btn pri" data-act="recheck">تحقّق من جديد</button><button type="button" class="btn" data-act="logout">خروج</button>'));
}
function gDevices(d) {
  const list = (d && d.ids || []).map((id) => { const x = (d.info || {})[id] || {}; return '<li><b>' + esc(x.name || 'جهاز') + '</b> <small class="lat">' + (x.t ? new Date(x.t).toLocaleDateString('fr-DZ') : '') + '</small></li>'; }).join('');
  gate('<h1>هذا الحساب مستعمل على جهازين</h1><p>كل حساب يعمل على <b>جهازين فقط</b>. هذا الجهاز ليس منهما:</p><ul class="devl">' + list + '</ul><p>إن غيّرت هاتفك أو حاسوبك، اطلب من المشرف «إعادة تعيين الأجهزة» لحسابك.</p>' +
    acts('<button type="button" class="btn pri" data-act="recheck">تحقّق من جديد</button><button type="button" class="btn" data-act="logout">خروج</button>'));
}
function gError(msg, extra) {
  gate('<h1>تعذّر الدخول</h1><p class="err" role="alert">' + esc(msg) + '</p>' + (extra || '') +
    acts('<button type="button" class="btn pri" data-act="recheck">حاول مرة أخرى</button><button type="button" class="btn" data-act="logout">خروج</button>'));
}
function friendly(err) {
  const c = err && err.code;
  if (c === 'permission-denied') return 'ليست لديك صلاحية قراءة هذا المحتوى بعد.';
  if (c === 'auth/network-request-failed' || c === 'unavailable') return 'لا يوجد اتصال بالإنترنت.';
  if (c === 'auth/unauthorized-domain') return 'عنوان الموقع غير مضاف في Firebase (Authorized domains).';
  return (err && err.message) ? err.message : 'حدث خطأ غير متوقع.';
}
function renderUser() {
  const u = $('#user');
  if (!me) { u.innerHTML = ''; return; }
  const ini = esc((me.name || me.email).trim().charAt(0).toUpperCase());
  u.innerHTML = (installEvt ? '<button type="button" class="chip inst" data-act="install">⤓ ثبّت التطبيق</button>' : '') +
    (isAdmin && ready ? '<a class="chip" href="admin.html">الإدارة</a>' : '') +
    '<span class="av" title="' + esc(me.email) + '">' + ini + '</span>' +
    '<button type="button" class="chip" data-act="logout">خروج</button>';
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; renderUser(); });
window.addEventListener('appinstalled', () => { installEvt = null; renderUser(); });
if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); }); }

/* ---------- الجهاز ---------- */
function deviceId() {
  let id = '';
  try { id = localStorage.getItem('gueschemi.device') || ''; } catch (e) {}
  if (!id) { id = 'd' + Math.random().toString(36).slice(2, 10) + now().toString(36); try { localStorage.setItem('gueschemi.device', id); } catch (e) {} }
  return id;
}
function deviceName() {
  const ua = navigator.userAgent || '';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'جهاز';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return os + (br ? ' · ' + br : '');
}
async function checkDevice() {
  const id = deviceId();
  let d = null;
  try { d = await getDevices(me.email); } catch (e) { return { ok: true }; }   // القواعد القديمة: لا نمنع
  const ids = (d && d.ids) || [];
  if (ids.indexOf(id) >= 0) return { ok: true };
  if (ids.length >= 2) return { ok: false, d: d };
  const info = Object.assign({}, (d && d.info) || {}); info[id] = { name: deviceName(), t: now() };
  try { await addDevice(me.email, ids.concat([id]), info); } catch (e) { return { ok: false, d: d }; }
  return { ok: true };
}

/* =================================================================
   المسار الرئيسي
   ================================================================= */
async function onUser(u) {
  me = u; isAdmin = false; M = null; cloud = 'off';
  renderUser();
  if (!u) { gLogin(); return; }
  KEY = 'gueschemi.v4:' + u.email;
  gate('<p>جارٍ التحقق من حسابك…</p>');
  try {
    const acc = await getAccess(u.email);
    if (acc === 'admin' || acc === 'allowed') {
      isAdmin = (acc === 'admin');
      if (!isAdmin) { const dv = await checkDevice(); if (!dv.ok) return gDevices(dv.d); }
      M = await loadManifest();
      if (!M || !M.chapters || !M.chapters.length) {
        renderUser();
        return gError(isAdmin ? 'لم يُرفع المحتوى بعد. افتح صفحة الإدارة وارفع ملفات المحتوى.' : 'المحتوى غير متاح حالياً، حاول لاحقاً.',
          isAdmin ? acts('<a class="btn pri" href="admin.html">صفحة الإدارة</a>') : '');
      }
      let remote = null;
      try { const j = await loadProgress(u.email); remote = j ? upgrade(JSON.parse(j)) : null; cloud = 'on'; } catch (e) { cloud = 'off'; }
      start(remote);
    } else if (acc === 'pending') gPending(u);
    else gRequest(u);
  } catch (err) { gError(friendly(err)); }
}

function start(remote) {
  FLOW = {}; ITEMS = {}; SETKEYS = {};
  M.chapters.forEach((ch) => {
    const list = [];
    ch.sections.forEach((s) => s.pages.forEach((p) => list.push({ img: p.img, n: p.n, t: p.t, sec: s.en, secAr: s.ar, rev: false })));
    ch.revision.forEach((p) => list.push({ img: p.img, n: p.n, t: p.t, sec: 'Revision', secAr: p.ar || 'المراجعة', rev: true }));
    FLOW[ch.id] = list;
    ch.qcm.forEach((set) => {
      const s = sk(ch.id, set.key); SETKEYS[s] = [];
      set.q.forEach((q, i) => { const k = s + q.n; ITEMS[k] = { key: k, ch: ch, set: set, q: q, i: i }; SETKEYS[s].push(k); });
    });
  });
  prog = merge(readLocal(), remote);
  revRes = {}; revLists = {}; quizSel = {};
  ready = true;
  save(true);
  GATE.hidden = true; GATE.innerHTML = '';
  VIEW.hidden = false; SIDE.hidden = false; $('#menuBtn').hidden = false; $('#searchBtn').hidden = false;
  renderUser();
  clearInterval(tick); tick = setInterval(onTick, 1000);
  M.chapters.forEach((ch) => chText(ch).catch(() => {}));   // تحميل مسبق للنصوص
  router();
}

/* ---------- التنقل ---------- */
function parse() {
  const raw = (location.hash || '#/').replace(/^#\/?/, '');
  const h = raw.split('/').filter(Boolean);
  const n = (x) => parseInt(x, 10) || 1;
  if (!h.length) return { v: 'home' };
  if (h[0] === 'stats') return { v: 'stats' };
  if (h[0] === 'mistakes') return { v: 'mistakes' };
  if (h[0] === 'fav') return { v: 'fav' };
  if (h[0] === 'progress') return { v: 'progress' };
  if (h[0] === 'search') return { v: 'search', q: decodeURIComponent(raw.slice(7) || '') };
  if (h[0] === 'today') return { v: 'review', src: 'today', i: n(h[1]) - 1 };
  if (h[0] === 'review' && h[1]) return { v: 'review', src: h[1], i: n(h[2]) - 1 };
  if (h[0] === 'exam') {
    if (h[1] === 'q') return { v: 'examq', i: n(h[2]) - 1 };
    if (h[1] === 'r' && h[2]) return h[3] ? { v: 'examrq', id: h[2], i: n(h[3]) - 1 } : { v: 'examr', id: h[2] };
    return { v: 'exam' };
  }
  if (h[0] === 'c') {
    const ch = M.chapters.find((c) => String(c.id) === h[1]);
    if (!ch) return { v: 'home' };
    if (h[2] === 'p') { const i = FLOW[ch.id].findIndex((p) => String(p.n) === h[3]); if (i >= 0) return { v: 'page', ch: ch, i: i }; }
    if (h[2] === 'q') { const set = ch.qcm.find((s) => s.key === h[3]); if (set) return { v: 'quiz', ch: ch, set: set, i: Math.max(0, Math.min(set.q.length - 1, n(h[4]) - 1)) }; }
    return { v: 'chapter', ch: ch };
  }
  return { v: 'home' };
}
function router() {
  if (!ready) return;
  const r = parse();
  CUR = null; renderId++;
  if (r.v === 'home') home();
  else if (r.v === 'stats') stats();
  else if (r.v === 'chapter') chapter(r.ch);
  else if (r.v === 'page') page(r.ch, r.i);
  else if (r.v === 'quiz') practice(r);
  else if (r.v === 'mistakes') mistakes();
  else if (r.v === 'fav') favorites();
  else if (r.v === 'progress') progressPage();
  else if (r.v === 'search') searchPage(r.q);
  else if (r.v === 'review') review(r);
  else if (r.v === 'exam') examHome();
  else if (r.v === 'examq') examQ(r.i);
  else if (r.v === 'examr') examResult(r.id);
  else if (r.v === 'examrq') examReview(r.id, r.i);
  if (r.v === 'page' || r.v === 'quiz' || r.v === 'chapter') { prog.last = location.hash; prog.lastT = now(); save(); }
  side(r);
  closeSide();
}
window.addEventListener('hashchange', () => { if (parse().v === 'search' && $('#sq')) return; router(); window.scrollTo(0, 0); });
const go = (h) => { if (location.hash === h) router(); else location.hash = h; };

/* ---------- القائمة الجانبية ---------- */
function side(r) {
  const cur = (r.ch && r.ch.id) || 0;
  const nw = wrongKeys().length, nf = favKeys().length + favPages().length, nd = dueKeys().length;
  const ex = prog.exam ? '<em class="lat live">' + fmtT(examLeft()) + '</em>' : '';
  let h = '<nav aria-label="الفهرس"><a class="sl' + (r.v === 'home' ? ' on' : '') + '" href="#/"><i class="ico">⌂</i>الرئيسية</a>' +
    '<a class="sl' + (r.v === 'search' ? ' on' : '') + '" href="#/search"><i class="ico">⌕</i>البحث</a>' +
    '<a class="sl' + (r.v === 'progress' ? ' on' : '') + '" href="#/progress"><i class="ico">↗</i>تقدّمي</a>' +
    '<a class="sl' + (r.v === 'stats' ? ' on' : '') + '" href="#/stats"><i class="ico">▤</i>الإحصائيات وخطة المراجعة</a>' +
    '<p class="sh">أدوات المراجعة</p>' +
    '<a class="sl' + (r.v === 'review' && r.src === 'today' ? ' on' : '') + '" href="#/today"><i class="ico">↻</i>مراجعة اليوم' + (nd ? '<em class="lat live">' + nd + '</em>' : '') + '</a>' +
    '<a class="sl' + (/^exam/.test(r.v) ? ' on' : '') + '" href="#/exam"><i class="ico">⏱</i>امتحان تجريبي' + ex + '</a>' +
    '<a class="sl' + (r.v === 'mistakes' || (r.v === 'review' && r.src.indexOf('wrong') === 0) ? ' on' : '') + '" href="#/mistakes"><i class="ico">✗</i>أخطائي' + (nw ? '<em class="lat bad">' + nw + '</em>' : '') + '</a>' +
    '<a class="sl' + (r.v === 'fav' || (r.v === 'review' && r.src === 'fav') ? ' on' : '') + '" href="#/fav"><i class="ico">★</i>المفضلة' + (nf ? '<em class="lat">' + nf + '</em>' : '') + '</a>' +
    '<p class="sh">الشابيطرات</p>';
  M.chapters.forEach((ch) => {
    const st = chStats(ch), open = ch.id === cur;
    h += '<div class="sch' + (open ? ' open' : '') + '" style="--c:var(--c' + ch.id + ')"><a class="sl ch' + (r.v === 'chapter' && open ? ' on' : '') + '" href="#/c/' + ch.id + '">' +
      '<b class="num lat">' + ch.id + '</b><span><span class="lat en">' + esc(ch.en) + '</span><small>' + esc(ch.ar) + '</small></span>' +
      '<i class="ring" style="--p:' + pct(st.read + st.qa, st.pages + st.qn) + '"></i></a>';
    if (open) {
      h += '<div class="sub">';
      ch.sections.forEach((s) => {
        const active = r.v === 'page' && s.pages.some((p) => p.n === FLOW[ch.id][r.i].n);
        const done = s.pages.every((p) => readP(p.n));
        h += '<a class="ss' + (active ? ' on' : '') + (done ? ' done' : '') + '" href="#/c/' + ch.id + '/p/' + s.pages[0].n + '"><span class="lat">' + esc(s.key === 'intro' ? '·' : s.key) + '</span>' + esc(s.ar) + '</a>';
      });
      const revActive = r.v === 'page' && FLOW[ch.id][r.i].rev;
      h += '<a class="ss' + (revActive ? ' on' : '') + '" href="#/c/' + ch.id + '/p/' + ch.revision[0].n + '"><span>★</span>المراجعة</a>';
      ch.qcm.forEach((set) => {
        const keys = SETKEYS[sk(ch.id, set.key)], a = keys.filter(res).length;
        h += '<a class="ss q' + (r.v === 'quiz' && r.set === set ? ' on' : '') + '" href="#/c/' + ch.id + '/q/' + set.key + '"><span>✎</span>' + esc(set.ar) + '<em class="lat">' + a + '/' + keys.length + '</em></a>';
      });
      h += '</div>';
    }
    h += '</div>';
  });
  SIDE.innerHTML = h + '</nav>';
}
function openSide() { SIDE.classList.add('show'); $('#scrim').hidden = false; }
function closeSide() { SIDE.classList.remove('show'); $('#scrim').hidden = true; }

/* =================================================================
   الصور المحمية
   ================================================================= */
let wmUrl = '';
function watermark() {
  if (wmUrl) return wmUrl;
  const t = esc(me ? me.email : '');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200"><text x="20" y="120" transform="rotate(-18 180 100)" font-family="Arial" font-size="15" fill="rgba(10,26,51,0.11)">' + t + '</text></svg>';
  wmUrl = 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")';
  return wmUrl;
}
function fig(id, cls, ratio) {
  return '<figure class="pg ' + (cls || '') + '" data-img="' + esc(id) + '" style="aspect-ratio:' + (ratio || '16 / 9') + '"><span class="sk"></span><i class="wm"></i></figure>';
}
function hydrate(root) {
  $$('.wm', root || VIEW).forEach((w) => { if (!w.style.backgroundImage) w.style.backgroundImage = watermark(); });
  $$('figure[data-img]', root || VIEW).forEach((f) => {
    if (f.dataset.done) return;
    f.dataset.done = '1';
    getImage(f.dataset.img).then((src) => {
      const im = new Image();
      im.alt = ''; im.draggable = false; im.decoding = 'async';
      im.onload = () => { f.style.aspectRatio = im.naturalWidth + ' / ' + im.naturalHeight; f.classList.add('ok'); };
      im.src = src;
      f.insertBefore(im, f.firstChild);
    }).catch(() => { f.classList.add('bad'); const s = f.querySelector('.sk'); if (s) s.textContent = 'تعذّر تحميل الصورة. تحقق من الاتصال ثم حدّث الصفحة.'; });
  });
}
function prefetch(id) { if (id) getImage(id).catch(() => {}); }
const star = (id, label) => '<button type="button" class="star' + (isFav(id) ? ' on' : '') + '" data-fav="' + esc(id) + '" aria-pressed="' + isFav(id) + '" title="أضف إلى المفضلة">' + (isFav(id) ? '★' : '☆') + (label ? '<span>' + (isFav(id) ? 'في المفضلة' : 'أضف للمفضلة') + '</span>' : '') + '</button>';
const modeSwitch = (what) => '<div class="seg" role="group" aria-label="طريقة العرض"><button type="button" data-mode="text" class="' + (viewMode === 'text' ? 'on' : '') + '">' + (what === 'q' ? 'السؤال مكتوباً' : 'الدرس مكتوباً') + '</button><button type="button" data-mode="orig" class="' + (viewMode === 'orig' ? 'on' : '') + '">' + (what === 'q' ? 'صورة السؤال' : 'الصفحة الأصلية') + '</button></div>';
const loading = '<div class="loadtx"><span class="sk"></span></div>';
const crumbs = (items) => '<nav class="crumb"><a href="#/">الرئيسية</a>' + items.map((x) => '<span>›</span>' + (x[1] ? '<a href="' + x[1] + '">' + x[0] + '</a>' : '<b>' + x[0] + '</b>')).join('') + '</nav>';

/* =================================================================
   الصفحة الرئيسية
   ================================================================= */
function home() {
  let tp = 0, tr = 0, tq = 0, ta = 0, tok = 0;
  const cards = M.chapters.map((ch) => {
    const s = chStats(ch); tp += s.pages; tr += s.read; tq += s.qn; ta += s.qa; tok += s.qok;
    const off = ch.qcm.find((x) => x.key === 'official'), pro = ch.qcm.find((x) => x.key === 'proposed');
    return '<a class="ccard" href="#/c/' + ch.id + '" style="--c:var(--c' + ch.id + ')">' +
      '<span class="cnum"><small>CH</small><b class="lat">' + ch.id + '</b></span>' +
      '<span class="ctx"><span class="lat en">' + esc(ch.en) + '</span><span class="ar">' + esc(ch.ar) + '</span><span class="tp lat">' + esc(ch.topics) + '</span>' +
      '<span class="facts"><span><b class="lat">' + ch.share + '%</b> من الامتحان</span><span><b class="lat">' + s.pages + '</b> صفحة</span><span><b class="lat">' + (off ? off.q.length : 0) + '</b> رسمي</span><span><b class="lat">' + (pro ? pro.q.length : 0) + '</b> مقترح</span></span>' +
      '<span class="pbar"><i style="width:' + pct(s.read, s.pages) + '%"></i></span><span class="pl">الدروس <b class="lat">' + s.read + '/' + s.pages + '</b> · الكيسيام <b class="lat">' + s.qa + '/' + s.qn + '</b>' + (s.qa ? ' · صحيح <b class="lat">' + pct(s.qok, s.qa) + '%</b>' : '') + '</span></span></a>';
  }).join('');
  const nOff = Object.keys(ITEMS).filter((k) => ITEMS[k].set.key === 'official').length, nPro = Object.keys(ITEMS).length - nOff;
  const first = (me.name || '').split(' ')[0];
  const nw = wrongKeys().length, nf = favKeys().length + favPages().length, nd = dueKeys().length, lastEx = prog.hist[0];
  VIEW.innerHTML =
    '<div class="hero"><div class="hero-in"><p class="kick lat">General Chemistry · 1st-year Pharmacy</p>' +
    '<h1>' + (first ? 'أهلاً ' + esc(first) + '، ' : '') + 'الكيمياء العامة كاملة، شابيطر بشابيطر</h1>' +
    '<p class="lead">اقرأ كل درس مكتوباً، حلّ كيسيام الامتحانات والكيسيام المقترح، راجع أخطاءك كل يوم، ثم اختبر نفسك في امتحان تجريبي بالوقت.</p>' +
    '<form class="hsearch" data-search><input type="search" name="q" placeholder="ابحث في الدروس والأسئلة… مثلاً Slater أو هوند" aria-label="بحث" autocomplete="off"><button type="submit" class="btn pri">بحث</button></form>' +
    '<div class="kpis"><span><b class="lat">' + nOff + '</b>كيسيام رسمي محلول</span><span><b class="lat">' + nPro + '</b>كيسيام مقترح</span><span><b class="lat">' + tp + '</b>صفحة دروس</span><span><b class="lat">' + M.chapters.length + '</b>شابيطرات</span></div>' +
    '<p class="acts">' + (prog.last ? '<a class="btn pri" href="' + esc(prog.last) + '">تابع من حيث توقفت ←</a>' : '<a class="btn pri" href="#/c/1">ابدأ بالشابيطر الأول ←</a>') + '<a class="btn ghost" href="#/exam">امتحان تجريبي</a></p>' +
    '</div></div>' +
    '<div class="wrap"><div class="overall card"><div><b>تقدّمك العام</b>' + cloudBadge() + '</div>' +
    '<div class="ov"><span>الدروس</span><span class="pbar"><i style="width:' + pct(tr, tp) + '%"></i></span><b class="lat">' + pct(tr, tp) + '%</b></div>' +
    '<div class="ov"><span>الكيسيام</span><span class="pbar"><i style="width:' + pct(ta, tq) + '%"></i></span><b class="lat">' + pct(ta, tq) + '%</b></div>' +
    '<div class="ov"><span>الإجابات الصحيحة</span><span class="pbar ok"><i style="width:' + pct(tok, ta) + '%"></i></span><b class="lat">' + pct(tok, ta) + '%</b></div></div>' +
    '<div class="tools four">' +
    '<a class="tool today" href="#/today"><i>↻</i><b>مراجعة اليوم</b><small>' + (nd ? '<span class="lat">' + nd + '</span> سؤالاً حان موعد مراجعته' : 'لا شيء اليوم، أحسنت') + '</small></a>' +
    '<a class="tool exam" href="#/exam"><i>⏱</i><b>' + (prog.exam ? 'امتحان جارٍ' : 'امتحان تجريبي') + '</b><small>' + (prog.exam ? 'الوقت المتبقي <span class="lat" data-timer>' + fmtT(examLeft()) + '</span>' : lastEx ? 'آخر نتيجة: <span class="lat">' + lastEx.ok + '/' + lastEx.n + '</span> (' + pct(lastEx.ok, lastEx.n) + '%)' : '20 إلى 100 سؤال بالوقت الذي تختاره') + '</small></a>' +
    '<a class="tool wrong" href="#/mistakes"><i>✗</i><b>أخطائي</b><small>' + (nw ? '<span class="lat">' + nw + '</span> سؤالاً تحتاج مراجعة' : 'لا أخطاء الآن') + '</small></a>' +
    '<a class="tool fav" href="#/fav"><i>★</i><b>المفضلة</b><small>' + (nf ? '<span class="lat">' + nf + '</span> عنصراً محفوظاً' : 'احفظ أي درس أو سؤال بالنجمة') + '</small></a></div>' +
    '<h2 class="h2">الشابيطرات</h2><div class="cgrid">' + cards + '</div></div>';
}

/* =================================================================
   الإحصائيات
   ================================================================= */
function stats() {
  VIEW.innerHTML = '<div class="wrap narrow">' + crumbs([['الإحصائيات']]) +
    '<header class="phead"><h1>الإحصائيات وخطة المراجعة</h1><p>تحليل أسئلة الامتحانات الرسمية من 16/17 إلى 25/26: أهمية كل شابيطر، المواضيع المتكررة، وكيف توزع وقت مراجعتك. اضغط على أي لوحة لتكبيرها.</p></header>' +
    M.overview.map((p, i) => '<section class="ovp"><h2><span class="lat">' + (i + 1) + '</span>' + esc(p.ar) + '<small class="lat">' + esc(p.en) + '</small></h2>' + fig(p.img, 'zoomable', '16 / 9') + '</section>').join('') + '</div>';
  hydrate();
}

/* =================================================================
   الشابيطر
   ================================================================= */
function chapter(ch) {
  const s = chStats(ch);
  const secs = ch.sections.map((sec) =>
    '<div class="sec"><h3><span class="lat key">' + esc(sec.key === 'intro' ? '·' : sec.key) + '</span><span>' + esc(sec.ar) + '<small class="lat">' + esc(sec.en) + '</small></span></h3><ol class="plist">' +
    sec.pages.map((p) => '<li><a href="#/c/' + ch.id + '/p/' + p.n + '"' + (readP(p.n) ? ' class="done"' : '') + '><span class="lat">' + esc(p.t) + '</span>' + (isFav('p' + p.n) ? '<i class="fv">★</i>' : '') + '<i class="ck"></i></a></li>').join('') +
    '</ol></div>').join('');
  const rev = ch.revision.map((p) => '<a class="tile" href="#/c/' + ch.id + '/p/' + p.n + '"><b>' + esc(p.ar || 'مراجعة') + '</b><small class="lat">' + esc(p.t) + '</small>' + (readP(p.n) ? '<i class="ck"></i>' : '') + '</a>').join('');
  const qs = ch.qcm.map((set) => {
    const keys = SETKEYS[sk(ch.id, set.key)], a = keys.filter(res).length, ok = keys.filter((k) => res(k) && res(k).ok).length;
    return '<a class="qtile ' + set.key + '" href="#/c/' + ch.id + '/q/' + set.key + '"><span class="qk">' + (set.key === 'official' ? 'EXAM' : 'NEW') + '</span><b>' + esc(set.ar) + '</b><small><span class="lat">' + set.q.length + '</span> سؤالاً' + (set.key === 'official' ? ' من امتحانات 16/17 إلى 25/26' : ' بنفس أسلوب الامتحان') + '</small>' +
      '<span class="pbar"><i style="width:' + pct(a, set.q.length) + '%"></i></span><span class="pl">' + (a ? 'أجبت عن <b class="lat">' + a + '/' + set.q.length + '</b> · صحيح <b class="lat">' + ok + '</b>' : 'لم تبدأ بعد') + '</span><span class="go">' + (a && a < set.q.length ? 'تابع' : a ? 'راجع' : 'ابدأ') + ' ←</span></a>';
  }).join('');
  const nw = wrongKeys(ch.id).length;
  VIEW.innerHTML = '<div class="chero" style="--c:var(--c' + ch.id + ')"><div class="wrap chero-in"><div class="ctext"><nav class="crumb inv"><a href="#/">الرئيسية</a><span>›</span><b>CH ' + ch.id + '</b></nav>' +
    '<p class="kick lat">Chapter ' + ch.id + '</p><h1><span class="lat">' + esc(ch.en) + '</span><span class="ar">' + esc(ch.ar) + '</span></h1><p class="tp lat">' + esc(ch.topics) + '</p>' +
    '<div class="chips"><span><b class="lat">' + ch.share + '%</b> من أسئلة الامتحان</span><span>الترتيب <b class="lat">#' + ch.rank + '</b></span><span><b class="lat">' + ch.app + '</b> ظهوراً في الامتحانات</span></div>' +
    '<p class="acts"><a class="btn pri" href="#/c/' + ch.id + '/p/' + FLOW[ch.id][0].n + '">' + (s.read ? 'تابع الدروس' : 'ابدأ الدرس') + ' ←</a><a class="btn ghost" href="#/c/' + ch.id + '/q/official">كيسيام الامتحانات</a></p></div>' +
    '<div class="ccover">' + fig(ch.cover, 'cover', '16 / 9') + '</div></div></div>' +
    '<div class="wrap"><div class="cprog card"><div class="ov"><span>الدروس المقروءة</span><span class="pbar"><i style="width:' + pct(s.read, s.pages) + '%"></i></span><b class="lat">' + s.read + '/' + s.pages + '</b></div>' +
    '<div class="ov"><span>الكيسيام المحلول</span><span class="pbar"><i style="width:' + pct(s.qa, s.qn) + '%"></i></span><b class="lat">' + s.qa + '/' + s.qn + '</b></div></div>' +
    '<h2 class="h2">الدروس</h2><div class="secs">' + secs + '</div>' +
    '<h2 class="h2">الكيسيام</h2><div class="qgrid">' + qs + '</div>' +
    (nw ? '<p class="wrongline">لديك <b class="lat">' + nw + '</b> أخطاء في هذا الشابيطر. <a href="#/review/wrong' + ch.id + '/1">راجعها الآن ←</a></p>' : '') +
    '<h2 class="h2">أدوات المراجعة</h2><div class="tgrid">' + rev + '</div></div>';
  hydrate();
}

/* =================================================================
   صفحة الدرس (نص + صور توضيحية، أو الصفحة الأصلية)
   ================================================================= */
function page(ch, i) {
  const rid = renderId;
  const list = FLOW[ch.id], p = list[i], prev = list[i - 1], next = list[i + 1];
  if (!readP(p.n)) { prog.r[p.n] = now(); save(); }
  const secPages = list.filter((x) => x.sec === p.sec && x.rev === p.rev);
  const k = secPages.indexOf(p) + 1;
  const nav = (x, dir) => x ? '<a class="pn ' + dir + '" data-nav="' + dir + '" href="#/c/' + ch.id + '/p/' + x.n + '"><small>' + (dir === 'prev' ? '→ السابق' : 'التالي ←') + '</small><span class="lat">' + esc(x.t) + '</span></a>' : '<span class="pn empty"></span>';
  const endNext = next ? nav(next, 'next') : '<a class="pn next" data-nav="next" href="#/c/' + ch.id + '/q/official"><small>انتهت الدروس ←</small><span>انتقل إلى كيسيام الامتحانات</span></a>';
  VIEW.innerHTML = '<div class="wrap reader">' + crumbs([['CH ' + ch.id + ' · ' + esc(ch.ar), '#/c/' + ch.id], [esc(p.secAr)]]) +
    '<header class="rhead" style="--c:var(--c' + ch.id + ')"><div><p class="kick"><span>' + esc(p.secAr) + '</span>' + (p.rev ? '' : '<span class="lat"> · ' + esc(p.sec) + '</span>') + '</p><h1 class="lat">' + esc(p.t) + '</h1><p class="artitle" dir="rtl" data-artitle></p></div>' +
    '<div class="rmeta">' + star('p' + p.n, true) + '<span class="lat" dir="ltr">' + k + ' / ' + secPages.length + '</span><span class="sep"></span><span>صفحة <b class="lat">' + (i + 1) + '</b> من <b class="lat">' + list.length + '</b></span></div></header>' +
    '<div class="rbar"><i style="width:' + pct(i + 1, list.length) + '%;background:var(--c' + ch.id + ')"></i></div>' +
    '<div class="rtools">' + modeSwitch('p') + '</div>' +
    '<div class="lbody" id="lbody">' + (viewMode === 'orig' || !ch.text ? fig(p.img, 'zoomable page', '16 / 9') + '<p class="hint"><button type="button" class="btn sm" data-zoom>⤢ تكبير وملء الشاشة</button><span>على الهاتف: أدِر الشاشة أفقياً أو استعمل زر التكبير.</span></p>' : loading) + '</div>' +
    '<div class="pnav">' + nav(prev, 'prev') + endNext + '</div></div>';
  hydrate();
  chText(ch).then((T) => {
    if (rid !== renderId || !T) return;
    const P = T.pages[p.n];
    const at = $('[data-artitle]'); if (at && P && P.ar) at.textContent = P.ar;
    if (viewMode !== 'orig' && P) {
      $('#lbody').innerHTML = '<article class="lesson" style="--c:var(--c' + ch.id + ')">' + P.html + '</article>';
      hydrate($('#lbody'));
    }
  }).catch(() => { if (rid === renderId && viewMode !== 'orig') { $('#lbody').innerHTML = fig(p.img, 'zoomable page', '16 / 9'); hydrate(); } });
  prefetch(next && next.img);
}

/* =================================================================
   شاشة السؤال الموحّدة (تدريب · مراجعة · امتحان · تصحيح)
   ================================================================= */
function optRows(key, q, T, sel, r, locked) {
  const opts = q.opts.split('').map((L) => {
    const o = T && T.opts.find((x) => x.L === L);
    let c = 'orow';
    if (sel.indexOf(L) >= 0) c += ' on';
    if (r) { const good = q.ans.indexOf(L) >= 0, picked = r.s.indexOf(L) >= 0; c += good && picked ? ' good' : good ? ' miss' : picked ? ' bad' : ' dim'; }
    const body = o ? '<span class="ot">' + (o.en ? '<span class="oe" dir="ltr">' + o.en + '</span>' : '') + (o.ar ? '<span class="oa" dir="rtl">' + o.ar + '</span>' : '') + (o.fig || '') + '</span>' : '<span class="ot"></span>';
    const mark = r ? (q.ans.indexOf(L) >= 0 ? '<i class="om">✓</i>' : r.s.indexOf(L) >= 0 ? '<i class="om">✗</i>' : '') : '';
    return '<button type="button" class="' + c + '" data-opt="' + L + '"' + (locked ? ' disabled' : '') + ' aria-pressed="' + (sel.indexOf(L) >= 0) + '"><b class="ol lat">' + L + '</b>' + body + mark + '</button>';
  }).join('');
  return '<div class="olist" dir="ltr">' + opts + '</div>';
}
function letterRow(q, sel, r, locked) {
  return '<div class="opts">' + q.opts.split('').map((L) => {
    let c = 'opt';
    if (sel.indexOf(L) >= 0) c += ' on';
    if (r) { const good = q.ans.indexOf(L) >= 0, picked = r.s.indexOf(L) >= 0; c += good && picked ? ' good' : good ? ' miss' : picked ? ' bad' : ' dim'; }
    return '<button type="button" class="' + c + '" data-opt="' + L + '"' + (locked ? ' disabled' : '') + ' aria-pressed="' + (sel.indexOf(L) >= 0) + '"><b class="lat">' + L + '</b></button>';
  }).join('') + '</div>';
}
function qscreen(ctx) {
  CUR = ctx;
  const rid = renderId;
  const keys = ctx.keys, i = Math.max(0, Math.min(keys.length - 1, ctx.i)), key = keys[i], it = ITEMS[key], q = it.q;
  ctx.i = i;
  const mode = ctx.mode, live = mode === 'exam';
  const r = ctx.result(key);
  const sel = live ? (prog.exam.ans[key] || '').split('').filter(Boolean) : r ? r.s.split('') : (quizSel[key] || []);
  const locked = !!r || (live && (examLeft() <= 0 || (prog.exam.lock && prog.exam.lock[key])));
  ctx.locked = locked;
  const chips = keys.map((k, j) => { const st = ctx.chip(k, j); const dis = ctx.chipDisabled && ctx.chipDisabled(j); return dis ? '<span class="qc dis' + (j === i ? ' cur' : '') + '"><span class="lat">' + (j + 1) + '</span></span>' : '<a class="qc' + (j === i ? ' cur' : '') + (st ? ' ' + st : '') + '" href="' + ctx.href(j) + '" aria-label="سؤال ' + (j + 1) + '"><span class="lat">' + (ctx.num ? ctx.num(k, j) : j + 1) + '</span></a>'; }).join('');
  const verdict = r ? '<div class="verdict ' + (r.ok ? 'ok' : 'ko') + '" role="status"><b>' + (r.ok ? '✓ إجابة صحيحة' : r.s ? '✗ إجابة غير صحيحة' : '— لم تُجب عن هذا السؤال') + '</b><span>' + (r.s ? 'إجابتك: <b class="lat">' + esc(r.s) + '</b> · ' : '') + 'الصحيح: <b class="lat">' + esc(q.ans) + '</b></span></div>' : '';
  const years = q.years && q.years.length ? '<span class="yrs">ظهر في: <b class="lat">' + q.years.join(' · ') + '</b>' + (q.years.length > 1 ? ' <em class="lat">×' + q.years.length + '</em>' : '') + '</span>' : (it.set.key === 'proposed' ? '<span class="yrs">سؤال مقترح</span>' : '');
  const src = mode === 'practice' ? '' : '<a class="srcq" href="#/c/' + it.ch.id + '/q/' + it.set.key + '/' + (it.i + 1) + '" style="--c:var(--c' + it.ch.id + ')"><b class="lat">CH ' + it.ch.id + '</b> ' + KIND_AR[it.set.key] + ' · س<span class="lat">' + q.n + '</span></a>';
  const flagged = live && prog.exam.flag && prog.exam.flag[key];
  let action = '';
  if (live) action = '<button type="button" class="btn ghost2 flag' + (flagged ? ' on' : '') + '" data-q="flag">' + (flagged ? '⚑ مُعلَّم للمراجعة' : '⚐ علّم للمراجعة') + '</button>';
  else if (!r) action = '<button type="button" class="btn pri check" data-q="check"' + (sel.length ? '' : ' disabled') + '>تحقّق من الإجابة</button>';
  const prevB = i > 0 && !(ctx.noPrev) ? '<a class="btn" data-nav="prev" href="' + ctx.href(i - 1) + '">→ السابق</a>' : '<span></span>';
  const nextB = ctx.nextBtn ? ctx.nextBtn(i) : (i < keys.length - 1 ? '<a class="btn' + (r || live ? ' pri' : '') + '" data-nav="next" href="' + ctx.href(i + 1) + '">التالي ←</a>' : (ctx.end || '<span></span>'));
  const mid = mode === 'practice' && r ? '<button type="button" class="btn ghost2" data-q="retry">أعد هذا السؤال</button>' : '<span></span>';
  const textMode = !!it.ch.text;   // الأسئلة دائماً مكتوبة (الصورة تُستعمل فقط إن تعذّر النص)
  VIEW.innerHTML = '<div class="wrap quiz' + (live ? ' live' : '') + '" style="--c:var(--c' + (mode === 'practice' ? it.ch.id : 0) + ',var(--cyan2))">' + ctx.top +
    '<div class="qchips" aria-label="الأسئلة">' + chips + '</div>' +
    '<article class="qcard"><div class="qtop"><span class="qn">السؤال <b class="lat">' + (i + 1) + '</b> من <b class="lat">' + keys.length + '</b></span>' + src + years + (ctx.qtimer || '') + star(key) + '</div>' +
    '<div id="qbody">' + (textMode ? loading : fig(q.q, 'qimg zoomable', '9 / 4') + '<p class="zhint">اضغط على السؤال لتكبيره</p>') + '</div>' +
    '<div class="opick"><p>' + (r ? 'إجابتك:' : live ? 'اختر الإجابة أو الإجابات (تُحفظ تلقائياً، والتصحيح بعد التسليم):' : 'اختر الإجابة أو الإجابات الصحيحة (قد تكون أكثر من واحدة):') + '</p>' + (textMode ? '' : letterRow(q, sel, r, locked)) + action + '</div>' +
    verdict + (r ? '<div class="sol"><p class="solh">الحل والشرح</p><div id="sbody">' + (textMode ? loading : fig(q.s, 'simg zoomable', '9 / 3')) + '</div></div>' : '') +
    '<div class="qnav">' + prevB + mid + nextB + '</div></article>' +
    '<p class="kbd lat">A–F · Enter · ← →</p></div>';
  hydrate();
  if (textMode) {
    qText(key).then((T) => {
      if (rid !== renderId) return;
      if (!T) { $('#qbody').innerHTML = fig(q.q, 'qimg zoomable', '9 / 4'); hydrate(); return; }
      $('#qbody').innerHTML = '<div class="qtext">' + (T.en ? '<p class="stem" dir="ltr">' + T.en + '</p>' : '') + (T.ar ? '<p class="stem sa" dir="rtl">' + T.ar + '</p>' : '') + (T.fig || '') + '</div>' + optRows(key, q, T, sel, r, locked);
      const sb = $('#sbody'); if (sb) sb.innerHTML = '<div class="solt">' + T.s + '</div>';
      hydrate();
    }).catch(() => { if (rid === renderId) { $('#qbody').innerHTML = fig(q.q, 'qimg zoomable', '9 / 4') + letterRow(q, sel, r, locked); hydrate(); } });
  }
  const nk = keys[i + 1]; if (nk) prefetch(ITEMS[nk].q.q);
  const cur = $('.qc.cur'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
}
function scoreLine(keys, get) {
  const a = keys.filter((k) => get(k)).length, ok = keys.filter((k) => get(k) && get(k).ok).length;
  return { a: a, ok: ok, html: '<div class="qscore"><span>أجبت <b class="lat">' + a + '/' + keys.length + '</b></span><span class="okc">صحيح <b class="lat">' + ok + '</b></span><span class="koc">خطأ <b class="lat">' + (a - ok) + '</b></span></div>' };
}

/* ---------- 1) تدريب الشابيطر ---------- */
function practice(r) {
  const ch = r.ch, set = r.set, keys = SETKEYS[sk(ch.id, set.key)];
  const sc = scoreLine(keys, res), n = keys.length;
  const summary = sc.a === n ? '<div class="qsum card ' + (sc.ok / n >= 0.5 ? 'pass' : 'fail') + '"><div><small>النتيجة النهائية</small><b class="lat">' + sc.ok + ' / ' + n + '</b><span class="lat">' + pct(sc.ok, n) + '%</span></div>' +
    '<p>' + (sc.ok === n ? 'ممتاز! أجبت عن كل الأسئلة إجابة صحيحة.' : 'راجع الأسئلة الحمراء وشرحها، ثم أعد محاولتها.') + '</p>' +
    '<p class="acts">' + (sc.ok < n ? '<button type="button" class="btn pri" data-q="wrong">أعد الأخطاء فقط</button>' : '') + '<button type="button" class="btn" data-q="reset">ابدأ من جديد</button></p></div>' : '';
  const base = '#/c/' + ch.id + '/q/' + set.key + '/';
  qscreen({
    mode: 'practice', keys: keys, i: r.i, href: (j) => base + (j + 1), result: res,
    chip: (k) => res(k) ? (res(k).ok ? 'ok' : 'ko') : '', num: (k) => ITEMS[k].q.n,
    end: '<a class="btn" href="#/c/' + ch.id + '">رجوع للشابيطر</a>', set: set, ch: ch,
    top: crumbs([['CH ' + ch.id + ' · ' + esc(ch.ar), '#/c/' + ch.id], [esc(set.ar)]]) +
      '<header class="qhead"><div><p class="kick">' + (set.key === 'official' ? 'EXAM' : 'PROPOSED') + ' · <span class="lat">' + esc(ch.en) + '</span></p><h1>' + esc(set.ar) + '</h1></div>' + sc.html + '</header>' +
      '<div class="rbar"><i style="width:' + pct(sc.a, n) + '%;background:var(--c' + ch.id + ')"></i></div>' + summary
  });
}

/* ---------- 2) المراجعة: أخطائي · المفضلة · مراجعة اليوم ---------- */
function reviewList(src) {
  if (src === 'fav') return favKeys();
  if (src === 'today') return dueKeys();
  const m = /^wrong(\d*)$/.exec(src); if (!m) return [];
  return wrongKeys(m[1] ? parseInt(m[1], 10) : 0);
}
const REV_T = { today: ['مراجعة اليوم', '#/today'], fav: ['المفضلة', '#/fav'] };
function review(r) {
  if (!revLists[r.src] || (r.i === 0 && !revLists[r.src].some((k) => revRes[k]))) revLists[r.src] = reviewList(r.src);
  const keys = revLists[r.src];
  const isW = r.src.indexOf('wrong') === 0, cid = isW ? parseInt(r.src.slice(5), 10) || 0 : 0;
  const back = isW ? ['أخطائي', '#/mistakes'] : REV_T[r.src] || ['المراجعة', '#/'];
  const title = isW ? 'مراجعة الأخطاء' + (cid ? ' · CH ' + cid : '') : r.src === 'today' ? 'مراجعة اليوم' : 'مراجعة المفضلة';
  if (!keys.length) {
    const nextDue = Object.keys(prog.sr).map((k) => prog.sr[k]).filter((x) => x && !x.done).map((x) => x.due).sort((a, b) => a - b)[0];
    VIEW.innerHTML = '<div class="wrap narrow">' + crumbs([[title]]) +
      '<div class="empty card"><b>' + (r.src === 'today' ? 'لا توجد أسئلة للمراجعة اليوم 🎉' : isW ? 'لا توجد أخطاء للمراجعة 🎉' : 'لا توجد أسئلة في المفضلة') + '</b><p>' +
      (r.src === 'today' ? 'كل سؤال تخطئ فيه يعود إليك هنا بعد يوم، ثم بعد يومين، ثم 4، ثم 8، ثم 16 يوماً حتى تحفظه.' + (nextDue ? ' أقرب مراجعة: <b class="lat">' + new Date(nextDue).toLocaleDateString('fr-DZ') + '</b>.' : '') : isW ? 'كل الأسئلة التي أجبت عنها صحيحة. تابع حل الكيسيام أو جرّب امتحاناً تجريبياً.' : 'اضغط ☆ في أي سؤال لحفظه هنا.') +
      '</p><p class="acts"><a class="btn pri" href="#/exam">امتحان تجريبي</a><a class="btn" href="#/">الرئيسية</a></p></div></div>';
    return;
  }
  const get = (k) => revRes[k] || null;
  const sc = scoreLine(keys, get), n = keys.length;
  const summary = sc.a === n ? '<div class="qsum card ' + (sc.ok / n >= 0.5 ? 'pass' : 'fail') + '"><div><small>نتيجة المراجعة</small><b class="lat">' + sc.ok + ' / ' + n + '</b><span class="lat">' + pct(sc.ok, n) + '%</span></div><p>' + (r.src === 'today' ? 'الأسئلة الصحيحة تعود إليك بعد مدة أطول، والخاطئة تعود غداً.' : isW ? 'الأسئلة التي صححتها خرجت من قائمة «أخطائي».' : 'أنهيت مراجعة المفضلة.') + '</p><p class="acts"><button type="button" class="btn pri" data-q="again">مراجعة جديدة</button><a class="btn" href="' + back[1] + '">رجوع</a></p></div>' : '';
  qscreen({
    mode: 'review', keys: keys, i: r.i, href: (j) => (r.src === 'today' ? '#/today/' : '#/review/' + r.src + '/') + (j + 1), result: get,
    chip: (k) => get(k) ? (get(k).ok ? 'ok' : 'ko') : '', src: r.src,
    end: '<a class="btn" href="' + back[1] + '">إنهاء المراجعة</a>',
    top: crumbs((r.src === 'today' ? [] : [[back[0], back[1]]]).concat([[title]])) +
      '<header class="qhead"><div><p class="kick">' + (r.src === 'today' ? 'SPACED REPETITION' : 'REVIEW') + '</p><h1>' + title + '</h1></div>' + sc.html + '</header>' +
      '<div class="rbar"><i style="width:' + pct(sc.a, n) + '%;background:var(--cyan2)"></i></div>' + summary
  });
}

function mistakes() {
  const all = wrongKeys();
  const rows = M.chapters.map((ch) => {
    const w = wrongKeys(ch.id), done = SETKEYS[sk(ch.id, 'official')].concat(SETKEYS[sk(ch.id, 'proposed')] || []).filter(res).length;
    return '<div class="mrow" style="--c:var(--c' + ch.id + ')"><span class="cnum sm"><b class="lat">' + ch.id + '</b></span><span class="mt"><b>' + esc(ch.ar) + '</b><small class="lat">' + esc(ch.en) + '</small></span>' +
      '<span class="mc"><b class="lat">' + w.length + '</b> خطأ من <span class="lat">' + done + '</span> محلول</span>' +
      (w.length ? '<a class="btn sm pri" href="#/review/wrong' + ch.id + '/1">راجع</a>' : '<span class="okc">✓</span>') + '</div>';
  }).join('');
  const chips = all.map((k) => '<a class="mq" href="#/c/' + ITEMS[k].ch.id + '/q/' + ITEMS[k].set.key + '/' + (ITEMS[k].i + 1) + '" style="--c:var(--c' + ITEMS[k].ch.id + ')"><b class="lat">CH' + ITEMS[k].ch.id + '</b> ' + KIND_AR[ITEMS[k].set.key] + ' <span class="lat">' + ITEMS[k].q.n + '</span></a>').join('');
  VIEW.innerHTML = '<div class="wrap narrow">' + crumbs([['أخطائي']]) +
    '<header class="phead"><h1>أخطائي</h1><p>كل سؤال أجبت عنه خطأً، في التدريب أو في الامتحان التجريبي، يظهر هنا حتى تصححه.</p></header>' +
    '<div class="mhead card"><div><b class="lat big">' + all.length + '</b><span>سؤالاً تحتاج مراجعة</span></div>' + (all.length ? '<a class="btn pri" href="#/review/wrong/1">راجع كل الأخطاء ←</a>' : '<a class="btn pri" href="#/exam">جرّب امتحاناً تجريبياً</a>') + '</div>' +
    '<div class="mlist card">' + rows + '</div>' +
    (all.length ? '<h2 class="h2">الأسئلة</h2><div class="mqs">' + chips + '</div>' : '') + '</div>';
}

function favorites() {
  const pages = favPages(), qs = favKeys();
  const pl = pages.map((x) => '<a class="tile" href="#/c/' + x.ch.id + '/p/' + x.p.n + '" style="border-color:var(--c' + x.ch.id + ')"><b>' + esc(x.p.secAr) + ' <small class="lat">CH ' + x.ch.id + '</small></b><small class="lat">' + esc(x.p.t) + '</small></a>').join('');
  const ql = qs.map((k) => '<a class="mq" href="#/c/' + ITEMS[k].ch.id + '/q/' + ITEMS[k].set.key + '/' + (ITEMS[k].i + 1) + '" style="--c:var(--c' + ITEMS[k].ch.id + ')"><b class="lat">CH' + ITEMS[k].ch.id + '</b> ' + KIND_AR[ITEMS[k].set.key] + ' <span class="lat">' + ITEMS[k].q.n + '</span>' + (res(k) ? (res(k).ok ? ' <i class="okc">✓</i>' : ' <i class="koc">✗</i>') : '') + '</a>').join('');
  VIEW.innerHTML = '<div class="wrap narrow">' + crumbs([['المفضلة']]) +
    '<header class="phead"><h1>المفضلة</h1><p>اضغط على النجمة ☆ في أي صفحة درس أو سؤال ليُحفظ هنا.</p></header>' +
    (!pages.length && !qs.length ? '<div class="empty card"><b>لا شيء في المفضلة بعد</b><p>افتح أي درس أو سؤال واضغط ☆.</p></div>' : '') +
    (pages.length ? '<h2 class="h2">صفحات الدروس <small class="lat">' + pages.length + '</small></h2><div class="tgrid">' + pl + '</div>' : '') +
    (qs.length ? '<h2 class="h2">الأسئلة <small class="lat">' + qs.length + '</small></h2><p class="acts" style="margin:0 0 12px"><a class="btn pri" href="#/review/fav/1">راجع أسئلة المفضلة ←</a></p><div class="mqs">' + ql + '</div>' : '') + '</div>';
}

/* =================================================================
   البحث
   ================================================================= */
let IDX = null, searchTimer = 0;
function normS(s) {
  return String(s || '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ')
    .replace(/[ً-ْٰـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 8320)).replace(/[⁰¹²³⁴-⁹]/g, (c) => ({ '⁰': '0', '¹': '1', '²': '2', '³': '3' }[c] || String(c.charCodeAt(0) - 8304)))
    .replace(/\s+/g, ' ');
}
const plainText = (h) => String(h || '').replace(/<figure[\s\S]*?<\/figure>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
async function buildIndex() {
  if (IDX) return IDX;
  const out = [];
  for (const ch of M.chapters) {
    let T = null; try { T = await chText(ch); } catch (e) {}
    FLOW[ch.id].forEach((p) => {
      const P = T && T.pages[p.n];
      const body = P ? plainText(P.html) : '';
      out.push({ type: 'p', ch: ch, p: p, title: p.t, sub: (P && P.ar) || p.secAr, body: body, nt: normS(p.t + ' ' + ((P && P.ar) || '') + ' ' + p.secAr + ' ' + p.sec), nb: normS(body) });
    });
    Object.keys(ITEMS).filter((k) => ITEMS[k].ch.id === ch.id).forEach((k) => {
      const Q = T && T.q[k]; const it = ITEMS[k];
      const body = Q ? plainText(Q.en + ' ' + Q.ar + ' ' + Q.opts.map((o) => o.en + ' ' + o.ar).join(' ')) : '';
      out.push({ type: 'q', ch: ch, key: k, title: Q ? plainText(Q.en) : 'سؤال ' + it.q.n, sub: Q ? plainText(Q.ar) : '', body: body, nt: normS(Q ? Q.en + ' ' + Q.ar : ''), nb: normS(body + ' ' + (Q ? plainText(Q.s) : '')) });
    });
  }
  IDX = out; return out;
}
function snippet(text, terms) {
  const low = normS(text);
  let at = -1; for (const t of terms) { const j = low.indexOf(t); if (j >= 0 && (at < 0 || j < at)) at = j; }
  if (at < 0) return esc(text.slice(0, 160));
  const s = Math.max(0, at - 60), e = Math.min(text.length, at + 120);
  let frag = esc((s ? '…' : '') + text.slice(s, e) + (e < text.length ? '…' : ''));
  terms.forEach((t) => { if (t.length < 2 || /[؀-ۿ]/.test(t)) return; const re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'); frag = frag.replace(re, '<mark>$1</mark>'); });
  return frag;
}
async function runSearch(q) {
  const box = $('#sres'); if (!box) return;
  const terms = normS(q).trim().split(' ').filter((t) => t.length > 0);
  if (!terms.length) { box.innerHTML = '<p class="small">اكتب كلمة أو أكثر بالإنجليزية أو العربية: مثلاً <b class="lat">Hund</b>، <b class="lat">VSEPR</b>، «الكهروسلبية»، «نظائر».</p>'; return; }
  box.innerHTML = '<p class="small">جارٍ البحث…</p>';
  const idx = await buildIndex();
  if ($('#sq') && normS($('#sq').value).trim() !== terms.join(' ')) return;
  const hits = [];
  idx.forEach((d) => {
    let score = 0;
    for (const t of terms) { const a = d.nt.indexOf(t) >= 0, b = d.nb.indexOf(t) >= 0; if (!a && !b) return; score += a ? 3 : 1; }
    hits.push([score + (d.type === 'p' ? 0.5 : 0), d]);
  });
  hits.sort((x, y) => y[0] - x[0]);
  const pages = hits.filter((h) => h[1].type === 'p').slice(0, 30), qs = hits.filter((h) => h[1].type === 'q').slice(0, 40);
  const pr = pages.map(([, d]) => '<a class="sr" href="#/c/' + d.ch.id + '/p/' + d.p.n + '" style="--c:var(--c' + d.ch.id + ')"><span class="sbadge lat">CH ' + d.ch.id + '</span><b class="lat">' + esc(d.title) + '</b><small>' + esc(d.sub || '') + '</small><span class="snip" dir="auto">' + snippet(d.body, terms) + '</span></a>').join('');
  const qr = qs.map(([, d]) => { const it = ITEMS[d.key]; return '<a class="sr" href="#/c/' + it.ch.id + '/q/' + it.set.key + '/' + (it.i + 1) + '" style="--c:var(--c' + it.ch.id + ')"><span class="sbadge lat">CH ' + it.ch.id + ' · ' + KIND_AR[it.set.key] + ' ' + it.q.n + '</span><b class="lat" dir="ltr">' + esc(d.title) + '</b><small dir="rtl">' + esc(d.sub) + '</small></a>'; }).join('');
  box.innerHTML = (!pages.length && !qs.length ? '<div class="empty card"><b>لا نتائج</b><p>جرّب كلمة أخرى أو تهجئة مختلفة.</p></div>' : '') +
    (pages.length ? '<h2 class="h2">الدروس <small class="lat">' + pages.length + '</small></h2><div class="srs">' + pr + '</div>' : '') +
    (qs.length ? '<h2 class="h2">الأسئلة <small class="lat">' + qs.length + '</small></h2><div class="srs">' + qr + '</div>' : '');
}
function searchPage(q) {
  VIEW.innerHTML = '<div class="wrap narrow">' + crumbs([['البحث']]) +
    '<header class="phead"><h1>البحث في الدروس والأسئلة</h1></header>' +
    '<form class="sbox" data-search><input id="sq" type="search" name="q" value="' + esc(q || '') + '" placeholder="مثلاً: Slater، هوند، isotopes، الكهروسلبية…" aria-label="بحث" autocomplete="off"><button type="submit" class="btn pri">بحث</button></form>' +
    '<div id="sres"></div></div>';
  const inp = $('#sq'); inp.focus();
  inp.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { try { history.replaceState(null, '', '#/search/' + encodeURIComponent(inp.value)); } catch (e) {} runSearch(inp.value); }, 220);
  });
  runSearch(q || '');
}

/* =================================================================
   تقدّمي: منحنى النتائج + أضعف الشابيطرات
   ================================================================= */
function lineChart(points) {
  const W = 640, H = 220, L = 38, R = 14, T = 14, B = 30;
  const n = points.length, x = (i) => L + (n === 1 ? (W - L - R) / 2 : i * (W - L - R) / (n - 1)), y = (v) => T + (100 - v) * (H - T - B) / 100;
  let g = '';
  [0, 25, 50, 75, 100].forEach((v) => { g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="gl' + (v === 50 ? ' mid' : '') + '"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" class="ax" text-anchor="end">' + v + '%</text>'; });
  const path = points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' ');
  const area = path + ' L' + x(n - 1).toFixed(1) + ' ' + y(0) + ' L' + x(0).toFixed(1) + ' ' + y(0) + ' Z';
  const dots = points.map((p, i) => '<g class="pt"><circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="4.5"/><text x="' + x(i).toFixed(1) + '" y="' + (y(p.v) - 10).toFixed(1) + '" text-anchor="middle" class="vl">' + p.v + '%</text><text x="' + x(i).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" class="ax">' + esc(p.l) + '</text><title>' + esc(p.tip) + '</title></g>').join('');
  return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="تطور نتائج الامتحانات التجريبية" dir="ltr">' + g + '<path d="' + area + '" class="ar"/><path d="' + path + '" class="ln"/>' + dots + '</svg>';
}
function progressPage() {
  let tp = 0, tr = 0, tq = 0, ta = 0, tok = 0;
  const per = M.chapters.map((ch) => { const s = chStats(ch); tp += s.pages; tr += s.read; tq += s.qn; ta += s.qa; tok += s.qok; return { ch: ch, s: s }; });
  const hist = prog.hist.slice().reverse().slice(-15);
  const pts = hist.map((h) => ({ v: pct(h.ok, h.n), l: new Date(h.end).toLocaleDateString('fr-DZ', { day: '2-digit', month: '2-digit' }), tip: h.ok + '/' + h.n }));
  const best = prog.hist.reduce((m, h) => Math.max(m, pct(h.ok, h.n)), 0);
  const weak = per.filter((x) => x.s.qa >= 3).sort((a, b) => a.s.qok / a.s.qa - b.s.qok / b.s.qa);
  const bars = per.map((x) => { const acc = pct(x.s.qok, x.s.qa); return '<div class="pbrow" style="--c:var(--c' + x.ch.id + ')"><span class="pbl"><b class="lat">CH ' + x.ch.id + '</b> ' + esc(x.ch.ar) + '</span><span class="pbar"><i style="width:' + acc + '%"></i></span><b class="lat">' + (x.s.qa ? acc + '%' : '—') + '</b><small class="lat">' + x.s.qok + '/' + x.s.qa + '</small></div>'; }).join('');
  const sets = ['official', 'proposed'].map((kind) => { let a = 0, ok = 0; Object.keys(ITEMS).forEach((k) => { if (ITEMS[k].set.key === kind && res(k)) { a++; if (res(k).ok) ok++; } }); return '<span><b class="lat">' + pct(ok, a) + '%</b>' + (kind === 'official' ? 'صحيح في الأسئلة الرسمية' : 'صحيح في الأسئلة المقترحة') + '</span>'; }).join('');
  VIEW.innerHTML = '<div class="wrap narrow">' + crumbs([['تقدّمي']]) +
    '<header class="phead"><h1>تقدّمي</h1><p>نتائجك في الامتحانات التجريبية، ودقتك في كل شابيطر، لتعرف أين تركّز.</p></header>' +
    '<div class="kpis light"><span><b class="lat">' + pct(tr, tp) + '%</b>من الدروس مقروءة</span><span><b class="lat">' + ta + '/' + tq + '</b>سؤالاً محلولاً</span><span><b class="lat">' + pct(tok, ta) + '%</b>إجابات صحيحة</span><span><b class="lat">' + prog.hist.length + '</b>امتحاناً تجريبياً' + (best ? ' · أفضل <span class="lat">' + best + '%</span>' : '') + '</span>' + sets + '</div>' +
    '<h2 class="h2">تطور نتائج الامتحانات التجريبية</h2><div class="card chartbox">' + (pts.length ? lineChart(pts) : '<div class="empty"><b>لا توجد نتائج بعد</b><p>أجرِ أول امتحان تجريبي ليظهر منحنى تطورك هنا.</p><p class="acts"><a class="btn pri" href="#/exam">ابدأ امتحاناً</a></p></div>') + '</div>' +
    '<h2 class="h2">دقتك حسب الشابيطر</h2><div class="card pbars">' + bars + '</div>' +
    (weak.length ? '<h2 class="h2">أين تركّز الآن؟</h2><div class="weak">' + weak.slice(0, 3).map((x, j) => '<div class="wk card" style="--c:var(--c' + x.ch.id + ')"><span class="wn lat">' + (j + 1) + '</span><div><b>' + esc(x.ch.ar) + ' <small class="lat">CH ' + x.ch.id + '</small></b><p>دقتك <b class="lat">' + pct(x.s.qok, x.s.qa) + '%</b> · وزنه في الامتحان <b class="lat">' + x.ch.share + '%</b></p></div>' + (wrongKeys(x.ch.id).length ? '<a class="btn sm pri" href="#/review/wrong' + x.ch.id + '/1">راجع أخطاءه</a>' : '<a class="btn sm" href="#/c/' + x.ch.id + '">افتح الشابيطر</a>') + '</div>').join('') + '</div>' : '') +
    '</div>';
}

/* =================================================================
   الامتحان التجريبي
   ================================================================= */
function examLeft() {
  const e = prog && prog.exam; if (!e) return 0;
  if (e.mode === 'q') return Math.max(0, Math.round((e.qs + e.qdur * 1000 - now()) / 1000));
  return Math.max(0, Math.round((e.start + e.dur * 1000 - now()) / 1000));
}
function fmtT(s) { s = Math.max(0, s | 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); }
function fmtDur(sec) { const h = Math.floor(sec / 3600), m = Math.round(sec % 3600 / 60); return (h ? h + ' سا ' : '') + (m ? m + ' د' : (h ? '' : '0 د')); }
function onTick() {
  if (!ready || !prog.exam) return;
  const left = examLeft();
  $$('[data-timer]').forEach((el) => { el.textContent = fmtT(left); el.classList.toggle('warn', left <= (prog.exam.mode === 'q' ? 10 : 300)); });
  const live = $('.sl em.live'); if (live && $('.sl[href="#/exam"] em.live')) $('.sl[href="#/exam"] em.live').textContent = fmtT(left);
  if (left <= 0) { if (prog.exam.mode === 'q') advanceQ(true); else submitExam(true); }
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function poolFor(src, chs) {
  return Object.keys(ITEMS).filter((k) => chs.indexOf(ITEMS[k].ch.id) >= 0 && (src === 'all' || ITEMS[k].set.key === src));
}
function buildExam(n, src, chs, weighted) {
  const pool = poolFor(src, chs);
  if (!weighted) return shuffle(pool.slice()).slice(0, n);
  const by = {}; pool.forEach((k) => { (by[ITEMS[k].ch.id] = by[ITEMS[k].ch.id] || []).push(k); });
  const cs = M.chapters.filter((c) => by[c.id]);
  const total = cs.reduce((a, c) => a + c.share, 0);
  const quota = {}; let used = 0;
  cs.forEach((c) => { quota[c.id] = Math.min(by[c.id].length, Math.floor(n * c.share / total)); used += quota[c.id]; });
  const order = cs.slice().sort((a, b) => b.share - a.share);
  for (let g = 0; used < n && g < 2000; g++) { const c = order[g % order.length]; if (quota[c.id] < by[c.id].length) { quota[c.id]++; used++; } }
  const keys = [];
  cs.forEach((c) => { shuffle(by[c.id].slice()).slice(0, quota[c.id]).forEach((k) => keys.push(k)); });
  return shuffle(keys);
}
let exForm = null;
function examHome() {
  const e = prog.exam;
  const f = exForm || (exForm = { n: 40, src: 'official', chs: M.chapters.map((c) => c.id), weighted: true, tmode: 't', h: 1, m: 0, pq: 90 });
  const hist = prog.hist.map((h) => '<a class="hrow" href="#/exam/r/' + h.id + '"><span class="lat">' + new Date(h.end).toLocaleDateString('fr-DZ') + '</span><span>' + h.n + ' سؤالاً · ' + ({ all: 'رسمي + مقترح', proposed: 'مقترح', official: 'رسمي' }[h.src] || '') + (h.mode === 'q' ? ' · وقت لكل سؤال' : '') + '</span><b class="lat ' + (h.ok / h.n >= 0.5 ? 'okc' : 'koc') + '">' + h.ok + '/' + h.n + ' · ' + pct(h.ok, h.n) + '%</b><span class="lat">' + fmtT(h.used) + '</span></a>').join('');
  const cur = e ? '<div class="exnow card"><div><p class="kick">امتحان جارٍ</p><b><span class="lat">' + e.keys.length + '</span> سؤالاً · أجبت عن <span class="lat">' + Object.keys(e.ans).filter((k) => e.ans[k]).length + '</span></b><span class="timer lat" data-timer>' + fmtT(examLeft()) + '</span></div>' +
    '<p class="acts"><a class="btn pri" href="#/exam/q/' + ((e.mode === 'q' ? e.cur : 0) + 1) + '">تابع الامتحان ←</a><button type="button" class="btn" data-q="abandon">إلغاء الامتحان</button></p></div>' : '';
  if (e) {
    VIEW.innerHTML = '<div class="wrap narrow">' + crumbs([['امتحان تجريبي']]) + '<header class="phead"><h1>امتحان تجريبي</h1></header>' + cur + (hist ? '<h2 class="h2">نتائجك السابقة</h2><div class="hist card">' + hist + '</div>' : '') + '</div>';
    return;
  }
  const radio = (name, val, label, sub, on, dis) => '<label class="ropt' + (dis ? ' dis' : '') + '"><input type="radio" name="' + name + '" value="' + val + '"' + (on ? ' checked' : '') + (dis ? ' disabled' : '') + '><span><b>' + label + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</span></label>';
  const pool = poolFor(f.src, f.chs).length;
  const maxMin = EXAM_MAX[f.n] || Math.round(f.n * 1.5);
  const hOpts = []; for (let h = 0; h <= Math.floor(maxMin / 60); h++) hOpts.push('<option value="' + h + '"' + (h === f.h ? ' selected' : '') + '>' + h + '</option>');
  const mOpts = []; for (let m = 0; m < 60; m += 5) mOpts.push('<option value="' + m + '"' + (m === f.m ? ' selected' : '') + '>' + String(m).padStart(2, '0') + '</option>');
  const total = f.h * 60 + f.m, over = total > maxMin, zero = total <= 0;
  VIEW.innerHTML = '<div class="wrap narrow">' + crumbs([['امتحان تجريبي']]) +
    '<header class="phead"><h1>امتحان تجريبي</h1><p>اختر عدد الأسئلة ومصدرها والشابيطرات والوقت. الأسئلة عشوائية في كل مرة، ولا يظهر التصحيح إلا بعد التسليم، وتذهب أخطاؤك تلقائياً إلى «أخطائي» و«مراجعة اليوم».</p></header>' +
    '<div class="exset card" id="exset">' +
    '<h3>1 · عدد الأسئلة <small>متاح الآن: <b class="lat">' + pool + '</b></small></h3><div class="ropts five">' + [20, 40, 60, 80, 100].map((n) => radio('n', n, n + ' سؤالاً', 'حتى ' + fmtDur(EXAM_MAX[n] * 60), f.n === n, n > pool)).join('') + '</div>' +
    '<h3>2 · مصدر الأسئلة</h3><div class="ropts">' + radio('src', 'official', 'الامتحانات الرسمية', '99 سؤالاً (16/17 → 25/26)', f.src === 'official') + radio('src', 'proposed', 'الكيسيام المقترح', '81 سؤالاً', f.src === 'proposed') + radio('src', 'all', 'معاً', '180 سؤالاً', f.src === 'all') + '</div>' +
    '<h3>3 · الشابيطرات</h3><div class="chks">' + M.chapters.map((c) => '<label class="chk" style="--c:var(--c' + c.id + ')"><input type="checkbox" name="ch" value="' + c.id + '"' + (f.chs.indexOf(c.id) >= 0 ? ' checked' : '') + '><span><b class="lat">CH ' + c.id + '</b> ' + esc(c.ar) + '</span></label>').join('') + '</div>' +
    '<label class="tgl"><input type="checkbox" name="weighted"' + (f.weighted ? ' checked' : '') + '><span>وزّع الأسئلة حسب أهمية كل شابيطر في الامتحان الحقيقي</span></label>' +
    '<h3>4 · الوقت</h3><div class="ropts">' + radio('tmode', 't', 'وقت للامتحان كله', 'تتنقل بحرية بين الأسئلة', f.tmode === 't') + radio('tmode', 'q', 'وقت لكل سؤال', 'ينتقل تلقائياً عند انتهاء الوقت', f.tmode === 'q') + '</div>' +
    (f.tmode === 't' ? '<div class="tsel"><label>الساعات <select name="h">' + hOpts.join('') + '</select></label><label>الدقائق <select name="m">' + mOpts.join('') + '</select></label><span class="small">الحد الأقصى لـ <b class="lat">' + f.n + '</b> سؤالاً: <b>' + fmtDur(maxMin * 60) + '</b></span></div>' + (over ? '<p class="err">الوقت أكبر من الحد الأقصى، سيُضبط على ' + fmtDur(maxMin * 60) + '.</p>' : zero ? '<p class="err">اختر وقتاً أكبر من صفر.</p>' : '')
      : '<div class="tsel"><label>لكل سؤال <select name="pq">' + PERQ.map((s) => '<option value="' + s + '"' + (s === f.pq ? ' selected' : '') + '>' + (s < 60 ? s + ' ثانية' : (s % 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : s / 60) + ' دقيقة') + '</option>').join('') + '</select></label><span class="small">المدة الكلية: <b>' + fmtDur(f.pq * f.n) + '</b> · الحد الأقصى 5 دقائق للسؤال</span></div>') +
    '<p class="acts"><button type="button" class="btn pri big" data-q="startexam"' + (pool < 1 || f.n > pool || (f.tmode === 't' && zero) ? ' disabled' : '') + '>ابدأ الامتحان ⏱</button></p>' +
    (f.n > pool ? '<p class="err">عدد الأسئلة المتاحة (' + pool + ') أقل من ' + f.n + '. اختر عدداً أصغر أو أضف شابيطرات أو مصدراً آخر.</p>' : '') +
    '<p class="small">قاعدة التصحيح: يُحسب السؤال صحيحاً فقط إذا اخترت كل الإجابات الصحيحة ولا شيء غيرها.</p></div>' +
    (hist ? '<h2 class="h2">نتائجك السابقة</h2><div class="hist card">' + hist + '</div>' : '') + '</div>';
}
function readExForm() {
  const box = $('#exset'); if (!box) return;
  const v = (n) => { const x = $('input[name="' + n + '"]:checked', box); return x ? x.value : ''; };
  exForm.n = parseInt(v('n'), 10) || exForm.n; exForm.src = v('src') || exForm.src; exForm.tmode = v('tmode') || exForm.tmode;
  exForm.chs = $$('input[name="ch"]:checked', box).map((x) => parseInt(x.value, 10));
  const w = $('input[name="weighted"]', box); exForm.weighted = !!(w && w.checked);
  const hs = $('select[name="h"]', box), ms = $('select[name="m"]', box), ps = $('select[name="pq"]', box);
  if (hs) exForm.h = parseInt(hs.value, 10) || 0; if (ms) exForm.m = parseInt(ms.value, 10) || 0; if (ps) exForm.pq = parseInt(ps.value, 10) || 60;
}
function onExFormChange(e) {
  if (!e.target.closest('#exset')) return;
  const prevN = exForm.n;
  readExForm();
  if (e.target.name === 'n' && exForm.n !== prevN) { const mx = EXAM_MAX[exForm.n]; exForm.h = Math.floor(mx / 60); exForm.m = mx % 60; }
  const y = window.scrollY; examHome(); window.scrollTo(0, y);
}
document.addEventListener('change', (e) => { if (ready && parse().v === 'exam' && !prog.exam) onExFormChange(e); });
function startExam() {
  readExForm();
  const f = exForm, pool = poolFor(f.src, f.chs).length;
  if (!f.chs.length || f.n > pool) return;
  const keys = buildExam(f.n, f.src, f.chs, f.weighted);
  const id = 'x' + now().toString(36);
  if (f.tmode === 'q') {
    const pq = Math.min(300, Math.max(30, f.pq));
    prog.exam = { id: id, t: now(), start: now(), mode: 'q', qdur: pq, dur: pq * keys.length, cur: 0, qs: now(), lock: {}, keys: keys, ans: {}, flag: {}, src: f.src };
  } else {
    const maxMin = EXAM_MAX[f.n] || Math.round(f.n * 1.5);
    const mins = Math.max(1, Math.min(maxMin, f.h * 60 + f.m));
    prog.exam = { id: id, t: now(), start: now(), mode: 't', dur: mins * 60, keys: keys, ans: {}, flag: {}, src: f.src };
  }
  save(true); go('#/exam/q/1');
}
function advanceQ(auto) {
  const e = prog.exam; if (!e || e.mode !== 'q') return;
  const k = e.keys[e.cur]; if (k) e.lock[k] = 1;
  e.cur++; e.qs = now(); e.t = now();
  save(true);
  if (e.cur >= e.keys.length) { submitExam(auto); return; }
  go('#/exam/q/' + (e.cur + 1));
}
function examTop(e) {
  const ans = e.keys.filter((k) => e.ans[k]).length, fl = e.keys.filter((k) => e.flag && e.flag[k]).length;
  return crumbs([['امتحان تجريبي', '#/exam'], ['جارٍ']]) +
    '<header class="qhead exh"><div><p class="kick">MOCK EXAM' + (e.mode === 'q' ? ' · ' + fmtDur(e.qdur) + ' لكل سؤال' : '') + '</p><h1>امتحان تجريبي</h1></div><div class="qscore"><span class="timer lat" data-timer>' + fmtT(examLeft()) + '</span><span>أجبت <b class="lat">' + ans + '/' + e.keys.length + '</b></span>' + (fl ? '<span>⚑ <b class="lat">' + fl + '</b></span>' : '') +
    '<button type="button" class="btn sm pri" data-q="submit">تسليم</button></div></header>' +
    '<div class="rbar"><i style="width:' + pct(e.mode === 'q' ? e.cur : ans, e.keys.length) + '%;background:var(--cyan2)"></i></div>';
}
function examQ(i) {
  const e = prog.exam;
  if (!e) { go('#/exam'); return; }
  if (e.mode === 'q' && i !== e.cur) { go('#/exam/q/' + (e.cur + 1)); return; }
  const isQ = e.mode === 'q';
  qscreen({
    mode: 'exam', keys: e.keys, i: i, href: (j) => '#/exam/q/' + (j + 1), result: () => null,
    chip: (k) => (e.flag && e.flag[k] ? 'fl ' : '') + (e.ans[k] ? 'ans' : '') + (isQ && e.lock[k] ? ' lk' : ''),
    chipDisabled: isQ ? (j) => j !== e.cur : null, noPrev: isQ,
    nextBtn: isQ ? (j) => '<button type="button" class="btn pri" data-q="nextq">' + (j < e.keys.length - 1 ? 'التالي ←' : 'إنهاء وتسليم') + '</button>' : null,
    end: '<button type="button" class="btn pri" data-q="submit">تسليم الامتحان</button>',
    top: examTop(e)
  });
}
function submitExam(auto) {
  const e = prog.exam; if (!e) return;
  let ok = 0; const by = {};
  e.keys.forEach((k) => {
    const s = e.ans[k] || '', it = ITEMS[k]; if (!it) return;
    const good = !!s && s === norm(it.q.ans); if (good) ok++;
    by[it.ch.id] = by[it.ch.id] || [0, 0]; by[it.ch.id][1]++; if (good) by[it.ch.id][0]++;
    if (s) setRes(k, s, false);
  });
  const end = Math.min(now(), e.start + e.dur * 1000 + 2000);
  const h = { id: e.id, start: e.start, end: end, n: e.keys.length, ok: ok, used: Math.round((end - e.start) / 1000), dur: e.dur, src: e.src, mode: e.mode || 't', keys: e.keys, ans: e.ans, by: by, auto: !!auto };
  prog.hist.unshift(h); prog.hist = prog.hist.slice(0, 20);
  prog.exam = null; save(true);
  go('#/exam/r/' + h.id);
}
const histById = (id) => prog.hist.find((h) => h.id === id);
function examResult(id) {
  const h = histById(id);
  if (!h) { go('#/exam'); return; }
  const p = pct(h.ok, h.n), mark = Math.round(20 * h.ok / h.n * 10) / 10;
  const rows = M.chapters.filter((c) => h.by[c.id]).map((c) => { const b = h.by[c.id]; return '<div class="ov" style="--c:var(--c' + c.id + ')"><span><b class="lat">CH ' + c.id + '</b> ' + esc(c.ar) + '</span><span class="pbar"><i style="width:' + pct(b[0], b[1]) + '%"></i></span><b class="lat">' + b[0] + '/' + b[1] + '</b></div>'; }).join('');
  const chips = h.keys.map((k, j) => { const s = h.ans[k] || '', good = s && ITEMS[k] && s === norm(ITEMS[k].q.ans); return '<a class="qc ' + (good ? 'ok' : s ? 'ko' : 'na') + '" href="#/exam/r/' + h.id + '/' + (j + 1) + '"><span class="lat">' + (j + 1) + '</span></a>'; }).join('');
  const weak = M.chapters.filter((c) => h.by[c.id] && h.by[c.id][0] / h.by[c.id][1] < 0.5).map((c) => 'CH ' + c.id);
  VIEW.innerHTML = '<div class="wrap narrow">' + crumbs([['امتحان تجريبي', '#/exam'], ['النتيجة']]) +
    '<div class="exres card ' + (p >= 50 ? 'pass' : 'fail') + '"><div class="big"><b class="lat">' + mark + '</b><small>/ 20</small></div><div><p class="kick">' + (h.auto ? 'انتهى الوقت · سُلّم تلقائياً' : 'النتيجة') + '</p><h1><span class="lat">' + h.ok + ' / ' + h.n + '</span> إجابة صحيحة · <span class="lat">' + p + '%</span></h1>' +
    '<p>الوقت المستعمل <b class="lat">' + fmtT(h.used) + '</b> من <b class="lat">' + fmtT(h.dur) + '</b>' + (weak.length ? ' · ركّز على: <b class="lat">' + weak.join('، ') + '</b>' : '') + '</p>' +
    '<p class="acts"><a class="btn pri" href="#/exam/r/' + h.id + '/1">راجع الأسئلة مع الحل</a>' + (h.n - h.ok ? '<a class="btn" href="#/mistakes">أخطائي</a>' : '') + '<a class="btn" href="#/progress">تقدّمي</a><a class="btn" href="#/exam">امتحان جديد</a></p></div></div>' +
    '<h2 class="h2">حسب الشابيطر</h2><div class="card exby">' + rows + '</div>' +
    '<h2 class="h2">الأسئلة</h2><div class="qchips wrapc">' + chips + '</div><p class="small">أخضر: صحيح · أحمر: خطأ · رمادي: لم تُجب.</p></div>';
}
function examReview(id, i) {
  const h = histById(id);
  if (!h) { go('#/exam'); return; }
  const get = (k) => ({ s: h.ans[k] || '', ok: !!h.ans[k] && h.ans[k] === norm(ITEMS[k].q.ans) });
  qscreen({
    mode: 'examres', keys: h.keys.filter((k) => ITEMS[k]), i: i, href: (j) => '#/exam/r/' + id + '/' + (j + 1), result: get,
    chip: (k) => h.ans[k] ? (get(k).ok ? 'ok' : 'ko') : 'na',
    end: '<a class="btn" href="#/exam/r/' + id + '">رجوع للنتيجة</a>',
    top: crumbs([['امتحان تجريبي', '#/exam'], ['النتيجة', '#/exam/r/' + id], ['المراجعة']]) +
      '<header class="qhead"><div><p class="kick">MOCK EXAM · REVIEW</p><h1>تصحيح الامتحان</h1></div><div class="qscore"><span class="okc">صحيح <b class="lat">' + h.ok + '/' + h.n + '</b></span></div></header>'
  });
}

/* =================================================================
   التفاعل مع الأسئلة
   ================================================================= */
function paintOpt(L, on) { $$('[data-opt="' + L + '"]').forEach((b) => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); }
function toggleOpt(L) {
  const c = CUR; if (!c) return;
  const key = c.keys[c.i], q = ITEMS[key].q;
  if (q.opts.indexOf(L) < 0 || c.locked) return;
  if (c.mode === 'exam') {
    const e = prog.exam; if (!e || examLeft() <= 0) return;
    const s = (e.ans[key] || '').split('').filter(Boolean); const j = s.indexOf(L);
    if (j >= 0) s.splice(j, 1); else s.push(L);
    e.ans[key] = norm(s.join('')); e.t = now(); save();
    paintOpt(L, j < 0);
    const chip = $('.qc.cur'); if (chip) chip.classList.toggle('ans', !!e.ans[key]);
    const a = e.keys.filter((k) => e.ans[k]).length; const scb = $('.exh .qscore span:nth-child(2) b'); if (scb) scb.textContent = a + '/' + e.keys.length;
    if (e.mode !== 'q') { const bar = $('.quiz .rbar i'); if (bar) bar.style.width = pct(a, e.keys.length) + '%'; }
    return;
  }
  if (c.result(key)) return;
  const s = quizSel[key] || []; const j = s.indexOf(L);
  if (j >= 0) s.splice(j, 1); else s.push(L);
  quizSel[key] = s;
  paintOpt(L, j < 0);
  const ck = $('[data-q="check"]'); if (ck) ck.disabled = !s.length;
}
function check() {
  const c = CUR; if (!c || (c.mode !== 'practice' && c.mode !== 'review')) return;
  const key = c.keys[c.i], s = norm((quizSel[key] || []).join(''));
  if (!s) return;
  const ok = setRes(key, s, c.mode === 'review' && c.src === 'today');
  if (c.mode === 'review') revRes[key] = { s: s, ok: ok };
  delete quizSel[key]; save();
  const y = window.scrollY; router(); window.scrollTo(0, y);
  setTimeout(() => { const v = $('.verdict'); if (v && v.scrollIntoView) v.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 60);
}

/* =================================================================
   العارض المكبّر
   ================================================================= */
const ZL = [1, 1.5, 2, 3];
let vz = 0, vrot = false, vimg = null;
function openViewer(src, title) {
  vz = 0;
  const st = $('#vstage');
  st.innerHTML = '<img alt="" draggable="false"><i class="wm" style="background-image:' + watermark() + '"></i>';
  vimg = st.querySelector('img'); vimg.onload = layoutViewer; vimg.src = src;
  $('#vtitle').textContent = title || '';
  $('#viewer').hidden = false; document.body.classList.add('noscroll');
  vrot = false;
  if (window.innerHeight > window.innerWidth * 1.2) { const tmp = new Image(); tmp.onload = () => { vrot = tmp.naturalWidth > tmp.naturalHeight * 1.25; layoutViewer(); }; tmp.src = src; }
  layoutViewer();
}
function layoutViewer() {
  if (!vimg || !vimg.naturalWidth) return;
  const box = $('#vscroll'), st = $('#vstage'), z = ZL[vz];
  const W = box.clientWidth, H = box.clientHeight, r = vimg.naturalHeight / vimg.naturalWidth;
  let iw, ih;
  if (!vrot) { iw = Math.min(W, H / r) * z; ih = iw * r; st.style.width = iw + 'px'; st.style.height = ih + 'px'; vimg.style.cssText = 'width:' + iw + 'px;height:' + ih + 'px'; }
  else { iw = Math.min(H, W / r) * z; ih = iw * r; st.style.width = ih + 'px'; st.style.height = iw + 'px'; vimg.style.cssText = 'width:' + iw + 'px;height:' + ih + 'px;transform-origin:0 0;transform:translateX(' + ih + 'px) rotate(90deg)'; }
  $('#vzoom').textContent = Math.round(z * 100) + '%';
}
function closeViewer() { $('#viewer').hidden = true; $('#vstage').innerHTML = ''; vimg = null; document.body.classList.remove('noscroll'); }
window.addEventListener('resize', () => { if (!$('#viewer').hidden) layoutViewer(); });

/* =================================================================
   الأحداث
   ================================================================= */
function arm(btn, label, fn) {
  if (btn.dataset.armed === '1') { fn(); return; }
  const orig = btn.textContent; btn.dataset.armed = '1'; btn.textContent = label;
  setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = orig; } }, 4000);
}
document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-search]'); if (!f) return;
  e.preventDefault();
  const q = (f.querySelector('input[name="q"]') || {}).value || '';
  if (parse().v === 'search') runSearch(q); else go('#/search/' + encodeURIComponent(q));
});
document.addEventListener('click', async (e) => {
  const t = e.target;
  const a = t.closest('[data-act]');
  if (a) {
    const act = a.dataset.act;
    if (act === 'login') { try { await signIn(); } catch (err) { if (!(err && err.code === 'auth/popup-closed-by-user')) gLogin(friendly(err)); } }
    else if (act === 'logout') { if (pushTimer) await push(); clearInterval(tick); quizSel = {}; revRes = {}; revLists = {}; IDX = null; Object.keys(TXT).forEach((k) => delete TXT[k]); wmUrl = ''; ready = false; cloud = 'off'; await signOutUser(); }
    else if (act === 'request') { a.disabled = true; try { await sendRequest(me); gPending(me); } catch (err) { gError(friendly(err)); } }
    else if (act === 'recheck') onUser(me);
    else if (act === 'install' && installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch (e2) {} installEvt = null; renderUser(); }
    return;
  }
  if (t.closest('#menuBtn')) { SIDE.classList.contains('show') ? closeSide() : openSide(); return; }
  if (t.closest('#searchBtn')) { go('#/search'); return; }
  if (t.closest('#scrim')) { closeSide(); return; }
  const md = t.closest('[data-mode]');
  if (md) { viewMode = md.dataset.mode; try { localStorage.setItem('gueschemi.view', viewMode); } catch (e2) {} const y = window.scrollY; router(); window.scrollTo(0, y); return; }
  const f = t.closest('[data-fav]');
  if (f) {
    const id = f.dataset.fav, on = !isFav(id);
    prog.f[id] = { on: on ? 1 : 0, t: now() }; save();
    f.classList.toggle('on', on); f.setAttribute('aria-pressed', String(on));
    f.firstChild.textContent = on ? '★' : '☆';
    const lab = f.querySelector('span'); if (lab) lab.textContent = on ? 'في المفضلة' : 'أضف للمفضلة';
    side(parse());
    return;
  }
  const o = t.closest('[data-opt]');
  if (o && !o.disabled && !t.closest('figure.zoomable.ok')) { toggleOpt(o.dataset.opt); return; }
  const qb = t.closest('[data-q]');
  if (qb) {
    const cmd = qb.dataset.q;
    if (cmd === 'check') { check(); return; }
    if (cmd === 'startexam') { startExam(); return; }
    if (cmd === 'nextq') { advanceQ(false); return; }
    if (cmd === 'abandon') { arm(qb, 'تأكيد: إلغاء الامتحان؟', () => { prog.exam = null; save(true); router(); }); return; }
    if (cmd === 'submit') {
      const ex = prog.exam; if (!ex) return;
      const left = ex.keys.filter((k) => !ex.ans[k]).length;
      arm(qb, left ? 'بقي ' + left + ' دون إجابة، سلّم؟' : 'تأكيد التسليم؟', () => submitExam(false));
      return;
    }
    if (cmd === 'flag') { const ex = prog.exam, c = CUR; if (!ex || !c) return; const k = c.keys[c.i]; ex.flag = ex.flag || {}; ex.flag[k] = !ex.flag[k]; save(); const y = window.scrollY; router(); window.scrollTo(0, y); return; }
    if (cmd === 'again') { const c = CUR; if (c && c.src) { c.keys.forEach((k) => delete revRes[k]); delete revLists[c.src]; go(c.src === 'today' ? '#/today/1' : '#/review/' + c.src + '/1'); } return; }
    const c = CUR; if (!c || c.mode !== 'practice') return;
    const keys = c.keys;
    if (cmd === 'retry') { clearRes(keys[c.i]); save(); router(); }
    else if (cmd === 'wrong') {
      const w = keys.filter((k) => res(k) && !res(k).ok); w.forEach(clearRes); save();
      go('#/c/' + c.ch.id + '/q/' + c.set.key + '/' + (keys.indexOf(w[0]) + 1));
    } else if (cmd === 'reset') {
      arm(qb, 'تأكيد: مسح كل الإجابات؟', () => { keys.forEach(clearRes); save(); go('#/c/' + c.ch.id + '/q/' + c.set.key + '/1'); });
    }
    return;
  }
  const z = t.closest('[data-zoom]') ? $('figure.zoomable.ok', VIEW) : t.closest('figure.zoomable.ok');
  if (z) { const im = z.querySelector('img'); if (im) openViewer(im.src, (($('.rhead h1') || $('.qn') || {}).textContent) || ''); return; }
  const v = t.closest('[data-v]');
  if (v) {
    const cv = v.dataset.v;
    if (cv === 'close') closeViewer();
    else if (cv === 'in') { vz = Math.min(ZL.length - 1, vz + 1); layoutViewer(); }
    else if (cv === 'out') { vz = Math.max(0, vz - 1); layoutViewer(); }
    else if (cv === 'rot') { vrot = !vrot; layoutViewer(); }
  }
});

document.addEventListener('keydown', (e) => {
  const k = (e.key || '').toLowerCase();
  const typing = /input|textarea|select/i.test((e.target.tagName || ''));
  if ((e.ctrlKey || e.metaKey) && ['c', 'x', 's', 'p', 'u'].indexOf(k) >= 0 && !(typing && ['c', 'x'].indexOf(k) >= 0)) { e.preventDefault(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'a' && !typing) { e.preventDefault(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!$('#viewer').hidden) { if (k === 'escape') closeViewer(); else if (k === '+' || k === '=') { vz = Math.min(ZL.length - 1, vz + 1); layoutViewer(); } else if (k === '-') { vz = Math.max(0, vz - 1); layoutViewer(); } return; }
  if (!ready || typing) return;
  if (k === '/') { go('#/search'); e.preventDefault(); return; }
  if (CUR) {
    if (/^[a-f]$/.test(k)) { toggleOpt(k.toUpperCase()); e.preventDefault(); return; }
    if (k === 'enter') { const c = $('[data-q="check"]'); if (c && !c.disabled) { check(); e.preventDefault(); return; } const nq = $('[data-q="nextq"]'); if (nq) { advanceQ(false); e.preventDefault(); } return; }
  }
  if (k === 'arrowleft') { const n = $('[data-nav="next"]'); if (n && n.href) { location.href = n.href; e.preventDefault(); } }
  if (k === 'arrowright') { const p = $('[data-nav="prev"]'); if (p && p.href) { location.href = p.href; e.preventDefault(); } }
});

['contextmenu', 'copy', 'cut', 'dragstart', 'selectstart'].forEach((ev) => document.addEventListener(ev, (e) => {
  if (/input|textarea/i.test((e.target && e.target.tagName) || '')) return;
  e.preventDefault();
}));

watchUser(onUser);
