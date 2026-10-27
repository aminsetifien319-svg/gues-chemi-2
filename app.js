// Gues Chemi: دخول Google ← فحص القبول ← الفهرس من Firestore ← الدروس، الكيسيام، الامتحان التجريبي، الأخطاء، المفضلة.
import {
  watchUser, signIn, signOutUser, getAccess, sendRequest, loadManifest, getImage,
  loadProgress, saveProgress, configMissing
} from './firebase.js';

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const VIEW = $('#view'), GATE = $('#gate'), SIDE = $('#side');
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const now = () => Date.now();
const norm = (s) => String(s || '').split('').sort().join('');
const KIND_AR = { official: 'رسمي', proposed: 'مقترح' };

let me = null, isAdmin = false, M = null, prog = null, KEY = '', ready = false;
let FLOW = {};        // chapter id → ordered pages
let ITEMS = {};       // question key (c3o5) → { key, ch, set, q, i }
let SETKEYS = {};     // 'c3o' → [keys]
let quizSel = {};     // unchecked selections (practice / review)
let revRes = {}, revLists = {};   // review session answers & frozen lists
let CUR = null;       // current question screen context
let cloud = 'off';    // 'on' | 'off' | 'err'
let pushTimer = 0, tick = 0, installEvt = null;

/* =================================================================
   التقدّم: محفوظ في المتصفح + في حساب الطالب (Firestore)
   ================================================================= */
