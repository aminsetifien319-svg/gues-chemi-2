// Gues Chemi: دخول Google ← فحص القبول ← قراءة الفهرس من Firestore ← الدروس والكيسيام.
import { watchUser, signIn, signOutUser, getAccess, sendRequest, loadManifest, getImage, configMissing } from './firebase.js';

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const VIEW = $('#view'), GATE = $('#gate'), SIDE = $('#side');

let me = null, isAdmin = false, M = null, prog = null, KEY = '', ready = false;
let FLOW = {};        // chapter id → ordered list of pages {img,n,t,sec,secAr,rev}
let quizSel = {};     // current (unchecked) selection per question key

/* ======================= التقدّم (محفوظ في متصفح الطالب) ======================= */
function blank() { return { r: {}, q: {}, last: '' }; }
function loadProg() {
  prog = blank();
  try { const raw = localStorage.getItem(KEY); if (raw) { const p = JSON.parse(raw); if (p && p.r && p.q) prog = p; } } catch (e) {}
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(prog)); } catch (e) {} }
function chStats(ch) {
  const pages = FLOW[ch.id], read = pages.filter((p) => prog.r[p.n]).length;
  let qn = 0, qa = 0, qok = 0;
  ch.qcm.forEach((set) => { const st = prog.q[setKey(ch.id, set.key)] || {}; qn += set.q.length; set.q.forEach((q) => { if (st[q.n]) { qa++; if (st[q.n].ok) qok++; } }); });
  return { pages: pages.length, read: read, qn: qn, qa: qa, qok: qok };
}
const setKey = (cid, kind) => 'c' + cid + kind[0];
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;

/* ======================= شاشات الدخول ======================= */
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
  u.innerHTML = (isAdmin && ready ? '<a class="chip" href="admin.html">الإدارة</a>' : '') +
    '<span class="av" title="' + esc(me.email) + '">' + ini + '</span>' +
    '<button type="button" class="chip" data-act="logout">خروج</button>';
}

/* ======================= المسار الرئيسي ======================= */
async function onUser(u) {
  me = u; isAdmin = false; M = null;
  renderUser();
  if (!u) { gLogin(); return; }
  KEY = 'gueschemi.v2:' + u.email;
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
      start();
    } else if (acc === 'pending') gPending(u);
    else gRequest(u);
  } catch (err) { gError(friendly(err)); }
}

function start() {
  FLOW = {};
  M.chapters.forEach((ch) => {
    const list = [];
    ch.sections.forEach((s) => s.pages.forEach((p) => list.push({ img: p.img, n: p.n, t: p.t, sec: s.en, secAr: s.ar, rev: false })));
    ch.revision.forEach((p) => list.push({ img: p.img, n: p.n, t: p.t, sec: 'Revision', secAr: p.ar || 'المراجعة', rev: true }));
    FLOW[ch.id] = list;
  });
  loadProg();
  ready = true;
  GATE.hidden = true; GATE.innerHTML = '';
  VIEW.hidden = false; SIDE.hidden = false; $('#menuBtn').hidden = false;
  renderUser();
  router();
}

