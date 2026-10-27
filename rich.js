// تنسيق النصوص العلمية: رموز النظائر مكدّسة (A فوق Z) + معادلات KaTeX بين $…$ (مع \ce{} للكيمياء).
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '−', '⁺': '+' };
const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₋': '−', '₊': '+' };
const pre = (a, z) => '<span class="pre"><sup class="p">' + a + '</sup><sub class="p">' + z + '</sub></span>';

// ¹⁴₇N  أو  <sup>14</sup><sub>7</sub>N  →  رمز مكدّس
export function fmt(h) {
  if (!h) return '';
  return String(h)
    .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+)([₀₁₂₃₄₅₆₇₈₉₋]+)(?=[A-Za-z])/g, (m, a, z) => pre(a.split('').map((c) => SUP[c]).join(''), z.split('').map((c) => SUB[c]).join('')))
    .replace(/<sup>([0-9]{1,3})<\/sup><sub>([−\-]?[0-9]{1,3})<\/sub>(?=(?:<\/b>)?[A-Za-z])/g, (m, a, z) => pre(a, z));
}

const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/';
let KX = null;
function addScript(src) {
  return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.crossOrigin = 'anonymous'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
}
export function loadKatex() {
  if (KX) return KX;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = CDN + 'katex.min.css'; l.crossOrigin = 'anonymous'; document.head.appendChild(l);
  KX = addScript(CDN + 'katex.min.js').then(() => addScript(CDN + 'contrib/mhchem.min.js')).then(() => addScript(CDN + 'contrib/auto-render.min.js'));
  KX.catch(() => { KX = null; });
  return KX;
}
// يرسم كل معادلة $…$ داخل العنصر (لا يحمّل KaTeX إلا إذا وُجد $)
export function typeset(root) {
  if (!root || (root.textContent || '').indexOf('$') < 0) return Promise.resolve();
  return loadKatex().then(() => {
    if (!root.isConnected || !window.renderMathInElement) return;
    window.renderMathInElement(root, {
      delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
      throwOnError: false, ignoredTags: ['script', 'noscript', 'style', 'textarea', 'input', 'option'], ignoredClasses: ['noformula']
    });
  }).catch(() => {});
}
