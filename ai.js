// مساعد Gemini داخل الموقع (Firebase AI Logic · Gemini Developer API).
// يعمل في نسخة Firebase منفصلة (12.x) حتى لا يمسّ باقي الموقع: إن فشل، يبقى الموقع سليماً.
import * as CFG from './firebase-config.js?v=78';

const V = '12.12.1';
const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3-flash-preview'];
const SYS = 'أنت «مساعد Gues Chemi»، أستاذ مساعد لطلبة السنة الأولى صيدلة في الجزائر. ' +
  'القاعدة الأهم: الدرس هو المرجع الأول. مع كل سؤال يصلك «نص الدرس» و«مقتطفات من الدرس»: ابنِ جوابك عليها أولاً، واستعمل نفس تعريفاتها وأرقامها ومصطلحاتها حتى لو كانت تختلف عمّا تعرفه، لأن الطالب يُمتحن على درسه. ' +
  'إن لم يكن الجواب موجوداً في نص الدرس، فقل صراحة: «هذا غير مذكور في الدرس، ومن معلوماتي العامة:» ثم أجب بحذر. لا تخلط بين ما في الدرس وما من معرفتك دون تمييز. ' +
  'أجب بالعربية الواضحة، واكتب المصطلحات العلمية بالفرنسية أو الإنجليزية كما في الدروس. كن مختصراً ومنظماً بنقاط قصيرة. لا تخترع أرقاماً أو مراجع. ' +
  'في أسئلة الكيسيام: قد يكون أكثر من اقتراح صحيح. اعتمد على «الجواب الرسمي» و«التصحيح» المرفقين إن وُجدا، واشرح لكل اقتراح (A، B، C…) لماذا هو صحيح أو خاطئ مع الجملة من الدرس التي تثبت ذلك. ' +
  'إن قال الطالب إنه يريد المحاولة وحده، أعطه تلميحاً دون كشف الجواب. لا تجب عن مواضيع لا علاقة لها بالدراسة.';