/* ======================= التنقل ======================= */
function parse() {
  const h = (location.hash || '#/').replace(/^#\/?/, '').split('/').filter(Boolean);
  if (!h.length) return { v: 'home' };
  if (h[0] === 'stats') return { v: 'stats' };
  if (h[0] === 'c') {
    const ch = M.chapters.find((c) => String(c.id) === h[1]);
    if (!ch) return { v: 'home' };
    if (h[2] === 'p') { const i = FLOW[ch.id].findIndex((p) => String(p.n) === h[3]); if (i >= 0) return { v: 'page', ch: ch, i: i }; }
    if (h[2] === 'q') { const set = ch.qcm.find((s) => s.key === h[3]); if (set) return { v: 'quiz', ch: ch, set: set, i: Math.max(0, Math.min(set.q.length - 1, (parseInt(h[4], 10) || 1) - 1)) }; }
    return { v: 'chapter', ch: ch };
  }
  return { v: 'home' };
}
function router() {
  if (!ready) return;
  const r = parse();
  if (r.v === 'home') home();
  else if (r.v === 'stats') stats();
  else if (r.v === 'chapter') chapter(r.ch);
  else if (r.v === 'page') page(r.ch, r.i);
  else quiz(r.ch, r.set, r.i);
  if (r.v !== 'home') { prog.last = location.hash; save(); }
  side(r);
  closeSide();
}
window.addEventListener('hashchange', () => { router(); window.scrollTo(0, 0); });
const go = (h) => { if (location.hash === h) router(); else location.hash = h; };

/* ---------- القائمة الجانبية ---------- */
function side(r) {
  const cur = (r.ch && r.ch.id) || 0;
  let h = '<nav aria-label="الفهرس"><a class="sl' + (r.v === 'home' ? ' on' : '') + '" href="#/"><i class="ico">⌂</i>الرئيسية</a>' +
    '<a class="sl' + (r.v === 'stats' ? ' on' : '') + '" href="#/stats"><i class="ico">▤</i>الإحصائيات وخطة المراجعة</a><p class="sh">الشابيطرات</p>';
  M.chapters.forEach((ch) => {
    const st = chStats(ch), open = ch.id === cur;
    h += '<div class="sch' + (open ? ' open' : '') + '" style="--c:var(--c' + ch.id + ')"><a class="sl ch' + (r.v === 'chapter' && open ? ' on' : '') + '" href="#/c/' + ch.id + '">' +
      '<b class="num lat">' + ch.id + '</b><span><span class="lat en">' + esc(ch.en) + '</span><small>' + esc(ch.ar) + '</small></span>' +
      '<i class="ring" style="--p:' + pct(st.read + st.qa, st.pages + st.qn) + '"></i></a>';
    if (open) {
      h += '<div class="sub">';
      ch.sections.forEach((s) => {
        const first = s.pages[0];
        const active = r.v === 'page' && s.pages.some((p) => p.n === FLOW[ch.id][r.i].n);
        const done = s.pages.every((p) => prog.r[p.n]);
        h += '<a class="ss' + (active ? ' on' : '') + (done ? ' done' : '') + '" href="#/c/' + ch.id + '/p/' + first.n + '"><span class="lat">' + esc(s.key === 'intro' ? '·' : s.key) + '</span>' + esc(s.ar) + '</a>';
      });
      const revActive = r.v === 'page' && FLOW[ch.id][r.i].rev;
      h += '<a class="ss' + (revActive ? ' on' : '') + '" href="#/c/' + ch.id + '/p/' + ch.revision[0].n + '"><span>★</span>المراجعة</a>';
      ch.qcm.forEach((set) => {
        const ss = prog.q[setKey(ch.id, set.key)] || {}, a = Object.keys(ss).length;
        h += '<a class="ss q' + (r.v === 'quiz' && r.set === set ? ' on' : '') + '" href="#/c/' + ch.id + '/q/' + set.key + '"><span>✎</span>' + esc(set.ar) + '<em class="lat">' + a + '/' + set.q.length + '</em></a>';
      });
      h += '</div>';
    }
    h += '</div>';
  });
  SIDE.innerHTML = h + '</nav>';
}
function openSide() { SIDE.classList.add('show'); $('#scrim').hidden = false; }
function closeSide() { SIDE.classList.remove('show'); $('#scrim').hidden = true; }

/* ======================= الصور المحمية ======================= */
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

/* ======================= الصفحة الرئيسية ======================= */
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
  const off = M.chapters.reduce((a, c) => a + ((c.qcm.find((x) => x.key === 'official') || { q: [] }).q.length), 0);
  const pro = M.chapters.reduce((a, c) => a + ((c.qcm.find((x) => x.key === 'proposed') || { q: [] }).q.length), 0);
  const first = (me.name || '').split(' ')[0];
  VIEW.innerHTML =
    '<div class="hero"><div class="hero-in"><p class="kick lat">General Chemistry · 1st-year Pharmacy</p>' +
    '<h1>' + (first ? 'أهلاً ' + esc(first) + '، ' : '') + 'الكيمياء العامة كاملة، شابيطر بشابيطر</h1>' +
    '<p class="lead">اقرأ كل درس على حدة، ثم حلّ كيسيام الامتحانات والكيسيام المقترح، وتحقق من إجابتك مع الشرح مباشرة.</p>' +
    '<div class="kpis"><span><b class="lat">' + off + '</b>كيسيام رسمي محلول</span><span><b class="lat">' + pro + '</b>كيسيام مقترح</span><span><b class="lat">' + tp + '</b>صفحة دروس</span><span><b class="lat">' + M.chapters.length + '</b>شابيطرات</span></div>' +
    (prog.last ? '<p class="acts"><a class="btn pri" href="' + esc(prog.last) + '">تابع من حيث توقفت ←</a><a class="btn ghost" href="#/stats">خطة المراجعة</a></p>' : '<p class="acts"><a class="btn pri" href="#/c/1">ابدأ بالشابيطر الأول ←</a><a class="btn ghost" href="#/stats">خطة المراجعة</a></p>') +
    '</div></div>' +
    '<div class="wrap"><div class="overall card"><div><b>تقدّمك العام</b><small>محفوظ على هذا الجهاز</small></div>' +
    '<div class="ov"><span>الدروس</span><span class="pbar"><i style="width:' + pct(tr, tp) + '%"></i></span><b class="lat">' + pct(tr, tp) + '%</b></div>' +
    '<div class="ov"><span>الكيسيام</span><span class="pbar"><i style="width:' + pct(ta, tq) + '%"></i></span><b class="lat">' + pct(ta, tq) + '%</b></div>' +
    '<div class="ov"><span>الإجابات الصحيحة</span><span class="pbar ok"><i style="width:' + pct(tok, ta) + '%"></i></span><b class="lat">' + pct(tok, ta) + '%</b></div></div>' +
    '<h2 class="h2">الشابيطرات</h2><div class="cgrid">' + cards + '</div></div>';
}

