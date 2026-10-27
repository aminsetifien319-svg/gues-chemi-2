// لوحة الإدارة: قبول الطلبة، إدارة القائمة، ورفع المحتوى (الفهرس + حزم الصور) إلى Firestore.
import {
  watchUser, signIn, signOutUser, isAdminUser, listRequests, listAllowed,
  approve, reject, removeAllowed, addAllowed, uploadImage, uploadManifest, listProgress, loadManifest, listDevices, resetDevices, configMissing
} from './firebase.js?v=7';
import { mountEditor } from './editor.js?v=7';

const $ = (s, r) => (r || document).querySelector(s);
const box = $('#box');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let me = null, note = '', busy = false, edMounted = false;

function gate(inner) { box.innerHTML = '<div class="gate" style="min-height:60vh"><div class="card">' + inner + '</div></div>'; }

function li(it, kind) {
  const btns = kind === 'req'
    ? '<button type="button" class="btn sm pri" data-a="approve">قبول</button><button type="button" class="btn sm" data-a="reject" data-label="رفض">رفض</button>'
    : '<button type="button" class="btn sm" data-a="remove" data-label="حذف">حذف</button>';
  return '<li data-email="' + esc(it.email) + '" data-name="' + esc(it.name) + '"><span class="em">' + esc(it.email) + '</span><span class="nm">' + esc(it.name) + '</span>' + btns + '</li>';
}

async function render(u) {
  me = u;
  $('#out').hidden = !u;
  if (!u) { const ed = $('#ed'); if (ed) { ed.hidden = true; ed.innerHTML = ''; } edMounted = false; }
  if (configMissing) { gate('<h1>الموقع غير مُهيّأ</h1><p>الصق إعدادات Firebase في الملف <b class="lat">firebase-config.js</b>.</p>'); return; }
  if (!u) { gate('<h1>لوحة الإدارة</h1><p>سجّل الدخول بحساب المشرف.</p><p class="acts" style="justify-content:center"><button type="button" class="btn pri" id="login">الدخول بحساب Google</button></p>'); return; }
  box.innerHTML = '<p>جارٍ التحقق…</p>';
  try {
    if (!(await isAdminUser(u.email))) {
      gate('<h1>ليست لديك صلاحية</h1><p>الحساب <bdi class="lat">' + esc(u.email) + '</bdi> ليس مشرفاً. أضِف بريدك في المجموعة <b class="lat">admins</b> داخل Firestore.</p>');
      return;
    }
    await refresh();
    if (!edMounted) { edMounted = true; mountEditor($('#ed')); }
  } catch (err) { gate('<h1>حدث خطأ</h1><p class="err">' + esc(err && err.message ? err.message : err) + '</p>'); }
}

function summarize(json) {
  let p = null; try { p = JSON.parse(json); } catch (e) { return null; }
  if (!p) return null;
  const a = p.a || {}; let ans = 0, ok = 0;
  Object.keys(a).forEach((k) => { if (a[k] && !a[k].d && a[k].s) { ans++; if (a[k].ok) ok++; } });
  const hist = p.hist || [];
  const best = hist.reduce((m, h) => Math.max(m, h.n ? Math.round(100 * h.ok / h.n) : 0), 0);
  return { read: Object.keys(p.r || {}).length, ans: ans, ok: ok, exams: hist.length, best: best, last: hist[0] };
}
function fmtDate(d) {
  if (!d) return '—';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 2) return 'الآن';
  if (mins < 60) return 'منذ ' + mins + ' د';
  if (mins < 1440) return 'منذ ' + Math.round(mins / 60) + ' س';
  return d.toLocaleDateString('fr-DZ');
}
let TOT = null;
function progressCard(allowed, progress, devices) {
  const map = {}; progress.forEach((x) => { map[x.email] = x; });
  const dev = {}; (devices || []).forEach((d) => { dev[d.email] = d; });
  const dcell = (email) => { const d = dev[email]; const n = d ? d.ids.length : 0; const names = d ? d.ids.map((id) => (d.info[id] || {}).name || 'جهاز').join('، ') : ''; return '<td class="dv" title="' + esc(names) + '"><span class="lat">' + n + '/2</span>' + (n ? ' <button type="button" class="btn sm" data-a="resetdev" data-email="' + esc(email) + '" data-label="إعادة تعيين">إعادة تعيين</button>' : '') + '</td>'; };
  const rows = allowed.map((st) => {
    const x = map[st.email], s = x && summarize(x.json);
    if (!s) return '<tr><td class="em">' + esc(st.email) + '</td><td colspan="5" class="small">لم يدخل بعد</td>' + dcell(st.email) + '</tr>';
    const pc = (a, b) => b ? Math.round(100 * a / b) : 0;
    return '<tr><td class="em">' + esc(st.email) + '</td><td class="lat">' + fmtDate(x.at) + '</td>' +
      '<td><span class="lat">' + s.read + (TOT ? '/' + TOT.pages : '') + '</span>' + (TOT ? '<span class="pbar"><i style="width:' + pc(s.read, TOT.pages) + '%"></i></span>' : '') + '</td>' +
      '<td><span class="lat">' + s.ans + (TOT ? '/' + TOT.qs : '') + '</span>' + (TOT ? '<span class="pbar"><i style="width:' + pc(s.ans, TOT.qs) + '%"></i></span>' : '') + '</td>' +
      '<td class="lat ' + (pc(s.ok, s.ans) >= 50 ? 'okc' : 'koc') + '">' + (s.ans ? pc(s.ok, s.ans) + '%' : '—') + '</td>' +
      '<td class="lat">' + (s.exams ? s.exams + ' · ' + s.best + '%' : '—') + '</td>' + dcell(st.email) + '</tr>';
  }).join('');
  return '<div class="card"><h2>تقدّم الطلبة <small>Progress</small></h2>' +
    (allowed.length ? '<div class="tscroll"><table class="ptab"><thead><tr><th>الطالب</th><th>آخر نشاط</th><th>الدروس</th><th>الكيسيام</th><th>صحيح</th><th>امتحانات · أفضل</th><th>الأجهزة</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p class="small">لا يوجد طلبة مقبولون بعد.</p>') + '</div>';
}

