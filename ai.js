// مساعد Gemini داخل الموقع (Firebase AI Logic · Gemini Developer API).
// يعمل في نسخة Firebase منفصلة (12.x) حتى لا يمسّ باقي الموقع: إن فشل، يبقى الموقع سليماً.
import * as CFG from './firebase-config.js?v=65';

const V = '12.12.1';
const MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash'];
const DAILY = 30;
const SYS = 'أنت «مساعد Gues Chemi»، أستاذ مساعد لطلبة السنة الأولى صيدلة في الجزائر. ' +
  'أجب بالعربية الواضحة، واكتب المصطلحات العلمية بالفرنسية أو الإنجليزية كما في الدروس (مثلاً: الكابسيد capside). ' +
  'اعتمد أولاً على «نص الدرس» المرفق مع السؤال إن وُجد، وإن كان الجواب غير موجود فيه قل ذلك ثم أجب من معرفتك بحذر. ' +
  'كن مختصراً ومنظماً (نقاط قصيرة)، واشرح الفكرة ببساطة مع مثال إن أمكن. لا تخترع أرقاماً أو مراجع. ' +
  'إن سُئلت عن سؤال كيسيام، اشرح لماذا كل اقتراح صحيح أو خاطئ. لا تجب عن مواضيع لا علاقة لها بالدراسة.';

let modP = null, chat = null, modelName = '', lastCtxKey = '';
function load() {
  if (!modP) modP = Promise.all([
    import('https://www.gstatic.com/firebasejs/' + V + '/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/' + V + '/firebase-ai.js')
  ]).then(async ([A, AI]) => {
    const app = A.getApps().find((x) => x.name === 'gcai') || A.initializeApp(CFG.firebaseConfig, 'gcai');
    if (CFG.appCheckSiteKey) {
      try { const C = await import('https://www.gstatic.com/firebasejs/' + V + '/firebase-app-check.js'); C.initializeAppCheck(app, { provider: new C.ReCaptchaV3Provider(CFG.appCheckSiteKey), isTokenAutoRefreshEnabled: true }); } catch (e) {}
    }
    const ai = AI.getAI(app, { backend: new AI.GoogleAIBackend() });
    return { AI: AI, ai: ai };
  }).catch((e) => { modP = null; throw e; });
  return modP;
}
async function newChat(history) {
  const { AI, ai } = await load();
  let err = null;
  for (const m of MODELS) {
    try {
      const model = AI.getGenerativeModel(ai, { model: m, systemInstruction: SYS, generationConfig: { maxOutputTokens: 1200, temperature: 0.4 } });
      const c = model.startChat({ history: history || [] });
      modelName = m; return c;
    } catch (e) { err = e; }
  }
  throw err;
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
    '<p class="ainote">قد يخطئ Gemini أحياناً: تحقّق دائماً من الدرس. <span class="aileft"></span></p></section>';
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const P = $('.aipanel'), M = $('.aimsgs'), TA = $('textarea'), Q = $('.aiquote');
  let quote = '', busy = false;

  function ctx() { let c = null; try { c = o.getCtx(); } catch (e) {} return c || { label: '', text: '', key: '' }; }
  function refreshHead() {
    const c = ctx(); $('.aictx').textContent = c.label || 'Gues Chemi';
    $('.aileft').textContent = 'متبقٍّ اليوم: ' + Math.max(0, DAILY - used()) + '/' + DAILY;
  }
  function open(q) {
    P.hidden = false; root.classList.add('on'); refreshHead();
    if (q) { quote = q.slice(0, 600); Q.hidden = false; Q.querySelector('span').textContent = '«' + quote + '»'; }
    setTimeout(() => TA.focus(), 50);
  }
  function close() { P.hidden = true; root.classList.remove('on'); }
  function reset() { chat = null; lastCtxKey = ''; M.querySelectorAll('.aim').forEach((x) => x.remove()); M.querySelector('.aiwel').hidden = false; }
  function bubble(cls, html) { const d = document.createElement('div'); d.className = 'aim ' + cls; d.innerHTML = html; M.appendChild(d); M.querySelector('.aiwel').hidden = true; M.scrollTop = M.scrollHeight; return d; }

  async function send(text) {
    text = (text || '').trim(); if (!text || busy) return;
    if (used() >= DAILY) { bubble('bot err', '<p>انتهت أسئلتك لهذا اليوم (' + DAILY + '). عُد غداً إن شاء الله.</p>'); return; }
    busy = true; TA.value = ''; TA.style.height = '';
    const c = ctx();
    bubble('me', (quote ? '<blockquote>' + esc(quote) + '</blockquote>' : '') + '<p>' + esc(text) + '</p>');
    let prompt = '';
    if (c.key !== lastCtxKey && (c.text || c.label)) {
      prompt += 'السياق: ' + (c.label || '') + '\n' + (c.text ? 'نص الدرس (الصفحة التي يقرؤها الطالب):\n"""\n' + c.text.slice(0, 6000) + '\n"""\n\n' : '\n');
      lastCtxKey = c.key;
    }
    if (quote) prompt += 'الجزء الذي حدّده الطالب من الدرس:\n"' + quote + '"\n\n';
    prompt += 'سؤال الطالب: ' + text;
    quote = ''; Q.hidden = true;
    const out = bubble('bot', '<p class="aiwait">… يكتب</p>');
    try {
      if (!chat) chat = await newChat();
      let acc = '';
      const r = await chat.sendMessageStream(prompt);
      for await (const ch of r.stream) { try { acc += ch.text(); } catch (e) {} out.innerHTML = md(acc); M.scrollTop = M.scrollHeight; }
      if (!acc) { const fin = await r.response; acc = fin.text(); out.innerHTML = md(acc); }
      use(); refreshHead();
    } catch (e) {
      const m = String(e && (e.message || e));
      chat = null; lastCtxKey = '';
      out.className = 'aim bot err';
      out.innerHTML = '<p>' + (/quota|429|exhaust|rate/i.test(m) ? 'المساعد مشغول الآن (انتهت الحصة المؤقتة). حاول بعد قليل.' :
        /api-not-enabled|not been used|disabled|PERMISSION|403|app-check/i.test(m) ? 'المساعد غير مفعّل بعد في إعدادات الموقع. أخبر المشرف.' :
        'تعذّر الاتصال بـ Gemini. تحقق من الإنترنت ثم أعد المحاولة.') + '</p>';
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
    else if (b.dataset.q) send(b.dataset.q);
  });
  $('.aiform').addEventListener('submit', (e) => { e.preventDefault(); send(TA.value); });
  TA.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(TA.value); } });
  TA.addEventListener('input', () => { TA.style.height = 'auto'; TA.style.height = Math.min(120, TA.scrollHeight) + 'px'; });
  window.__gcAsk = (q) => open(q);
  return { open: open, close: close };
}
