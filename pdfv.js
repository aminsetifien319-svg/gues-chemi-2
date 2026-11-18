// قارئ الدرس PDF داخل الموقع مع أدوات الكتابة (على طريقة Samsung Notes).
// الصفحات صور محمية بعلامة البريد؛ لا تحميل ولا مشاركة ولا طباعة.
// ملاحظات الطالب تُحفظ تلقائياً في حسابه (Firestore: notes/<email>/ch/<chapter>).

const PEN_COLS = ['#e53935', '#fb8c00', '#fdd835', '#26c6b0', '#42a5f5', '#1e40af', '#8e44ad', '#111827', '#ffffff'];
const STICK = [['', 'بدون'], ['#fef08a', ''], ['#fbcfe8', ''], ['#bfdbfe', ''], ['#bbf7d0', ''], ['#fed7aa', '']];
const HL_COLS = ['#fde047', '#86efac', '#f9a8d4', '#93c5fd', '#fdba74'];
const KINDS = [['pen', 'قلم حبر'], ['ball', 'قلم جاف'], ['pencil', 'رصاص'], ['brush', 'فرشاة']];
const ZOOMS = [[0.75, '75%'], [1, 'ملاءمة'], [1.25, '125%'], [1.5, '150%'], [2, '200%'], [2.5, '250%']];
const MAXJ = 980000;

const I = {
  text: '<svg viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M6 9h1M9 9h1M12 9h1M15 9h1M18 9h0M6 12h1M9 12h1M12 12h1M15 12h1M18 12h0M8 15.5h8"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20l1.2-4.6L15.8 4.8a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z"/><path d="M14 6.6l3.4 3.4"/></svg>',
  hl: '<svg viewBox="0 0 24 24"><path d="M9 14l-3 3v3h6l1-1"/><path d="M8.5 13.5l7-9 4 4-9 7z"/><path d="M6 20h14"/></svg>',
  er: '<svg viewBox="0 0 24 24"><path d="M8.5 19.5l-4-4a1.6 1.6 0 0 1 0-2.3l8.7-8.7a1.6 1.6 0 0 1 2.3 0l4 4a1.6 1.6 0 0 1 0 2.3l-6.7 6.7"/><path d="M8.5 19.5h11"/><path d="M8 10l6 6"/></svg>',
  lasso: '<svg viewBox="0 0 24 24" stroke-dasharray="2.6 2.6"><ellipse cx="12" cy="10.5" rx="8.5" ry="6"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 7L4.5 11.5 9 16"/><path d="M5 11.5h9a5.5 5.5 0 0 1 0 11h-2"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path d="M15 7l4.5 4.5L15 16"/><path d="M19 11.5h-9a5.5 5.5 0 0 0 0 11h2"/></svg>',
  laser: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/></svg>',
  hand: '<svg viewBox="0 0 24 24"><path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5.5a1.5 1.5 0 0 1 3 0V13"/><path d="M17 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6.5 6.5 0 0 1-5.2-2.6L4 14.6a1.5 1.5 0 0 1 2.3-1.9L8 14.5"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/></svg>',
  sel: '<svg viewBox="0 0 24 24"><path d="M4 6V4h2M18 4h2v2M20 18v2h-2M6 20H4v-2"/><path d="M9 8h6M12 8v8M10.5 16h3"/></svg>',
  pagecfg: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/><path d="M14 3v5h5"/><path d="M19 8v3"/><circle cx="17.5" cy="17.5" r="2.2"/><path d="M17.5 13.5v1.3M17.5 20.2v1.3M13.5 17.5h1.3M20.2 17.5h1.3M14.7 14.7l.9.9M19.4 19.4l.9.9M14.7 20.3l.9-.9M19.4 15.6l.9-.9"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>'
};

