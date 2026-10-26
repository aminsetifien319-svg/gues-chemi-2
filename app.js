// موقع الطلبة: دخول Google ← فحص القبول ← تحميل المحتوى من Firestore ← عرض الدروس والكيسيام.
import { watchUser, signIn, signOutUser, getAccess, sendRequest, loadContent, configMissing } from './firebase.js';

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cv = (n) => '--c:var(--c' + n + ');--on:var(--on' + n + ')';
const qid = (ch, i) => 'c' + ch.id + 'q' + (i + 1);

let CHAPTERS = [], STATS = null, VIEWS = [], prog = {}, KEY = '', me = null, isAdmin = false, built = false;

/* ---------- التقدّم (محلي في متصفح الطالب) ---------- */
function loadProg() { prog = {}; try { const raw = localStorage.getItem(KEY); if (raw) prog = JSON.parse(raw) || {}; } catch (e) { prog = {}; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(prog)); } catch (e) {} }
function counts(ch) {
  let a = 0, ok = 0;
  ch.qcm.forEach((q, i) => { const v = prog[qid(ch, i)]; if (v !== undefined) { a++; if (v === 1) ok++; } });
  return { a: a, ok: ok, n: ch.qcm.length };
}

/* ---------- شاشات الدخول والقبول ---------- */
function showGate(inner) {
  $$('.view').forEach((s) => { s.hidden = (s.id !== 'gate'); });
  $('#gate').innerHTML = '<div class="gate"><div class="card"><p class="kick">GUES CHEMI</p>' + inner + '</div></div>';
  window.scrollTo(0, 0);
}
function gLogin(msg) {
  if (configMissing) {
    return showGate('<h1>الموقع غير مُهيّأ بعد</h1><p>افتح الملف <b class="lat">firebase-config.js</b> والصق إعدادات مشروع Firebase، ثم أعد رفع الموقع.</p>');
  }
  showGate('<h1>الكيمياء العامة</h1><p>الدروس والكيسيام متاحة للطلبة المقبولين فقط. سجّل الدخول بحساب Google.</p>' +
    (msg ? '<p class="err" role="alert">' + esc(msg) + '</p>' : '') +
    '<p><button type="button" class="btn pri" data-act="login">الدخول بحساب Google</button></p>');
}
function gRequest(u) {
  showGate('<h1>مرحباً ' + esc((u.name || '').split(' ')[0]) + '</h1><p>حسابك <bdi class="lat">' + esc(u.email) + '</bdi> غير مقبول بعد. أرسل طلب وصول ليراجعه المشرف.</p>' +
    '<p style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn pri" data-act="request">إرسال طلب الوصول</button><button type="button" class="btn" data-act="logout">خروج</button></p>');
}
function gPending(u) {
  showGate('<h1>طلبك قيد المراجعة</h1><p>أُرسل طلب الحساب <bdi class="lat">' + esc(u.email) + '</bdi>. ستتمكن من الدخول عندما يقبله المشرف.</p>' +
    '<p style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn pri" data-act="recheck">تحقّق من جديد</button><button type="button" class="btn" data-act="logout">خروج</button></p>');
}
function gError(msg, extra) {
  showGate('<h1>تعذّر الدخول</h1><p class="err" role="alert">' + esc(msg) + '</p>' + (extra || '') +
    '<p style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn pri" data-act="recheck">حاول مرة أخرى</button><button type="button" class="btn" data-act="logout">خروج</button></p>');
}
function friendly(err) {
  const c = err && err.code;
  if (c === 'permission-denied') return 'ليست لديك صلاحية قراءة هذا المحتوى بعد.';
  if (c === 'auth/network-request-failed' || c === 'unavailable') return 'لا يوجد اتصال بالإنترنت.';
  if (c === 'auth/unauthorized-domain') return 'عنوان الموقع غير مضاف في Firebase (Authorized domains).';
  return (err && err.message) ? err.message : 'حدث خطأ غير متوقع.';
}