async function refresh() {
  const [req, allowed, progress, devices] = await Promise.all([listRequests(), listAllowed(), listProgress().catch(() => []), listDevices().catch(() => [])]);
  if (!TOT) {
    try {
      const m = await loadManifest();
      if (m) TOT = { pages: m.chapters.reduce((a, c) => a + c.sections.reduce((b, s) => b + s.pages.length, 0) + c.revision.length, 0), qs: m.chapters.reduce((a, c) => a + c.qcm.reduce((b, s) => b + s.q.length, 0), 0) };
    } catch (e) {}
  }
  box.innerHTML =
    '<div class="card"><h2>طلبات الوصول <small>' + req.length + ' pending</small></h2>' +
    (req.length ? '<ul class="list" id="reqs">' + req.map((r) => li(r, 'req')).join('') + '</ul>' : '<p class="small">لا توجد طلبات الآن.</p>') + '</div>' +
    '<div class="card"><h2>الطلبة المقبولون <small>' + allowed.length + ' students</small></h2>' +
    '<div class="row-form"><input class="input" id="newmail" type="email" placeholder="student@gmail.com" autocomplete="off" dir="ltr"><button type="button" class="btn pri" id="add">إضافة بريد</button></div>' +
    (allowed.length ? '<ul class="list" id="alw">' + allowed.map((r) => li(r, 'alw')).join('') + '</ul>' : '<p class="small">لا يوجد طلبة مقبولون بعد.</p>') + '</div>' +
    progressCard(allowed, progress, devices) +
    '<div class="card"><h2>محتوى الموقع <small>Content</small></h2>' +
    '<p class="small">اختر <b>كل</b> ملفات المحتوى معاً: <b class="lat">manifest.json</b> وملفات <b class="lat">pack-….json</b> (7 ملفات). لإضافة بطاقات المراجعة وحدها اختر الملف <b class="lat">pack-cards.json</b> فقط. تعديلاتك من المحرّر تبقى محفوظة عند إعادة الرفع. ملاحظة: الصور التي رُفعت سابقاً من هذا المتصفح تُتخطّى تلقائياً. الرفع يستغرق بضع دقائق، وإن انقطع أعد الضغط على «رفع المحتوى» من نفس المتصفح وسيكمل من حيث توقف.</p>' +
    '<div class="row-form"><input class="input" id="file" type="file" accept="application/json,.json" multiple><button type="button" class="btn pri" id="upload">رفع المحتوى</button></div>' +
    '<div class="prog-up" id="up" hidden><span class="pbar"><i id="upbar" style="width:0%"></i></span><p class="small" id="uptxt"></p></div>' +
    '<p id="msg" class="' + (note.indexOf('✓') === 0 ? 'okmsg' : 'err') + '" role="status">' + esc(note) + '</p></div>';
}

async function readJson(f) {
  try { return JSON.parse(await f.text()); } catch (e) { throw new Error('الملف ' + f.name + ' ليس JSON صالحاً.'); }
}