export function mountPdf(root, o) {
  const ch = o.ch, ids = ch.pdf, N = ids.length, R = ch.pdfR || [];
  const esc = o.esc;
  let LS = {}; try { LS = JSON.parse(localStorage.getItem('gueschemi.pvtools') || '{}') || {}; } catch (e) {}
  const st = Object.assign({ tool: '', kind: 'pen', pc: PEN_COLS[5], pw: 6, hc: HL_COLS[0], hw: 22, emode: 'stroke', ehl: false, straight: false, tz: 16, tc: '#111827', zoom: 1, tone: 'white' }, LS);
  st.tool = '';
  const keepLS = () => { try { const c = Object.assign({}, st); delete c.tool; localStorage.setItem('gueschemi.pvtools', JSON.stringify(c)); } catch (e) {} };

  let data = { v: 1, p: {} }, loaded = false, dirty = false, saveT = 0, saving = false, dead = false;
  const undo = [], redo = [];
  let pages = [], byKey = {};   // صفحات الدرس + صفحات ملاحظات الطالب بالترتيب
  let cur = 0, penSeen = false;

  root.innerHTML = '<div class="pv" style="--c:var(--c' + ch.id + ')">' +
    '<div class="pvtop"><a class="pvback" href="#/c/' + ch.id + '" aria-label="عودة"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg><span>عودة</span></a>' +
    '<div class="pvttl"><b class="lat">' + esc(ch.en) + '</b><small>' + esc(ch.ar) + '</small></div>' +
    '<span class="pvsave" aria-live="polite"></span>' +
    '<select class="pvsel" data-pv="page" dir="ltr" aria-label="الصفحة"></select>' +
    '<button type="button" class="pvnew pvpaste" data-pv="paste" hidden>📋 لصق</button>' +
    '<button type="button" class="pvnew" data-pv="new" title="إضافة صفحة فارغة خاصة بك بعد الصفحة الحالية لتكتب فيها ملاحظاتك"><span class="pl">＋</span><span class="tx">صفحة ملاحظات</span></button>' +
    '<select class="pvsel" data-pv="zoom" aria-label="التكبير">' + ZOOMS.map((z) => '<option value="' + z[0] + '"' + (z[0] === st.zoom ? ' selected' : '') + '>' + z[1] + '</option>').join('') + '</select>' +
    '<button type="button" class="pvfs" data-pv="full" aria-label="ملء الشاشة" title="ملء الشاشة (Plein écran)"><svg viewBox="0 0 24 24"><path class="in" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><path class="out" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg></button></div>' +
    '<div class="pvscroll"><div class="pvdoc" style="--pz:' + st.zoom + '"></div></div>' +
    '<div class="pvpop" hidden></div>' +
    '<div class="pvbar" role="toolbar" aria-label="أدوات الكتابة">' +
    btn('text', 'كتابة بلوحة المفاتيح') + btn('pen', 'قلم') + btn('hl', 'قلم تظليل') + btn('er', 'ممحاة') + btn('lasso', 'تحديد') + (ch.pdfT ? btn('sel', 'تحديد نص من الدرس (نسخ، Google، Gemini)') : '') +
    '<button type="button" class="pvb" data-act="undo" aria-label="تراجع" disabled>' + I.undo + '</button><button type="button" class="pvb" data-act="redo" aria-label="إعادة" disabled>' + I.redo + '</button>' +
    '<button type="button" class="pvb" data-act="ins" aria-label="إدراج" title="إدراج: صورة، كاميرا، تسجيل صوتي، جدول، ملصق">' + I.plus + '</button>' + btn('laser', 'مؤشر ليزر') + '<button type="button" class="pvb on" data-tool="" aria-label="قراءة وتمرير">' + I.hand + '</button>' +
    '<button type="button" class="pvb pvpg" data-act="page" aria-label="إعدادات صفحة الملاحظات" title="إعدادات صفحة الملاحظات (اللون، النوع، الحذف)" hidden>' + I.pagecfg + '</button></div></div>';
  function btn(t, l) { return '<button type="button" class="pvb" data-tool="' + t + '" aria-label="' + l + '" title="' + l + '">' + I[t] + (t === 'pen' || t === 'hl' || t === 'text' ? '<i class="dot"></i>' : '') + '</button>'; }

  const $ = (s) => root.querySelector(s);
  const PV = $('.pv'), DOC = $('.pvdoc'), SCR = $('.pvscroll'), POP = $('.pvpop'), BAR = $('.pvbar'), SAVE = $('.pvsave');
  const selPage = $('[data-pv="page"]'), selZoom = $('[data-pv="zoom"]');
  paintDots();

  /* ---------- تحميل الصور حسب الحاجة + تفعيل اللوحات القريبة فقط (توفير الذاكرة) ---------- */
  const io = new IntersectionObserver((ents) => {
    ents.forEach((e) => {
      const p = pages[+e.target.dataset.i];
      if (e.isIntersecting) {
        if (!p.img && p.li != null) { p.img = true; o.getImage(ids[p.li]).then((src) => { if (dead) return; const im = new Image(); im.alt = ''; im.draggable = false; im.decoding = 'async'; im.onload = () => p.fig.classList.add('ok'); im.src = src; p.fig.insertBefore(im, p.fig.firstChild); }).catch(() => { p.img = false; const s = p.fig.querySelector('.sk'); if (s) s.textContent = 'تعذّر تحميل الصفحة. تحقق من الاتصال.'; }); }
        if (!p.on) { p.on = true; sizePage(p); }
      } else if (p.on) { p.on = false; p.cv.width = p.cv.height = 0; p.base.width = p.base.height = 0; }
    });
  }, { rootMargin: '900px 0px' });
  const ro = new ResizeObserver(() => pages.forEach((p) => { p.fig.style.setProperty('--pw', p.fig.clientWidth + 'px'); if (p.on) sizePage(p); }));
  ro.observe(DOC);

  function sizePage(p) {
    const cw = p.fig.clientWidth, chh = p.fig.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(2400000 / Math.max(1, cw * chh)));
    const w = Math.round(cw * dpr), h = Math.round(chh * dpr);
    p.fig.style.setProperty('--pw', p.fig.clientWidth + 'px');
    if (!w || !h) return;
    if (p.cv.width !== w || p.cv.height !== h) { p.cv.width = w; p.cv.height = h; p.base.width = w; p.base.height = h; }
    renderBase(p); blit(p); renderTexts(p);
  }
  const items = (k) => data.p[k] || (data.p[k] = []);

  /* ---------- بناء الصفحات: صفحات الدرس + صفحات الملاحظات التي يضيفها الطالب ---------- */
  const PAPERS = [['blank', 'فارغة'], ['lined-n', 'مسطّرة ضيقة'], ['lined', 'مسطّرة'], ['lined-w', 'مسطّرة واسعة'], ['grid-n', 'مربعات صغيرة'], ['grid', 'مربعات'], ['grid-w', 'مربعات كبيرة'], ['dot-n', 'نقاط متقاربة'], ['dot', 'نقاط'], ['dot-w', 'نقاط متباعدة'], ['oxford', 'أكسفورد (بهامش)'], ['cornell', 'كورنيل (للمراجعة)'], ['check', 'قائمة مهام'], ['table', 'جدول عمودين']];
  const TONES = [['white', '#ffffff', 'بيضاء'], ['cream', '#fdf6e3', 'كريمي'], ['yellow', '#fff3b8', 'صفراء'], ['peach', '#ffdcc2', 'مشمشي'], ['pink', '#fbd5dc', 'وردية'], ['mint', '#d3f2e4', 'نعناعي'], ['sky', '#d6e8fa', 'سماوية'], ['lavender', '#e6dffa', 'بنفسجية'], ['gray', '#e5e7eb', 'رمادية'], ['sage', '#a7c4b5', 'زيتية'], ['navy', '#1e293b', 'كحلية'], ['black', '#141518', 'سوداء']];
  const toneOf = (k) => TONES.find((t) => t[0] === k) || TONES[0];
  const isDarkTone = (k) => k === 'black' || k === 'navy';
  // خلفية الورقة: صور SVG صغيرة مكرّرة، مقاسها نسبة من عرض الصفحة حتى تتكبّر مع التكبير
  function paperCSS(paper, tone, pw) {
    const dark = isDarkTone(tone), ln = dark ? 'rgba(255,255,255,0.22)' : 'rgba(60,90,150,0.32)', dt = dark ? 'rgba(255,255,255,0.38)' : 'rgba(60,80,120,0.45)';
    const enc = (s) => "url('data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" ' + s + '</svg>').replace(/'/g, '%27') + "')";
    const U = (k) => (pw ? (pw * k).toFixed(2) + 'px' : 'calc(var(--pw,800px) * ' + k + ')');
    const [base, sz] = (paper || 'lined').split('-');
    const k = { lined: { n: 0.024, '': 0.034, w: 0.05 }, grid: { n: 0.02, '': 0.03, w: 0.05 }, dot: { n: 0.022, '': 0.034, w: 0.05 } };
    const step = (b) => k[b][sz || ''];
    const lineRow = enc('width="100" height="10" preserveAspectRatio="none" viewBox="0 0 100 10"><rect y="9.4" width="100" height="0.6" fill="' + ln + '"/>');
    const L = [];
    if (base === 'lined' || base === 'oxford' || base === 'cornell' || base === 'table') L.push([lineRow, '100% ' + U(base === 'lined' ? step('lined') : 0.034)]);
    if (base === 'grid') L.push([enc('width="10" height="10" viewBox="0 0 10 10"><path d="M10 0V10H0" fill="none" stroke="' + ln + '" stroke-width="0.5"/>'), U(step('grid')) + ' ' + U(step('grid'))]);
    if (base === 'dot') L.push([enc('width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="0.75" fill="' + dt + '"/>'), U(step('dot')) + ' ' + U(step('dot'))]);
    if (base === 'check') L.push([enc('width="100" height="10" preserveAspectRatio="xMaxYMid meet" viewBox="0 0 100 10"><rect y="9.4" width="100" height="0.6" fill="' + ln + '"/><rect x="95.2" y="2.8" width="3.6" height="3.6" rx="0.6" fill="none" stroke="' + dt + '" stroke-width="0.5"/>'), '100% ' + U(0.05)]);
    if (base === 'oxford') L.unshift([enc('width="100" height="100" preserveAspectRatio="none" viewBox="0 0 100 100"><rect x="91" width="0.35" height="100" fill="#ef4444" opacity="0.7"/><rect width="100" height="7" fill="' + (dark ? 'rgba(255,255,255,0.04)' : 'rgba(60,90,150,0.05)') + '"/>'), '100% 100%']);
    if (base === 'cornell') L.unshift([enc('width="100" height="100" preserveAspectRatio="none" viewBox="0 0 100 100"><rect x="70" width="0.4" height="78" fill="' + dt + '"/><rect y="78" width="100" height="0.5" fill="' + dt + '"/><rect y="78.5" width="100" height="21.5" fill="' + (dark ? 'rgba(255,255,255,0.05)' : 'rgba(60,90,150,0.06)') + '"/>'), '100% 100%']);
    if (base === 'table') L.unshift([enc('width="100" height="100" preserveAspectRatio="none" viewBox="0 0 100 100"><rect x="49.8" width="0.4" height="100" fill="' + dt + '"/>'), '100% 100%']);
    return 'background-color:' + toneOf(tone)[1] + (L.length ? ';background-image:' + L.map((x) => x[0]).join(',') + ';background-size:' + L.map((x) => x[1]).join(',') + ';background-repeat:repeat' : '');
  }
  function stylePicker(mode, after) {
    return '<p class="pvnl">لون الورقة</p><div class="pvtones2">' + TONES.map((t) => '<button type="button" class="pvtone2' + (t[0] === st.tone ? ' on' : '') + '" data-tone="' + t[0] + '" style="background:' + t[1] + '" title="' + t[2] + '" aria-label="' + t[2] + '"></button>').join('') + '</div>' +
      '<p class="pvnl">نوع الورقة <small>(' + (mode === 'edit' ? 'اضغط لتغيير هذه الصفحة' : 'اضغط لإضافة الصفحة') + ')</small></p><div class="pvstyles">' +
      PAPERS.map((x) => '<button type="button" data-paper="' + x[0] + '" data-after="' + after + '"><i class="pvthumb" data-p="' + x[0] + '" style="' + paperCSS(x[0], st.tone, 150) + '"></i><span>' + x[1] + '</span></button>').join('') + '</div>';
  }
  function refreshThumbs() { POP.querySelectorAll('.pvthumb').forEach((i) => { i.setAttribute('style', paperCSS(i.dataset.p, st.tone, 150)); }); }
  const addBar = () => '';
  function build() {
    const keepK = pages[cur] ? pages[cur].k : null;
    if (sel) { if (sel.el) sel.el.remove(); sel = null; }
    io.disconnect();
    pages.forEach((p) => { p.cv.width = p.cv.height = 0; p.base.width = p.base.height = 0; });
    const X = data.x || {}, seq = [];
    const noteFig = (n, after) => { seq.push({ k: 'n' + n.id, li: null, after: after, dark: isDarkTone(n.tone), nid: n.id }); return '<figure class="pvp note' + (isDarkTone(n.tone) ? ' dark' : '') + '" data-i="' + (seq.length - 1) + '" style="aspect-ratio:' + (R[Math.max(0, after)] || 1.7778) + ';' + paperCSS(n.paper, n.tone || 'white') + '"><canvas class="pvc"></canvas><div class="pvlay"></div><i class="wm"></i></figure>' + addBar(after); };
    let h = addBar(-1);
    (X['-1'] || []).forEach((n) => { h += noteFig(n, -1); });
    for (let i = 0; i < N; i++) {
      seq.push({ k: String(i), li: i });
      h += '<figure class="pvp" data-i="' + (seq.length - 1) + '" style="aspect-ratio:' + (R[i] || 1.7778) + '"><span class="sk"></span><canvas class="pvc"></canvas><div class="pvlay"></div><i class="wm"></i><span class="pnum lat">' + (i + 1) + '</span></figure>' + addBar(i);
      (X[String(i)] || []).forEach((n) => { h += noteFig(n, i); });
    }
    const old = byKey; const keepImg = {};
    Object.keys(old).forEach((k) => { const im = old[k].fig.querySelector('img'); if (im) keepImg[k] = im; });
    DOC.innerHTML = h;
    pages = []; byKey = {};
    DOC.querySelectorAll('figure.pvp').forEach((fig) => {
      const q = seq[+fig.dataset.i], cv = fig.querySelector('canvas');
      const p = Object.assign({ idx: pages.length, fig: fig, cv: cv, ctx: cv.getContext('2d'), base: document.createElement('canvas'), lay: fig.querySelector('.pvlay'), on: false, img: false }, q);
      fig.dataset.i = String(p.idx);
      p.bctx = p.base.getContext('2d');
      if (p.li == null) fig.classList.add('ok');
      else if (keepImg[p.k]) { fig.insertBefore(keepImg[p.k], fig.firstChild); fig.classList.add('ok'); p.img = true; }
      pages.push(p); byKey[p.k] = p;
    });
    DOC.querySelectorAll('.wm').forEach((w) => { w.style.backgroundImage = o.wm(); });
    pages.forEach((p) => io.observe(p.fig));
    const nn = pages.length - N;
    selPage.innerHTML = pages.map((p, i) => '<option value="' + i + '">' + (p.li != null ? (p.li + 1) + ' / ' + N : '📝 ' + (p.after + 1) + ' +') + '</option>').join('');
    const small = $('.pvttl small'); if (small) small.textContent = ch.ar + (nn ? ' · ' + nn + (nn === 1 ? ' صفحة ملاحظات' : nn === 2 ? ' صفحتا ملاحظات' : nn <= 10 ? ' صفحات ملاحظات' : ' صفحة ملاحظات') : '');
    if (keepK && byKey[keepK]) cur = byKey[keepK].idx; else cur = Math.max(0, Math.min(cur, pages.length - 1));
    selPage.value = String(cur);
    undo.length = 0; redo.length = 0; uiUndo(); syncPgBtn();
  }
  function syncPgBtn() { const b = BAR.querySelector('[data-act="page"]'); if (b) b.hidden = !(pages[cur] && pages[cur].nid); }
  function addNote(after, paper, tone) {
    data.x = data.x || {};
    const L = data.x[String(after)] || (data.x[String(after)] = []);
    const n = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), paper: paper, tone: tone || 'white' };
    L.push(n);
    build(); touch();
    const p = byKey['n' + n.id]; if (p) { cur = p.idx; selPage.value = String(cur); requestAnimationFrame(() => goPage(p.idx, true)); }
  }
  function delNote(id) {
    const X = data.x || {};
    Object.keys(X).forEach((a) => { X[a] = X[a].filter((n) => n.id !== id); if (!X[a].length) delete X[a]; });
    delete data.p['n' + id];
    build(); touch();
  }
  let addOpen = null;
  function closeAdd() { if (!addOpen) return; addOpen.classList.remove('open'); const c = addOpen.querySelector('.pvpaper'); if (c) c.remove(); addOpen = null; }
  DOC.addEventListener('click', (e) => {
    const a = e.target.closest('[data-add]'), d = e.target.closest('[data-del]'), pp = e.target.closest('[data-paper]');
    if (pp && pp.closest('.pvadd')) { const after = +pp.closest('.pvadd').dataset.after; closeAdd(); addNote(after, pp.dataset.paper); return; }
    if (e.target.closest('[data-paper-x]')) { closeAdd(); return; }
    if (a) {
      const bar = a.parentNode;
      if (addOpen === bar) { closeAdd(); return; }
      closeAdd(); bar.classList.add('open'); addOpen = bar;
      bar.insertAdjacentHTML('beforeend', '<div class="pvpaper"><p><b>صفحة ملاحظات جديدة</b> تُضاف هنا بين صفحات الدرس، لتكتب فيها بالقلم أو بلوحة المفاتيح. هي خاصة بك وتُحفظ في حسابك، والدرس الأصلي لا يتغيّر. اختر نوع الورقة:</p><div class="pvpapers">' + PAPERS.map((x) => '<button type="button" data-paper="' + x[0] + '"><i class="pvsw paper-' + x[0] + '"></i><span>' + x[1] + '</span></button>').join('') + '</div><button type="button" class="pvpx" data-paper-x>إلغاء</button></div>');
      return;
    }
    const sty = e.target.closest('[data-style]');
    if (sty) { editStylePop(sty.dataset.style); return; }
    if (d) {
      if (d.dataset.sure) delNote(d.dataset.del);
      else { d.dataset.sure = '1'; d.classList.add('sure'); d.innerHTML = I.trash + '<span>اضغط مرة أخرى للحذف</span>'; setTimeout(() => { if (d.isConnected) { delete d.dataset.sure; d.classList.remove('sure'); d.innerHTML = I.trash; } }, 3000); }
    }
  });

  /* ---------- نسخ جمل قصيرة من الدرس + بحث Google / Gemini ---------- */
  const MAXC = 300;
  let TX = null, txP = null, tsel = null, clip = null;
  function loadTX() { if (!ch.pdfT) return Promise.resolve(null); if (!txP) txP = o.getImage(ch.pdfT).then((s) => { TX = JSON.parse(s).p || []; return TX; }).catch(() => { txP = null; return null; }); return txP; }
  function copyText(t) {
    const fb = () => { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;top:-100px;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); };
    try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).catch(fb); } catch (e) {}
    fb(); return Promise.resolve();
  }
  function toast(msg) { const t = document.createElement('div'); t.className = 'pvtoast'; t.textContent = msg; PV.appendChild(t); setTimeout(() => t.remove(), 2200); }
  function clearTSel() { if (tsel) { tsel.el.remove(); tsel = null; } }
  function makeTSel(p, a, b) {
    clearTSel();
    if (!TX) { loadTX().then(() => { if (TX) makeTSel(p, a, b); else toast('النص غير متاح لهذه الصفحة'); }); return; }
    const L = TX[p.li] || [];
    const tap = Math.abs(a[0] - b[0]) < 80 && Math.abs(a[1] - b[1]) < 80;
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    let got = L.filter((l) => tap ? (a[0] >= l[0] - 40 && a[0] <= l[2] + 40 && a[1] >= l[1] - 40 && a[1] <= l[3] + 40)
      : (Math.min(x1, l[2]) - Math.max(x0, l[0]) > (l[2] - l[0]) * 0.3 || (l[0] >= x0 && l[2] <= x1)) && (Math.min(y1, l[3]) - Math.max(y0, l[1]) > (l[3] - l[1]) * 0.5));
    if (!got.length) { toast('لا يوجد نص هنا'); return; }
    got.sort((u, v) => (u[1] - v[1]) || (u[0] - v[0]));
    let txt = got.map((l) => l[4]).join('\n'), cut = false;
    if (txt.length > MAXC) { txt = txt.slice(0, MAXC); cut = true; }
    const el = document.createElement('div'); el.className = 'pvtsel';
    el.innerHTML = got.map((l) => '<i style="left:' + l[0] / 100 + '%;top:' + l[1] / 100 + '%;width:' + (l[2] - l[0]) / 100 + '%;height:' + (l[3] - l[1]) / 100 + '%"></i>').join('') +
      '<div class="pvtbar" style="top:' + Math.max(0, Math.min(...got.map((l) => l[1])) / 100) + '%"><button type="button" data-t="copy">نسخ</button><button type="button" data-t="google">بحث Google</button><button type="button" data-t="gemini">اسأل Gemini</button><span class="lat">' + txt.length + '/' + MAXC + '</span></div>';
    p.lay.appendChild(el); tsel = { el: el, txt: txt };
    if (cut) toast('النسخ محدود بـ ' + MAXC + ' حرفاً في كل مرة');
    el.querySelector('.pvtbar').addEventListener('pointerdown', (e) => e.stopPropagation());
    el.querySelector('.pvtbar').addEventListener('click', (e) => {
      const k = e.target.closest('[data-t]'); if (!k) return; const t = tsel ? tsel.txt : '';
      if (k.dataset.t === 'copy') copyText(t).then(() => toast('تم النسخ'));
      else if (k.dataset.t === 'google') window.open('https://www.google.com/search?q=' + encodeURIComponent(t), '_blank', 'noopener');
      else if (k.dataset.t === 'gemini') { if (window.__gcAsk) window.__gcAsk(t); else window.open('https://www.google.com/search?udm=50&q=' + encodeURIComponent(t), '_blank', 'noopener'); }
      clearTSel();
    });
  }
  /* نسخ ولصق كتابة الطالب نفسه (بالتحديد) */
  function copyStrokes() {
    if (!sel) return;
    clip = JSON.parse(JSON.stringify(sel.items));
    const t = sel.items.filter((s) => s.t === 'x').map((s) => s.s).join('\n');
    if (t) copyText(t);
    syncPaste(); toast('تم النسخ. اضغط «لصق» في الصفحة التي تريد');
  }
  function pasteStrokes() {
    if (!clip) return; const p = pages[cur]; if (!p) return;
    clearSel();
    const add = clip.map((s) => !s.pts ? Object.assign({}, s, { x: Math.min(9000, s.x + 150), y: Math.min(9500, s.y + 150) }) : Object.assign({}, s, { pts: s.pts.map((v, k) => Math.min(10000, v + 150)) }));
    const op = { pg: p.k, add: add, del: [] }; apply(op, false); commit(op);
  }
  function syncPaste() { const b = $('[data-pv="paste"]'); if (b) b.hidden = !clip; }

  /* ---------- إدراج: صورة، كاميرا، تسجيل صوتي، جدول، ملصق ---------- */
  const MEDIA = {};   // id -> Promise(dataURL)
  const media = (id) => MEDIA[id] || (MEDIA[id] = o.loadMedia(id).catch((e) => { delete MEDIA[id]; throw e; }));
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let objSel = null;
  function placeObj(p, s) {   // مكان العنصر الجديد: وسط الجزء الظاهر من الصفحة
    const r = p.fig.getBoundingClientRect(), vh = window.innerHeight;
    const cy = Math.max(r.top, 0) + (Math.min(r.bottom, vh) - Math.max(r.top, 0)) / 2;
    s.x = Math.round((10000 - s.w) / 2); s.y = Math.max(0, Math.min(10000 - (s.h || 1500), Math.round((cy - r.top) / r.height * 10000 - (s.h || 1500) / 2)));
    const L = data.p[p.k] || [];
    for (let k = 0; k < 8 && L.some((q) => !q.pts && Math.abs(q.x - s.x) < 600 && Math.abs(q.y - s.y) < 600); k++) { s.x = Math.max(0, Math.min(10000 - s.w, s.x + 700)); s.y = Math.max(0, Math.min(9200, s.y + 700)); }
  }
  function addObj(s) {
    const p = pages[cur]; if (!p) return; placeObj(p, s); const op = { pg: p.k, add: [s], del: [] }; apply(op, false); commit(op);
    if (st.tool) setTool('');   // وضع اليد حتى يستطيع تحريكه وتكبيره مباشرة
    requestAnimationFrame(() => { const el = [...p.lay.children].find((x) => x._s === s); if (el) selectObj(p, el); });
  }
  function objEl(p, s) {
    const el = document.createElement('div'); el.className = 'pvobj pv-' + s.t; el._s = s;
    el.style.left = s.x / 100 + '%'; el.style.top = s.y / 100 + '%'; el.style.width = s.w / 100 + '%';
    if (s.h) el.style.height = s.h / 100 + '%';
    if (s.t === 'i') {
      el.innerHTML = '<span class="sk">…</span>';
      media(s.m).then((src) => { el.innerHTML = ''; const im = new Image(); im.src = src; im.alt = ''; im.draggable = false; el.appendChild(im); }).catch(() => { el.innerHTML = '<span class="sk">تعذّر تحميل الصورة</span>'; });
    } else if (s.t === 'a') {
      el.innerHTML = '<button type="button" class="pvplay">▶</button><span class="pvdur lat">' + fmtDur(s.d || 0) + '</span><i class="pvwave"></i>';
      el.querySelector('.pvplay').addEventListener('click', (e) => { e.stopPropagation(); playAudio(el, s); });
    } else if (s.t === 'tb') {
      const g = document.createElement('div'); g.className = 'pvgrid'; g.style.gridTemplateColumns = 'repeat(' + s.c + ',1fr)';
      for (let i = 0; i < s.r * s.c; i++) {
        const inp = document.createElement('textarea'); inp.rows = 1; inp.dir = 'auto'; inp.value = (s.v && s.v[i]) || ''; inp.className = i < s.c ? 'hd' : '';
        inp.addEventListener('input', () => { s.v = s.v || []; s.v[i] = inp.value; touch(); });
        inp.addEventListener('pointerdown', (e) => e.stopPropagation());
        g.appendChild(inp);
      }
      el.appendChild(g);
    }
    el.addEventListener('pointerdown', (e) => {
      if (st.tool && st.tool !== 'lasso') return; e.stopPropagation();
      if (!objSel || objSel.el !== el) { selectObj(p, el); if (!e.target.closest('textarea,.pvplay')) { el._down(e); } return; }
      el._down(e);
    });
    el.addEventListener('pointermove', (e) => { if (el._move) el._move(e); });
    el.addEventListener('pointerup', (e) => { if (el._up) el._up(e); });
    el.addEventListener('pointercancel', (e) => { if (el._up) el._up(e); });
    return el;
  }
  function fmtDur(t) { t = Math.round(t); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
  let playing = null;
  function playAudio(el, s) {
    if (playing) { playing.a.pause(); playing.el.classList.remove('on'); const same = playing.el === el; playing = null; if (same) return; }
    media(s.m).then((src) => { const a = new Audio(src); playing = { a: a, el: el }; el.classList.add('on'); a.onended = () => { el.classList.remove('on'); playing = null; }; a.play().catch(() => { el.classList.remove('on'); playing = null; }); });
  }
  function selectObj(p, el) {
    deselectObj();
    objSel = { p: p, el: el, s: el._s };
    el.classList.add('sel');
    const h = document.createElement('div'); h.className = 'pvobjbar';
    h.innerHTML = '<span class="mv" title="تحريك">✥</span><button type="button" class="sz" data-o="smaller" title="تصغير">−</button><button type="button" class="sz" data-o="bigger" title="تكبير">+</button><button type="button" data-o="del" title="حذف">' + I.trash + '</button>';
    el.appendChild(h);
    if (el.offsetTop < 44) h.style.top = 'calc(100% + 10px)';   // في أعلى الصفحة: الشريط تحت العنصر حتى لا يُخفى
    const rz = document.createElement('span'); rz.className = 'pvrz'; rz.title = 'تكبير/تصغير'; el.appendChild(rz);
    h.querySelector('[data-o="del"]').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); const s = objSel.s, pg = p.k; deselectObj(); const op = { pg: pg, add: [], del: [s] }; apply(op, false); commit(op); });
    const drag = (mode) => (e) => {
      e.stopPropagation(); e.preventDefault();
      const s = objSel.s, r = p.fig.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, sx = s.x, sy = s.y, sw = s.w, sh = s.h || 0;
      const ratio = s.t === 'i' && sh ? sh / sw : 0;
      const mv = (ev) => {
        const dx = (ev.clientX - x0) / r.width * 10000, dy = (ev.clientY - y0) / r.height * 10000;
        if (mode === 'm') { const hh = (el.offsetHeight / r.height) * 10000, ww = (el.offsetWidth / r.width) * 10000; el.style.left = Math.max(0, Math.min(10000 - ww, sx + dx)) / 100 + '%'; el.style.top = Math.max(0, Math.min(10000 - hh, sy + dy)) / 100 + '%'; }
        else { const w = Math.max(800, Math.min(10000, sw + dx)); el.style.width = w / 100 + '%'; if (ratio) el.style.height = (w * ratio * r.width / r.height) / 100 + '%'; }
      };
      const up = () => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
        const ns = Object.assign({}, s, { x: Math.round(parseFloat(el.style.left) * 100), y: Math.round(parseFloat(el.style.top) * 100), w: Math.round(parseFloat(el.style.width) * 100) });
        if (el.style.height) ns.h = Math.round(parseFloat(el.style.height) * 100);
        if (ns.x === s.x && ns.y === s.y && ns.w === s.w) return;
        const L = items(p.k), k = L.indexOf(s); if (k < 0) return;
        L[k] = ns; el._s = ns; objSel.s = ns; commit({ pg: p.k, add: [ns], del: [s] });
      };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    };
    h.querySelector('.mv').addEventListener('pointerdown', drag('m'));
    rz.addEventListener('pointerdown', drag('r'));
    // تكبير/تصغير بالأزرار (10% كل ضغطة)
    const resizeTo = (w) => {
      const s = objSel.s, r = p.fig.getBoundingClientRect();
      w = Math.round(Math.max(800, Math.min(10000, w)));
      const ns = Object.assign({}, s, { w: w, x: Math.max(0, Math.min(10000 - w, s.x)) });
      if (s.h && s.t === 'i') ns.h = Math.round(s.h * w / s.w);
      else if (s.h && s.t !== 'tb') ns.h = s.h;
      if (ns.h) ns.y = Math.max(0, Math.min(10000 - ns.h, s.y));
      el.style.width = ns.w / 100 + '%'; el.style.left = ns.x / 100 + '%'; el.style.top = ns.y / 100 + '%'; if (ns.h) el.style.height = ns.h / 100 + '%';
      const L = items(p.k), k = L.indexOf(s); if (k < 0) return;
      L[k] = ns; el._s = ns; objSel.s = ns; commit({ pg: p.k, add: [ns], del: [s] });
    };
    h.querySelectorAll('.sz').forEach((b) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); resizeTo(objSel.s.w * (b.dataset.o === 'bigger' ? 1.12 : 0.89)); }));
    // سحب العنصر نفسه لتحريكه، وإصبعان لتكبيره (مثل Samsung Notes)
    const ptrs = new Map(); let pinch = null;
    el._down = (e) => {
      if (e.target.closest('.pvobjbar,.pvrz,textarea,.pvplay')) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, w: objSel.s.w }; return; }
      drag('m')(e);
    };
    el._move = (e) => {
      if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const w = Math.max(800, Math.min(10000, pinch.w * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)); el.style.width = w / 100 + '%'; if (objSel.s.t === 'i' && objSel.s.h) el.style.height = (objSel.s.h * w / objSel.s.w) / 100 + '%'; }
    };
    el._up = (e) => {
      ptrs.delete(e.pointerId);
      if (pinch && ptrs.size < 2) { const w = parseFloat(el.style.width) * 100; pinch = null; resizeTo(w); }
    };
  }
  function deselectObj() { if (!objSel) return; const el = objSel.el; el.classList.remove('sel'); el.querySelectorAll('.pvobjbar,.pvrz').forEach((x) => x.remove()); el._down = el._move = el._up = null; objSel = null; }
  document.addEventListener('pointerdown', (e) => { if (objSel && !e.target.closest('.pvobj')) deselectObj(); }, true);

  function shrinkImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const k = Math.min(1, 1400 / Math.max(im.naturalWidth, im.naturalHeight));
        const w = Math.round(im.naturalWidth * k), h = Math.round(im.naturalHeight * k);
        const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(im, 0, 0, w, h);
        URL.revokeObjectURL(url);
        let q = 0.78, d = c.toDataURL('image/jpeg', q);
        while (d.length > 700000 && q > 0.35) { q -= 0.12; d = c.toDataURL('image/jpeg', q); }
        res({ d: d, w: w, h: h });
      };
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')); };
      im.src = url;
    });
  }
  async function insertImage(file) {
    if (!file) return;
    toast('جارٍ إضافة الصورة…');
    try {
      const r = await shrinkImage(file), id = newId();
      await o.saveMedia(id, r.d); MEDIA[id] = Promise.resolve(r.d);
      const p = pages[cur], pr = p.fig.clientHeight / p.fig.clientWidth, w = 4500;
      addObj({ t: 'i', m: id, w: w, h: Math.round(w * (r.h / r.w) / pr) });
      toast('أُضيفت الصورة');
    } catch (e) { toast('تعذّر حفظ الصورة. حاول بصورة أصغر'); }
  }
  function pickImage(camera) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; if (camera) inp.setAttribute('capture', 'environment');
    inp.style.display = 'none'; document.body.appendChild(inp);
    inp.addEventListener('change', () => { insertImage(inp.files && inp.files[0]); inp.remove(); });
    inp.click();
  }
  /* تسجيل صوتي (حتى 90 ثانية) */
  let rec = null;
  async function toggleRecord() {
    if (rec) { rec.stop(); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) { toast('التسجيل الصوتي غير مدعوم في هذا المتصفح'); return; }
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { toast('اسمح للموقع باستعمال الميكروفون'); return; }
    const mt = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
    const mr = new MediaRecorder(stream, mt ? { mimeType: mt, audioBitsPerSecond: 24000 } : { audioBitsPerSecond: 24000 });
    const chunks = [], t0 = Date.now(), bar = document.createElement('div');
    bar.className = 'pvrec'; bar.innerHTML = '<i></i><span class="lat">0:00</span><button type="button">إيقاف وحفظ</button>'; PV.appendChild(bar);
    const tick = setInterval(() => { const s = (Date.now() - t0) / 1000; bar.querySelector('span').textContent = fmtDur(s); if (s >= 90) mr.stop(); }, 250);
    bar.querySelector('button').addEventListener('click', () => mr.stop());
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      clearInterval(tick); bar.remove(); stream.getTracks().forEach((t) => t.stop()); rec = null;
      const dur = (Date.now() - t0) / 1000; if (dur < 0.7 || !chunks.length) return;
      const blob = new Blob(chunks, { type: mr.mimeType || mt || 'audio/webm' });
      const d = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      if (d.length > 950000) { toast('التسجيل طويل جداً'); return; }
      const id = newId();
      try { await o.saveMedia(id, d); MEDIA[id] = Promise.resolve(d); addObj({ t: 'a', m: id, w: 2600, h: 700, d: Math.round(dur) }); toast('حُفظ التسجيل'); }
      catch (e) { toast('تعذّر حفظ التسجيل'); }
    };
    rec = mr; mr.start(500);
  }
  function insertMenu() {
    if (!POP.hidden && POP.dataset.for === 'ins') { closePop(); return; }
    setTool('');
    POP.innerHTML = '<div class="pvph"><b>إدراج في الصفحة</b><button type="button" class="pvx0" data-pop="close" aria-label="إغلاق">' + I.x + '</button></div><div class="pvins">' +
      [['img', '🖼️', 'صورة من المعرض'], ['cam', '📷', 'الكاميرا'], ['rec', '🎙️', 'تسجيل صوتي'], ['tbl', '▦', 'جدول'], ['stk', '🗒️', 'ملصق (Sticky)'], ['page', '📄', 'صفحة ملاحظات']].map((x) => '<button type="button" data-ins="' + x[0] + '"><span>' + x[1] + '</span>' + x[2] + '</button>').join('') +
      '</div><div class="pvtblcfg" hidden><p class="pvnl">حجم الجدول</p><div class="pvrng2"><label>صفوف <select data-tr>' + [2, 3, 4, 5, 6, 8, 10].map((n) => '<option' + (n === 3 ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label><label>أعمدة <select data-tc>' + [2, 3, 4, 5].map((n) => '<option' + (n === 2 ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label><button type="button" class="pvok" data-ins="tblok">إضافة</button></div></div>';
    POP.dataset.for = 'ins'; POP.hidden = false;
  }
  POP.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ins]'); if (!b) return;
    const k = b.dataset.ins;
    if (k === 'img') { closePop(); pickImage(false); }
    else if (k === 'cam') { closePop(); pickImage(true); }
    else if (k === 'rec') { closePop(); toggleRecord(); }
    else if (k === 'tbl') { POP.querySelector('.pvtblcfg').hidden = false; }
    else if (k === 'tblok') { const r = +POP.querySelector('[data-tr]').value, c = +POP.querySelector('[data-tc]').value; closePop(); addObj({ t: 'tb', r: r, c: c, w: Math.min(9000, 2200 * c), v: [] }); }
    else if (k === 'stk') { closePop(); st.tb = st.tb || '#fef08a'; keepLS(); setTool('text'); toast('اضغط على الصفحة لكتابة الملصق'); }
    else if (k === 'page') { closePop(); newPagePop(); }
  });

  /* ---------- الرسم ---------- */
  const DARK = (c) => c === '#111827' || c === '#000000';
  function drawStroke(c, s, W, H, off, dark) {
    const pts = s.pts; if (!pts || pts.length < 2) return;
    const dx = off ? off[0] : 0, dy = off ? off[1] : 0;
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    let lw = s.w / 1000 * W;
    if (s.t === 'h') { c.globalAlpha = dark ? 0.45 : 0.38; c.lineCap = 'butt'; if (!dark) c.globalCompositeOperation = 'multiply'; }
    else if (s.k === 'ball') lw *= 0.75;
    else if (s.k === 'pencil') { c.globalAlpha = 0.72; lw *= 0.7; }
    else if (s.k === 'brush') lw *= 1.7;
    const col = dark && DARK(s.c) ? '#f3f4f6' : s.c;
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = Math.max(0.6, lw);
    const X = (k) => (pts[k] / 10000 + dx) * W, Y = (k) => (pts[k + 1] / 10000 + dy) * H;
    c.beginPath();
    if (pts.length === 2) { c.arc(X(0), Y(0), c.lineWidth / 2, 0, 7); c.fill(); c.restore(); return; }
    c.moveTo(X(0), Y(0));
    for (let k = 2; k < pts.length - 2; k += 2) { const mx = (X(k) + X(k + 2)) / 2, my = (Y(k) + Y(k + 2)) / 2; c.quadraticCurveTo(X(k), Y(k), mx, my); }
    c.lineTo(X(pts.length - 2), Y(pts.length - 2));
    c.stroke(); c.restore();
  }
  function renderBase(p) {
    const c = p.bctx, W = p.base.width, H = p.base.height; if (!W) return;
    c.clearRect(0, 0, W, H);
    (data.p[p.k] || []).forEach((s) => { if (s.t === 'p' || s.t === 'h') { if (sel && sel.pg === p.k && sel.set.has(s)) return; drawStroke(c, s, W, H, null, p.dark); } });
  }
  function blit(p, extra) {
    const c = p.ctx, W = p.cv.width, H = p.cv.height; if (!W) return;
    c.clearRect(0, 0, W, H); c.drawImage(p.base, 0, 0);
    if (sel && sel.pg === p.k) sel.items.forEach((s) => { if (s.pts) drawStroke(c, sel.scale && sel.scale !== 1 ? scaledItem(s, sel.scale, sel.box[0], sel.box[1]) : s, W, H, sel.off, p.dark); });
    if (extra) extra(c, W, H);
  }
  let rafQ = new Set(), rafId = 0;
  function queue(p, extra) { p._extra = extra; rafQ.add(p); if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; rafQ.forEach((q) => blit(q, q._extra)); rafQ.clear(); }); }

  /* ---------- النصوص المكتوبة بلوحة المفاتيح ---------- */
  function renderTexts(p) {
    p.lay.innerHTML = '';
    (data.p[p.k] || []).forEach((s) => { if (s.t === 'x') p.lay.appendChild(textEl(p, s)); else if (!s.pts) p.lay.appendChild(objEl(p, s)); });
  }
  function textEl(p, s) {
    const stick = !!s.b;
    const ta = document.createElement('textarea');
    ta.className = 'pvx' + (stick ? ' stick' : ''); if (stick) ta.style.background = s.b; ta.value = s.s || ''; ta.dir = 'auto'; ta.rows = 1; ta.spellcheck = false;
    ta.style.left = (s.x / 100) + '%'; ta.style.top = (s.y / 100) + '%';
    ta.style.color = p.dark && !stick && DARK(s.c) ? '#f3f4f6' : s.c; ta.style.fontSize = 'calc(var(--pw) * ' + (s.z / 1000) + ')';
    if (sel && sel.pg === p.k && sel.set.has(s)) ta.classList.add('selx');
    const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; ta.style.width = 'auto'; ta.style.width = Math.min(p.fig.clientWidth * (1 - ta._s.x / 10000) - 4, Math.max(60, measure(ta) + 18)) + 'px'; };
    ta.addEventListener('input', () => { ta._s.s = ta.value; fit(); touch(); });
    ta.addEventListener('blur', () => { const s1 = ta._s; if (!(s1.s || '').trim()) { const L = items(p.k); const k = L.indexOf(s1); if (k >= 0) { L.splice(k, 1); touch(); } ta.remove(); } });
    ta._s = s; ta._fit = fit; requestAnimationFrame(fit);
    ta.addEventListener('focus', () => textBar(p, ta));
    ta.addEventListener('blur', () => setTimeout(() => { if (TBAR && TBAR._ta === ta && document.activeElement !== ta) hideTBar(); }, 150));
    return ta;
  }
  /* شريط صغير فوق النص: تصغير/تكبير الخط، تحريك، حذف */
  let TBAR = null;
  function hideTBar() { if (TBAR) { TBAR.remove(); TBAR = null; } }
  function textBar(p, ta) {
    hideTBar();
    const b = document.createElement('div'); b.className = 'pvzbar'; b._ta = ta;
    b.innerHTML = '<span class="mv" title="تحريك">✥</span><button type="button" data-t="-" title="تصغير الخط">A−</button><output></output><button type="button" data-t="+" title="تكبير الخط">A+</button><button type="button" data-t="del" title="حذف">' + I.trash + '</button>';
    const pos = () => {
      b.style.left = 'min(' + ta.style.left + ', calc(100% - 190px))';
      b.style.top = ta.offsetTop < 44 ? (ta.offsetTop + ta.offsetHeight + 6) + 'px' : (ta.offsetTop - 40) + 'px';   // فوق النص، أو تحته إن كان في أعلى الصفحة
      b.querySelector('output').textContent = ta._s.z;
    };
    pos(); p.lay.appendChild(b); TBAR = b;
    const setZ = (z) => {
      const s0 = ta._s, L = items(p.k), k = L.indexOf(s0); if (k < 0) return;
      const ns = Object.assign({}, s0, { z: Math.max(6, Math.min(60, z)) }); if (ns.z === s0.z) return;
      L[k] = ns; ta._s = ns; ta.style.fontSize = 'calc(var(--pw) * ' + (ns.z / 1000) + ')'; ta._fit(); pos();
      commit({ pg: p.k, add: [ns], del: [s0] });
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();   // يبقى النص مفتوحاً للكتابة
      const t = e.target.closest('[data-t],.mv'); if (!t) return;
      if (t.dataset.t === '-') setZ(ta._s.z - 2);
      else if (t.dataset.t === '+') setZ(ta._s.z + 2);
      else if (t.dataset.t === 'del') { const s0 = ta._s; hideTBar(); const op = { pg: p.k, add: [], del: [s0] }; if (items(p.k).indexOf(s0) >= 0) { apply(op, false); commit(op); } }
      else if (t.classList.contains('mv')) {
        const r = p.fig.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, s0 = ta._s;
        const mv = (ev) => { ta.style.left = Math.max(0, Math.min(9500, s0.x + (ev.clientX - x0) / r.width * 10000)) / 100 + '%'; ta.style.top = Math.max(0, Math.min(9800, s0.y + (ev.clientY - y0) / r.height * 10000)) / 100 + '%'; pos(); };
        const up = () => {
          window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
          const ns = Object.assign({}, s0, { x: Math.round(parseFloat(ta.style.left) * 100), y: Math.round(parseFloat(ta.style.top) * 100) });
          const L = items(p.k), k = L.indexOf(s0); if (k < 0 || (ns.x === s0.x && ns.y === s0.y)) return;
          L[k] = ns; ta._s = ns; ta._fit(); commit({ pg: p.k, add: [ns], del: [s0] }); ta.focus();
        };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      }
    });
  }
  const mctx = document.createElement('canvas').getContext('2d');
  function measure(ta) { const cs = getComputedStyle(ta); mctx.font = cs.fontSize + ' ' + cs.fontFamily; return Math.max.apply(null, ta.value.split('\n').map((l) => mctx.measureText(l || ' ').width)); }

  /* ---------- الأدوات ---------- */
  function setTool(t) {
    if (st.tool === t && t && t !== 'lasso' && t !== 'laser') { togglePop(t); return; }
    clearSel(); clearTSel(); closePop();
    st.tool = t;
    if (t === 'sel') loadTX();
    PV.dataset.tool = t;
    BAR.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
  }
  function paintDots() {
    const d = (t, c) => { const b = BAR.querySelector('[data-tool="' + t + '"] .dot'); if (b) b.style.background = c; };
    d('pen', st.pc); d('hl', st.hc); d('text', st.tc);
  }
  function closePop() { POP.hidden = true; POP.innerHTML = ''; POP.dataset.for = ''; POP.dataset.edit = ''; }
  function togglePop(t) { if (!POP.hidden && POP.dataset.for === t) { closePop(); return; } openPop(t); }
  function sw(cols, curC, attr) { return '<div class="pvcols">' + cols.map((c) => '<button type="button" class="pvcol' + (c === curC ? ' on' : '') + '" data-' + attr + '="' + c + '" style="background:' + c + '" aria-label="لون"></button>').join('') + '<label class="pvcol any" aria-label="لون آخر"><input type="color" data-' + attr + '-any value="' + curC + '"></label></div>'; }
  function openPop(t) {
    let h = '<div class="pvph"><b>' + ({ pen: 'القلم', hl: 'قلم التظليل', er: 'الممحاة', text: 'الكتابة بلوحة المفاتيح' })[t] + '</b><button type="button" class="pvx0" data-pop="close" aria-label="إغلاق">' + I.x + '</button></div>';
    if (t === 'pen') {
      h += '<div class="pvkinds">' + KINDS.map((k) => '<button type="button" class="pvkind k-' + k[0] + (st.kind === k[0] ? ' on' : '') + '" data-kind="' + k[0] + '"><i style="--kc:' + st.pc + '"></i><span>' + k[1] + '</span></button>').join('') + '</div>' +
        rng('pw', st.pw, 1, 30) + '<label class="pvtog"><span>تقويم الخطوط</span><input type="checkbox" data-straight' + (st.straight ? ' checked' : '') + '><i></i></label>' + sw(PEN_COLS, st.pc, 'pc') +
        '<p class="pvhint">لتحريك ما كتبته أو تكبيره أو تغيير لونه: اختر ✋ ثم اضغط على الخط، أو أحِطه بأداة التحديد ◌.</p>';
    } else if (t === 'hl') {
      h += rng('hw', st.hw, 8, 50) + sw(HL_COLS, st.hc, 'hc');
    } else if (t === 'er') {
      h += '<label class="pvrad"><input type="radio" name="em" value="stroke"' + (st.emode === 'stroke' ? ' checked' : '') + '><span>مسح الخط كاملاً</span></label>' +
        '<label class="pvrad"><input type="radio" name="em" value="area"' + (st.emode === 'area' ? ' checked' : '') + '><span>مسح منطقة (جزء من الخط)</span></label>' +
        '<label class="pvtog"><span>مسح التظليل فقط</span><input type="checkbox" data-ehl' + (st.ehl ? ' checked' : '') + '><i></i></label>' +
        '<button type="button" class="pvall" data-erall>مسح كل الكتابة في هذه الصفحة</button>';
    } else if (t === 'text') {
      h += rng('tz', st.tz, 8, 40) + sw(PEN_COLS, st.tc, 'tc') +
        '<p class="pvnl" style="margin-top:14px">خلفية النص <small>(ملصق ملوّن مثل Sticky note)</small></p><div class="pvtbs">' + STICK.map((c) => '<button type="button" class="pvtb' + ((st.tb || '') === c[0] ? ' on' : '') + '" data-tb="' + c[0] + '" style="' + (c[0] ? 'background:' + c[0] : '') + '">' + c[1] + '</button>').join('') + '</div>' +
        '<p class="pvhint">اضغط على الصفحة في المكان الذي تريد الكتابة فيه. لتغيير حجم نص مكتوب: اضغط عليه ثم <b>A−</b> أو <b>A+</b>.</p>';
    }
    POP.innerHTML = h; POP.dataset.for = t; POP.hidden = false;
  }
  function rng(k, v, a, b) { return '<div class="pvrng"><button type="button" data-step="' + k + '" data-d="-1">−</button><input type="range" min="' + a + '" max="' + b + '" value="' + v + '" data-rng="' + k + '"><output>' + v + '</output><button type="button" data-step="' + k + '" data-d="1">+</button></div>'; }

  function newPagePop() {
    if (!POP.hidden && POP.dataset.for === 'new') { closePop(); return; }
    hideHint(); setTool(''); 
    const p = pages[cur], after = p.li != null ? p.li : p.after, lbl = after < 0 ? 'قبل الصفحة 1' : 'بعد الصفحة ' + (after + 1);
    POP.innerHTML = '<div class="pvph"><b>صفحة ملاحظات جديدة</b><button type="button" class="pvx0" data-pop="close" aria-label="إغلاق">' + I.x + '</button></div>' +
      '<p class="pvnp">تُضاف صفحة فارغة خاصة بك <b>' + lbl + '</b> لتكتب فيها بالقلم أو بلوحة المفاتيح. تُحفظ في حسابك، ولا يراها غيرك، والدرس الأصلي لا يتغيّر.</p>' +
      stylePicker('new', after);
    POP.dataset.for = 'new'; POP.dataset.edit = ''; POP.hidden = false;
  }
  function editStylePop(id) {
    setTool('');
    let n = null; Object.keys(data.x || {}).forEach((a) => (data.x[a] || []).forEach((q) => { if (q.id === id) n = q; }));
    if (!n) return;
    st.tone = n.tone || 'white';
    POP.innerHTML = '<div class="pvph"><b>إعدادات صفحة الملاحظات</b><button type="button" class="pvx0" data-pop="close" aria-label="إغلاق">' + I.x + '</button></div>' + stylePicker('edit', 0) +
      '<button type="button" class="pvall" data-pdel="' + id + '">' + I.trash + ' حذف صفحة الملاحظات هذه</button>';
    POP.querySelectorAll('[data-paper="' + (n.paper || 'lined') + '"]').forEach((b) => b.classList.add('on'));
    POP.dataset.for = 'edit'; POP.dataset.edit = id; POP.hidden = false;
  }
  function setStyle(id, paper, tone) {
    Object.keys(data.x || {}).forEach((a) => (data.x[a] || []).forEach((q) => { if (q.id === id) { if (paper) q.paper = paper; if (tone) q.tone = tone; } }));
    build(); touch();
  }
  POP.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tone) { st.tone = b.dataset.tone; keepLS(); POP.querySelectorAll('.pvtone2').forEach((x) => x.classList.toggle('on', x === b)); refreshThumbs(); if (POP.dataset.edit) setStyle(POP.dataset.edit, null, st.tone); return; }
    if (b.dataset.paper) { if (POP.dataset.edit) { const id = POP.dataset.edit; closePop(); setStyle(id, b.dataset.paper, st.tone); return; } const a = +b.dataset.after; closePop(); addNote(a, b.dataset.paper, st.tone); return; }
    if (b.dataset.tb != null) { st.tb = b.dataset.tb; keepLS(); POP.querySelectorAll('[data-tb]').forEach((x) => x.classList.toggle('on', x === b)); return; }
    if (b.dataset.pdel) { if (b.dataset.sure) { const id = b.dataset.pdel; closePop(); delNote(id); } else { b.dataset.sure = '1'; b.textContent = 'اضغط مرة أخرى لتأكيد الحذف'; } return; }
    if (b.dataset.pop === 'close') closePop();
    else if (b.dataset.kind) { st.kind = b.dataset.kind; POP.querySelectorAll('.pvkind').forEach((x) => x.classList.toggle('on', x === b)); keepLS(); }
    else if (b.dataset.pc) { st.pc = b.dataset.pc; recol(b); }
    else if (b.dataset.hc) { st.hc = b.dataset.hc; recol(b); }
    else if (b.dataset.tc) { st.tc = b.dataset.tc; recol(b); }
    else if (b.dataset.step) { const r = POP.querySelector('[data-rng="' + b.dataset.step + '"]'); r.value = +r.value + (+b.dataset.d); r.dispatchEvent(new Event('input')); }
    else if (b.hasAttribute('data-erall')) {
      if (b.dataset.sure) { eraseAll(); closePop(); }
      else { b.dataset.sure = '1'; b.textContent = 'اضغط مرة أخرى للتأكيد'; setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = 'مسح كل الكتابة في هذه الصفحة'; } }, 3000); }
    }
  });
  function recol(b) { b.parentNode.querySelectorAll('.pvcol').forEach((x) => x.classList.toggle('on', x === b)); POP.querySelectorAll('.pvkind i').forEach((i) => i.style.setProperty('--kc', st.pc)); paintDots(); keepLS(); }
  POP.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.rng) { st[t.dataset.rng] = +t.value; t.nextElementSibling.textContent = t.value; keepLS(); }
    else if (t.hasAttribute('data-pc-any')) { st.pc = t.value; paintDots(); keepLS(); }
    else if (t.hasAttribute('data-hc-any')) { st.hc = t.value; paintDots(); keepLS(); }
    else if (t.hasAttribute('data-tc-any')) { st.tc = t.value; paintDots(); keepLS(); }
  });
  POP.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'em') st.emode = t.value;
    else if (t.hasAttribute('data-ehl')) st.ehl = t.checked;
    else if (t.hasAttribute('data-straight')) st.straight = t.checked;
    keepLS();
  });
  BAR.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'page') { const p = pages[cur]; if (p && p.nid) { if (!POP.hidden && POP.dataset.for === 'edit') closePop(); else editStylePop(p.nid); } return; }
    if (b.dataset.act === 'ins') { insertMenu(); return; }
    if (b.dataset.act === 'undo') doUndo();
    else if (b.dataset.act === 'redo') doRedo();
    else if ('tool' in b.dataset) setTool(b.dataset.tool);
  });

  /* ---------- التراجع والإعادة ---------- */
  function commit(op) { undo.push(op); if (undo.length > 200) undo.shift(); redo.length = 0; uiUndo(); touch(); }
  function apply(op, rev) {
    const L = items(op.pg);
    const del = rev ? op.add : op.del, add = rev ? op.del : op.add;
    del.forEach((s) => { const k = L.indexOf(s); if (k >= 0) L.splice(k, 1); });
    add.forEach((s) => L.push(s));
    const p = byKey[op.pg]; if (p && p.on) { renderBase(p); blit(p); renderTexts(p); }
    touch();
  }
  function doUndo() { clearSel(); const op = undo.pop(); if (!op) return; apply(op, true); redo.push(op); uiUndo(); }
  function doRedo() { clearSel(); const op = redo.pop(); if (!op) return; apply(op, false); undo.push(op); uiUndo(); }
  function uiUndo() { BAR.querySelector('[data-act="undo"]').disabled = !undo.length; BAR.querySelector('[data-act="redo"]').disabled = !redo.length; }

  /* ---------- الإدخال بالقلم/الأصبع ---------- */
  const touches = new Map();
  let act = null;   // {p, kind:'draw'|'erase'|'lasso'|'laser'|'move'|'scroll', ...}
  const pos = (p, e) => { const r = p.cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * 10000), Math.round((e.clientY - r.top) / r.height * 10000)]; };
  function pageOf(e) { const f = e.target.closest && e.target.closest('figure.pvp'); return f ? pages[+f.dataset.i] : null; }

  DOC.addEventListener('pointerdown', (e) => {
    if (!st.tool) return;
    const p = pageOf(e); if (!p) return;
    if (e.target.classList.contains('pvx') && st.tool === 'text') return;   // تعديل نص موجود
    if (e.pointerType === 'pen') penSeen = true;
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (penSeen) { if (!act || act.kind === 'scroll') act = { kind: 'scroll', mid: one() }; return; }   // مع القلم: الأصبع يمرّر ولا يكتب
      if (touches.size >= 2) { if (act && act.kind === 'draw') { act = null; queue(p); } act = { kind: 'scroll', mid: mid() }; return; }
    }
    if (e.button > 0) return;
    if (sel && st.tool === 'lasso') {
      const q = pos(p, e);
      if (sel.pg === p.k && inBox(q, sel)) { act = { kind: 'move', p: p, start: q }; capture(e); e.preventDefault(); return; }
      clearSel();
    }
    if (st.tool === 'text') { act = { kind: 'tap', p: p, start: pos(p, e), x: e.clientX, y: e.clientY }; return; }
    capture(e); e.preventDefault(); closePop();
    const q = pos(p, e);
    if (st.tool === 'pen' || st.tool === 'hl') {
      const s = st.tool === 'pen' ? { t: 'p', k: st.kind, c: st.pc, w: +(st.pw * 0.6).toFixed(2), pts: q.slice() } : { t: 'h', c: st.hc, w: +(st.hw * 0.6).toFixed(2), pts: q.slice() };
      act = { kind: 'draw', p: p, s: s };
      queue(p, (c, W, H) => drawStroke(c, s, W, H, null, p.dark));
    } else if (st.tool === 'er') { act = { kind: 'erase', p: p, op: { pg: p.k, add: [], del: [] }, last: q }; eraseAt(act, q); }
    else if (st.tool === 'lasso') { act = { kind: 'lasso', p: p, poly: q.slice() }; }
    else if (st.tool === 'laser') { act = { kind: 'laser', p: p }; laserAdd(e); }
    else if (st.tool === 'sel') { if (p.li == null) { act = null; toast('هذه صفحة ملاحظاتك: استعمل أداة التحديد العادية'); return; } act = { kind: 'tsel', p: p, start: q, end: q }; }
  });
  function capture(e) { try { e.target.setPointerCapture(e.pointerId); } catch (x) {} }
  function one() { const v = Array.from(touches.values()); return v[v.length - 1]; }
  function mid() { const v = Array.from(touches.values()); return [(v[0][0] + v[1][0]) / 2, (v[0][1] + v[1][1]) / 2]; }

  DOC.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (!act) return;
    if (act.kind === 'scroll') { if (!touches.size || (!penSeen && touches.size < 2)) return; const m = touches.size >= 2 ? mid() : one(); window.scrollBy(act.mid[0] - m[0], act.mid[1] - m[1]); SCR.scrollLeft += act.mid[0] - m[0]; act.mid = m; return; }
    if (penSeen && e.pointerType === 'touch') return;
    const p = act.p; let evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null; if (!evs || !evs.length) evs = [e];
    if (act.kind === 'draw') {
      const s = act.s, minD = 12;
      evs.forEach((ev) => { const q = pos(p, ev); const n = s.pts.length; if (Math.abs(q[0] - s.pts[n - 2]) + Math.abs(q[1] - s.pts[n - 1]) >= minD) s.pts.push(q[0], q[1]); });
      queue(p, (c, W, H) => drawStroke(c, s, W, H, null, p.dark));
    } else if (act.kind === 'erase') {
      evs.forEach((ev) => {
        const q = pos(p, ev), l = act.last || q, d = Math.hypot(q[0] - l[0], q[1] - l[1]), n = Math.min(40, Math.ceil(d / 60));
        for (let k = 1; k <= n; k++) eraseAt(act, [Math.round(l[0] + (q[0] - l[0]) * k / n), Math.round(l[1] + (q[1] - l[1]) * k / n)]);
        if (!n) eraseAt(act, q);
        act.last = q;
      });
    }
    else if (act.kind === 'lasso') { const q = pos(p, e); act.poly.push(q[0], q[1]); queue(p, (c, W, H) => { c.save(); c.setLineDash([6, 5]); c.strokeStyle = '#2563eb'; c.lineWidth = 1.5 * (window.devicePixelRatio || 1); c.beginPath(); for (let k = 0; k < act.poly.length; k += 2) { const x = act.poly[k] / 10000 * W, y = act.poly[k + 1] / 10000 * H; k ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); c.restore(); }); }
    else if (act.kind === 'move') { const q = pos(p, e); sel.off = [(q[0] - act.start[0]) / 10000, (q[1] - act.start[1]) / 10000]; placeSelBox(); moveTexts(); queue(p); }
    else if (act.kind === 'laser') laserAdd(e);
    else if (act.kind === 'tsel') { const q = pos(p, e); act.end = q; const a0 = act.start; queue(p, (c, W, H) => { c.save(); c.fillStyle = 'rgba(37,99,235,.12)'; c.strokeStyle = '#2563eb'; c.setLineDash([5, 4]); c.lineWidth = 1.5; const x = Math.min(a0[0], q[0]) / 1e4 * W, y = Math.min(a0[1], q[1]) / 1e4 * H, w = Math.abs(q[0] - a0[0]) / 1e4 * W, h = Math.abs(q[1] - a0[1]) / 1e4 * H; c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h); c.restore(); }); }
    else if (act.kind === 'tap') { if (Math.abs(e.clientX - act.x) + Math.abs(e.clientY - act.y) > 12) act = null; }
  });
  const endPtr = (e) => {
    if (e.pointerType === 'touch') touches.delete(e.pointerId);
    if (!act) return;
    if (act.kind === 'scroll') { if (touches.size < (penSeen ? 1 : 2)) act = null; else act.mid = touches.size >= 2 ? mid() : one(); return; }
    if (penSeen && e.pointerType === 'touch') return;
    const a = act; act = null; const p = a.p;
    if (a.kind === 'draw') {
      const s = a.s;
      if (st.straight && s.t === 'p') straighten(s);
      if (s.t === 'h' && s.pts.length > 4) straightenH(s);
      items(p.k).push(s); renderBase(p); blit(p);
      commit({ pg: p.k, add: [s], del: [] });
    } else if (a.kind === 'erase') { if (a.op.add.length || a.op.del.length) commit(a.op); }
    else if (a.kind === 'lasso') { makeSel(p, a.poly); }
    else if (a.kind === 'move') { finishMove(); }
    else if (a.kind === 'tap' && e.type === 'pointerup') { addText(p, a.start); }
    else if (a.kind === 'tsel') { queue(p); makeTSel(p, a.start, a.end); }
  };
  DOC.addEventListener('pointerup', endPtr);
  DOC.addEventListener('pointercancel', endPtr);

  function straighten(s) {
    const P = s.pts, n = P.length; if (n < 6) return;
    const x0 = P[0], y0 = P[1], x1 = P[n - 2], y1 = P[n - 1], L = Math.hypot(x1 - x0, y1 - y0); if (L < 300) return;
    let mx = 0; for (let k = 2; k < n - 2; k += 2) { const d = Math.abs((y1 - y0) * P[k] - (x1 - x0) * P[k + 1] + x1 * y0 - y1 * x0) / L; if (d > mx) mx = d; }
    if (mx < L * 0.06) s.pts = [x0, y0, x1, y1];
  }
  function straightenH(s) {   // التظليل يُسوّى أفقياً إن كان شبه مستقيم (مثل تطبيقات الملاحظات)
    const P = s.pts, n = P.length, x0 = P[0], y0 = P[1], x1 = P[n - 2], y1 = P[n - 1];
    let mx = 0; for (let k = 2; k < n - 2; k += 2) mx = Math.max(mx, Math.abs(P[k + 1] - (y0 + y1) / 2));
    if (Math.abs(x1 - x0) > 400 && mx < 160) { const y = Math.round((y0 + y1) / 2); s.pts = [x0, y, x1, y]; }
  }

  /* ---------- الممحاة ---------- */
  function eraseAt(a, q) {
    const p = a.p, L = items(p.k), W = p.cv.clientWidth || 1, H = p.cv.clientHeight || 1;
    const rad = (st.emode === 'area' ? 16 : 10);
    const rx = rad / W * 10000, ry = rad / H * 10000;
    let changed = false;
    for (let j = L.length - 1; j >= 0; j--) {
      const s = L[j]; if (!s.pts) continue; if (st.ehl && s.t !== 'h') continue;
      const hw = s.w / 1000 * 10000 / 2;
      if (st.emode === 'stroke') {
        if (hitStroke(s, q, rx + hw, ry + hw * W / H)) { L.splice(j, 1); a.op.del.push(s); changed = true; }
      } else {
        const P = s.pts, keep = [];
        let segs = [], curS = [];
        for (let k = 0; k < P.length; k += 2) {
          const dx = (P[k] - q[0]) / rx, dy = (P[k + 1] - q[1]) / ry;
          if (dx * dx + dy * dy <= 1) { if (curS.length) { segs.push(curS); curS = []; } }
          else curS.push(P[k], P[k + 1]);
        }
        if (curS.length) segs.push(curS);
        if (segs.length === 1 && segs[0].length === P.length) continue;
        L.splice(j, 1); a.op.del.push(s); changed = true;
        segs.forEach((g) => { if (g.length >= 4) { const ns = Object.assign({}, s, { pts: g }); L.push(ns); a.op.add.push(ns); keep.push(ns); } });
      }
    }
    if (changed) { renderBase(p); blit(p); }
    // معاينة دائرة الممحاة
    queue(p, (c, W2, H2) => { c.save(); c.strokeStyle = 'rgba(100,116,139,.8)'; c.lineWidth = 1.2 * (window.devicePixelRatio || 1); c.beginPath(); c.ellipse(q[0] / 10000 * W2, q[1] / 10000 * H2, rx / 10000 * W2, ry / 10000 * H2, 0, 0, 7); c.stroke(); c.restore(); });
  }
  function hitStroke(s, q, rx, ry) {
    const P = s.pts;
    for (let k = 0; k < P.length; k += 2) {
      const ax = P[k], ay = P[k + 1], bx = k + 2 < P.length ? P[k + 2] : ax, by = k + 2 < P.length ? P[k + 3] : ay;
      const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
      let t = L2 ? ((q[0] - ax) * vx + (q[1] - ay) * vy) / L2 : 0; t = Math.max(0, Math.min(1, t));
      const dx = (ax + t * vx - q[0]) / rx, dy = (ay + t * vy - q[1]) / ry;
      if (dx * dx + dy * dy <= 1) return true;
    }
    return false;
  }
  function eraseAll() {
    const i = pages[cur].k, L = items(i), del = L.filter((s) => s.pts && (!st.ehl || s.t === 'h'));
    if (!del.length) return;
    const op = { pg: i, add: [], del: del };
    apply(op, false); commit(op);
  }

  /* ---------- التحديد (لاسو) ---------- */
  let sel = null;   // {pg, items:[], set, off:[dx,dy], box:[x0,y0,x1,y1], el}
  function inPoly(x, y, poly) { let c = false; for (let a = 0, b = poly.length - 2; a < poly.length; b = a, a += 2) { if (((poly[a + 1] > y) !== (poly[b + 1] > y)) && (x < (poly[b] - poly[a]) * (y - poly[a + 1]) / (poly[b + 1] - poly[a + 1]) + poly[a])) c = !c; } return c; }
  function makeSel(p, poly) {
    queue(p);
    if (poly.length < 8) return;
    const got = items(p.k).filter((s) => {
      if (!s.pts) return inPoly(s.x, s.y, poly);
      let n = 0; for (let k = 0; k < s.pts.length; k += 2) if (inPoly(s.pts[k], s.pts[k + 1], poly)) n++;
      return n * 2 >= s.pts.length / 2;
    });
    if (!got.length) return;
    selectItems(p, got);
  }
  // مستطيل حول العناصر بحسب حجمها الحقيقي على الصفحة
  function itemBox(p, s) {
    if (s.pts) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let k = 0; k < s.pts.length; k += 2) { x0 = Math.min(x0, s.pts[k]); y0 = Math.min(y0, s.pts[k + 1]); x1 = Math.max(x1, s.pts[k]); y1 = Math.max(y1, s.pts[k + 1]); } return [x0, y0, x1, y1]; }
    const el = [...p.lay.children].find((x) => x._s === s), r = p.fig.getBoundingClientRect();
    if (el && r.width) { const b = el.getBoundingClientRect(); return [s.x, s.y, s.x + b.width / r.width * 10000, s.y + b.height / r.height * 10000]; }
    return [s.x, s.y, s.x + (s.w || 600), s.y + (s.h || 300)];
  }
  function selBounds(p, L) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; L.forEach((s) => { const b = itemBox(p, s); x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }); const pad = 120; return [x0 - pad, y0 - pad, x1 + pad, y1 + pad]; }
  function selectItems(p, got) {
    sel = { pg: p.k, items: got, set: new Set(got), off: [0, 0], scale: 1, box: selBounds(p, got) };
    const el = document.createElement('div'); el.className = 'pvselbox';
    el.innerHTML = '<div class="pvselbar"><button type="button" data-sel="smaller" title="تصغير">−</button><button type="button" data-sel="bigger" title="تكبير">+</button><button type="button" data-sel="color" title="تغيير اللون"><i class="pvselc"></i></button><button type="button" data-sel="copy"><span>نسخ</span></button><button type="button" data-sel="del">' + I.trash + '</button></div>' +
      '<div class="pvselcols" hidden>' + PEN_COLS.map((c) => '<button type="button" data-selc="' + c + '" style="background:' + c + '"></button>').join('') + '</div>' +
      '<span class="pvselrz" title="اسحب للتكبير والتصغير"></span>';
    p.lay.appendChild(el); sel.el = el; placeSelBox();
    const stop = (e) => { e.stopPropagation(); e.preventDefault(); };
    el.querySelector('.pvselbar').addEventListener('pointerdown', (e) => {
      stop(e); const b = e.target.closest('[data-sel]'); if (!b || !sel) return;
      const k = b.dataset.sel;
      if (k === 'copy') copyStrokes();
      else if (k === 'del') { const op = { pg: p.k, add: [], del: sel.items.slice() }; sel = null; el.remove(); apply(op, false); commit(op); }
      else if (k === 'smaller') scaleSel(0.88);
      else if (k === 'bigger') scaleSel(1.12);
      else if (k === 'color') { const c = el.querySelector('.pvselcols'); c.hidden = !c.hidden; }
    });
    el.querySelector('.pvselcols').addEventListener('pointerdown', (e) => { stop(e); const b = e.target.closest('[data-selc]'); if (b) recolorSel(b.dataset.selc); });
    // سحب المستطيل لتحريك ما بداخله، وإصبعان أو الزاوية للتكبير
    const ptrs = new Map(); let g = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.pvselbar,.pvselcols') || !sel) return;
      stop(e); try { el.setPointerCapture(e.pointerId); } catch (x) {}
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      const r = p.cv.getBoundingClientRect();
      if (e.target.classList.contains('pvselrz')) { g = { kind: 'rz', r: r, w0: (sel.box[2] - sel.box[0]) / 10000 * r.width, ax: r.left + sel.box[0] / 10000 * r.width }; return; }
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; g = { kind: 'pinch', r: r, d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1 }; sel.off = [0, 0]; return; }
      g = { kind: 'mv', r: r, x0: e.clientX, y0: e.clientY };
    });
    el.addEventListener('pointermove', (e) => {
      if (!g || !ptrs.has(e.pointerId) || !sel) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (g.kind === 'mv') { sel.off = [(e.clientX - g.x0) / g.r.width, (e.clientY - g.y0) / g.r.height]; placeSelBox(); moveTexts(); queue(p); }
      else if (g.kind === 'rz') { sel.scale = Math.max(0.2, Math.min(5, (e.clientX - g.ax) / g.w0)); placeSelBox(); queue(p); }
      else if (g.kind === 'pinch' && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; sel.scale = Math.max(0.2, Math.min(5, Math.hypot(a[0] - b[0], a[1] - b[1]) / g.d0)); placeSelBox(); queue(p); }
    });
    const up = (e) => {
      ptrs.delete(e.pointerId); if (!g || !sel) { g = null; return; }
      if (g.kind === 'mv' && !ptrs.size) { g = null; finishMove(); }
      else if ((g.kind === 'rz' && !ptrs.size) || (g.kind === 'pinch' && ptrs.size < 2)) { const f = sel.scale; sel.scale = 1; g = null; if (Math.abs(f - 1) > 0.01) scaleSel(f); else { placeSelBox(); queue(p); } }
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    renderBase(p); blit(p); renderTexts(p); p.lay.appendChild(el);
  }
  // تكبير/تصغير ما حُدّد انطلاقاً من زاويته العليا
  function scaledItem(s, f, ax, ay) {
    const X = (v) => Math.round(ax + (v - ax) * f), Y = (v) => Math.round(ay + (v - ay) * f);
    if (s.pts) return Object.assign({}, s, { pts: s.pts.map((v, k) => k % 2 ? Y(v) : X(v)), w: +Math.max(0.3, Math.min(60, s.w * f)).toFixed(2) });
    const n = Object.assign({}, s, { x: X(s.x), y: Y(s.y) });
    if (s.t === 'x') n.z = +Math.max(4, Math.min(80, s.z * f)).toFixed(1);
    if (s.w != null) n.w = Math.round(Math.max(400, Math.min(10000, s.w * f)));
    if (s.h != null) n.h = Math.round(s.h * f);
    return n;
  }
  function scaleSel(f) {
    if (!sel) return; finishMove();
    const p = byKey[sel.pg], ax = sel.box[0], ay = sel.box[1];
    const nw = sel.items.map((s) => scaledItem(s, f, ax, ay));
    const op = { pg: sel.pg, add: nw, del: sel.items.slice() };
    const L = items(op.pg); op.del.forEach((s) => { const k = L.indexOf(s); if (k >= 0) L.splice(k, 1); }); nw.forEach((s) => L.push(s));
    sel.items = nw; sel.set = new Set(nw);
    commit(op); renderBase(p); blit(p); const el = sel.el; renderTexts(p); p.lay.appendChild(el);
    sel.box = selBounds(p, nw); placeSelBox();
  }
  function recolorSel(c) {
    if (!sel) return; finishMove();
    const p = byKey[sel.pg];
    const nw = sel.items.map((s) => (s.c && s.t !== 'h' ? Object.assign({}, s, { c: c }) : s));
    const op = { pg: sel.pg, add: nw.filter((s, i) => s !== sel.items[i]), del: sel.items.filter((s, i) => s !== nw[i]) };
    if (!op.add.length) return;
    const L = items(op.pg); op.del.forEach((s) => { const k = L.indexOf(s); if (k >= 0) L.splice(k, 1); }); op.add.forEach((s) => L.push(s));
    sel.items = nw; sel.set = new Set(nw);
    commit(op); renderBase(p); blit(p); const el = sel.el; renderTexts(p); p.lay.appendChild(el);
  }
  // في وضع اليد: الضغط على خط أو نص يحدّده مباشرة
  function hitItem(p, q, e) {
    const L = items(p.k);
    for (let i = L.length - 1; i >= 0; i--) {
      const s = L[i];
      if (s.t === 'x') { const el = [...p.lay.children].find((x) => x._s === s); if (el) { const b = el.getBoundingClientRect(); if (e.clientX >= b.left - 6 && e.clientX <= b.right + 6 && e.clientY >= b.top - 6 && e.clientY <= b.bottom + 6) return s; } continue; }
      if (!s.pts) continue;
      // المسافة بالبكسل على الشاشة (حتى يسهل اللمس بالإصبع على الهاتف)
      const r = p.cv.getBoundingClientRect(), kx = r.width / 10000, ky = r.height / 10000;
      const tol = Math.max(e.pointerType === 'touch' || matchMedia('(pointer:coarse)').matches ? 20 : 12, s.w / 1000 * r.width / 2 + 8), P = s.pts;
      const D = (x, y) => Math.hypot((x - q[0]) * kx, (y - q[1]) * ky);
      if (P.length === 2) { if (D(P[0], P[1]) < tol) return s; continue; }
      for (let k = 2; k < P.length; k += 2) {
        const ax = P[k - 2], ay = P[k - 1], bx = P[k], by = P[k + 1], dx = (bx - ax) * kx, dy = (by - ay) * ky, l2 = dx * dx + dy * dy;
        const t = l2 ? Math.max(0, Math.min(1, ((q[0] - ax) * kx * dx + (q[1] - ay) * ky * dy) / l2)) : 0;
        if (D(ax + t * (bx - ax), ay + t * (by - ay)) < tol) return s;
      }
    }
    return null;
  }
  DOC.addEventListener('click', (e) => {
    if (st.tool || e.target.closest('.pvobj,.pvselbox,.pvzbar,.pvtsel,.pvadd,button,select,textarea')) return;
    const p = pageOf(e); if (!p) return;
    const s = hitItem(p, pos(p, e), e);
    if (s) { clearSel(); selectItems(p, [s]); }
    else if (sel) clearSel();
  });
  function inBox(q, s) { const b = s.box, dx = s.off[0] * 10000, dy = s.off[1] * 10000; return q[0] >= b[0] + dx && q[0] <= b[2] + dx && q[1] >= b[1] + dy && q[1] <= b[3] + dy; }
  function placeSelBox() { const b = sel.box, dx = sel.off[0] * 100, dy = sel.off[1] * 100, f = sel.scale || 1; Object.assign(sel.el.style, { left: (b[0] / 100 + dx) + '%', top: (b[1] / 100 + dy) + '%', width: ((b[2] - b[0]) * f / 100) + '%', height: ((b[3] - b[1]) * f / 100) + '%' }); sel.el.classList.toggle('low', b[1] + sel.off[1] * 10000 < 600); }
  function moveTexts() { const p = byKey[sel.pg]; p.lay.querySelectorAll('.pvx,.pvobj').forEach((t) => { if (sel.set.has(t._s)) { t.style.left = (t._s.x / 100 + sel.off[0] * 100) + '%'; t.style.top = (t._s.y / 100 + sel.off[1] * 100) + '%'; } }); }
  function finishMove() {
    if (!sel || (!sel.off[0] && !sel.off[1])) return;
    const dx = Math.round(sel.off[0] * 10000), dy = Math.round(sel.off[1] * 10000), p = byKey[sel.pg];
    const moved = sel.items.map((s) => !s.pts ? Object.assign({}, s, { x: s.x + dx, y: s.y + dy }) : Object.assign({}, s, { pts: s.pts.map((v, k) => v + (k % 2 ? dy : dx)) }));
    const op = { pg: sel.pg, add: moved, del: sel.items.slice() };
    sel.items = moved; sel.set = new Set(moved); sel.box = [sel.box[0] + dx, sel.box[1] + dy, sel.box[2] + dx, sel.box[3] + dy]; sel.off = [0, 0];
    const L = items(op.pg); op.del.forEach((s) => { const k = L.indexOf(s); if (k >= 0) L.splice(k, 1); }); moved.forEach((s) => L.push(s));
    commit(op); placeSelBox(); renderBase(p); blit(p); const el = sel.el; renderTexts(p); p.lay.appendChild(el);
  }
  function clearSel() { if (!sel) return; const p = byKey[sel.pg]; if (sel.el) sel.el.remove(); sel = null; if (p && p.on) { renderBase(p); blit(p); renderTexts(p); } }

  /* ---------- الكتابة بلوحة المفاتيح ---------- */
  function addText(p, q) {
    const s = { t: 'x', x: q[0], y: Math.max(0, q[1] - 200), s: '', z: +(st.tz * 1.3).toFixed(1), c: st.tc }; if (st.tb) s.b = st.tb;
    items(p.k).push(s);
    const ta = textEl(p, s); p.lay.appendChild(ta);
    let first = true;
    ta.addEventListener('blur', () => { if (first && (s.s || '').trim()) { first = false; undo.push({ pg: p.k, add: [s], del: [] }); redo.length = 0; uiUndo(); } });
    ta.focus({ preventScroll: true });
  }

  /* ---------- مؤشر الليزر (لا يُحفظ) ---------- */
  let laserPts = [], laserRaf = 0;
  function laserAdd(e) { const p = act.p; const q = pos(p, e); laserPts.push({ p: p, x: q[0], y: q[1], t: performance.now() }); if (!laserRaf) laserRaf = requestAnimationFrame(laserTick); }
  function laserTick() {
    laserRaf = 0; const now = performance.now();
    laserPts = laserPts.filter((a) => now - a.t < 900);
    const byP = new Map(); laserPts.forEach((a) => { if (!byP.has(a.p)) byP.set(a.p, []); byP.get(a.p).push(a); });
    pages.forEach((p) => { if (p.on && (byP.has(p) || p._las)) { p._las = byP.has(p); blit(p, (c, W, H) => { const L = byP.get(p) || []; c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; for (let k = 1; k < L.length; k++) { const al = 1 - (now - L[k].t) / 900; c.strokeStyle = 'rgba(239,68,68,' + al.toFixed(2) + ')'; c.shadowColor = '#ef4444'; c.shadowBlur = 10; c.lineWidth = 4 * (window.devicePixelRatio || 1); c.beginPath(); c.moveTo(L[k - 1].x / 10000 * W, L[k - 1].y / 10000 * H); c.lineTo(L[k].x / 10000 * W, L[k].y / 10000 * H); c.stroke(); } c.restore(); }); } });
    if (laserPts.length) laserRaf = requestAnimationFrame(laserTick);
  }

  /* ---------- الحفظ التلقائي ---------- */
  function touch() { dirty = true; status('…'); clearTimeout(saveT); saveT = setTimeout(flush, 1200); }
  function status(s) {
    if (s === '…') SAVE.textContent = 'جارٍ الحفظ…';
    else if (s === 'ok') SAVE.textContent = '✓ محفوظ';
    else if (s === 'full') SAVE.textContent = '⚠ امتلأت مساحة الملاحظات لهذا الدرس';
    else if (s === 'err') SAVE.textContent = '⚠ لم يُحفظ بعد، سأعيد المحاولة';
    else SAVE.textContent = s || '';
    SAVE.dataset.s = s;
  }
  // نسخة احتياطية على الجهاز: لا يضيع شيء حتى بلا إنترنت أو إن فشل الحفظ في الحساب
  const BK = 'gueschemi.pvn.' + (o.uid || '') + '.' + ch.id;
  let cloudOK = false, lastTs = 0;
  function backup(j) { try { localStorage.setItem(BK, j); } catch (e) {} }
  function pack() {
    lastTs = Date.now();
    const out = { v: 1, ts: lastTs, p: {} };
    if (data.x && Object.keys(data.x).length) out.x = data.x;
    Object.keys(data.p).forEach((k) => { const L = data.p[k].filter((s) => s.t !== 'x' || (s.s || '').trim()); if (L.length) out.p[k] = L; });
    return JSON.stringify(out);
  }
  async function flush() {
    clearTimeout(saveT);
    if (!dirty || !loaded) return;
    if (saving) { saveT = setTimeout(flush, 800); return; }
    const j = pack();
    if (j.length > MAXJ) { status('full'); return; }
    backup(j);
    if (!cloudOK) { status('📱 محفوظ على هذا الجهاز'); return; }   // لم نقرأ نسخة الحساب بعد: لا نكتب فوقها
    saving = true; dirty = false;
    try { await o.saveNotes(ch.id, j); if (!dirty) status('ok'); }
    catch (e) { dirty = true; status('📱 محفوظ على الجهاز، سأرفعه لحسابك'); if (!dead) saveT = setTimeout(flush, 5000); }
    saving = false;
  }
  function parse(j) { try { const d = JSON.parse(j); return d && d.p ? d : null; } catch (e) { return null; } }
  function applyData(d) {
    data = d;
    build(); restoreStart();
    pages.forEach((p) => { if (p.on) { renderBase(p); blit(p); renderTexts(p); } });
  }
  // 1) نعرض فوراً ما على الجهاز  2) نقارن مع نسخة الحساب ونأخذ الأحدث
  let local = null; try { local = parse(localStorage.getItem(BK) || ''); } catch (e) {}
  const seen = new Set(); if (local) Object.keys(local.p).forEach((k) => local.p[k].forEach((it) => seen.add(it)));   // ما كان محفوظاً قبل هذه الجلسة
  if (local) { loaded = true; setTimeout(() => { if (!dead && !cloudOK) applyData(local); }, 0); }
  function loadCloud() {
    o.loadNotes(ch.id).then((j) => {
      if (dead) return;
      const cl = j ? parse(j) : null;
      const lt = local ? (local.ts || 0) : -1, ct = cl ? (cl.ts || 1) : 0;
      cloudOK = true; loaded = true;
      if (cl && ct >= lt) {
        // نسخة الحساب أحدث: نأخذها، ونضيف إليها ما كتبه الطالب قبل اكتمال التحميل
        if (dirty) {
          Object.keys(data.p).forEach((k) => { const add = data.p[k].filter((it) => !seen.has(it)); if (add.length) cl.p[k] = (cl.p[k] || []).concat(add); });
          if (data.x) { cl.x = cl.x || {}; Object.keys(data.x).forEach((k) => { const have = (cl.x[k] || []).map((n) => n.id); cl.x[k] = (cl.x[k] || []).concat(data.x[k].filter((n) => have.indexOf(n.id) < 0)); }); }
        }
        applyData(cl);
        if (dirty) touch(); else { backup(j); status('ok'); }
      }
      else if (local) { if (data !== local && !dirty) applyData(local); dirty = true; touch(); }   // تعديلات الجهاز أحدث من الحساب: نرفعها
      else if (dirty) touch();
    }).catch(() => {
      if (dead) return;
      loaded = true; status(local ? '📱 محفوظ على هذا الجهاز' : '');
      setTimeout(() => { if (!dead && !cloudOK) loadCloud(); }, 10000);   // نعيد المحاولة
    });
  }
  loadCloud();

  /* ---------- الصفحة الحالية والتكبير ---------- */
  const LK = 'gueschemi.pvpage.' + ch.id;
  function topOff() { const t = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--top')); return (isNaN(t) ? 56 : t) + $('.pvtop').offsetHeight + 8; }
  function goPage(i, smooth) { const f = pages[i].fig; const y = f.getBoundingClientRect().top + window.scrollY - topOff(); window.scrollTo({ top: y, behavior: smooth ? 'smooth' : 'auto' }); }
  let scT = 0;
  function onScroll() {
    if (scT) return;
    scT = requestAnimationFrame(() => {
      scT = 0; const line = topOff() + window.innerHeight * 0.25;
      let best = cur;
      for (let i = 0; i < pages.length; i++) { const r = pages[i].fig.getBoundingClientRect(); if (r.top <= line && r.bottom > line) { best = i; break; } if (r.top > line) { best = Math.max(0, i - 1); break; } }
      if (best !== cur) { cur = best; selPage.value = String(cur); syncPgBtn(); try { localStorage.setItem(LK, pages[cur].k); } catch (e) {} if (o.onPage) o.onPage(cur); }
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  selPage.addEventListener('change', () => { goPage(+selPage.value, false); });
  $('[data-pv="paste"]').addEventListener('click', pasteStrokes);
  const NEWB = $('[data-pv="new"]');
  NEWB.addEventListener('click', newPagePop);
  let hintEl = null;
  function hideHint() { if (hintEl) { hintEl.remove(); hintEl = null; try { localStorage.setItem('gueschemi.pvhint', '1'); } catch (e) {} } }
  (() => { let seen = false; try { seen = !!localStorage.getItem('gueschemi.pvhint'); } catch (e) {} if (seen) return;
    hintEl = document.createElement('div'); hintEl.className = 'pvhintb'; hintEl.innerHTML = '<span>جديد: يمكنك إضافة صفحات لملاحظاتك بين صفحات الدرس من هذا الزر.</span><button type="button" aria-label="فهمت">فهمت</button>';
    $('.pvtop').appendChild(hintEl); hintEl.querySelector('button').addEventListener('click', hideHint); setTimeout(hideHint, 9000); })();
  selZoom.addEventListener('change', () => {
    const keep = cur; st.zoom = +selZoom.value; keepLS(); DOC.style.setProperty('--pz', st.zoom);
    requestAnimationFrame(() => goPage(keep, false));
  });
  const onKey = (e) => {
    const typing = /input|textarea|select/i.test((e.target.tagName || ''));
    if (typing) { if (e.key === 'Escape') e.target.blur(); return; }
    const k = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); doRedo(); }
    else if (k === 'escape') { if (!POP.hidden) closePop(); else if (sel) clearSel(); else setTool(''); }
    else if ((k === 'delete' || k === 'backspace') && sel) { const op = { pg: sel.pg, add: [], del: sel.items.slice() }; const el = sel.el; sel = null; el.remove(); apply(op, false); commit(op); }
    else if (k === 'pagedown' || k === 'arrowdown' && !st.tool) { if (cur < pages.length - 1) { e.preventDefault(); goPage(cur + 1, true); } }
    else if (k === 'pageup' || k === 'arrowup' && !st.tool) { if (cur > 0) { e.preventDefault(); goPage(cur - 1, true); } }
  };
  document.addEventListener('keydown', onKey, true);
  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
  document.addEventListener('visibilitychange', onHide);

  let startK = o.start != null ? String(o.start) : null;
  if (startK == null) { try { startK = localStorage.getItem(LK) || '0'; } catch (e) { startK = '0'; } }
  build();
  function restoreStart() { const p = byKey[startK] || byKey['0']; cur = p.idx; selPage.value = String(cur); requestAnimationFrame(() => { if (cur) goPage(cur, false); }); }
  restoreStart();

  window.__gcPdfCtx = () => {
    const p = pages[cur]; if (!p) return null;
    if (p.li == null) return { label: ch.ar + ' · صفحة ملاحظات', text: '', key: 'pdf' + ch.id + p.k, kind: 'pdf', ch: ch };
    loadTX();
    const L = TX && TX[p.li] ? TX[p.li].map((l) => l[4]).join('\n') : '';
    return { label: ch.en + ' · ' + ch.ar + ' · صفحة ' + (p.li + 1) + ' / ' + N, text: L, key: 'pdf' + ch.id + '_' + p.li + (L ? 't' : ''), kind: 'pdf', ch: ch };
  };
  loadTX();
  /* ---------- ملء الشاشة (Plein écran) ---------- */
  // على Android والحاسوب وiPad: ملء الشاشة الحقيقي. على iPhone (لا يسمح Safari بذلك): نخفي كل شيء ما عدا الدرس.
  const FSB = $('[data-pv="full"]');
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  function setFull(on) {
    document.body.classList.toggle('pvfull', on); FSB.classList.toggle('on', on);
    document.documentElement.style.setProperty('--top', on ? '0px' : '');
    FSB.setAttribute('aria-label', on ? 'الخروج من ملء الشاشة' : 'ملء الشاشة');
    const k = cur; requestAnimationFrame(() => goPage(k, false));
  }
  async function toggleFull() {
    const on = !document.body.classList.contains('pvfull');
    if (on) {
      setFull(true);
      const d = document.documentElement, rq = d.requestFullscreen || d.webkitRequestFullscreen;
      if (rq) { try { await rq.call(d, { navigationUI: 'hide' }); } catch (e) {} }
    } else {
      setFull(false);
      if (fsEl()) { try { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {} }
    }
  }
  const onFsChange = () => { if (!fsEl() && document.body.classList.contains('pvfull') && FS_REAL) setFull(false); FS_REAL = !!fsEl(); };
  let FS_REAL = false;
  FSB.addEventListener('click', toggleFull);
  document.addEventListener('fullscreenchange', onFsChange); document.addEventListener('webkitfullscreenchange', onFsChange);
  return function destroy() {
    window.__gcPdfCtx = null;
    document.removeEventListener('fullscreenchange', onFsChange); document.removeEventListener('webkitfullscreenchange', onFsChange);
    if (document.body.classList.contains('pvfull')) { document.body.classList.remove('pvfull'); document.documentElement.style.removeProperty('--top'); if (fsEl()) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {} } }
    flush();
    dead = true;
    io.disconnect(); ro.disconnect();
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onHide);
  };
}