/* ---------- المسار الرئيسي ---------- */
async function route(u) {
  me = u;
  if (!u) { resetApp(); renderNav(); gLogin(); return; }
  KEY = 'gueschemi.progress.v1:' + u.email;
  renderNav();
  showGate('<p>جارٍ التحقق من حسابك…</p>');
  try {
    const acc = await getAccess(u.email);
    if (acc === 'admin' || acc === 'allowed') {
      isAdmin = (acc === 'admin');
      const content = await loadContent();
      if (!content.chapters.length) {
        renderNav();
        return gError(isAdmin ? 'لم يُرفع المحتوى بعد. افتح صفحة الإدارة وارفع ملف content.json.' : 'المحتوى غير متاح حالياً، حاول لاحقاً.',
          isAdmin ? '<p><a class="btn pri" style="text-decoration:none;display:inline-block" href="admin.html">صفحة الإدارة</a></p>' : '');
      }
      startApp(content);
    } else if (acc === 'pending') { gPending(u); }
    else { gRequest(u); }
  } catch (err) { gError(friendly(err)); }
}

function resetApp() {
  built = false; CHAPTERS = []; STATS = null; isAdmin = false; prog = {};
  $('#v-home').innerHTML = ''; $('#v-stats').innerHTML = '';
  $$('.view[data-ch]').forEach((s) => s.remove());
}

