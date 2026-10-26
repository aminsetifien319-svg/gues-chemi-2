// لوحة الإدارة: قبول الطلبة، إدارة القائمة، ورفع المحتوى إلى Firestore.
import {
  watchUser, signIn, signOutUser, isAdminUser, listRequests, listAllowed,
  approve, reject, removeAllowed, addAllowed, uploadContent, configMissing
} from './firebase.js';

const $ = (s, r) => (r || document).querySelector(s);
const box = $('#box');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let me = null, note = '', pickedFile = null;

function card(inner) { return '<div class="gate"><div class="card">' + inner + '</div></div>'; }

function li(it, kind) {
  const btns = kind === 'req'
    ? '<button type="button" class="btn pri" data-a="approve">قبول</button><button type="button" class="btn" data-a="reject" data-label="رفض">رفض</button>'
    : '<button type="button" class="btn" data-a="remove" data-label="حذف">حذف</button>';
  return '<li data-email="' + esc(it.email) + '" data-name="' + esc(it.name) + '"><span class="em">' + esc(it.email) + '</span><span class="nm">' + esc(it.name) + '</span>' + btns + '</li>';
}

async function render(u) {
  me = u;
  $('#out').hidden = !u;
  if (configMissing) { box.innerHTML = card('<h1>الموقع غير مُهيّأ</h1><p>الصق إعدادات Firebase في الملف <b class="lat">firebase-config.js</b>.</p>'); return; }
  if (!u) {
    box.innerHTML = card('<h1>لوحة الإدارة</h1><p>سجّل الدخول بحساب المشرف.</p><p><button type="button" class="btn pri" id="login">الدخول بحساب Google</button></p>');
    return;
  }
  box.innerHTML = '<p>جارٍ التحقق…</p>';
  try {
    if (!(await isAdminUser(u.email))) {
      box.innerHTML = card('<h1>ليست لديك صلاحية</h1><p>الحساب <bdi class="lat">' + esc(u.email) + '</bdi> ليس مشرفاً. أضِف بريدك في المجموعة <b class="lat">admins</b> داخل Firestore.</p>');
      return;
    }
    await refresh();
  } catch (err) {
    box.innerHTML = card('<h1>حدث خطأ</h1><p class="err">' + esc(err && err.message ? err.message : err) + '</p>');
  }
}

async function refresh() {
  const [req, allowed] = await Promise.all([listRequests(), listAllowed()]);
  box.innerHTML =
    '<div class="sh"><h2>طلبات الوصول</h2><small>' + req.length + ' pending</small></div>' +
    (req.length ? '<ul class="list" id="reqs">' + req.map((r) => li(r, 'req')).join('') + '</ul>' : '<p class="small">لا توجد طلبات الآن.</p>') +
    '<div class="sh"><h2>الطلبة المقبولون</h2><small>' + allowed.length + ' students</small></div>' +
    '<div class="row-form"><input class="input" id="newmail" type="email" placeholder="student@gmail.com" autocomplete="off"><button type="button" class="btn pri" id="add">إضافة بريد</button></div>' +
    (allowed.length ? '<ul class="list" id="alw">' + allowed.map((r) => li(r, 'alw')).join('') + '</ul>' : '<p class="small">لا يوجد طلبة مقبولون بعد.</p>') +
    '<div class="sh"><h2>محتوى الموقع</h2><small>Content</small></div>' +
    '<p>اختر الملف <b class="lat">content.json</b> من مجلد <b class="lat">private</b> ثم ارفعه. يُستبدل المحتوى الحالي بالكامل.</p>' +
    '<div class="row-form"><input class="input" id="file" type="file" accept="application/json,.json"><button type="button" class="btn pri" id="upload">رفع المحتوى</button></div>' +
    '<p id="msg" class="' + (note.indexOf('✓') === 0 ? 'okmsg' : 'err') + '" role="status">' + esc(note) + '</p>';
}

let armed = null, armTimer = 0;
document.addEventListener('click', async (e) => {
  const t = e.target;
  if (t.id === 'out') { await signOutUser(); return; }
  if (t.id === 'login') { try { await signIn(); } catch (err) { if (!(err && err.code === 'auth/popup-closed-by-user')) box.innerHTML = card('<h1>تعذّر الدخول</h1><p class="err">' + esc(err.message || err) + '</p>'); } return; }
  if (t.id === 'add') {
    const input = $('#newmail'); const v = (input.value || '').trim().toLowerCase();
    if (!EMAIL.test(v)) { note = 'البريد غير صحيح.'; await refresh(); return; }
    try { await addAllowed(v); note = '✓ أُضيف ' + v; } catch (err) { note = err.message || String(err); }
    await refresh(); return;
  }
  if (t.id === 'upload') {
    const f = $('#file').files && $('#file').files[0];
    const msg = $('#msg');
    if (!f) { msg.className = 'err'; msg.textContent = 'اختر الملف أولاً.'; return; }
    t.disabled = true; msg.className = ''; msg.textContent = 'جارٍ الرفع…';
    try {
      const data = JSON.parse(await f.text());
      if (!data || !Array.isArray(data.chapters) || !data.chapters.length) throw new Error('الملف لا يحتوي على chapters.');
      data.chapters.forEach((c) => { if (!c.id || !c.lesson || !Array.isArray(c.qcm)) throw new Error('شابيطر ناقص البيانات.'); });
      const n = await uploadContent(data);
      note = '✓ رُفع المحتوى: ' + n + ' شابيطرات.';
    } catch (err) { note = err.message || String(err); }
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

watchUser(render);