function blank() { return { v: 3, r: {}, a: {}, f: {}, last: '', lastT: 0, exam: null, hist: [] }; }
function upgrade(p) {
  if (!p || typeof p !== 'object') return blank();
  const out = blank();
  if (p.v === 3) return Object.assign(out, p, { r: p.r || {}, a: p.a || {}, f: p.f || {}, hist: p.hist || [] });
  // نسخة v2: q[setKey][n] = {s, ok}
  out.r = p.r || {}; out.last = p.last || '';
  Object.keys(p.q || {}).forEach((sk) => Object.keys(p.q[sk] || {}).forEach((n) => { const x = p.q[sk][n]; if (x && x.s) out.a[sk + n] = { s: x.s, ok: !!x.ok, t: 1 }; }));
  return out;
}
function readLocal() {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem('gueschemi.v2:' + me.email);
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
  o.r = mergeMap(a.r, b.r); o.a = mergeMap(a.a, b.a); o.f = mergeMap(a.f, b.f);
  const L = (a.lastT || 0) >= (b.lastT || 0) ? a : b; o.last = L.last; o.lastT = L.lastT || 0;
  const H = {}; (a.hist || []).concat(b.hist || []).forEach((h) => { if (h && h.id) H[h.id] = h; });
  o.hist = Object.keys(H).map((k) => H[k]).sort((x, y) => y.end - x.end).slice(0, 15);
  const E = [a.exam, b.exam].filter(Boolean).sort((x, y) => y.start - x.start)[0] || null;
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
  try { await saveProgress(me.email, JSON.stringify(prog)); cloud = 'on'; }
  catch (e) { cloud = 'err'; }
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
function setRes(key, s) { prog.a[key] = { s: s, ok: s === norm(ITEMS[key].q.ans), t: now() }; }
function clearRes(key) { if (prog.a[key]) prog.a[key] = { d: 1, t: now() }; }
const readP = (n) => !!prog.r[n];
function chStats(ch) {
  const pages = FLOW[ch.id], read = pages.filter((p) => readP(p.n)).length;
  let qn = 0, qa = 0, qok = 0;
  ch.qcm.forEach((set) => SETKEYS[sk(ch.id, set.key)].forEach((k) => { qn++; const x = res(k); if (x) { qa++; if (x.ok) qok++; } }));
  return { pages: pages.length, read: read, qn: qn, qa: qa, qok: qok };
}
const sk = (cid, kind) => 'c' + cid + kind[0];
const wrongKeys = (cid) => Object.keys(ITEMS).filter((k) => (!cid || ITEMS[k].ch.id === cid) && res(k) && !res(k).ok);
const favKeys = () => Object.keys(ITEMS).filter((k) => isFav(k));
const favPages = () => { const out = []; M.chapters.forEach((ch) => FLOW[ch.id].forEach((p) => { if (isFav('p' + p.n)) out.push({ ch: ch, p: p }); })); return out; };

/* =================================================================
   شاشات الدخول
   ================================================================= */
function gate(inner) {
  ready = false; VIEW.hidden = true; VIEW.innerHTML = ''; SIDE.hidden = true; $('#menuBtn').hidden = true; closeSide();
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

/* =================================================================
   المسار الرئيسي
   ================================================================= */
async function onUser(u) {
  me = u; isAdmin = false; M = null; cloud = 'off';
  renderUser();
  if (!u) { gLogin(); return; }
  KEY = 'gueschemi.v3:' + u.email;
  gate('<p>جارٍ التحقق من حسابك…</p>');
  try {
    const acc = await getAccess(u.email);
    if (acc === 'admin' || acc === 'allowed') {
      isAdmin = (acc === 'admin');
      M = await loadManifest();
      if (!M || !M.chapters || !M.chapters.length) {
        renderUser();
        return gError(isAdmin ? 'لم يُرفع المحتوى بعد. افتح صفحة الإدارة وارفع ملفات المحتوى.' : 'المحتوى غير متاح حالياً، حاول لاحقاً.',
          isAdmin ? acts('<a class="btn pri" href="admin.html">صفحة الإدارة</a>') : '');
      }
      let remote = null;
      try { const j = await loadProgress(u.email); remote = j ? upgrade(JSON.parse(j)) : null; cloud = 'on'; }
      catch (e) { cloud = 'off'; }
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
  VIEW.hidden = false; SIDE.hidden = false; $('#menuBtn').hidden = false;
  renderUser();
  clearInterval(tick); tick = setInterval(onTick, 1000);
  router();
}

/* ---------- التنقل ---------- */
function parse() {
  const h = (location.hash || '#/').replace(/^#\/?/, '').split('/').filter(Boolean);
  const n = (x) => parseInt(x, 10) || 1;
  if (!h.length) return { v: 'home' };
  if (h[0] === 'stats') return { v: 'stats' };
  if (h[0] === 'mistakes') return { v: 'mistakes' };
  if (h[0] === 'fav') return { v: 'fav' };
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
  CUR = null;
  if (r.v === 'home') home();
  else if (r.v === 'stats') stats();
  else if (r.v === 'chapter') chapter(r.ch);
  else if (r.v === 'page') page(r.ch, r.i);
  else if (r.v === 'quiz') practice(r);
  else if (r.v === 'mistakes') mistakes();
  else if (r.v === 'fav') favorites();
  else if (r.v === 'review') review(r);
  else if (r.v === 'exam') examHome();
  else if (r.v === 'examq') examQ(r.i);
  else if (r.v === 'examr') examResult(r.id);
  else if (r.v === 'examrq') examReview(r.id, r.i);
  if (r.v === 'page' || r.v === 'quiz' || r.v === 'chapter') { prog.last = location.hash; prog.lastT = now(); save(); }
  side(r);
  closeSide();
}
window.addEventListener('hashchange', () => { router(); window.scrollTo(0, 0); });
const go = (h) => { if (location.hash === h) router(); else location.hash = h; };

/* ---------- القائمة الجانبية ---------- */
function side(r) {
  const cur = (r.ch && r.ch.id) || 0;
  const nw = wrongKeys().length, nf = favKeys().length + favPages().length;
  const ex = prog.exam ? '<em class="lat live">' + fmtT(remain()) + '</em>' : '';
  let h = '<nav aria-label="الفهرس"><a class="sl' + (r.v === 'home' ? ' on' : '') + '" href="#/"><i class="ico">⌂</i>الرئيسية</a>' +
    '<a class="sl' + (r.v === 'stats' ? ' on' : '') + '" href="#/stats"><i class="ico">▤</i>الإحصائيات وخطة المراجعة</a>' +
    '<p class="sh">أدوات المراجعة</p>' +
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
  return '<figure class="pg ' + (cls || '') + '" data-img="' + esc(id) + '" style="aspect-ratio:' + (ratio || '16 / 9') + '"><span class="sk"></span><i class="wm" style="background-image:' + watermark() + '"></i></figure>';
}
function hydrate(root) {
  $$('figure[data-img]', root || VIEW).forEach((f) => {
    if (f.dataset.done) return;
    f.dataset.done = '1';
    getImage(f.dataset.img).then((src) => {
      const im = new Image();
      im.alt = ''; im.draggable = false; im.decoding = 'async';
      im.onload = () => { f.style.aspectRatio = im.naturalWidth + ' / ' + im.naturalHeight; f.classList.add('ok'); };
      im.src = src;
      f.insertBefore(im, f.firstChild);
    }).catch(() => { f.classList.add('bad'); f.querySelector('.sk').textContent = 'تعذّر تحميل الصورة. تحقق من الاتصال ثم حدّث الصفحة.'; });
  });
}
function prefetch(id) { if (id) getImage(id).catch(() => {}); }
const star = (id, label) => '<button type="button" class="star' + (isFav(id) ? ' on' : '') + '" data-fav="' + esc(id) + '" aria-pressed="' + isFav(id) + '" title="أضف إلى المفضلة">' + (isFav(id) ? '★' : '☆') + (label ? '<span>' + (isFav(id) ? 'في المفضلة' : 'أضف للمفضلة') + '</span>' : '') + '</button>';

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
  const nw = wrongKeys().length, nf = favKeys().length + favPages().length, lastEx = prog.hist[0];
  VIEW.innerHTML =
    '<div class="hero"><div class="hero-in"><p class="kick lat">General Chemistry · 1st-year Pharmacy</p>' +
    '<h1>' + (first ? 'أهلاً ' + esc(first) + '، ' : '') + 'الكيمياء العامة كاملة، شابيطر بشابيطر</h1>' +
    '<p class="lead">اقرأ كل درس على حدة، حلّ كيسيام الامتحانات والكيسيام المقترح، ثم اختبر نفسك في امتحان تجريبي بالوقت.</p>' +
    '<div class="kpis"><span><b class="lat">' + nOff + '</b>كيسيام رسمي محلول</span><span><b class="lat">' + nPro + '</b>كيسيام مقترح</span><span><b class="lat">' + tp + '</b>صفحة دروس</span><span><b class="lat">' + M.chapters.length + '</b>شابيطرات</span></div>' +
    '<p class="acts">' + (prog.last ? '<a class="btn pri" href="' + esc(prog.last) + '">تابع من حيث توقفت ←</a>' : '<a class="btn pri" href="#/c/1">ابدأ بالشابيطر الأول ←</a>') + '<a class="btn ghost" href="#/exam">امتحان تجريبي</a></p>' +
    '</div></div>' +
    '<div class="wrap"><div class="overall card"><div><b>تقدّمك العام</b>' + cloudBadge() + '</div>' +
    '<div class="ov"><span>الدروس</span><span class="pbar"><i style="width:' + pct(tr, tp) + '%"></i></span><b class="lat">' + pct(tr, tp) + '%</b></div>' +
    '<div class="ov"><span>الكيسيام</span><span class="pbar"><i style="width:' + pct(ta, tq) + '%"></i></span><b class="lat">' + pct(ta, tq) + '%</b></div>' +
    '<div class="ov"><span>الإجابات الصحيحة</span><span class="pbar ok"><i style="width:' + pct(tok, ta) + '%"></i></span><b class="lat">' + pct(tok, ta) + '%</b></div></div>' +
    '<div class="tools">' +
    '<a class="tool exam" href="#/exam"><i>⏱</i><b>' + (prog.exam ? 'امتحان جارٍ' : 'امتحان تجريبي') + '</b><small>' + (prog.exam ? 'الوقت المتبقي <span class="lat" data-timer>' + fmtT(remain()) + '</span>' : lastEx ? 'آخر نتيجة: <span class="lat">' + lastEx.ok + '/' + lastEx.n + '</span> (' + pct(lastEx.ok, lastEx.n) + '%)' : 'أسئلة من كل الشابيطرات بالوقت، كالامتحان الحقيقي') + '</small></a>' +
    '<a class="tool wrong" href="#/mistakes"><i>✗</i><b>أخطائي</b><small>' + (nw ? '<span class="lat">' + nw + '</span> سؤالاً تحتاج مراجعة' : 'لا أخطاء الآن') + '</small></a>' +
    '<a class="tool fav" href="#/fav"><i>★</i><b>المفضلة</b><small>' + (nf ? '<span class="lat">' + nf + '</span> عنصراً محفوظاً' : 'احفظ أي درس أو سؤال بالنجمة') + '</small></a></div>' +
    '<h2 class="h2">الشابيطرات</h2><div class="cgrid">' + cards + '</div></div>';
}

/* =================================================================
   الإحصائيات
   ================================================================= */
function stats() {
  VIEW.innerHTML = '<div class="wrap narrow"><nav class="crumb"><a href="#/">الرئيسية</a><span>›</span><b>الإحصائيات</b></nav>' +
    '<header class="phead"><h1>الإحصائيات وخطة المراجعة</h1><p>تحليل أسئلة الامتحانات الرسمية من 16/17 إلى 25/26: أهمية كل شابيطر، المواضيع المتكررة، وكيف توزع وقت مراجعتك.</p></header>' +
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
   صفحة الدرس
   ================================================================= */
function page(ch, i) {
  const list = FLOW[ch.id], p = list[i], prev = list[i - 1], next = list[i + 1];
  if (!readP(p.n)) { prog.r[p.n] = now(); save(); }
  const secPages = list.filter((x) => x.sec === p.sec && x.rev === p.rev);
  const k = secPages.indexOf(p) + 1;
  const nav = (x, dir) => x ? '<a class="pn ' + dir + '" href="#/c/' + ch.id + '/p/' + x.n + '"><small>' + (dir === 'prev' ? '→ السابق' : 'التالي ←') + '</small><span class="lat">' + esc(x.t) + '</span></a>' : '<span class="pn empty"></span>';
  const endNext = next ? nav(next, 'next') : '<a class="pn next" href="#/c/' + ch.id + '/q/official"><small>انتهت الدروس ←</small><span>انتقل إلى كيسيام الامتحانات</span></a>';
  VIEW.innerHTML = '<div class="wrap reader"><nav class="crumb"><a href="#/">الرئيسية</a><span>›</span><a href="#/c/' + ch.id + '">CH ' + ch.id + ' · ' + esc(ch.ar) + '</a><span>›</span><b>' + esc(p.secAr) + '</b></nav>' +
    '<header class="rhead" style="--c:var(--c' + ch.id + ')"><div><p class="kick"><span>' + esc(p.secAr) + '</span>' + (p.rev ? '' : '<span class="lat"> · ' + esc(p.sec) + '</span>') + '</p><h1 class="lat">' + esc(p.t) + '</h1></div>' +
    '<div class="rmeta">' + star('p' + p.n, true) + '<span class="lat" dir="ltr">' + k + ' / ' + secPages.length + '</span><span class="sep"></span><span>صفحة <b class="lat">' + (i + 1) + '</b> من <b class="lat">' + list.length + '</b></span></div></header>' +
    '<div class="rbar"><i style="width:' + pct(i + 1, list.length) + '%;background:var(--c' + ch.id + ')"></i></div>' +
    fig(p.img, 'zoomable page', '16 / 9') +
    '<p class="hint"><button type="button" class="btn sm" data-zoom>⤢ تكبير وملء الشاشة</button><span>على الهاتف: أدِر الشاشة أفقياً أو استعمل زر التكبير.</span></p>' +
    '<div class="pnav">' + nav(prev, 'prev') + endNext + '</div></div>';
  hydrate();
  prefetch(next && next.img); prefetch(prev && prev.img);
}

/* =================================================================
   شاشة السؤال الموحّدة (تدريب · مراجعة · امتحان · تصحيح الامتحان)
   ================================================================= */
function qscreen(ctx) {
  CUR = ctx;
  const keys = ctx.keys, i = Math.max(0, Math.min(keys.length - 1, ctx.i)), key = keys[i], it = ITEMS[key], q = it.q;
  ctx.i = i;
  const mode = ctx.mode, live = mode === 'exam';
  const r = ctx.result(key);              // {s, ok} or null
  const sel = live ? (prog.exam.ans[key] || '').split('').filter(Boolean) : r ? r.s.split('') : (quizSel[key] || []);
  const locked = !!r || (live && remain() <= 0);
  const chips = keys.map((k, j) => { const st = ctx.chip(k); return '<a class="qc' + (j === i ? ' cur' : '') + (st ? ' ' + st : '') + '" href="' + ctx.href(j) + '" aria-label="سؤال ' + (j + 1) + '"><span class="lat">' + (ctx.num ? ctx.num(k, j) : j + 1) + '</span></a>'; }).join('');
  const opts = q.opts.split('').map((L) => {
    let c = 'opt';
    if (sel.indexOf(L) >= 0) c += ' on';
    if (r) { const good = q.ans.indexOf(L) >= 0, picked = r.s.indexOf(L) >= 0; c += good && picked ? ' good' : good ? ' miss' : picked ? ' bad' : ' dim'; }
    return '<button type="button" class="' + c + '" data-opt="' + L + '"' + (locked ? ' disabled' : '') + ' aria-pressed="' + (sel.indexOf(L) >= 0) + '"><b class="lat">' + L + '</b></button>';
  }).join('');
  const verdict = r ? '<div class="verdict ' + (r.ok ? 'ok' : 'ko') + '" role="status"><b>' + (r.ok ? '✓ إجابة صحيحة' : r.s ? '✗ إجابة غير صحيحة' : '— لم تُجب عن هذا السؤال') + '</b><span>' + (r.s ? 'إجابتك: <b class="lat">' + esc(r.s) + '</b> · ' : '') + 'الصحيح: <b class="lat">' + esc(q.ans) + '</b></span></div>' : '';
  const years = q.years && q.years.length ? '<span class="yrs">ظهر في: <b class="lat">' + q.years.join(' · ') + '</b>' + (q.years.length > 1 ? ' <em class="lat">×' + q.years.length + '</em>' : '') + '</span>' : (it.set.key === 'proposed' ? '<span class="yrs">سؤال مقترح</span>' : '');
  const src = mode === 'practice' ? '' : '<a class="srcq" href="#/c/' + it.ch.id + '/q/' + it.set.key + '/' + (it.i + 1) + '" style="--c:var(--c' + it.ch.id + ')"><b class="lat">CH ' + it.ch.id + '</b> ' + KIND_AR[it.set.key] + ' · س<span class="lat">' + q.n + '</span></a>';
  const flagged = live && prog.exam.flag && prog.exam.flag[key];
  let action = '';
  if (live) action = '<button type="button" class="btn ghost2 flag' + (flagged ? ' on' : '') + '" data-q="flag">' + (flagged ? '⚑ مُعلَّم للمراجعة' : '⚐ علّم للمراجعة') + '</button>';
  else if (!r) action = '<button type="button" class="btn pri check" data-q="check"' + (sel.length ? '' : ' disabled') + '>تحقّق من الإجابة</button>';
  const prevB = i > 0 ? '<a class="btn" data-nav="prev" href="' + ctx.href(i - 1) + '">→ السابق</a>' : '<span></span>';
  const nextB = i < keys.length - 1 ? '<a class="btn' + (r || live ? ' pri' : '') + '" data-nav="next" href="' + ctx.href(i + 1) + '">التالي ←</a>' : (ctx.end || '<span></span>');
  const mid = mode === 'practice' && r ? '<button type="button" class="btn ghost2" data-q="retry">أعد هذا السؤال</button>' : '<span></span>';
  VIEW.innerHTML = '<div class="wrap quiz' + (live ? ' live' : '') + '" style="--c:var(--c' + (mode === 'practice' ? it.ch.id : 0) + ',var(--cyan2))">' + ctx.top +
    '<div class="qchips" aria-label="الأسئلة">' + chips + '</div>' +
    '<article class="qcard"><div class="qtop"><span class="qn">السؤال <b class="lat">' + (i + 1) + '</b> من <b class="lat">' + keys.length + '</b></span>' + src + years + star(key) + '</div>' +
    fig(q.q, 'qimg zoomable', '9 / 4') + '<p class="zhint">اضغط على السؤال لتكبيره</p>' +
    '<div class="opick"><p>' + (r ? 'إجابتك:' : live ? 'اختر الإجابة أو الإجابات (تُحفظ تلقائياً، والتصحيح بعد التسليم):' : 'اختر الإجابة أو الإجابات الصحيحة (قد تكون أكثر من واحدة):') + '</p><div class="opts">' + opts + '</div>' + action + '</div>' +
    verdict + (r ? '<div class="sol"><p class="solh">الحل والشرح</p>' + fig(q.s, 'simg zoomable', '9 / 3') + '</div>' : '') +
    '<div class="qnav">' + prevB + mid + nextB + '</div></article>' +
    '<p class="kbd lat">A–F · Enter · ← →</p></div>';
  hydrate();
  if (r || live) prefetch(keys[i + 1] && ITEMS[keys[i + 1]].q.q); else prefetch(q.s);
  const cur = $('.qc.cur'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
}
const crumbs = (items) => '<nav class="crumb"><a href="#/">الرئيسية</a>' + items.map((x) => '<span>›</span>' + (x[1] ? '<a href="' + x[1] + '">' + x[0] + '</a>' : '<b>' + x[0] + '</b>')).join('') + '</nav>';
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

/* ---------- 2) مراجعة الأخطاء / المفضلة ---------- */
function reviewList(src) {
  if (src === 'fav') return favKeys();
  const m = /^wrong(\d*)$/.exec(src); if (!m) return [];
  return wrongKeys(m[1] ? parseInt(m[1], 10) : 0);
}
function review(r) {
  if (!revLists[r.src] || r.i === 0 && !Object.keys(revRes).some((k) => revLists[r.src].indexOf(k) >= 0)) revLists[r.src] = reviewList(r.src);
  const keys = revLists[r.src];
  const isW = r.src !== 'fav', cid = isW ? parseInt(r.src.slice(5), 10) || 0 : 0;
  const title = isW ? 'مراجعة الأخطاء' + (cid ? ' · CH ' + cid : '') : 'مراجعة المفضلة';
  if (!keys.length) {
    VIEW.innerHTML = '<div class="wrap narrow">' + crumbs([[isW ? 'أخطائي' : 'المفضلة', isW ? '#/mistakes' : '#/fav'], [title]]) +
      '<div class="empty card"><b>' + (isW ? 'لا توجد أخطاء للمراجعة 🎉' : 'لا توجد أسئلة في المفضلة') + '</b><p>' + (isW ? 'كل الأسئلة التي أجبت عنها صحيحة. تابع حل الكيسيام أو جرّب امتحاناً تجريبياً.' : 'اضغط ☆ في أي سؤال لحفظه هنا.') + '</p><p class="acts"><a class="btn pri" href="#/exam">امتحان تجريبي</a><a class="btn" href="#/">الرئيسية</a></p></div></div>';
    return;
  }
  const get = (k) => revRes[k] || null;
  const sc = scoreLine(keys, get), n = keys.length;
  const summary = sc.a === n ? '<div class="qsum card ' + (sc.ok / n >= 0.5 ? 'pass' : 'fail') + '"><div><small>نتيجة المراجعة</small><b class="lat">' + sc.ok + ' / ' + n + '</b><span class="lat">' + pct(sc.ok, n) + '%</span></div><p>' + (isW ? 'الأسئلة التي صححتها خرجت من قائمة «أخطائي».' : 'أنهيت مراجعة المفضلة.') + '</p><p class="acts"><button type="button" class="btn pri" data-q="again">مراجعة جديدة</button><a class="btn" href="' + (isW ? '#/mistakes' : '#/fav') + '">رجوع</a></p></div>' : '';
  qscreen({
    mode: 'review', keys: keys, i: r.i, href: (j) => '#/review/' + r.src + '/' + (j + 1), result: get,
    chip: (k) => get(k) ? (get(k).ok ? 'ok' : 'ko') : '', src: r.src,
    end: '<a class="btn" href="' + (isW ? '#/mistakes' : '#/fav') + '">إنهاء المراجعة</a>',
    top: crumbs([[isW ? 'أخطائي' : 'المفضلة', isW ? '#/mistakes' : '#/fav'], [title]]) +
      '<header class="qhead"><div><p class="kick">REVIEW</p><h1>' + title + '</h1></div>' + sc.html + '</header>' +
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
    '<header class="phead"><h1>أخطائي</h1><p>كل سؤال أجبت عنه خطأً، في التدريب أو في الامتحان التجريبي، يظهر هنا حتى تصححه. راجعها قبل الامتحان: هذا أسرع طريق لرفع علامتك.</p></header>' +
    '<div class="mhead card"><div><b class="lat big">' + all.length + '</b><span>سؤالاً تحتاج مراجعة</span></div>' + (all.length ? '<a class="btn pri" href="#/review/wrong/1">راجع كل الأخطاء ←</a>' : '<a class="btn pri" href="#/exam">جرّب امتحاناً تجريبياً</a>') + '</div>' +
    '<div class="mlist card">' + rows + '</div>' +
    (all.length ? '<h2 class="h2">الأسئلة</h2><div class="mqs">' + chips + '</div>' : '') + '</div>';
}

function favorites() {
  const pages = favPages(), qs = favKeys();
  const pl = pages.map((x) => '<a class="tile" href="#/c/' + x.ch.id + '/p/' + x.p.n + '" style="border-color:var(--c' + x.ch.id + ')"><b>' + esc(x.p.secAr) + ' <small class="lat">CH ' + x.ch.id + '</small></b><small class="lat">' + esc(x.p.t) + '</small></a>').join('');
  const ql = qs.map((k) => '<a class="mq" href="#/c/' + ITEMS[k].ch.id + '/q/' + ITEMS[k].set.key + '/' + (ITEMS[k].i + 1) + '" style="--c:var(--c' + ITEMS[k].ch.id + ')"><b class="lat">CH' + ITEMS[k].ch.id + '</b> ' + KIND_AR[ITEMS[k].set.key] + ' <span class="lat">' + ITEMS[k].q.n + '</span>' + (res(k) ? (res(k).ok ? ' <i class="okc">✓</i>' : ' <i class="koc">✗</i>') : '') + '</a>').join('');
  VIEW.innerHTML = '<div class="wrap narrow">' + crumbs([['المفضلة']]) +
    '<header class="phead"><h1>المفضلة</h1><p>اضغط على النجمة ☆ في أي صفحة درس أو سؤال ليُحفظ هنا، فتجد ما تريد مراجعته في مكان واحد.</p></header>' +
    (!pages.length && !qs.length ? '<div class="empty card"><b>لا شيء في المفضلة بعد</b><p>افتح أي درس أو سؤال واضغط ☆.</p></div>' : '') +
    (pages.length ? '<h2 class="h2">صفحات الدروس <small class="lat">' + pages.length + '</small></h2><div class="tgrid">' + pl + '</div>' : '') +
    (qs.length ? '<h2 class="h2">الأسئلة <small class="lat">' + qs.length + '</small></h2><p class="acts" style="margin:0 0 12px"><a class="btn pri" href="#/review/fav/1">راجع أسئلة المفضلة ←</a></p><div class="mqs">' + ql + '</div>' : '') + '</div>';
}

/* =================================================================
   الامتحان التجريبي
   ================================================================= */
function remain() { const e = prog && prog.exam; return e ? Math.max(0, Math.round((e.start + e.dur * 1000 - now()) / 1000)) : 0; }
function fmtT(s) { s = Math.max(0, s | 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); }
function onTick() {
  if (!ready || !prog.exam) return;
  const left = remain();
  $$('[data-timer]').forEach((el) => { el.textContent = fmtT(left); el.classList.toggle('warn', left <= 300); });
  const live = $('.sl em.live'); if (live) live.textContent = fmtT(left);
  if (left <= 0) submitExam(true);
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function buildExam(n, srcKind, focus) {
  const chs = M.chapters;
  const pool = {}; chs.forEach((c) => { pool[c.id] = Object.keys(ITEMS).filter((k) => ITEMS[k].ch.id === c.id && (srcKind === 'all' || ITEMS[k].set.key === 'official')); });
  if (focus === 'weak') chs.forEach((c) => { const w = pool[c.id].filter((k) => !res(k) || !res(k).ok); if (w.length >= 3) pool[c.id] = w; });
  const total = chs.reduce((a, c) => a + c.share, 0);
  const quota = {}; let used = 0;
  chs.forEach((c) => { quota[c.id] = Math.min(pool[c.id].length, Math.floor(n * c.share / total)); used += quota[c.id]; });
  const order = chs.slice().sort((a, b) => b.share - a.share);
  for (let guard = 0; used < n && guard < 500; guard++) { const c = order[guard % order.length]; if (quota[c.id] < pool[c.id].length) { quota[c.id]++; used++; } }
  const keys = [];
  chs.forEach((c) => { shuffle(pool[c.id].slice()).slice(0, quota[c.id]).sort((a, b) => ITEMS[a].i - ITEMS[b].i).forEach((k) => keys.push(k)); });
  return keys;
}
function examHome() {
  const e = prog.exam;
  const hist = prog.hist.map((h) => '<a class="hrow" href="#/exam/r/' + h.id + '"><span class="lat">' + new Date(h.end).toLocaleDateString('fr-DZ') + '</span><span>' + h.n + ' سؤالاً · ' + (h.src === 'all' ? 'رسمي + مقترح' : 'رسمي') + '</span><b class="lat ' + (h.ok / h.n >= 0.5 ? 'okc' : 'koc') + '">' + h.ok + '/' + h.n + ' · ' + pct(h.ok, h.n) + '%</b><span class="lat">' + fmtT(h.used) + '</span></a>').join('');
  const cur = e ? '<div class="exnow card"><div><p class="kick">امتحان جارٍ</p><b><span class="lat">' + e.keys.length + '</span> سؤالاً · أجبت عن <span class="lat">' + Object.keys(e.ans).filter((k) => e.ans[k]).length + '</span></b><span class="timer lat" data-timer>' + fmtT(remain()) + '</span></div>' +
    '<p class="acts"><a class="btn pri" href="#/exam/q/1">تابع الامتحان ←</a><button type="button" class="btn" data-q="abandon">إلغاء الامتحان</button></p></div>' : '';
  const opt = (name, val, label, sub, on) => '<label class="ropt"><input type="radio" name="' + name + '" value="' + val + '"' + (on ? ' checked' : '') + '><span><b>' + label + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</span></label>';
  VIEW.innerHTML = '<div class="wrap narrow">' + crumbs([['امتحان تجريبي']]) +
    '<header class="phead"><h1>امتحان تجريبي</h1><p>أسئلة من كل الشابيطرات بنفس توزيع الامتحان الحقيقي (الشابيطر 3 أكثرها)، مع مؤقّت. لا يظهر التصحيح إلا بعد التسليم، ثم ترى علامتك وشرح كل سؤال، وتذهب أخطاؤك تلقائياً إلى «أخطائي».</p></header>' + cur +
    (e ? '' : '<div class="exset card"><h3>عدد الأسئلة</h3><div class="ropts">' + opt('n', 20, '20 سؤالاً', '30 دقيقة') + opt('n', 40, '40 سؤالاً', '60 دقيقة', true) + opt('n', 60, '60 سؤالاً', '90 دقيقة') + '</div>' +
      '<h3>مصدر الأسئلة</h3><div class="ropts">' + opt('src', 'official', 'الامتحانات الرسمية فقط', '99 سؤالاً من 16/17 إلى 25/26', true) + opt('src', 'all', 'رسمي + مقترح', '180 سؤالاً') + '</div>' +
      '<h3>التركيز</h3><div class="ropts">' + opt('focus', 'mix', 'كل الأسئلة', 'اختيار عشوائي', true) + opt('focus', 'weak', 'ما لم أُتقنه بعد', 'أسئلة لم تحلها أو أخطأت فيها') + '</div>' +
      '<p class="acts"><button type="button" class="btn pri big" data-q="startexam">ابدأ الامتحان ⏱</button></p><p class="small">قاعدة التصحيح: يُحسب السؤال صحيحاً فقط إذا اخترت كل الإجابات الصحيحة ولا شيء غيرها.</p></div>') +
    (hist ? '<h2 class="h2">نتائجك السابقة</h2><div class="hist card">' + hist + '</div>' : '') + '</div>';
}
function examCtxTop(e) {
  const ans = e.keys.filter((k) => e.ans[k]).length, fl = e.keys.filter((k) => e.flag && e.flag[k]).length;
  return crumbs([['امتحان تجريبي', '#/exam'], ['جارٍ']]) +
    '<header class="qhead exh"><div><p class="kick">MOCK EXAM</p><h1>امتحان تجريبي</h1></div><div class="qscore"><span class="timer lat" data-timer>' + fmtT(remain()) + '</span><span>أجبت <b class="lat">' + ans + '/' + e.keys.length + '</b></span>' + (fl ? '<span>⚑ <b class="lat">' + fl + '</b></span>' : '') +
    '<button type="button" class="btn sm pri" data-q="submit">تسليم</button></div></header>' +
    '<div class="rbar"><i style="width:' + pct(ans, e.keys.length) + '%;background:var(--cyan2)"></i></div>';
}
function examQ(i) {
  const e = prog.exam;
  if (!e) { go('#/exam'); return; }
  qscreen({
    mode: 'exam', keys: e.keys, i: i, href: (j) => '#/exam/q/' + (j + 1), result: () => null,
    chip: (k) => (e.flag && e.flag[k] ? 'fl ' : '') + (e.ans[k] ? 'ans' : ''),
    end: '<button type="button" class="btn pri" data-q="submit">تسليم الامتحان</button>',
    top: examCtxTop(e)
  });
}
function submitExam(auto) {
  const e = prog.exam; if (!e) return;
  let ok = 0; const by = {};
  e.keys.forEach((k) => {
    const s = e.ans[k] || '', it = ITEMS[k]; if (!it) return;
    const good = !!s && s === norm(it.q.ans); if (good) ok++;
    by[it.ch.id] = by[it.ch.id] || [0, 0]; by[it.ch.id][1]++; if (good) by[it.ch.id][0]++;
    if (s) setRes(k, s);
  });
  const end = Math.min(now(), e.start + e.dur * 1000);
  const h = { id: e.id, start: e.start, end: end, n: e.keys.length, ok: ok, used: Math.round((end - e.start) / 1000), dur: e.dur, src: e.src, keys: e.keys, ans: e.ans, by: by, auto: !!auto };
  prog.hist.unshift(h); prog.hist = prog.hist.slice(0, 15);
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
    '<p class="acts"><a class="btn pri" href="#/exam/r/' + h.id + '/1">راجع الأسئلة مع الحل</a>' + (h.n - h.ok ? '<a class="btn" href="#/mistakes">أخطائي</a>' : '') + '<a class="btn" href="#/exam">امتحان جديد</a></p></div></div>' +
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
function toggleOpt(L) {
  const c = CUR; if (!c) return;
  const key = c.keys[c.i], q = ITEMS[key].q;
  if (q.opts.indexOf(L) < 0) return;
  if (c.mode === 'exam') {
    const e = prog.exam; if (!e || remain() <= 0) return;
    const s = (e.ans[key] || '').split('').filter(Boolean); const j = s.indexOf(L);
    if (j >= 0) s.splice(j, 1); else s.push(L);
    e.ans[key] = norm(s.join('')); save();
    const b = $('.opt[data-opt="' + L + '"]'); if (b) { b.classList.toggle('on', j < 0); b.setAttribute('aria-pressed', String(j < 0)); }
    const chip = $('.qc.cur'); if (chip) chip.classList.toggle('ans', !!e.ans[key]);
    const a = e.keys.filter((k) => e.ans[k]).length; const sc = $('.exh .qscore span:nth-child(2) b'); if (sc) sc.textContent = a + '/' + e.keys.length;
    const bar = $('.quiz .rbar i'); if (bar) bar.style.width = pct(a, e.keys.length) + '%';
    return;
  }
  if (c.result(key)) return;
  const s = quizSel[key] || []; const j = s.indexOf(L);
  if (j >= 0) s.splice(j, 1); else s.push(L);
  quizSel[key] = s;
  const b = $('.opt[data-opt="' + L + '"]'); if (b) { b.classList.toggle('on', j < 0); b.setAttribute('aria-pressed', String(j < 0)); }
  const ck = $('[data-q="check"]'); if (ck) ck.disabled = !s.length;
}
function check() {
  const c = CUR; if (!c || (c.mode !== 'practice' && c.mode !== 'review')) return;
  const key = c.keys[c.i], s = norm((quizSel[key] || []).join(''));
  if (!s) return;
  setRes(key, s);
  if (c.mode === 'review') revRes[key] = { s: s, ok: s === norm(ITEMS[key].q.ans) };
  delete quizSel[key]; save();
  const y = window.scrollY; router(); window.scrollTo(0, y);
  const v = $('.verdict'); if (v && v.scrollIntoView) v.scrollIntoView({ block: 'center', behavior: 'smooth' });
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
  vrot = window.innerHeight > window.innerWidth * 1.2; // هاتف عمودي: نديرها أفقياً تلقائياً
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
document.addEventListener('click', async (e) => {
  const t = e.target;
  const a = t.closest('[data-act]');
  if (a) {
    const act = a.dataset.act;
    if (act === 'login') { try { await signIn(); } catch (err) { if (!(err && err.code === 'auth/popup-closed-by-user')) gLogin(friendly(err)); } }
    else if (act === 'logout') { if (pushTimer) await push(); clearInterval(tick); quizSel = {}; revRes = {}; revLists = {}; wmUrl = ''; ready = false; cloud = 'off'; await signOutUser(); }
    else if (act === 'request') { a.disabled = true; try { await sendRequest(me); gPending(me); } catch (err) { gError(friendly(err)); } }
    else if (act === 'recheck') onUser(me);
    else if (act === 'install' && installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch (e2) {} installEvt = null; renderUser(); }
    return;
  }
  if (t.closest('#menuBtn')) { SIDE.classList.contains('show') ? closeSide() : openSide(); return; }
  if (t.closest('#scrim')) { closeSide(); return; }
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
  const o = t.closest('[data-opt]'); if (o && !o.disabled) { toggleOpt(o.dataset.opt); return; }
  const qb = t.closest('[data-q]');
  if (qb) {
    const cmd = qb.dataset.q;
    if (cmd === 'check') { check(); return; }
    if (cmd === 'startexam') {
      const v = (n) => { const x = $('input[name="' + n + '"]:checked'); return x ? x.value : ''; };
      const n = parseInt(v('n'), 10) || 40, src = v('src') || 'official', focus = v('focus') || 'mix';
      const keys = buildExam(n, src, focus);
      prog.exam = { id: 'x' + now().toString(36), start: now(), dur: Math.round(n * 1.5) * 60, keys: keys, ans: {}, flag: {}, src: src };
      save(true); go('#/exam/q/1'); return;
    }
    if (cmd === 'abandon') { arm(qb, 'تأكيد: إلغاء الامتحان؟', () => { prog.exam = null; save(true); router(); }); return; }
    if (cmd === 'submit') {
      const ex = prog.exam; if (!ex) return;
      const left = ex.keys.filter((k) => !ex.ans[k]).length;
      arm(qb, left ? 'بقي ' + left + ' دون إجابة، سلّم؟' : 'تأكيد التسليم؟', () => submitExam(false));
      return;
    }
    if (cmd === 'flag') { const ex = prog.exam, c = CUR; if (!ex || !c) return; const k = c.keys[c.i]; ex.flag = ex.flag || {}; ex.flag[k] = !ex.flag[k]; save(); const y = window.scrollY; router(); window.scrollTo(0, y); return; }
    if (cmd === 'again') { const c = CUR; if (c && c.src) { c.keys.forEach((k) => delete revRes[k]); delete revLists[c.src]; go('#/review/' + c.src + '/1'); } return; }
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
  if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'a', 's', 'p', 'u'].indexOf(k) >= 0) { e.preventDefault(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!$('#viewer').hidden) { if (k === 'escape') closeViewer(); else if (k === '+' || k === '=') { vz = Math.min(ZL.length - 1, vz + 1); layoutViewer(); } else if (k === '-') { vz = Math.max(0, vz - 1); layoutViewer(); } return; }
  if (!ready || /input|textarea|select/i.test((e.target.tagName || ''))) return;
  if (CUR) {
    if (/^[a-f]$/.test(k)) { toggleOpt(k.toUpperCase()); e.preventDefault(); return; }
    if (k === 'enter') { const c = $('[data-q="check"]'); if (c && !c.disabled) { check(); e.preventDefault(); } return; }
  }
  // الواجهة من اليمين لليسار: السهم الأيسر = التالي
  if (k === 'arrowleft') { const n = $('.pnav .next, [data-nav="next"]'); if (n && n.href) { location.href = n.href; e.preventDefault(); } }
  if (k === 'arrowright') { const p = $('.pnav .prev, [data-nav="prev"]'); if (p && p.href) { location.href = p.href; e.preventDefault(); } }
});

['contextmenu', 'copy', 'cut', 'dragstart', 'selectstart'].forEach((ev) => document.addEventListener(ev, (e) => {
  if (ev === 'selectstart' && /input|textarea/i.test((e.target && e.target.tagName) || '')) return;
  e.preventDefault();
}));

watchUser(onUser);