/* ---------- التنقل ---------- */
function renderNav() {
  if (!me) { $('#nav').innerHTML = ''; return; }
  let html = '';
  if (built) {
    const items = [['home', 'الرئيسية', 0], ['stats', 'الإحصائيات', 0]].concat(CHAPTERS.map((c) => ['ch' + c.id, 'CH ' + c.id, c.id]));
    html += items.map((it) => '<button type="button" class="nv" data-go="' + it[0] + '">' + (it[2] ? '<i class="dot" style="background:var(--c' + it[2] + ')"></i>' : '') + '<span' + (it[2] ? ' class="lat"' : '') + '>' + it[1] + '</span></button>').join('');
  }
  if (isAdmin) html += '<a class="nv" href="admin.html">الإدارة</a>';
  html += '<button type="button" class="nv" data-act="logout">خروج</button>';
  $('#nav').innerHTML = html;
  if (built) { const cur = $$('.view').filter((s) => !s.hidden)[0]; if (cur) markNav(cur.id.replace('v-', '')); }
}
function markNav(v) {
  $$('.nv[data-go]').forEach((b) => { if (b.dataset.go === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
}
function show(v) {
  if (!built) return;
  if (VIEWS.indexOf(v) < 0) v = 'home';
  $$('.view').forEach((s) => { s.hidden = (s.id !== 'v-' + v); });
  markNav(v);
  try { history.replaceState(null, '', '#' + v); } catch (e) {}
  window.scrollTo(0, 0);
}

/* ---------- الصفحة الرئيسية ---------- */
function buildHome() {
  const rows = CHAPTERS.map((ch) =>
    '<button type="button" class="row" data-go="ch' + ch.id + '" style="' + cv(ch.id) + '">' +
    '<span class="badge"><small>CH</small><b>' + ch.id + '</b></span>' +
    '<span class="rtxt"><span class="en">' + ch.en + '</span><span class="ar">' + ch.ar + '</span><span class="tp">' + ch.topics + '</span></span>' +
    '<span class="meta"><span class="share"><bdi>' + ch.share + '%</bdi> من أسئلة الامتحان</span><span data-prog="' + ch.id + '"></span></span></button>').join('');
  $('#v-home').innerHTML =
    '<div class="hero"><p class="kick">General Chemistry · 1st-year Pharmacy</p>' +
    '<h1>الكيمياء العامة كاملة، شابيطر بشابيطر</h1>' +
    '<p class="lead">اقرأ الدرس، ثم حلّ الكيسيام وتحقق من إجابتك مباشرة. كل شيء داخل الموقع.</p>' +
    '<div class="overall"><span class="bar"><i data-overbar style="width:0%"></i></span><span data-over></span></div></div>' +
    '<div class="sh"><h2>الشابيطرات</h2><small>' + CHAPTERS.length + ' chapters</small></div><div class="rows">' + rows + '</div>' +
    '<div class="linkrow"><p>أيّ شابيطر يستحق وقتاً أكثر؟ شاهد كيف توزعت أسئلة الامتحانات خلال 7 سنوات.</p><button type="button" class="btn pri" data-go="stats">إحصائيات الامتحانات</button></div>';
}

/* ---------- الشابيطرات والكيسيام ---------- */
function qHTML(ch, q, i) {
  const id = qid(ch, i);
  const nOk = q.o.filter((o) => o[1]).length;
  const multi = nOk > 1;
  const opts = q.o.map((o, j) =>
    '<label class="opt"><input type="' + (multi ? 'checkbox' : 'radio') + '" name="' + id + '" value="' + j + '"><span class="lt">' + 'ABCDEF'.charAt(j) + '</span><span class="ot">' + o[0] + '</span><span class="mk"></span></label>').join('');
  return '<article class="q" id="' + id + '" data-id="' + id + '" style="' + cv(ch.id) + '">' +
    '<header class="qh"><span class="qn">Q' + (i + 1) + '</span><span class="qt">' + (multi ? 'عدة إجابات صحيحة: اختر كلها' : 'إجابة واحدة صحيحة') + '</span><span class="qs" data-st></span></header>' +
    '<p class="qq">' + q.q + '</p>' +
    '<div class="opts" role="' + (multi ? 'group' : 'radiogroup') + '" aria-label="الخيارات">' + opts + '</div>' +
    '<div class="qa"><button type="button" class="btn pri" data-check disabled>تحقق</button><button type="button" class="btn" data-retry hidden>أعد المحاولة</button></div>' +
    '<div class="res" aria-live="polite" hidden></div></article>';
}

function buildChapter(ch, idx) {
  const prev = CHAPTERS[idx - 1], next = CHAPTERS[idx + 1];
  const s = document.createElement('section');
  s.className = 'view'; s.id = 'v-ch' + ch.id; s.hidden = true; s.setAttribute('data-ch', ch.id); s.setAttribute('style', cv(ch.id));
  const pager = '<button type="button" class="btn pri" data-tabgo="qcm">حلّ كيسيام هذا الشابيطر</button>' +
    (prev ? '<button type="button" class="btn" data-go="ch' + prev.id + '">الشابيطر السابق: CH ' + prev.id + '</button>' : '') +
    (next ? '<button type="button" class="btn" data-go="ch' + next.id + '">الشابيطر التالي: CH ' + next.id + '</button>' : '');
  s.innerHTML =
    '<div class="chhead"><div class="bigbadge"><small>CH</small><b>' + ch.id + '</b></div>' +
    '<div class="chtx"><h1 class="en">' + ch.en + '</h1><p class="ar" style="margin:0">' + ch.ar + '</p><span class="tp">' + ch.topics + '</span>' +
    '<p class="chips"><span class="chip"><bdi>' + ch.share + '%</bdi> من أسئلة الامتحان</span><span class="chip">المرتبة <bdi>' + ch.rank + '</bdi> من 5</span></p></div></div>' +
    '<div class="tabs" role="tablist"><button type="button" class="tab" role="tab" aria-selected="true" data-tab="lesson">الدرس</button>' +
    '<button type="button" class="tab" role="tab" aria-selected="false" data-tab="qcm">كيسيام <span class="cnt">' + ch.qcm.length + '</span></button></div>' +
    '<div class="pane" data-pane="lesson"><article class="lesson">' + ch.lesson + '</article><div class="pager">' + pager + '</div></div>' +
    '<div class="pane" data-pane="qcm" hidden>' +
    '<div class="qsum"><span class="sumtx" data-sum="' + ch.id + '"></span><span class="bar"><i data-sumbar="' + ch.id + '" style="width:0%"></i></span><button type="button" class="btn" data-reset="' + ch.id + '">مسح تقدّمي</button></div>' +
    '<p class="qnote">الإجابة تُحسب صحيحة فقط إذا اخترت كل الخيارات الصحيحة ولا شيء غيرها.</p>' +
    ch.qcm.map((q, i) => qHTML(ch, q, i)).join('') + '</div>';
  $('#main').appendChild(s);
}

function setTab(sec, name) {
  $$('.pane', sec).forEach((p) => { p.hidden = (p.dataset.pane !== name); });
  $$('.tab', sec).forEach((t) => { t.setAttribute('aria-selected', t.dataset.tab === name ? 'true' : 'false'); });
  window.scrollTo(0, 0);
}

function updateProgress() {
  let tot = 0, okAll = 0;
  CHAPTERS.forEach((ch) => {
    const c = counts(ch); tot += c.n; okAll += c.ok;
    const el = $('[data-prog="' + ch.id + '"]');
    if (el) el.textContent = c.a ? (c.ok + ' / ' + c.n + ' صحيحة') : (c.n + ' كيسيام');
    const sm = $('[data-sum="' + ch.id + '"]'); if (sm) sm.textContent = c.ok + ' / ' + c.n + ' صحيحة · أجبت على ' + c.a;
    const sb = $('[data-sumbar="' + ch.id + '"]'); if (sb) sb.style.width = (c.n ? c.ok / c.n * 100 : 0) + '%';
    ch.qcm.forEach((q, i) => {
      const st = $('#' + qid(ch, i) + ' [data-st]');
      const v = prog[qid(ch, i)];
      if (st) st.textContent = v === 1 ? '✓ حللتها صحيحة' : (v === 0 ? '✗ أخطأت سابقاً' : '');
    });
  });
  const o = $('[data-over]'); if (o) o.textContent = okAll + ' / ' + tot + ' كيسيام صحيحة';
  const ob = $('[data-overbar]'); if (ob) ob.style.width = (tot ? okAll / tot * 100 : 0) + '%';
}

function resetCard(card) {
  $$('input', card).forEach((i) => { i.checked = false; i.disabled = false; });
  $$('.opt', card).forEach((l) => { l.classList.remove('good', 'bad', 'miss'); $('.mk', l).textContent = ''; });
  const r = $('.res', card); r.hidden = true; r.className = 'res'; r.innerHTML = '';
  $('[data-check]', card).hidden = false; $('[data-check]', card).disabled = true;
  $('[data-retry]', card).hidden = true;
}

function checkCard(card) {
  const m = /^c(\d+)q(\d+)$/.exec(card.dataset.id);
  const ch = CHAPTERS.filter((c) => c.id === +m[1])[0], q = ch.qcm[+m[2] - 1];
  const sel = $$('input:checked', card).map((i) => +i.value);
  if (!sel.length) return;
  const nOk = q.o.filter((o) => o[1]).length;
  const ok = sel.length === nOk && sel.every((j) => q.o[j][1] === 1);
  $$('.opt', card).forEach((l, j) => {
    const chosen = sel.indexOf(j) >= 0, right = q.o[j][1] === 1, mk = $('.mk', l);
    if (chosen && right) { l.classList.add('good'); mk.textContent = '✓ صحيح'; }
    else if (chosen && !right) { l.classList.add('bad'); mk.textContent = '✗ خطأ'; }
    else if (!chosen && right) { l.classList.add('miss'); mk.textContent = 'كان صحيحاً'; }
    $('input', l).disabled = true;
  });
  const r = $('.res', card);
  r.hidden = false; r.className = 'res ' + (ok ? 'ok' : 'ko');
  r.innerHTML = '<strong>' + (ok ? 'إجابة صحيحة' : 'إجابة غير صحيحة') + '</strong><span>' + q.why + '</span>';
  $('[data-check]', card).hidden = true; $('[data-retry]', card).hidden = false;
  prog[card.dataset.id] = ok ? 1 : 0; save(); updateProgress();
}

/* ---------- الإحصائيات ---------- */
function donut() {
  const C = 2 * Math.PI * 70, tot = CHAPTERS.reduce((s, c) => s + c.app, 0);
  let off = 0;
  const segs = CHAPTERS.map((ch) => {
    const len = ch.app / tot * C;
    const s = '<circle cx="100" cy="100" r="70" fill="none" stroke-width="30" style="stroke:var(--c' + ch.id + ')" stroke-dasharray="' + (len - 2).toFixed(2) + ' ' + (C - len + 2).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 100 100)"/>';
    off += len; return s;
  }).join('');
  return '<svg viewBox="0 0 200 200" role="img" aria-label="توزيع ظهور الشابيطرات في الامتحانات">' + segs +
    '<text x="100" y="100" text-anchor="middle" class="dn">' + tot + '</text><text x="100" y="120" text-anchor="middle" class="dl">ظهور في الامتحانات</text></svg>';
}
function heatCell(v) {
  if (v === null || v === undefined) return '<td class="na">–</td>';
  const p = Math.round(v / 10 * 88);
  return '<td style="background:color-mix(in srgb,var(--ink) ' + p + '%,var(--surface));color:var(' + (p > 46 ? '--surface' : '--ink') + ')">' + v + '</td>';
}
function buildStats() {
  if (!STATS) { $('#v-stats').innerHTML = '<p>لا توجد إحصائيات.</p>'; return; }
  const sorted = CHAPTERS.slice().sort((a, b) => a.rank - b.rank);
  const imp = sorted.map((ch) => '<tr><td><i class="chdot" style="background:var(--c' + ch.id + ')"></i><b class="lat">Ch ' + ch.id + '</b> ' + ch.ar + '</td><td class="c m">' + ch.official + '</td><td class="c m"><b>' + ch.app + '</b></td><td class="c m">' + ch.share + '%</td><td class="c m">' + ch.rank + '</td></tr>').join('');
  const yearTot = STATS.years.map((y, k) => CHAPTERS.reduce((s, c) => s + (STATS.matrix[c.id][k] || 0), 0));
  const heatRows = CHAPTERS.map((ch) => {
    const row = STATS.matrix[ch.id], tot = row.reduce((s, v) => s + (v || 0), 0);
    return '<tr><td class="lab"><i class="chdot" style="background:var(--c' + ch.id + ')"></i>Ch ' + ch.id + ' · ' + ch.en + '</td>' + row.map(heatCell).join('') + '<td><b>' + tot + '</b></td></tr>';
  }).join('');
  const topicCards = CHAPTERS.map((ch) => {
    const rows = STATS.topics[ch.id].map((t) => '<div class="trow" style="' + cv(ch.id) + '"><div class="l"><span style="color:var(--ink);font-family:var(--font-lat)">' + t[0] + '</span><span>' + t[1] + '</span></div><span class="bar"><i style="width:' + t[2] / 11 * 100 + '%"></i></span><span class="v">' + t[2] + '</span></div>').join('');
    return '<div class="card" style="' + cv(ch.id) + '"><h3><span class="mini">Ch ' + ch.id + '</span><span>' + ch.ar + '</span></h3>' + rows + '</div>';
  }).join('');
  const top5 = STATS.top5.map((t) => '<li><span class="lat">' + t[0] + '</span> (Ch ' + t[1] + ') — <b class="lat">' + t[2] + '</b></li>').join('');
  const rec = STATS.recurring.map((r) => '<tr><td class="seen">×' + r[0] + '</td><td class="lat"><i class="chdot" style="background:var(--c' + r[1] + ')"></i>Ch ' + r[1] + ' · Q' + r[2] + '</td><td><span class="lat" style="display:block">' + r[3] + '</span><span class="small">' + r[4] + '</span></td><td class="m small">' + r[5] + '</td></tr>').join('');
  const mini = (arr) => '<div class="mini2">' + arr.map((v, k) => '<div class="mrow" style="' + cv(k + 1) + '"><span class="lat">Ch ' + (k + 1) + '</span><span class="bar"><i style="width:' + Math.max(v, 1.5) + '%"></i></span><b>' + v + '%</b></div>').join('') + '</div>';
  const maxH = Math.max.apply(null, STATS.hours.map((h) => h[1]));
  const hrs = STATS.hours.map((h) => {
    const ch = CHAPTERS.filter((c) => c.id === h[0])[0];
    return '<div class="hrow" style="' + cv(ch.id) + '"><span><b class="lat">Ch ' + ch.id + '</b> ' + ch.ar + '</span><span class="bar"><i style="width:' + h[1] / maxH * 100 + '%"></i></span><b>' + h[1] + ' h</b></div>';
  }).join('');
  const must = CHAPTERS.map((ch) => '<tr><td><i class="chdot" style="background:var(--c' + ch.id + ')"></i><b class="lat">Ch ' + ch.id + '</b></td><td>' + STATS.must[ch.id] + '</td></tr>').join('');

  $('#v-stats').innerHTML =
    '<div class="hero"><p class="kick">Exam statistics</p><h1>إحصائيات الامتحانات</h1><p class="lead">مبنية على 99 كيسيام رسمياً من امتحانات 16/17 إلى 25/26، لتعرف أين تضع وقتك.</p></div>' +
    '<ul class="facts"><li><b>5</b><span>شابيطرات</span></li><li><b>99</b><span>سؤالاً رسمياً مختلفاً</span></li><li><b>140</b><span>مرة ظهور في الامتحانات</span></li><li><b>7</b><span>سنوات امتحان</span></li><li><b>40%</b><span>أسئلة بأكثر من إجابة</span></li></ul>' +
    '<div class="sh"><h2>أهمية كل شابيطر في الامتحان</h2><small>How important is each chapter?</small></div>' +
    '<div class="grid2"><div class="card donut">' + donut() + '<p class="cap">نسبة الظهور في الامتحانات</p></div>' +
    '<div><div class="tblw" style="margin-top:0"><table class="tbl"><thead><tr><th>الشابيطر</th><th>أسئلة</th><th>ظهور</th><th>النسبة</th><th>الرتبة</th></tr></thead><tbody>' + imp + '<tr><td><b>المجموع</b></td><td class="c m"><b>99</b></td><td class="c m"><b>140</b></td><td class="c m">100%</td><td></td></tr></tbody></table></div>' +
    '<div class="note"><p>الشابيطر 3 وحده أكثر من ربع الأسئلة، والشابيطران 3 و5 معاً أكثر من النصف (52%). لكن كل شابيطر يظهر في كل سنة تقريباً، فلا يمكن ترك أي واحد.</p></div></div></div>' +
    '<div class="sh"><h2>سنة بسنة: من أين تأتي الأسئلة؟</h2><small>Year by year</small></div>' +
    '<div class="tblw"><table class="tbl heat"><thead><tr><th>chapter \\ year</th>' + STATS.years.map((y) => '<th>' + y + '</th>').join('') + '<th>total</th></tr></thead><tbody>' + heatRows +
    '<tr class="tot"><td class="lab">Total per year</td>' + yearTot.map((v) => '<td>' + v + '</td>').join('') + '<td>140</td></tr></tbody></table></div>' +
    '<div class="note"><p><b>النمط:</b> الامتحانات الأخيرة فيها بين 15 و24 سؤالاً، أي حوالي 4 أسئلة لكل شابيطر.</p></div>' +
    '<div class="note"><p>بنك الشابيطر 3 هو الأكبر (30 سؤالاً مختلفاً) والأسئلة تتجدد، فالفهم أهم من الحفظ. والشابيطر 2 هو الأكثر تكراراً لنفس الأسئلة.</p></div>' +
    '<p class="small">سنة 16/17 موجودة فقط في مجموعة الشابيطر 5، و 20/21 و 21/22 غير موجودتين في المجموعات.</p>' +
    '<div class="sh"><h2>داخل كل شابيطر: المواضيع المطروحة</h2><small>Topics that are asked</small></div>' +
    '<div class="topics">' + topicCards + '<div class="dark-card"><h3>المواضيع الخمسة الأكثر مردوداً</h3><ol>' + top5 + '</ol><p>هذه المواضيع وحدها تمثل 41 سؤالاً من 99.</p></div></div>' +
    '<div class="sh"><h2>الأسئلة التي تتكرر كل سنة</h2><small>The questions that keep coming back</small></div>' +
    '<div class="tblw" style="margin-top:0"><table class="tbl"><thead><tr><th>مرات</th><th>السؤال</th><th>الموضوع</th><th>السنوات</th></tr></thead><tbody>' + rec + '</tbody></table></div>' +
    '<div class="note"><p>13 سؤالاً ظهرت في 3 سنوات أو أكثر: أتقنها أولاً فهي شبه نقاط مضمونة.</p></div>' +
    '<div class="two"><div class="card"><h3>أسئلة بأكثر من إجابة</h3>' + mini(STATS.several) + '</div><div class="card"><h3>أسئلة حسابية</h3>' + mini(STATS.numeric) + '</div></div>' +
    '<div class="sh"><h2>خطة المراجعة</h2><small>Your revision strategy</small></div>' +
    '<div class="two"><div class="card"><h3 style="margin-bottom:10px">إذا كان عندك 20 ساعة، وزّعها حسب الامتحان</h3><div class="hrs">' + hrs + '</div><p class="small" style="margin:10px 0 0">الوقت متناسب مع نسبة الظهور.</p></div>' +
    '<div class="card"><h3 style="margin-bottom:8px">طريقة تعمل</h3><ol class="steps"><li>اقرأ الدرس: الملخص والفخاخ.</li><li>حلّ الكيسيام وحدك ثم اضغط «تحقق».</li><li>اقرأ التصحيح وافهم لماذا أخطأت.</li><li>أعد الأسئلة التي أخطأت فيها بعد أيام.</li></ol>' +
    '<h3 style="margin:14px 0 6px">نصائح يوم الامتحان</h3><ul class="tips"><li>40% من الأسئلة لها أكثر من إجابة: افحص كل الخيارات.</li><li>الحساب 12% فقط (الشابيطرات 1 و2 و5): احمل القوانين لا طريقة ثقيلة.</li><li>الشابيطران 3 و4 استدلال خالص: ارسم الخانات وضع العنصر.</li></ul></div></div>' +
    '<div class="sh"><h2>ما يجب إتقانه في كل شابيطر</h2><small>The must-know</small></div>' +
    '<div class="tblw" style="margin-top:0"><table class="tbl"><tbody>' + must + '</tbody></table></div>' +
    '<p class="small">مبني على كيسيامات الامتحانات الرسمية CH1–CH5 (99 سؤالاً، سنوات 16/17 → 25/26).</p>';
}

/* ---------- تشغيل التطبيق بعد القبول ---------- */
function startApp(content) {
  CHAPTERS = content.chapters; STATS = content.stats;
  VIEWS = ['home', 'stats'].concat(CHAPTERS.map((c) => 'ch' + c.id));
  loadProg();
  $$('.view[data-ch]').forEach((s) => s.remove());
  built = true;
  buildHome(); buildStats();
  CHAPTERS.forEach(buildChapter);
  renderNav();
  updateProgress();
  const first = (location.hash || '').replace('#', '');
  show(VIEWS.indexOf(first) >= 0 ? first : 'home');
}

/* ---------- الأحداث ---------- */
let armed = null, armTimer = 0;
document.addEventListener('click', async (e) => {
  const t = e.target;
  const act = t.closest('[data-act]');
  if (act) {
    const a = act.dataset.act;
    act.disabled = true;
    try {
      if (a === 'login') await signIn();
      else if (a === 'logout') await signOutUser();
      else if (a === 'request') { await sendRequest(me); gPending(me); }
      else if (a === 'recheck') await route(me);
    } catch (err) {
      act.disabled = false;
      const c = err && err.code;
      if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return;
      if (a === 'login') gLogin(friendly(err)); else gError(friendly(err));
    }
    return;
  }
  const go = t.closest('[data-go]'); if (go) { show(go.dataset.go); return; }
  const tab = t.closest('[data-tab]'); if (tab) { setTab(tab.closest('.view'), tab.dataset.tab); return; }
  const tg = t.closest('[data-tabgo]'); if (tg) { setTab(tg.closest('.view'), tg.dataset.tabgo); return; }
  const chk = t.closest('[data-check]'); if (chk) { checkCard(chk.closest('.q')); return; }
  const rt = t.closest('[data-retry]'); if (rt) { resetCard(rt.closest('.q')); return; }
  const rs = t.closest('[data-reset]');
  if (rs) {
    if (armed !== rs) {
      armed = rs; rs.textContent = 'اضغط مرة أخرى للتأكيد';
      clearTimeout(armTimer); armTimer = setTimeout(() => { rs.textContent = 'مسح تقدّمي'; armed = null; }, 4000);
    } else {
      clearTimeout(armTimer); armed = null; rs.textContent = 'مسح تقدّمي';
      const ch = CHAPTERS.filter((c) => c.id === +rs.dataset.reset)[0];
      ch.qcm.forEach((q, i) => { delete prog[qid(ch, i)]; resetCard($('#' + qid(ch, i))); });
      save(); updateProgress();
    }
  }
});
document.addEventListener('change', (e) => {
  const card = e.target.closest && e.target.closest('.q'); if (!card) return;
  $('[data-check]', card).disabled = !$('input:checked', card);
});

/* للدراسة فقط: لا نسخ ولا حفظ ولا طباعة من الصفحة */
['contextmenu', 'copy', 'cut', 'dragstart', 'selectstart'].forEach((t) => {
  document.addEventListener(t, (e) => e.preventDefault());
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'a', 's', 'p', 'u'].indexOf(e.key.toLowerCase()) >= 0) e.preventDefault();
});

watchUser(route);