let modP = null, chat = null, modelName = '', lastCtxKey = '', hist = [], mIdx = 0;
function load() {
  if (!modP) modP = Promise.all([
    import('https://www.gstatic.com/firebasejs/' + V + '/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/' + V + '/firebase-ai.js')
  ]).then(async ([A, AI]) => {
    const app = A.getApps().find((x) => x.name === 'gcai') || A.initializeApp(CFG.firebaseConfig, 'gcai');
    if (CFG.appCheckSiteKey) {
      try { const C = await import('https://www.gstatic.com/firebasejs/' + V + '/firebase-app-check.js'); C.initializeAppCheck(app, { provider: CFG.appCheckEnterprise ? new C.ReCaptchaEnterpriseProvider(CFG.appCheckSiteKey) : new C.ReCaptchaV3Provider(CFG.appCheckSiteKey), isTokenAutoRefreshEnabled: true }); } catch (e) {}
    }
    const ai = AI.getAI(app, { backend: new AI.GoogleAIBackend() });
    return { AI: AI, ai: ai };
  }).catch((e) => { modP = null; throw e; });
  return modP;
}
async function chatWith(idx) {
  const { AI, ai } = await load();
  const model = AI.getGenerativeModel(ai, { model: MODELS[idx], systemInstruction: SYS, generationConfig: { maxOutputTokens: 1500, temperature: 0.4 } });
  modelName = MODELS[idx];
  return model.startChat({ history: hist.slice() });
}
// نجرّب النماذج بالترتيب: إن رفض نموذج (حصة صفر / غير متاح) ننتقل إلى التالي ونتذكّره
async function streamAsk(prompt, onText) {
  let last = null;
  for (let k = 0; k < MODELS.length; k++) {
    const idx = (mIdx + k) % MODELS.length;
    try {
      const c = await chatWith(idx);
      const r = await c.sendMessageStream(prompt);
      let acc = '';
      for await (const ch of r.stream) { try { acc += ch.text(); } catch (e) {} onText(acc); }
      if (!acc) { const fin = await r.response; acc = fin.text(); onText(acc); }
      mIdx = idx;
      hist.push({ role: 'user', parts: [{ text: prompt }] }, { role: 'model', parts: [{ text: acc }] });
      if (hist.length > 16) hist = hist.slice(-16);
      return acc;
    } catch (e) {
      last = e; const m = String(e && (e.message || e));
      try { console.warn('[GuesAI]', MODELS[idx], m); } catch (x) {}
      if (!/quota|429|exhaust|rate|404|not found|not supported|unsupported|invalid.*model|model/i.test(m)) break;
    }
  }
  throw last;
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function md(t) {   // تنسيق بسيط وآمن: عناوين، خط عريض، قوائم، أسطر
  const lines = esc(t).split('\n');
  let h = '', inL = false;
  for (const raw of lines) {
    let l = raw.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    const li = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (li) { if (!inL) { h += '<ul>'; inL = true; } h += '<li>' + li[1] + '</li>'; continue; }
    if (inL) { h += '</ul>'; inL = false; }
    const hd = l.match(/^#{1,4}\s+(.*)$/);
    if (hd) h += '<p class="aih">' + hd[1] + '</p>';
    else if (l.trim()) h += '<p>' + l + '</p>';
  }
  if (inL) h += '</ul>';
  return h;
}

export function mountAI(o) {
  if (document.getElementById('gcai')) return;
  /* ---- سجلّ المحادثات: محفوظ على الجهاز وفي حساب الطالب ---- */
  const LKEY = () => 'gueschemi.aichats.' + (o.email() || '');
  let CH = [];          // [{id, ti, t, m:[{r:'u'|'b', x, q?, l?}]}] الأحدث أولاً
  let cur = null;       // المحادثة الحالية
  const keepLocal = () => { try { localStorage.setItem(LKEY(), JSON.stringify(CH.slice(0, 30))); } catch (e) { try { localStorage.setItem(LKEY(), JSON.stringify(CH.slice(0, 8))); } catch (x) {} } };
  try { CH = JSON.parse(localStorage.getItem(LKEY()) || '[]') || []; } catch (e) { CH = []; }
  const synced = (async () => {
    if (!o.listChats) return;
    try {
      const L = (await o.listChats()).map((j) => { try { return JSON.parse(j); } catch (e) { return null; } }).filter((c) => c && c.id);
      const by = {}; CH.concat(L).forEach((c) => { if (!by[c.id] || (c.t || 0) > (by[c.id].t || 0)) by[c.id] = c; });
      CH = Object.values(by).sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 40); keepLocal();
      // ما حُفظ على الجهاز فقط (بلا إنترنت سابقاً) نرفعه الآن
      const ids = {}; L.forEach((c) => { ids[c.id] = c.t; });
      CH.forEach((c) => { if (ids[c.id] !== c.t) push(c); });
    } catch (e) {}
  })();
  function push(c) { if (!o.saveChat) return; let j = JSON.stringify(c); while (j.length > 290000 && c.m.length > 2) { c.m = c.m.slice(2); j = JSON.stringify(c); } o.saveChat(c.id, j).catch(() => {}); }
  function record(u, b, q, l) {
    if (!cur) { cur = { id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ti: u.slice(0, 70), t: 0, m: [] }; CH.unshift(cur); }
    cur.m.push({ r: 'u', x: u.slice(0, 4000), q: q ? q.slice(0, 600) : undefined, l: l || undefined }, { r: 'b', x: b.slice(0, 12000) });
    if (cur.m.length > 80) cur.m = cur.m.slice(-80);
    cur.t = Date.now();
    CH = [cur].concat(CH.filter((c) => c !== cur && c.id !== cur.id)).slice(0, 40);
    keepLocal(); push(cur);
  }
  function showConv(c) {
    reset(); cur = c;
    c.m.forEach((x) => { if (x.r === 'u') bubble('me', (x.q ? '<blockquote>' + esc(x.q) + '</blockquote>' : '') + '<p>' + esc(x.x) + '</p>' + (x.l ? '<small class="ailbl">' + esc(x.l) + '</small>' : '')); else bubble('bot', md(x.x)); });
    // نعيد للنموذج آخر الأسئلة والأجوبة (بلا نص الدرس؛ يُرسل الدرس من جديد مع السؤال القادم)
    hist = c.m.slice(-16).map((x) => ({ role: x.r === 'u' ? 'user' : 'model', parts: [{ text: x.x }] }));
    lastCtxKey = '';
  }
  function histView() {
    const H = $('.aihist');
    if (!H.hidden) { H.hidden = true; return; }
    H.innerHTML = '<p class="aihh"><b>🕘 محادثاتك السابقة</b><button type="button" class="aix" data-ai="hclose" aria-label="رجوع">✕</button></p>' +
      (CH.length ? CH.map((c) => '<div class="aihi' + (c === cur ? ' on' : '') + '"><button type="button" data-ai="hopen" data-id="' + esc(c.id) + '"><b>' + esc(c.ti || 'محادثة') + '</b><small>' + new Date(c.t || 0).toLocaleString('fr-DZ', { dateStyle: 'short', timeStyle: 'short' }) + ' · ' + Math.ceil((c.m || []).length / 2) + ' سؤال</small></button><button type="button" class="aidel" data-ai="hdel" data-id="' + esc(c.id) + '" aria-label="حذف">🗑</button></div>').join('')
        : '<p class="small">لا توجد محادثات بعد. أسئلتك وأجوبة Gemini تُحفظ هنا تلقائياً.</p>');
    H.style.top = P.querySelector('header').offsetHeight + 'px'; H.hidden = false;
  }

  const root = document.createElement('div'); root.id = 'gcai';
  root.innerHTML = '<button type="button" class="aifab" aria-label="اسأل Gemini" title="اسأل Gemini عن الدرس"><span>✨</span><b>اسأل Gemini</b></button>' +
    '<section class="aipanel" hidden role="dialog" aria-label="مساعد Gemini">' +
    '<header><div><b>✨ مساعد Gemini</b><small class="aictx"></small></div><button type="button" class="aix" data-ai="hist" title="محادثاتي السابقة">🕘</button><button type="button" class="aix" data-ai="new" title="محادثة جديدة">↺</button><button type="button" class="aix" data-ai="close" aria-label="إغلاق">✕</button></header>' +
    '<div class="aimsgs"><div class="aiwel"><p>اسألني عن أي شيء في الدرس: شرح فكرة، تلخيص صفحة، الفرق بين مفهومين، أو لماذا جواب كيسيام صحيح.</p>' +
    '<div class="aisugg"><button type="button" data-q="اشرح لي هذه الصفحة ببساطة">اشرح هذه الصفحة</button><button type="button" data-q="لخّص لي هذه الصفحة في نقاط قصيرة">لخّص الصفحة</button><button type="button" data-q="اطرح عليّ 3 أسئلة كيسيام عن هذه الصفحة مع الحل">اختبرني</button></div></div></div>' +
    '<div class="aihist" hidden></div>' +
    '<div class="aiquote" hidden><span></span><button type="button" data-ai="unquote" aria-label="إزالة">✕</button></div>' +
    '<form class="aiform"><textarea rows="1" placeholder="اكتب سؤالك…" dir="auto"></textarea><button type="submit" aria-label="إرسال">➤</button></form>' +
    '<p class="ainote">قد يخطئ Gemini أحياناً: تحقّق دائماً من الدرس. <span class="aileft"></span></p><p class="airc">محمي بـ reCAPTCHA وتنطبق <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">سياسة الخصوصية</a> و<a href="https://policies.google.com/terms" target="_blank" rel="noopener">شروط الخدمة</a> من Google.</p></section>';
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const P = $('.aipanel'), M = $('.aimsgs'), TA = $('textarea'), Q = $('.aiquote');
  let quote = '', busy = false;

  async function ctx(q) { let c = null; try { c = await o.getCtx(q); } catch (e) {} return c || { label: '', text: '', key: '' }; }
  const SUG = { qcm: [['اشرح لي هذا السؤال وكل اقتراح', 'اشرح لي هذا السؤال: لماذا كل اقتراح صحيح أو خاطئ، اعتماداً على الدرس'], ['أعطني تلميحاً فقط', 'أريد أن أحاول وحدي: أعطني تلميحاً من الدرس دون كشف الجواب'], ['ذكّرني بالدرس المتعلق', 'لخّص لي جزء الدرس المتعلق بهذا السؤال']],
    def: [['اشرح هذه الصفحة', 'اشرح لي هذه الصفحة ببساطة'], ['لخّص الصفحة', 'لخّص لي هذه الصفحة في نقاط قصيرة'], ['اختبرني', 'اطرح عليّ 3 أسئلة كيسيام من هذه الصفحة مع الحل']] };
  async function refreshHead() {
    const c = await ctx(); $('.aictx').textContent = c.block || c.label || 'Gues Chemi';
    $('.aisugg').innerHTML = (SUG[c.kind] || SUG.def).map((x) => '<button type="button" data-q="' + esc(x[1]) + '">' + esc(x[0]) + '</button>').join('');
    $('.aileft').textContent = '';
  }
  let first = true;
  function open(q, ask) {
    P.hidden = false; root.classList.add('on'); refreshHead();
    // أول فتح: نكمل آخر محادثة إن كانت خلال 12 ساعة
    if (first) { first = false; const go = () => { if (!cur && !M.querySelector('.aim') && CH[0] && Date.now() - (CH[0].t || 0) < 432e5) showConv(CH[0]); }; go(); synced.then(go); }
    if (q) { quote = q.slice(0, 600); Q.hidden = false; Q.querySelector('span').textContent = '«' + quote + '»'; }
    if (ask) send(ask); else setTimeout(() => TA.focus(), 50);
  }
  function close() { P.hidden = true; root.classList.remove('on'); }
  function reset() { hist = []; lastCtxKey = ''; cur = null; $('.aihist').hidden = true; M.querySelectorAll('.aim').forEach((x) => x.remove()); M.querySelector('.aiwel').hidden = false; }
  function bubble(cls, html) { const d = document.createElement('div'); d.className = 'aim ' + cls; d.innerHTML = html; M.appendChild(d); M.querySelector('.aiwel').hidden = true; M.scrollTop = M.scrollHeight; return d; }

  let extQ = '', extShort = '';
  function copyText(t) {
    const fb = () => { try { const a = document.createElement('textarea'); a.value = t; a.setAttribute('readonly', ''); a.style.cssText = 'position:fixed;top:0;opacity:0'; document.body.appendChild(a); a.select(); a.setSelectionRange(0, t.length); document.execCommand('copy'); a.remove(); } catch (e) {} };
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).catch(fb); else fb(); } catch (e) { fb(); }
  }
  async function send(text) {
    text = (text || '').trim(); if (!text || busy) return;
    // بلا حدّ يومي
    busy = true; TA.value = ''; TA.style.height = '';
    const c = await ctx(text);
    if (c.block) { bubble('bot err', '<p>' + esc(c.block) + '</p>'); busy = false; return; }
    bubble('me', (quote ? '<blockquote>' + esc(quote) + '</blockquote>' : '') + '<p>' + esc(text) + '</p>');
    let prompt = '';
    if (c.key !== lastCtxKey && (c.text || c.label)) {
      prompt += 'السياق: ' + (c.label || '') + '\n' + (c.text ? 'نص الدرس (ما يقرؤه الطالب الآن):\n"""\n' + c.text.slice(0, 9000) + '\n"""\n\n' : '\n');
      lastCtxKey = c.key;
    }
    if (c.more) prompt += 'مقتطفات أخرى من الدرس قد تفيد في الجواب:\n"""\n' + c.more + '\n"""\n\n';
    if (quote) prompt += 'الجزء الذي حدّده الطالب من الدرس:\n"' + quote + '"\n\n';
    prompt += 'سؤال الطالب: ' + text;
    const q0 = quote; quote = ''; Q.hidden = true;
    // نسخة كاملة للسؤال لاستعمالها في Gemini الخارجي إن تعذّر المساعد
    extQ = 'أنا طالب سنة أولى صيدلة. أجبني بالعربية مع المصطلحات بالفرنسية، واعتمد على نص الدرس أولاً.\n\n' +
      (c.label ? 'الدرس: ' + c.label + '\n' : '') + (c.text ? 'نص الدرس:\n"""\n' + c.text.slice(0, 6000) + '\n"""\n\n' : '') +
      (c.more ? 'مقتطفات أخرى:\n"""\n' + c.more.slice(0, 2000) + '\n"""\n\n' : '') + (q0 ? 'الجزء المحدد: "' + q0 + '"\n\n' : '') + 'سؤالي: ' + text;
    extShort = (c.label ? c.label + ' — ' : '') + (q0 ? '«' + q0.slice(0, 300) + '» ' : '') + text;
    const out = bubble('bot', '<p class="aiwait">… يكتب</p>');
    try {
      const ans = await streamAsk(prompt, (acc) => { out.innerHTML = md(acc); M.scrollTop = M.scrollHeight; });
      record(text, ans || '', q0, c.label);
    } catch (e) {
      const m = String(e && (e.message || e));
      lastCtxKey = '';
      out.className = 'aim bot err';
      out.innerHTML = '<p>' + (/quota|429|exhaust|rate/i.test(m) ? 'المساعد مشغول الآن (انتهت الحصة المؤقتة). حاول بعد قليل.' :
        /api-not-enabled|not been used|disabled|PERMISSION|403|app-check/i.test(m) ? 'المساعد غير مفعّل بعد في إعدادات الموقع. أخبر المشرف.' :
        'تعذّر الاتصال بـ Gemini. تحقق من الإنترنت ثم أعد المحاولة.') + '</p>' +
        '<p class="ainfo">أكمل سؤالك الآن بحسابك في Gemini (مجاناً): الزر ينسخ سؤالك مع نص الدرس ثم يفتح Gemini، فاضغط مطوّلاً في خانة الكتابة ← <b>لصق</b> ← أرسل.</p><p class="aiext"><button type="button" class="btn sm pri" data-ai="ext">✨ انسخ وافتح Gemini</button> <button type="button" class="btn sm" data-ai="extg">🔎 Google AI</button></p>' +
        '<p class="aiexth" hidden>✓ نُسخ — الصقه في Gemini.</p>' +
        '<p class="aierr" dir="ltr">' + esc(m.slice(0, 220)) + '</p>';
      try { console.warn('[GuesAI]', m); } catch (x) {}
    }
    busy = false;
  }

  $('.aifab').addEventListener('click', () => (P.hidden ? open() : close()));
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ai],[data-q]'); if (!b) return;
    if (b.dataset.ai === 'close') close();
    else if (b.dataset.ai === 'new') reset();
    else if (b.dataset.ai === 'hist') histView();
    else if (b.dataset.ai === 'hclose') $('.aihist').hidden = true;
    else if (b.dataset.ai === 'hopen') { const c = CH.find((x) => x.id === b.dataset.id); if (c) showConv(c); }
    else if (b.dataset.ai === 'hdel') {
      if (b.dataset.arm !== '1') { b.dataset.arm = '1'; b.textContent = 'حذف؟'; setTimeout(() => { if (b.isConnected) { b.dataset.arm = ''; b.textContent = '🗑'; } }, 3000); return; }
      const id = b.dataset.id; CH = CH.filter((x) => x.id !== id); keepLocal(); if (o.delChat) o.delChat(id).catch(() => {});
      if (cur && cur.id === id) reset();
      $('.aihist').hidden = true; histView();
    }
    else if (b.dataset.ai === 'unquote') { quote = ''; Q.hidden = true; }
    else if (b.dataset.ai === 'ext') {
      copyText(extQ);
      const h = b.closest('.aim') && b.closest('.aim').querySelector('.aiexth'); if (h) h.hidden = false;
      window.open('https://gemini.google.com/app', '_blank', 'noopener');
    }
    else if (b.dataset.ai === 'extg') window.open('https://www.google.com/search?udm=50&q=' + encodeURIComponent(extShort.slice(0, 1500)), '_blank', 'noopener');
    else if (b.dataset.q) send(b.dataset.q);
  });
  $('.aiform').addEventListener('submit', (e) => { e.preventDefault(); send(TA.value); });
  TA.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(TA.value); } });
  TA.addEventListener('input', () => { TA.style.height = 'auto'; TA.style.height = Math.min(120, TA.scrollHeight) + 'px'; });
  window.__gcAsk = (q, ask) => open(q, ask);
  return { open: open, close: close };
}
