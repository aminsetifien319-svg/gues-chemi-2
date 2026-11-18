// مساعد Gemini داخل الموقع (Firebase AI Logic · Gemini Developer API).
// يعمل في نسخة Firebase منفصلة (12.x) حتى لا يمسّ باقي الموقع: إن فشل، يبقى الموقع سليماً.
import * as CFG from './firebase-config.js?v=74';

const V = '12.12.1';
const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3-flash-preview'];
const DAILY = 30;
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
  const dayKey = () => 'gueschemi.ai.' + (o.email() || '') + '.' + new Date().toISOString().slice(0, 10);
  const used = () => { try { return +localStorage.getItem(dayKey()) || 0; } catch (e) { return 0; } };
  const use = () => { try { localStorage.setItem(dayKey(), String(used() + 1)); } catch (e) {} };

  const root = document.createElement('div'); root.id = 'gcai';
  root.innerHTML = '<button type="button" class="aifab" aria-label="اسأل Gemini" title="اسأل Gemini عن الدرس"><span>✨</span><b>اسأل Gemini</b></button>' +
    '<section class="aipanel" hidden role="dialog" aria-label="مساعد Gemini">' +
    '<header><div><b>✨ مساعد Gemini</b><small class="aictx"></small></div><button type="button" class="aix" data-ai="new" title="محادثة جديدة">↺</button><button type="button" class="aix" data-ai="close" aria-label="إغلاق">✕</button></header>' +
    '<div class="aimsgs"><div class="aiwel"><p>اسألني عن أي شيء في الدرس: شرح فكرة، تلخيص صفحة، الفرق بين مفهومين، أو لماذا جواب كيسيام صحيح.</p>' +
    '<div class="aisugg"><button type="button" data-q="اشرح لي هذه الصفحة ببساطة">اشرح هذه الصفحة</button><button type="button" data-q="لخّص لي هذه الصفحة في نقاط قصيرة">لخّص الصفحة</button><button type="button" data-q="اطرح عليّ 3 أسئلة كيسيام عن هذه الصفحة مع الحل">اختبرني</button></div></div></div>' +
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
  function open(q, ask) {
    P.hidden = false; root.classList.add('on'); refreshHead();
    if (q) { quote = q.slice(0, 600); Q.hidden = false; Q.querySelector('span').textContent = '«' + quote + '»'; }
    if (ask) send(ask); else setTimeout(() => TA.focus(), 50);
  }
  function close() { P.hidden = true; root.classList.remove('on'); }
  function reset() { hist = []; lastCtxKey = ''; M.querySelectorAll('.aim').forEach((x) => x.remove()); M.querySelector('.aiwel').hidden = false; }
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
    quote = ''; Q.hidden = true;
    // نسخة كاملة للسؤال لاستعمالها في Gemini الخارجي إن تعذّر المساعد
    extQ = 'أنا طالب سنة أولى صيدلة. أجبني بالعربية مع المصطلحات بالفرنسية، واعتمد على نص الدرس أولاً.\n\n' +
      (c.label ? 'الدرس: ' + c.label + '\n' : '') + (c.text ? 'نص الدرس:\n"""\n' + c.text.slice(0, 6000) + '\n"""\n\n' : '') +
      (c.more ? 'مقتطفات أخرى:\n"""\n' + c.more.slice(0, 2000) + '\n"""\n\n' : '') + (quote ? 'الجزء المحدد: "' + quote + '"\n\n' : '') + 'سؤالي: ' + text;
    extShort = (c.label ? c.label + ' — ' : '') + (quote ? '«' + quote.slice(0, 300) + '» ' : '') + text;
    const out = bubble('bot', '<p class="aiwait">… يكتب</p>');
    try {
      await streamAsk(prompt, (acc) => { out.innerHTML = md(acc); M.scrollTop = M.scrollHeight; });
      use(); refreshHead();
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