/* ======================= الإحصائيات ======================= */
function stats() {
  VIEW.innerHTML = '<div class="wrap narrow"><nav class="crumb"><a href="#/">الرئيسية</a><span>›</span><b>الإحصائيات</b></nav>' +
    '<header class="phead"><h1>الإحصائيات وخطة المراجعة</h1><p>تحليل أسئلة الامتحانات الرسمية من 16/17 إلى 25/26: أهمية كل شابيطر، المواضيع المتكررة، وكيف توزع وقت مراجعتك.</p></header>' +
    M.overview.map((p, i) => '<section class="ovp"><h2><span class="lat">' + (i + 1) + '</span>' + esc(p.ar) + '<small class="lat">' + esc(p.en) + '</small></h2>' + fig(p.img, 'zoomable', '16 / 9') + '</section>').join('') + '</div>';
  hydrate();
}

/* ======================= الشابيطر ======================= */
function chapter(ch) {
  const s = chStats(ch);
  const secs = ch.sections.map((sec) =>
    '<div class="sec"><h3><span class="lat key">' + esc(sec.key === 'intro' ? '·' : sec.key) + '</span><span>' + esc(sec.ar) + '<small class="lat">' + esc(sec.en) + '</small></span></h3><ol class="plist">' +
    sec.pages.map((p) => '<li><a href="#/c/' + ch.id + '/p/' + p.n + '"' + (prog.r[p.n] ? ' class="done"' : '') + '><span class="lat">' + esc(p.t) + '</span><i class="ck" aria-label="' + (prog.r[p.n] ? 'مقروءة' : '') + '"></i></a></li>').join('') +
    '</ol></div>').join('');
  const rev = ch.revision.map((p) => '<a class="tile" href="#/c/' + ch.id + '/p/' + p.n + '"><b>' + esc(p.ar || 'مراجعة') + '</b><small class="lat">' + esc(p.t) + '</small>' + (prog.r[p.n] ? '<i class="ck"></i>' : '') + '</a>').join('');
  const qs = ch.qcm.map((set) => {
    const st = prog.q[setKey(ch.id, set.key)] || {}, a = set.q.filter((q) => st[q.n]).length, ok = set.q.filter((q) => st[q.n] && st[q.n].ok).length;
    return '<a class="qtile ' + set.key + '" href="#/c/' + ch.id + '/q/' + set.key + '"><span class="qk">' + (set.key === 'official' ? 'EXAM' : 'NEW') + '</span><b>' + esc(set.ar) + '</b><small><span class="lat">' + set.q.length + '</span> سؤالاً' + (set.key === 'official' ? ' من امتحانات 16/17 إلى 25/26' : ' بنفس أسلوب الامتحان') + '</small>' +
      '<span class="pbar"><i style="width:' + pct(a, set.q.length) + '%"></i></span><span class="pl">' + (a ? 'أجبت عن <b class="lat">' + a + '/' + set.q.length + '</b> · صحيح <b class="lat">' + ok + '</b>' : 'لم تبدأ بعد') + '</span><span class="go">' + (a && a < set.q.length ? 'تابع' : a ? 'راجع' : 'ابدأ') + ' ←</span></a>';
  }).join('');
  VIEW.innerHTML = '<div class="chero" style="--c:var(--c' + ch.id + ')"><div class="wrap chero-in"><div class="ctext"><nav class="crumb inv"><a href="#/">الرئيسية</a><span>›</span><b>CH ' + ch.id + '</b></nav>' +
    '<p class="kick lat">Chapter ' + ch.id + '</p><h1><span class="lat">' + esc(ch.en) + '</span><span class="ar">' + esc(ch.ar) + '</span></h1><p class="tp lat">' + esc(ch.topics) + '</p>' +
    '<div class="chips"><span><b class="lat">' + ch.share + '%</b> من أسئلة الامتحان</span><span>الترتيب <b class="lat">#' + ch.rank + '</b></span><span><b class="lat">' + ch.app + '</b> ظهوراً في الامتحانات</span></div>' +
    '<p class="acts"><a class="btn pri" href="#/c/' + ch.id + '/p/' + FLOW[ch.id][0].n + '">' + (s.read ? 'تابع الدروس' : 'ابدأ الدرس') + ' ←</a><a class="btn ghost" href="#/c/' + ch.id + '/q/official">كيسيام الامتحانات</a></p></div>' +
    '<div class="ccover">' + fig(ch.cover, 'cover', '16 / 9') + '</div></div></div>' +
    '<div class="wrap"><div class="cprog card"><div class="ov"><span>الدروس المقروءة</span><span class="pbar"><i style="width:' + pct(s.read, s.pages) + '%"></i></span><b class="lat">' + s.read + '/' + s.pages + '</b></div>' +
    '<div class="ov"><span>الكيسيام المحلول</span><span class="pbar"><i style="width:' + pct(s.qa, s.qn) + '%"></i></span><b class="lat">' + s.qa + '/' + s.qn + '</b></div></div>' +
    '<h2 class="h2">الدروس</h2><div class="secs">' + secs + '</div>' +
    '<h2 class="h2">الكيسيام</h2><div class="qgrid">' + qs + '</div>' +
    '<h2 class="h2">أدوات المراجعة</h2><div class="tgrid">' + rev + '</div></div>';
  hydrate();
}

