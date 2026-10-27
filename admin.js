// لوحة الإدارة: قبول الطلبة، إدارة القائمة، ورفع المحتوى (الفهرس + حزم الصور) إلى Firestore.
import {
  watchUser, signIn, signOutUser, isAdminUser, listRequests, listAllowed,
  approve, reject, removeAllowed, addAllowed, uploadImage, uploadManifest, configMissing
} from './firebase.js';

const $ = (s, r) => (r || document).querySelector(s);
const box = $('#box');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let me = null, note = '', busy = false;

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
  if (configMissing) { gate('<h1>الموقع غير مُهيّأ</h1><p>الصق إعدادات Firebase في الملف <b class="lat">firebase-config.js</b>.</p>'); return; }
  if (!u) { gate('<h1>لوحة الإدارة</h1><p>سجّل الدخول بحساب المشرف.</p><p class="acts" style="justify-content:center"><button type="button" class="btn pri" id="login">الدخول بحساب Google</button></p>'); return; }
  box.innerHTML = '<p>جارٍ التحقق…</p>';
  try {
    if (!(await isAdminUser(u.email))) {
      gate('<h1>ليست لديك صلاحية</h1><p>الحساب <bdi class="lat">' + esc(u.email) + '</bdi> ليس مشرفاً. أضِف بريدك في المجموعة <b class="lat">admins</b> داخل Firestore.</p>');
      return;
    }
    await refresh();
  } catch (err) { gate('<h1>حدث خطأ</h1><p class="err">' + esc(err && err.message ? err.message : err) + '</p>'); }
}

async function refresh() {
  const [req, allowed] = await Promise.all([listRequests(), listAllowed()]);
  box.innerHTML =
    '<div class="card"><h2>طلبات الوصول <small>' + req.length + ' pending</small></h2>' +
    (req.length ? '<ul class="list" id="reqs">' + req.map((r) => li(r, 'req')).join('') + '</ul>' : '<p class="small">لا توجد طلبات الآن.</p>') + '</div>' +
    '<div class="card"><h2>الطلبة المقبولون <small>' + allowed.length + ' students</small></h2>' +
    '<div class="row-form"><input class="input" id="newmail" type="email" placeholder="student@gmail.com" autocomplete="off" dir="ltr"><button type="button" class="btn pri" id="add">إضافة بريد</button></div>' +
    (allowed.length ? '<ul class="list" id="alw">' + allowed.map((r) => li(r, 'alw')).join('') + '</ul>' : '<p class="small">لا يوجد طلبة مقبولون بعد.</p>') + '</div>' +
    '<div class="card"><h2>محتوى الموقع <small>Content</small></h2>' +
    '<p class="small">اختر <b>كل</b> ملفات المحتوى معاً: <b class="lat">manifest.json</b> وملفات <b class="lat">pack-….json</b> (7 ملفات). الرفع يستغرق بضع دقائق، وإن انقطع أعد الضغط على «رفع المحتوى» من نفس المتصفح وسيكمل من حيث توقف.</p>' +
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
  if (!manifest) throw new Error('لم تختر الملف manifest.json.');
  // تحقق أن كل صور الفهرس موجودة في الحزم المختارة (أو مرفوعة سابقاً)
  const need = new Set();
  manifest.overview.forEach((p) => need.add(p.img));
  manifest.chapters.forEach((c) => { need.add(c.cover); c.sections.forEach((s) => s.pages.forEach((p) => need.add(p.img))); c.revision.forEach((p) => need.add(p.img)); c.qcm.forEach((s) => s.q.forEach((q) => { need.add(q.q); need.add(q.s); })); });
  const all = new Map(); packs.forEach((p) => Object.keys(p.docs).forEach((k) => all.set(k, p.docs[k])));
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
  await uploadManifest(manifest);
  return { sent: sent, skipped: skipped, total: ids.length, ch: manifest.chapters.length };
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
      msg.className = 'okmsg'; msg.textContent = '✓ اكتمل: ' + r.ch + ' شابيطرات، ' + r.total + ' صورة (رُفع ' + r.sent + '، موجود مسبقاً ' + r.skipped + ').';
    } catch (err) { msg.className = 'err'; msg.textContent = (err && err.message) || String(err); }
    busy = false; t.disabled = false; return;
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
