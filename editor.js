// محرّر المحتوى (للمشرف فقط): تصحيح الدروس والأسئلة والبطاقات مباشرة من لوحة الإدارة.
// كل حفظ يُنشئ نسخة جديدة من ملف النص (معرّف جديد) ثم يحدّث الفهرس، فيرى الطلبة التعديل فوراً،
// وتبقى النسخة الأصلية محفوظة للرجوع إليها.
import { getImage, uploadImage, loadManifest, uploadManifest } from './firebase.js?v=7';
import { fmt, typeset } from './rich.js?v=7';

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KIND = { official: 'رسمي', proposed: 'مقترح' };
const SYMS = ['×', '·', '→', '⇌', '≈', '≤', '≥', '±', '°', 'Δ', 'λ', 'ν', 'μ', 'χ', 'σ', 'π', 'Ψ', 'ℓ', '⁻', '⁺', '½', 'Å'];

let root = null, M = null, sel = { ch: 1, type: 'lesson', item: '' }, busy = false, dirty = false;
let T = null, CH = null, CUR = null, CARDS = null;

export function mountEditor(el) {
  root = el; root.hidden = false;
  root.innerHTML = '<div class="card"><h2>تحرير المحتوى <small>Editor</small></h2>' +
    '<p class="small">صحّح أي درس أو سؤال أو بطاقة مباشرة: اضغط على النص واكتب كما في Word. كل حفظ يظهر للطلبة فوراً، والنسخة الأصلية تبقى محفوظة ويمكنك الرجوع إليها. للمعادلات اكتبها بين علامتي <b class="lat">$…$</b>، مثلاً <bdi class="lat" dir="ltr"><b>$E = h\\nu$</b></bdi> أو <bdi class="lat" dir="ltr"><b>$\\ce{H2O}$</b></bdi>.</p>' +
    '<div class="edsel" id="edsel"><p class="small">جارٍ تحميل الفهرس…</p></div><div id="edarea"></div></div>';
  init();
}
async function init() {
  try { M = await loadManifest(); } catch (e) { M = null; }
  if (!M || !M.chapters) { $('#edsel').innerHTML = '<p class="small">ارفع المحتوى أولاً لتتمكن من تحريره.</p>'; return; }
  renderSel();
}
const chOf = (id) => M.chapters.find((c) => c.id === +id);
function items(ch, type) {
  if (type === 'lesson') {
    const out = [];
    ch.sections.forEach((s) => s.pages.forEach((p) => out.push([String(p.n), p.n + ' · ' + (s.key === 'intro' ? '' : s.key + ' · ') + p.t])));
    ch.revision.forEach((p) => out.push([String(p.n), p.n + ' · ★ ' + p.t]));
    return out;
  }
  if (type === 'question') {
    const out = [];
    ch.qcm.forEach((set) => set.q.forEach((q) => out.push(['c' + ch.id + set.key[0] + q.n, KIND[set.key] + ' · السؤال ' + q.n])));
    return out;
  }
  return [];
}
function renderSel() {
  const ch = chOf(sel.ch) || M.chapters[0]; sel.ch = ch.id;
  const its = items(ch, sel.type);
  if (its.length && !its.some((x) => x[0] === sel.item)) sel.item = its[0][0];
  const edited = ch.textBase ? '<span class="badge-ed">نص معدّل</span>' : '';
  $('#edsel').innerHTML =
    '<select class="input" id="e_ch" aria-label="الشابيطر">' + M.chapters.map((c) => '<option value="' + c.id + '"' + (c.id === ch.id ? ' selected' : '') + '>CH ' + c.id + ' · ' + esc(c.ar) + '</option>').join('') + '</select>' +
    '<select class="input" id="e_ty" aria-label="النوع">' + [['lesson', 'درس'], ['question', 'سؤال كيسيام'], ['cards', 'بطاقات المراجعة']].map((x) => '<option value="' + x[0] + '"' + (x[0] === sel.type ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select>' +
    (its.length ? '<select class="input" id="e_it" aria-label="العنصر" dir="ltr">' + its.map((x) => '<option value="' + x[0] + '"' + (x[0] === sel.item ? ' selected' : '') + '>' + esc(x[1]) + '</option>').join('') + '</select>' : '') +
    '<button type="button" class="btn pri" id="e_open">فتح للتحرير</button>' + edited +
    (ch.textBase && sel.type !== 'cards' ? '<button type="button" class="btn sm" id="e_revert" data-label="الرجوع للنص الأصلي">الرجوع للنص الأصلي</button>' : '') +
    (ch.flashBase && sel.type === 'cards' ? '<button type="button" class="btn sm" id="e_revertc" data-label="الرجوع للبطاقات الأصلية">الرجوع للبطاقات الأصلية</button>' : '');
}

/* ---------- أدوات التحرير ---------- */
function toolbar() {
  return '<div class="edtool" role="toolbar" aria-label="أدوات التنسيق">' +
    '<button type="button" data-cmd="bold" title="عريض"><b>B</b></button>' +
    '<button type="button" data-cmd="subscript" title="منخفض (H₂O)">x<sub>2</sub></button>' +
    '<button type="button" data-cmd="superscript" title="مرتفع (10³)">x<sup>2</sup></button>' +
    '<button type="button" data-cmd="formula" title="معادلة $…$" class="lat">ƒ $</button>' +
    '<button type="button" data-cmd="removeFormat" title="إزالة التنسيق">⌫</button>' +
    SYMS.map((s) => '<button type="button" data-sym="' + esc(s) + '">' + esc(s) + '</button>').join('') +
    '<span class="sp"></span><button type="button" data-cmd="undo" title="تراجع">↶</button><button type="button" data-cmd="redo" title="إعادة">↷</button></div>';
}
let lastEd = null;
document.addEventListener('focusin', (e) => { const t = e.target; if (root && root.contains(t) && (t.isContentEditable || /textarea|input/i.test(t.tagName))) lastEd = t; });
document.addEventListener('mousedown', (e) => { if (root && e.target.closest && e.target.closest('.edtool button')) e.preventDefault(); });
function runCmd(btn) {
  const ed = lastEd; if (!ed || !ed.isConnected) return;
  ed.focus();
  const isText = /textarea|input/i.test(ed.tagName);
  if (btn.dataset.sym) { insertText(ed, btn.dataset.sym); return; }
  const cmd = btn.dataset.cmd;
  if (cmd === 'formula') {
    const s = isText ? ed.value.slice(ed.selectionStart, ed.selectionEnd) : String(window.getSelection());
    insertText(ed, '$' + (s || 'E = h\\nu') + '$');
    return;
  }
  if (isText) { if (cmd === 'undo' || cmd === 'redo') document.execCommand(cmd); return; }
  document.execCommand(cmd, false, null);
  markDirty();
}
function insertText(ed, s) {
  if (/textarea|input/i.test(ed.tagName)) {
    const a = ed.selectionStart, b = ed.selectionEnd;
    ed.value = ed.value.slice(0, a) + s + ed.value.slice(b); ed.selectionStart = ed.selectionEnd = a + s.length;
  } else document.execCommand('insertText', false, s);
  markDirty();
}
function markDirty() { dirty = true; const m = $('#e_msg'); if (m && !busy) { m.className = 'small'; m.textContent = 'تعديلات غير محفوظة'; } }
const box = (id, html, dir, cls) => '<div class="edbox ' + (cls || '') + '" id="' + id + '" contenteditable="true" dir="' + dir + '" spellcheck="false">' + (html || '') + '</div>';

// صور الدرس داخل المحرّر: تُعرض ولا تُعدّل
function lockFigures(el) {
  $$('figure', el).forEach((f) => {
    f.setAttribute('contenteditable', 'false');
    const id = f.dataset.img;
    if (id && !f.querySelector('img')) getImage(id).then((src) => { const im = new Image(); im.src = src; im.alt = ''; im.style.cssText = 'display:block;width:100%'; f.insertBefore(im, f.firstChild); f.classList.add('ok'); }).catch(() => {});
  });
}
// تنظيف HTML قبل الحفظ
function clean(el) {
  const c = el.cloneNode(true);
  $$('figure', c).forEach((f) => { f.removeAttribute('contenteditable'); f.classList.remove('ok', 'bad'); f.removeAttribute('data-done'); $$('img', f).forEach((i) => i.remove()); const sk = f.querySelector('.sk'); if (sk) sk.textContent = ''; });
  $$('font', c).forEach((f) => { while (f.firstChild) f.parentNode.insertBefore(f.firstChild, f); f.remove(); });
  $$('[style]', c).forEach((x) => { if (!/^(SECTION|FIGURE)$/.test(x.tagName) && !x.classList.contains('wm')) x.removeAttribute('style'); });
  $$('[contenteditable]', c).forEach((x) => x.removeAttribute('contenteditable'));
  $$('strong', c).forEach((x) => { const b = document.createElement('b'); while (x.firstChild) b.appendChild(x.firstChild); x.replaceWith(b); });
  let h = c.innerHTML.replace(/&nbsp;/g, ' ').replace(/(<br\s*\/?>\s*)+$/i, '').replace(/^\s*(<br\s*\/?>\s*)+/i, '').trim();
  if (h.replace(/<[^>]+>/g, '').trim() === '' && h.indexOf('<figure') < 0) h = '';
  return h;
}
function saveRow(extra) {
  return '<div class="edsave"><button type="button" class="btn pri" id="e_save">حفظ التعديلات</button><button type="button" class="btn" id="e_prev">معاينة</button><button type="button" class="btn" id="e_close">إغلاق</button>' + (extra || '') + '<span class="small" id="e_msg" role="status"></span></div><div id="e_pv"></div>';
}

/* ---------- فتح عنصر ---------- */
async function open() {
  const ch = chOf(sel.ch); CH = ch; dirty = false;
  const area = $('#edarea'); area.innerHTML = '<p class="small">جارٍ التحميل…</p>';
  try {
    if (sel.type === 'cards') {
      CARDS = ch.flash ? (JSON.parse(await getImage(ch.flash)).cards || []) : [];
      return cardsEditor(area);
    }
    if (!ch.text) { area.innerHTML = '<p class="err">لا يوجد نص لهذا الشابيطر.</p>'; return; }
    T = JSON.parse(await getImage(ch.text));
    if (sel.type === 'lesson') lessonEditor(area); else questionEditor(area);
  } catch (e) { area.innerHTML = '<p class="err">تعذّر التحميل: ' + esc(e && e.message || e) + '</p>'; }
}
function lessonEditor(area) {
  const P = T.pages[sel.item];
  if (!P) { area.innerHTML = '<p class="err">هذه الصفحة غير موجودة في النص (تُعرض كصورة فقط).</p>'; return; }
  CUR = { kind: 'lesson', n: sel.item };
  area.innerHTML = '<label class="edlbl">العنوان بالعربية</label><input class="input" id="l_ar" dir="rtl" value="' + esc(P.ar || '') + '">' +
    '<label class="edlbl">محتوى الدرس (اضغط على أي نص لتعديله · الصور ثابتة)</label>' + toolbar() +
    '<div class="edlesson"><article class="lesson edbox" id="l_html" contenteditable="true" spellcheck="false" style="--c:var(--c' + CH.id + ')">' + P.html + '</article></div>' + saveRow();
  lockFigures($('#l_html'));
}
function questionEditor(area) {
  const key = sel.item, Q = T.q[key];
  const set = CH.qcm.find((s) => s.key[0] === key.replace(/^c\d+/, '')[0]);
  const q = set && set.q.find((x) => 'c' + CH.id + set.key[0] + x.n === key);
  if (!Q || !q) { area.innerHTML = '<p class="err">هذا السؤال غير موجود في النص.</p>'; return; }
  CUR = { kind: 'question', key: key, q: q };
  const opts = q.opts.split('').map((L) => {
    const o = Q.opts.find((x) => x.L === L) || { en: '', ar: '' };
    return '<div class="edopt"><label class="ok"><input type="checkbox" data-ans="' + L + '"' + (q.ans.indexOf(L) >= 0 ? ' checked' : '') + '><span class="lat">' + L + '</span></label>' +
      box('o_en_' + L, o.en, 'ltr') + box('o_ar_' + L, o.ar, 'rtl') + '</div>';
  }).join('');
  area.innerHTML = toolbar() +
    '<label class="edlbl">نص السؤال (English)</label>' + box('q_en', Q.en, 'ltr') +
    '<label class="edlbl">نص السؤال (عربي)</label>' + box('q_ar', Q.ar, 'rtl') +
    (Q.fig ? '<div class="edlesson" id="q_fig">' + Q.fig + '</div>' : '') +
    '<label class="edlbl">الاختيارات · ضع ✓ على الإجابة أو الإجابات الصحيحة</label>' + opts +
    '<label class="edlbl">الحل والشرح</label>' + box('q_s', Q.s, 'ltr', 'solt') + saveRow();
  if ($('#q_fig')) lockFigures($('#q_fig'));
}
function cardsEditor(area) {
  CUR = { kind: 'cards' };
  const row = (c, i) => '<div class="edcard" data-id="' + esc(c.id) + '"><div class="h"><b class="lat">#' + (i + 1) + '</b><input class="input lat" data-k="s" value="' + esc(c.s || '') + '" placeholder="القسم" aria-label="القسم" dir="ltr"><button type="button" class="btn sm" data-del>حذف</button></div>' +
    '<div class="r"><textarea data-k="f" dir="ltr" placeholder="السؤال (English)">' + esc(c.f || '') + '</textarea><textarea data-k="fa" dir="rtl" placeholder="السؤال بالعربية">' + esc(c.fa || '') + '</textarea></div>' +
    '<div class="r"><textarea data-k="b" dir="ltr" placeholder="الجواب (English)">' + esc(c.b || '') + '</textarea><textarea data-k="ba" dir="rtl" placeholder="الجواب بالعربية">' + esc(c.ba || '') + '</textarea></div></div>';
  area.innerHTML = '<p class="small">' + (CARDS.length ? CARDS.length + ' بطاقة' : 'لا توجد بطاقات لهذا الشابيطر بعد، أضف أول بطاقة.') + ' · حذف البطاقة يحذفها من عند كل الطلبة.</p>' + toolbar() +
    '<div id="c_list">' + CARDS.map(row).join('') + '</div><p><button type="button" class="btn" id="c_add">+ إضافة بطاقة</button></p>' + saveRow();
  CUR.row = row;
}
function readCards() {
  return $$('#c_list .edcard').map((el) => {
    const g = (k) => ($('[data-k="' + k + '"]', el).value || '').trim();
    return { id: el.dataset.id, s: g('s'), f: g('f'), fa: g('fa'), b: g('b'), ba: g('ba') };
  }).filter((c) => c.f || c.b || c.fa || c.ba);
}

/* ---------- المعاينة ---------- */
function preview() {
  const pv = $('#e_pv'); if (!pv) return;
  if (pv.innerHTML) { pv.innerHTML = ''; return; }
  let h = '';
  if (CUR.kind === 'lesson') h = '<article class="lesson" style="--c:var(--c' + CH.id + ')">' + fmt(clean($('#l_html'))) + '</article>';
  else if (CUR.kind === 'question') {
    h = '<div class="qtext"><p class="stem" dir="ltr">' + fmt(clean($('#q_en'))) + '</p><p class="stem sa" dir="rtl">' + fmt(clean($('#q_ar'))) + '</p></div>' +
      '<div class="olist" dir="ltr">' + CUR.q.opts.split('').map((L) => '<div class="orow' + ($('[data-ans="' + L + '"]').checked ? ' good' : '') + '"><b class="ol lat">' + L + '</b><span class="ot"><span class="oe" dir="ltr">' + fmt(clean($('#o_en_' + L))) + '</span><span class="oa" dir="rtl">' + fmt(clean($('#o_ar_' + L))) + '</span></span></div>').join('') + '</div>' +
      '<div class="sol"><p class="solh">الحل والشرح</p><div class="solt">' + fmt(clean($('#q_s'))) + '</div></div>';
  } else h = readCards().map((c) => '<div class="edcard"><p class="fq" dir="ltr">' + fmt(esc(c.f)) + '</p><p class="fqa" dir="rtl">' + fmt(esc(c.fa)) + '</p><hr><p dir="ltr">' + fmt(esc(c.b)) + '</p><p class="fqa" dir="rtl">' + fmt(esc(c.ba)) + '</p></div>').join('');
  pv.innerHTML = '<div class="edprev"><small>معاينة كما يراها الطالب</small>' + h + '</div>';
  $$('figure', pv).forEach((f) => { const id = f.dataset.img; if (id) getImage(id).then((src) => { const im = new Image(); im.src = src; im.style.cssText = 'display:block;width:100%'; f.insertBefore(im, f.firstChild); f.classList.add('ok'); }).catch(() => {}); });
  typeset(pv);
}

/* ---------- الحفظ ---------- */
const stamp = () => Date.now().toString(36);
async function freshChapter() { const cur = await loadManifest(); const c = cur.chapters.find((x) => x.id === CH.id); return [cur, c]; }
async function save() {
  if (busy) return;
  const msg = $('#e_msg'), btn = $('#e_save');
  const say = (t, ok) => { msg.className = ok === true ? 'okmsg' : ok === false ? 'err' : 'small'; msg.textContent = t; };
  busy = true; btn.disabled = true; say('جارٍ الحفظ…');
  try {
    if (CUR.kind === 'cards') {
      const cards = readCards();
      if (cards.some((c) => !c.f || !c.b)) throw new Error('كل بطاقة تحتاج سؤالاً وجواباً (بالإنجليزية على الأقل).');
      const id = 'flash_c' + CH.id + '_e' + stamp();
      await uploadImage(id, JSON.stringify({ cards: cards }));
      const [cur, c] = await freshChapter();
      if (c.flash && !c.flashBase) c.flashBase = c.flash;
      c.flash = id;
      await uploadManifest(cur); M = cur; CH = c; CARDS = cards;
    } else {
      let ansFix = null;
      if (CUR.kind === 'lesson') {
        const P = T.pages[CUR.n];
        P.html = clean($('#l_html')); P.ar = ($('#l_ar').value || '').trim();
      } else {
        const Q = T.q[CUR.key];
        const ans = $$('[data-ans]').filter((x) => x.checked).map((x) => x.dataset.ans).join('');
        if (!ans) throw new Error('اختر إجابة صحيحة واحدة على الأقل.');
        Q.en = clean($('#q_en')); Q.ar = clean($('#q_ar')); Q.s = clean($('#q_s'));
        CUR.q.opts.split('').forEach((L) => {
          let o = Q.opts.find((x) => x.L === L);
          if (!o) { o = { L: L, en: '', ar: '', fig: '' }; Q.opts.push(o); }
          o.en = clean($('#o_en_' + L)); o.ar = clean($('#o_ar_' + L));
        });
        if (ans !== CUR.q.ans) ansFix = ans;
      }
      const id = 'text_c' + CH.id + '_e' + stamp();
      await uploadImage(id, JSON.stringify(T));
      const [cur, c] = await freshChapter();
      if (!c.textBase) c.textBase = c.text;
      c.text = id;
      if (ansFix) {
        cur.fix = cur.fix || {}; cur.fix.ans = cur.fix.ans || {}; cur.fix.ans[CUR.key] = ansFix;
        c.qcm.forEach((s) => s.q.forEach((q) => { if ('c' + c.id + s.key[0] + q.n === CUR.key) q.ans = ansFix; }));
        CUR.q.ans = ansFix;
      }
      await uploadManifest(cur); M = cur; CH = c;
    }
    dirty = false;
    say('✓ حُفظ. يظهر التعديل للطلبة عند فتح الموقع من جديد.', true);
    renderSel();
  } catch (e) { say((e && e.message) || String(e), false); }
  busy = false; btn.disabled = false;
}
async function revert(field) {
  const [cur, c] = await freshChapter();
  if (field === 'text' && c.textBase) { c.text = c.textBase; delete c.textBase; }
  if (field === 'flash' && c.flashBase) { c.flash = c.flashBase; delete c.flashBase; }
  await uploadManifest(cur); M = cur;
  $('#edarea').innerHTML = '<p class="okmsg">✓ رجعت النسخة الأصلية.</p>';
  renderSel();
}

/* ---------- الأحداث ---------- */
let armed = null;
document.addEventListener('change', (e) => {
  if (!root || !root.contains(e.target)) return;
  const t = e.target;
  if (t.id === 'e_ch' || t.id === 'e_ty' || t.id === 'e_it') {
    if (t.id === 'e_ch') sel.ch = +t.value;
    if (t.id === 'e_ty') sel.type = t.value;
    if (t.id === 'e_it') sel.item = t.value; else renderSel();
    return;
  }
  if (t.matches('[data-ans]')) markDirty();
});
document.addEventListener('input', (e) => { if (root && root.contains(e.target) && !e.target.closest('#edsel')) markDirty(); });
document.addEventListener('paste', (e) => {
  const t = e.target.closest && e.target.closest('[contenteditable="true"]');
  if (!t || !root || !root.contains(t)) return;
  e.preventDefault();
  const s = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, s);
});
document.addEventListener('click', async (e) => {
  if (!root || !root.contains(e.target)) return;
  const t = e.target;
  const tb = t.closest('.edtool button'); if (tb) { runCmd(tb); return; }
  if (t.closest('#e_open')) {
    if (dirty && armed !== 'open') { armed = 'open'; const m = $('#e_msg'); if (m) { m.className = 'err'; m.textContent = 'لديك تعديلات غير محفوظة. اضغط «فتح» مرة أخرى لتجاهلها.'; } return; }
    armed = null; open(); return;
  }
  if (t.closest('#e_save')) { save(); return; }
  if (t.closest('#e_prev')) { preview(); return; }
  if (t.closest('#e_close')) { if (dirty && armed !== 'close') { armed = 'close'; const m = $('#e_msg'); m.className = 'err'; m.textContent = 'لديك تعديلات غير محفوظة. اضغط «إغلاق» مرة أخرى لتجاهلها.'; return; } armed = null; dirty = false; $('#edarea').innerHTML = ''; return; }
  const rv = t.closest('#e_revert, #e_revertc');
  if (rv) {
    if (armed !== rv.id) { armed = rv.id; rv.textContent = 'تأكيد؟ تضيع كل التعديلات'; setTimeout(() => { if (rv.isConnected) rv.textContent = rv.dataset.label; if (armed === rv.id) armed = null; }, 4000); return; }
    armed = null;
    try { await revert(rv.id === 'e_revert' ? 'text' : 'flash'); } catch (err) { rv.textContent = (err && err.message) || 'خطأ'; }
    return;
  }
  if (t.closest('#c_add')) {
    const n = $$('#c_list .edcard').length;
    const c = { id: 'c' + CH.id + 'k' + stamp(), s: '', f: '', fa: '', b: '', ba: '' };
    $('#c_list').insertAdjacentHTML('beforeend', CUR.row(c, n));
    const last = $('#c_list .edcard:last-child textarea'); if (last) last.focus();
    markDirty(); return;
  }
  const del = t.closest('[data-del]');
  if (del) {
    if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'تأكيد الحذف؟'; setTimeout(() => { if (del.isConnected) { del.dataset.armed = ''; del.textContent = 'حذف'; } }, 4000); return; }
    del.closest('.edcard').remove(); markDirty(); return;
  }
});
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