/* ======================= صفحة الدرس ======================= */
function page(ch, i) {
  const list = FLOW[ch.id], p = list[i], prev = list[i - 1], next = list[i + 1];
  prog.r[p.n] = 1; save();
  const secPages = list.filter((x) => x.sec === p.sec && x.rev === p.rev);
  const k = secPages.indexOf(p) + 1;
  const nav = (x, dir) => x ? '<a class="pn ' + dir + '" href="#/c/' + ch.id + '/p/' + x.n + '"><small>' + (dir === 'prev' ? '→ السابق' : 'التالي ←') + '</small><span class="lat">' + esc(x.t) + '</span></a>' : '<span class="pn empty"></span>';
  const endNext = next ? nav(next, 'next') : '<a class="pn next" href="#/c/' + ch.id + '/q/official"><small>انتهت الدروس ←</small><span>انتقل إلى كيسيام الامتحانات</span></a>';
  VIEW.innerHTML = '<div class="wrap reader"><nav class="crumb"><a href="#/">الرئيسية</a><span>›</span><a href="#/c/' + ch.id + '">CH ' + ch.id + ' · ' + esc(ch.ar) + '</a><span>›</span><b>' + esc(p.secAr) + '</b></nav>' +
    '<header class="rhead" style="--c:var(--c' + ch.id + ')"><div><p class="kick"><span>' + esc(p.secAr) + '</span>' + (p.rev ? '' : '<span class="lat"> · ' + esc(p.sec) + '</span>') + '</p><h1 class="lat">' + esc(p.t) + '</h1></div>' +
    '<div class="rmeta"><span class="lat" dir="ltr">' + k + ' / ' + secPages.length + '</span><span class="sep"></span><span>صفحة <b class="lat">' + (i + 1) + '</b> من <b class="lat">' + list.length + '</b></span></div></header>' +
    '<div class="rbar"><i style="width:' + pct(i + 1, list.length) + '%;background:var(--c' + ch.id + ')"></i></div>' +
    fig(p.img, 'zoomable page', '16 / 9') +
    '<p class="hint"><button type="button" class="btn sm" data-zoom>⤢ تكبير وملء الشاشة</button><span>على الهاتف: أدِر الشاشة أفقياً أو استعمل زر التكبير.</span></p>' +
    '<div class="pnav">' + nav(prev, 'prev') + endNext + '</div></div>';
  hydrate();
  prefetch(next && next.img); prefetch(prev && prev.img);
}