async function upload(files) {
  const msg = $('#msg'), up = $('#up'), bar = $('#upbar'), txt = $('#uptxt');
  let manifest = null; const packs = [];
  for (const f of files) {
    const j = await readJson(f);
    if (j && Array.isArray(j.chapters) && j.overview) manifest = j;
    else if (j && j.docs && j.pack) packs.push(j);
    else if (j && Array.isArray(j.chapters) && j.chapters[0] && j.chapters[0].lesson) throw new Error('هذا ملف content.json القديم، ولم يعد مستعملاً. اختر manifest.json وملفات pack.');
    else throw new Error('لم أتعرّف على الملف ' + f.name + '.');
  }
  if (!manifest) {
    if (packs.length && packs.every((p) => p.patch)) return uploadPatch(packs);
    throw new Error('لم تختر الملف manifest.json.');
  }
  // تحقق أن كل صور الفهرس موجودة في الحزم المختارة (أو مرفوعة سابقاً)
  const need = new Set();
  manifest.overview.forEach((p) => need.add(p.img));
  manifest.chapters.forEach((c) => { need.add(c.cover); if (c.text) need.add(c.text); c.sections.forEach((s) => s.pages.forEach((p) => need.add(p.img))); c.revision.forEach((p) => need.add(p.img)); c.qcm.forEach((s) => s.q.forEach((q) => { need.add(q.q); need.add(q.s); })); });
  const all = new Map(); packs.forEach((p) => Object.keys(p.docs).forEach((k) => all.set(k, p.docs[k])));
  // كل ما في الحزم (صور الصفحات + الصور التوضيحية داخل النص + ملفات النص) + ما يذكره الفهرس
  all.forEach((v, k) => need.add(k));
  const ids = Array.from(need);
  up.hidden = false;
  let done = 0, sent = 0, skipped = 0; const missing = [];
  const step = () => { done++; bar.style.width = Math.round(100 * done / ids.length) + '%'; txt.textContent = done + ' / ' + ids.length + ' صورة · رُفع ' + sent + ' · موجود مسبقاً ' + skipped; };
  // نتذكّر في هذا المتصفح الصور التي رُفعت، فإن انقطع الرفع نكمل من حيث توقف.
  const DONE_KEY = 'gueschemi.uploaded:' + me.email;
  let doneSet = new Set();
  try { doneSet = new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]')); } catch (e) {}
  const remember = () => { try { localStorage.setItem(DONE_KEY, JSON.stringify(Array.from(doneSet))); } catch (e) {} };
  let k = 0;
  async function worker() {
    while (k < ids.length) {
      const id = ids[k++];
      if (doneSet.has(id)) { skipped++; step(); continue; }
      const d = all.get(id);
      if (!d) { missing.push(id); step(); continue; }
      let tries = 0;
      for (;;) {
        try { await uploadImage(id, d); break; } catch (e) { if (++tries >= 3) throw e; await new Promise((r) => setTimeout(r, 1500 * tries)); }
      }
      doneSet.add(id); remember();
      sent++; step();
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (missing.length) throw new Error('صور ناقصة (' + missing.length + '): اختر كل ملفات pack ثم أعد الرفع. أول صورة ناقصة: ' + missing[0]);
  txt.textContent = 'جارٍ حفظ الفهرس…';
  let cur = null; try { cur = await loadManifest(); } catch (e) {}
  if (cur) keepEdits(manifest, cur);
  await uploadManifest(manifest);
  return { sent: sent, skipped: skipped, total: ids.length, ch: manifest.chapters.length };
}
// لا نفقد تعديلات المحرّر ولا البطاقات عند إعادة رفع نفس المحتوى
function keepEdits(nm, cur) {
  nm.chapters.forEach((nc) => {
    const oc = (cur.chapters || []).find((x) => x.id === nc.id); if (!oc) return;
    if (oc.textBase && oc.textBase === nc.text) { nc.text = oc.text; nc.textBase = oc.textBase; }
    if (oc.flash && !nc.flash) { nc.flash = oc.flash; if (oc.flashBase) nc.flashBase = oc.flashBase; }
  });
  if (cur.fix) {
    nm.fix = cur.fix;
    const A = (cur.fix && cur.fix.ans) || {};
    nm.chapters.forEach((c) => c.qcm.forEach((s) => s.q.forEach((q) => { const k = 'c' + c.id + s.key[0] + q.n; if (A[k]) q.ans = A[k]; })));
  }
}
// حزمة إضافية (مثل البطاقات): ترفع ملفاتها ثم تُضاف إلى الفهرس الموجود
async function uploadPatch(packs) {
  const up = $('#up'), bar = $('#upbar'), txt = $('#uptxt');
  const cur = await loadManifest();
  if (!cur || !cur.chapters) throw new Error('ارفع المحتوى الأساسي أولاً (manifest.json وملفات pack)، ثم البطاقات.');
  const docs = []; packs.forEach((p) => Object.keys(p.docs).forEach((k) => docs.push([k, p.docs[k]])));
  up.hidden = false; let done = 0;
  for (const [id, d] of docs) {
    let tries = 0;
    for (;;) { try { await uploadImage(id, d); break; } catch (e) { if (++tries >= 3) throw e; await new Promise((r) => setTimeout(r, 1500 * tries)); } }
    done++; bar.style.width = Math.round(100 * done / docs.length) + '%'; txt.textContent = done + ' / ' + docs.length;
  }
  let n = 0;
  packs.forEach((p) => Object.keys(p.patch).forEach((cid) => {
    const c = cur.chapters.find((x) => String(x.id) === String(cid)); if (!c) return;
    const P = p.patch[cid];
    if (P.flash) { if (c.flashBase === P.flash) return; c.flash = P.flash; delete c.flashBase; n++; }
  }));
  txt.textContent = 'جارٍ حفظ الفهرس…';
  await uploadManifest(cur);
  return { patch: true, total: docs.length, ch: n };
}

let armed = null, armTimer = 0;
document.addEventListener('click', async (e) => {
  const t = e.target;
  if (t.id === 'out') { await signOutUser(); return; }
  if (t.id === 'login') { try { await signIn(); } catch (err) { if (!(err && err.code === 'auth/popup-closed-by-user')) gate('<h1>تعذّر الدخول</h1><p class="err">' + esc(err.message || err) + '</p>'); } return; }
  if (t.id === 'add') {
    const v = ($('#newmail').value || '').trim().toLowerCase();
    if (!EMAIL.test(v)) { note = 'البريد غير صحيح.'; await refresh(); return; }
    try { await addAllowed(v); note = '✓ أُضيف ' + v; } catch (err) { note = err.message || String(err); }
    await refresh(); return;
  }
  if (t.id === 'upload') {
    if (busy) return;
    const files = Array.from(($('#file').files) || []);
    const msg = $('#msg');
    if (!files.length) { msg.className = 'err'; msg.textContent = 'اختر الملفات أولاً.'; return; }
    busy = true; t.disabled = true; msg.className = ''; msg.textContent = 'جارٍ قراءة الملفات… لا تغلق الصفحة.';
    try {
      const r = await upload(files);
      msg.className = 'okmsg'; msg.textContent = r.patch ? '✓ اكتمل: أضيفت بطاقات المراجعة إلى ' + r.ch + ' شابيطرات (' + r.total + ' ملفات).' : '✓ اكتمل: ' + r.ch + ' شابيطرات، ' + r.total + ' صورة (رُفع ' + r.sent + '، موجود مسبقاً ' + r.skipped + ').';
      if (edMounted) mountEditor($('#ed'));
    } catch (err) { msg.className = 'err'; msg.textContent = (err && err.message) || String(err); }
    busy = false; t.disabled = false; return;
  }
  const rd = t.closest('[data-a="resetdev"]');
  if (rd) {
    if (armed !== rd) { armed = rd; rd.textContent = 'تأكيد؟'; clearTimeout(armTimer); armTimer = setTimeout(() => { rd.textContent = rd.dataset.label; armed = null; }, 4000); return; }
    armed = null;
    try { await resetDevices(rd.dataset.email); note = '✓ أُعيد تعيين أجهزة ' + rd.dataset.email; } catch (err) { note = err.message || String(err); }
    await refresh(); return;
  }
  const b = t.closest('[data-a]');
  if (b) {
    const row = b.closest('li'), email = row.dataset.email, a = b.dataset.a;
    try {
      if (a === 'approve') { await approve(email, row.dataset.name); note = '✓ قُبل ' + email; await refresh(); return; }
      if (armed !== b) {
        armed = b; b.textContent = 'تأكيد؟';
        clearTimeout(armTimer); armTimer = setTimeout(() => { b.textContent = b.dataset.label; armed = null; }, 4000);
        return;
      }
      armed = null; clearTimeout(armTimer);
      if (a === 'reject') await reject(email); else await removeAllowed(email);
      note = '✓ تم'; await refresh();
    } catch (err) { note = err.message || String(err); await refresh(); }
  }
});

window.addEventListener('beforeunload', (e) => { if (busy) { e.preventDefault(); e.returnValue = ''; } });
watchUser(render);