/* ======================= الكيسيام ======================= */
function quiz(ch, set, i) {
  const sk = setKey(ch.id, set.key), st = prog.q[sk] || (prog.q[sk] = {});
  const q = set.q[i], qkey = sk + q.n, res = st[q.n];
  const sel = res ? res.s.split('') : (quizSel[qkey] || []);
  const answered = set.q.filter((x) => st[x.n]).length, ok = set.q.filter((x) => st[x.n] && st[x.n].ok).length;
  const chips = set.q.map((x, j) => '<a class="qc' + (j === i ? ' cur' : '') + (st[x.n] ? (st[x.n].ok ? ' ok' : ' ko') : '') + '" href="#/c/' + ch.id + '/q/' + set.key + '/' + (j + 1) + '" aria-label="سؤال ' + x.n + '"><span class="lat">' + x.n + '</span></a>').join('');
  const opts = q.opts.split('').map((L) => {
    let c = 'opt';
    if (sel.indexOf(L) >= 0) c += ' on';
    if (res) { const good = q.ans.indexOf(L) >= 0, picked = res.s.indexOf(L) >= 0; c += good && picked ? ' good' : good ? ' miss' : picked ? ' bad' : ' dim'; }
    return '<button type="button" class="' + c + '" data-opt="' + L + '"' + (res ? ' disabled' : '') + ' aria-pressed="' + (sel.indexOf(L) >= 0) + '"><b class="lat">' + L + '</b></button>';
  }).join('');
  const done = answered === set.q.length;
  const summary = done ? '<div class="qsum card ' + (ok / set.q.length >= 0.5 ? 'pass' : 'fail') + '"><div><small>النتيجة النهائية</small><b class="lat">' + ok + ' / ' + set.q.length + '</b><span class="lat">' + pct(ok, set.q.length) + '%</span></div>' +
    '<p>' + (ok === set.q.length ? 'ممتاز! أجبت عن كل الأسئلة إجابة صحيحة.' : 'راجع الأسئلة الحمراء وشرحها، ثم أعد محاولتها.') + '</p>' +
    '<p class="acts">' + (ok < set.q.length ? '<button type="button" class="btn pri" data-q="wrong">أعد الأخطاء فقط</button>' : '') + '<button type="button" class="btn" data-q="reset">ابدأ من جديد</button></p></div>' : '';
  const verdict = res ? '<div class="verdict ' + (res.ok ? 'ok' : 'ko') + '" role="status"><b>' + (res.ok ? '✓ إجابة صحيحة' : '✗ إجابة غير صحيحة') + '</b><span>إجابتك: <b class="lat">' + esc(res.s) + '</b> · الصحيح: <b class="lat">' + esc(q.ans) + '</b></span></div>' : '';
  const years = q.years && q.years.length ? '<span class="yrs">ظهر في: <b class="lat">' + q.years.join(' · ') + '</b>' + (q.years.length > 1 ? ' <em class="lat">×' + q.years.length + '</em>' : '') + '</span>' : (set.key === 'proposed' ? '<span class="yrs">سؤال مقترح</span>' : '');
  VIEW.innerHTML = '<div class="wrap quiz" style="--c:var(--c' + ch.id + ')"><nav class="crumb"><a href="#/">الرئيسية</a><span>›</span><a href="#/c/' + ch.id + '">CH ' + ch.id + ' · ' + esc(ch.ar) + '</a><span>›</span><b>' + esc(set.ar) + '</b></nav>' +
    '<header class="qhead"><div><p class="kick">' + (set.key === 'official' ? 'EXAM' : 'PROPOSED') + ' · <span class="lat">' + esc(ch.en) + '</span></p><h1>' + esc(set.ar) + '</h1></div>' +
    '<div class="qscore"><span>أجبت <b class="lat">' + answered + '/' + set.q.length + '</b></span><span class="okc">صحيح <b class="lat">' + ok + '</b></span><span class="koc">خطأ <b class="lat">' + (answered - ok) + '</b></span></div></header>' +
    '<div class="rbar"><i style="width:' + pct(answered, set.q.length) + '%;background:var(--c)"></i></div>' + summary +
    '<div class="qchips" aria-label="الأسئلة">' + chips + '</div>' +
    '<article class="qcard"><div class="qtop"><span class="qn">السؤال <b class="lat">' + q.n + '</b> من <b class="lat">' + set.q.length + '</b></span>' + years + '</div>' +
    fig(q.q, 'qimg zoomable', '9 / 4') + '<p class="zhint">اضغط على السؤال لتكبيره</p>' +
    '<div class="opick"><p>' + (res ? 'إجابتك:' : 'اختر الإجابة أو الإجابات الصحيحة (قد تكون أكثر من واحدة):') + '</p><div class="opts">' + opts + '</div>' +
    (res ? '' : '<button type="button" class="btn pri check" data-q="check"' + (sel.length ? '' : ' disabled') + '>تحقّق من الإجابة</button>') + '</div>' +
    verdict + (res ? '<div class="sol"><p class="solh">الحل والشرح</p>' + fig(q.s, 'simg zoomable', '9 / 3') + '</div>' : '') +
    '<div class="qnav">' + (i > 0 ? '<a class="btn" href="#/c/' + ch.id + '/q/' + set.key + '/' + i + '">→ السابق</a>' : '<span></span>') +
    (res ? '<button type="button" class="btn ghost2" data-q="retry">أعد هذا السؤال</button>' : '<span></span>') +
    (i < set.q.length - 1 ? '<a class="btn ' + (res ? 'pri' : '') + '" href="#/c/' + ch.id + '/q/' + set.key + '/' + (i + 2) + '">التالي ←</a>' : '<a class="btn" href="#/c/' + ch.id + '">رجوع للشابيطر</a>') + '</div></article>' +
    '<p class="kbd lat">A–F · Enter · ← →</p></div>';
  hydrate();
  if (res) prefetch(set.q[i + 1] && set.q[i + 1].q);
  else prefetch(q.s);
  const cur = $('.qc.cur'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
}
function quizCtx() { const r = parse(); return r.v === 'quiz' ? r : null; }
function toggleOpt(L) {
  const r = quizCtx(); if (!r) return;
  const q = r.set.q[r.i], sk = setKey(r.ch.id, r.set.key);
  if ((prog.q[sk] || {})[q.n] || q.opts.indexOf(L) < 0) return;
  const k = sk + q.n, s = quizSel[k] || [];
  const j = s.indexOf(L); if (j >= 0) s.splice(j, 1); else s.push(L);
  quizSel[k] = s;
  const b = $('.opt[data-opt="' + L + '"]'); if (b) { b.classList.toggle('on', j < 0); b.setAttribute('aria-pressed', String(j < 0)); }
  const c = $('[data-q="check"]'); if (c) c.disabled = !s.length;
}
function check() {
  const r = quizCtx(); if (!r) return;
  const q = r.set.q[r.i], sk = setKey(r.ch.id, r.set.key), k = sk + q.n, s = (quizSel[k] || []).slice().sort().join('');
  if (!s) return;
  (prog.q[sk] || (prog.q[sk] = {}))[q.n] = { s: s, ok: s === q.ans.split('').sort().join('') };
  delete quizSel[k]; save();
  const y = window.scrollY; quiz(r.ch, r.set, r.i); side(r); window.scrollTo(0, y);
  const v = $('.verdict'); if (v && v.scrollIntoView) v.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/* ======================= العارض المكبّر ======================= */
const ZL = [1, 1.5, 2, 3];
let vz = 0, vrot = false, vimg = null;
function openViewer(src, title, kind) {
  vz = 0; vrot = false;
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
  const wm = st.querySelector('.wm'); if (wm) wm.style.cssText = 'background-image:' + watermark();
  $('#vzoom').textContent = Math.round(z * 100) + '%';
}
function closeViewer() { $('#viewer').hidden = true; $('#vstage').innerHTML = ''; vimg = null; document.body.classList.remove('noscroll'); }
window.addEventListener('resize', () => { if (!$('#viewer').hidden) layoutViewer(); });

/* ======================= الأحداث ======================= */
document.addEventListener('click', async (e) => {
  const t = e.target;
  const a = t.closest('[data-act]');
  if (a) {
    const act = a.dataset.act;
    if (act === 'login') { try { await signIn(); } catch (err) { if (!(err && err.code === 'auth/popup-closed-by-user')) gLogin(friendly(err)); } }
    else if (act === 'logout') { quizSel = {}; wmUrl = ''; ready = false; await signOutUser(); }
    else if (act === 'request') { a.disabled = true; try { await sendRequest(me); gPending(me); } catch (err) { gError(friendly(err)); } }
    else if (act === 'recheck') onUser(me);
    return;
  }
  if (t.closest('#menuBtn')) { SIDE.classList.contains('show') ? closeSide() : openSide(); return; }
  if (t.closest('#scrim')) { closeSide(); return; }
  const o = t.closest('[data-opt]'); if (o && !o.disabled) { toggleOpt(o.dataset.opt); return; }
  const qb = t.closest('[data-q]');
  if (qb) {
    const r = quizCtx(); if (!r) return;
    const sk = setKey(r.ch.id, r.set.key), st = prog.q[sk] || (prog.q[sk] = {});
    const cmd = qb.dataset.q;
    if (cmd === 'check') check();
    else if (cmd === 'retry') { delete st[r.set.q[r.i].n]; save(); router(); }
    else if (cmd === 'wrong') {
      const wrong = r.set.q.filter((x) => st[x.n] && !st[x.n].ok);
      wrong.forEach((x) => delete st[x.n]); save();
      go('#/c/' + r.ch.id + '/q/' + r.set.key + '/' + (r.set.q.indexOf(wrong[0]) + 1));
    } else if (cmd === 'reset') {
      if (qb.dataset.armed !== '1') { qb.dataset.armed = '1'; qb.textContent = 'تأكيد: مسح كل الإجابات؟'; setTimeout(() => { if (qb.isConnected) { qb.dataset.armed = ''; qb.textContent = 'ابدأ من جديد'; } }, 4000); return; }
      prog.q[sk] = {}; save(); go('#/c/' + r.ch.id + '/q/' + r.set.key + '/1');
    }
    return;
  }
  const z = t.closest('[data-zoom]') ? $('figure.zoomable.ok', VIEW) : t.closest('figure.zoomable.ok');
  if (z) { const im = z.querySelector('img'); if (im) openViewer(im.src, (($('.rhead h1') || $('.qn') || {}).textContent) || '', !z.classList.contains('page') && !z.classList.contains('cover') && z.closest('.quiz') ? 'card' : 'page'); return; }
  const v = t.closest('[data-v]');
  if (v) {
    const c = v.dataset.v;
    if (c === 'close') closeViewer();
    else if (c === 'in') { vz = Math.min(ZL.length - 1, vz + 1); layoutViewer(); }
    else if (c === 'out') { vz = Math.max(0, vz - 1); layoutViewer(); }
    else if (c === 'rot') { vrot = !vrot; layoutViewer(); }
  }
});

document.addEventListener('keydown', (e) => {
  const k = (e.key || '').toLowerCase();
  // منع النسخ والحفظ والطباعة
  if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'a', 's', 'p', 'u'].indexOf(k) >= 0) { e.preventDefault(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!$('#viewer').hidden) { if (k === 'escape') closeViewer(); else if (k === '+' || k === '=') { vz = Math.min(ZL.length - 1, vz + 1); layoutViewer(); } else if (k === '-') { vz = Math.max(0, vz - 1); layoutViewer(); } return; }
  if (!ready || /input|textarea|select/i.test((e.target.tagName || ''))) return;
  const r = parse();
  if (r.v === 'quiz') {
    if (/^[a-f]$/.test(k)) { toggleOpt(k.toUpperCase()); e.preventDefault(); return; }
    if (k === 'enter') { const c = $('[data-q="check"]'); if (c && !c.disabled) { check(); e.preventDefault(); } return; }
  }
  if (r.v === 'quiz' || r.v === 'page') {
    // الواجهة من اليمين لليسار: السهم الأيسر = التالي
    if (k === 'arrowleft') { const n = $('.pnav .next, .qnav a.btn:last-child'); if (n && n.href) { location.href = n.href; e.preventDefault(); } }
    if (k === 'arrowright') { const p = $('.pnav .prev, .qnav a.btn:first-child'); if (p && p.href && /السابق/.test(p.textContent)) { location.href = p.href; e.preventDefault(); } }
  }
});

['contextmenu', 'copy', 'cut', 'dragstart', 'selectstart'].forEach((ev) => document.addEventListener(ev, (e) => {
  if (ev === 'selectstart' && /input|textarea/i.test((e.target && e.target.tagName) || '')) return;
  e.preventDefault();
}));

watchUser(onUser);
