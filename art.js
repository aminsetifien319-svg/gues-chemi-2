// هوية بصرية لكل مادة (لون + شعار + زخرفة) ورسمة مجسّمة لكل درس — كلها SVG مرسومة هنا، بلا صور خارجية.
let UID = 0;

/* ---------- أدوات رسم بسيطة بإيحاء ثلاثي الأبعاد ---------- */
function Pen() {
  const id = 'a' + (++UID) + '_'; const defs = []; const seen = {};
  const sh = (c, k) => { // تفتيح/تغميق لون hex
    const n = parseInt(c.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = (v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
    return '#' + ((1 << 24) + (f(r) << 16) + (f(g) << 8) + f(b)).toString(16).slice(1);
  };
  const P = {
    sh,
    ball(c) { // تدرّج كروي
      const k = 'b' + c.slice(1); if (!seen[k]) { seen[k] = 1; defs.push('<radialGradient id="' + id + k + '" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="' + sh(c, .75) + '"/><stop offset=".45" stop-color="' + c + '"/><stop offset="1" stop-color="' + sh(c, -.55) + '"/></radialGradient>'); }
      return 'url(#' + id + k + ')';
    },
    lin(c, dir) { // تدرّج خطي لوجه مكعب
      const k = 'l' + c.slice(1) + (dir || 'v'); if (!seen[k]) { seen[k] = 1; defs.push('<linearGradient id="' + id + k + '" x1="0" y1="0" x2="' + (dir === 'h' ? 1 : 0) + '" y2="' + (dir === 'h' ? 0 : 1) + '"><stop offset="0" stop-color="' + sh(c, .35) + '"/><stop offset="1" stop-color="' + sh(c, -.25) + '"/></linearGradient>'); }
      return 'url(#' + id + k + ')';
    },
    glow(c) {
      const k = 'g' + c.slice(1); if (!seen[k]) { seen[k] = 1; defs.push('<radialGradient id="' + id + k + '"><stop offset="0" stop-color="' + c + '" stop-opacity=".55"/><stop offset="1" stop-color="' + c + '" stop-opacity="0"/></radialGradient>'); }
      return 'url(#' + id + k + ')';
    },
    s(cx, cy, r, c) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + P.ball(c) + '"/>'; },
    shadow(cx, cy, rx) { return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + (rx * .22).toFixed(1) + '" fill="#000" opacity=".18"/>'; },
    bond(x1, y1, x2, y2, w) { return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#9aa6b8" stroke-width="' + (w || 6) + '" stroke-linecap="round"/><line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#e8edf4" stroke-width="' + ((w || 6) / 3) + '" stroke-linecap="round" opacity=".8"/>'; },
    cube(x, y, w, h, d, c) { // متوازي مستطيلات متساوي القياس
      const top = 'M' + x + ' ' + y + 'l' + w / 2 + ' ' + (-d) + 'l' + w / 2 + ' ' + d + 'l' + (-w / 2) + ' ' + d + 'z';
      const L = 'M' + x + ' ' + y + 'l' + w / 2 + ' ' + d + 'v' + h + 'l' + (-w / 2) + ' ' + (-d) + 'z';
      const R = 'M' + (x + w) + ' ' + y + 'l' + (-w / 2) + ' ' + d + 'v' + h + 'l' + w / 2 + ' ' + (-d) + 'z';
      return '<path d="' + L + '" fill="' + sh(c, -.15) + '"/><path d="' + R + '" fill="' + sh(c, -.4) + '"/><path d="' + top + '" fill="' + sh(c, .25) + '"/>';
    },
    svg(vb, body, cls) { return '<svg class="' + (cls || 'art') + '" viewBox="' + vb + '" aria-hidden="true" focusable="false"><defs>' + defs.join('') + '</defs>' + body + '</svg>'; },
  };
  return P;
}

/* ---------- المواد ---------- */
export const THEMES = {
  gen: { a: '#1f8fe0', b: '#0b3d74', c: '#0a1f3d', name: 'الكيمياء العامة' },
  org: { a: '#8b5cf6', b: '#3b1f7a', c: '#1a0f3a', name: 'الكيمياء العضوية' },
  bio: { a: '#22a35a', b: '#0f5a36', c: '#082a1c', name: 'البيولوجيا الخلوية' },
  stat: { a: '#f08a1c', b: '#8a3f05', c: '#2c1606', name: 'الإحصاء الحيوي' },
  ana: { a: '#e0464e', b: '#7a1420', c: '#2e080d', name: 'التشريح' },
  hist: { a: '#c8903a', b: '#6b4414', c: '#2a1a07', name: 'تاريخ الصيدلة' },
};
export const theme = (k) => THEMES[k] || THEMES.gen;

// شعار صغير لكل مادة (يُرسم بلون currentColor)
const ICONS = {
  gen: '<ellipse cx="16" cy="16" rx="13" ry="5" fill="none" stroke="currentColor" stroke-width="1.8"/><ellipse cx="16" cy="16" rx="13" ry="5" fill="none" stroke="currentColor" stroke-width="1.8" transform="rotate(60 16 16)"/><ellipse cx="16" cy="16" rx="13" ry="5" fill="none" stroke="currentColor" stroke-width="1.8" transform="rotate(-60 16 16)"/><circle cx="16" cy="16" r="3" fill="currentColor"/>',
  org: '<path d="M16 4l10.4 6v12L16 28 5.6 22V10z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="16" r="5.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M26.4 10l3.6-2M16 4V1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  bio: '<path d="M16 3c7 0 13 5.5 13 13s-6 13-13 13S3 23 3 16 9 3 16 3z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="14" cy="14" r="5" fill="currentColor" opacity=".85"/><circle cx="22" cy="21" r="1.6" fill="currentColor"/><circle cx="9" cy="22" r="1.3" fill="currentColor"/><path d="M20 9c2 0 4 1 4 3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  stat: '<path d="M4 28h24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="6" y="18" width="4" height="10" rx="1" fill="currentColor" opacity=".6"/><rect x="12" y="11" width="4" height="17" rx="1" fill="currentColor" opacity=".8"/><rect x="18" y="14" width="4" height="14" rx="1" fill="currentColor" opacity=".7"/><rect x="24" y="21" width="4" height="7" rx="1" fill="currentColor" opacity=".55"/><path d="M4 22C9 22 10 6 16 6s7 16 12 16" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  hist: '<path d="M9 5h14v3H9zM11 8v13M21 8v13M7 21h18v3H7zM5 24h22v3H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M16 10v8M13 14h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  ana: '<circle cx="16" cy="6" r="3.4" fill="currentColor"/><path d="M16 10v10M9 14l7-2 7 2M16 20l-5 9M16 20l5 9" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".55"/>',
};
export function subjIcon(k, cls) { return '<svg class="' + (cls || 'sico') + '" viewBox="0 0 32 32" aria-hidden="true">' + (ICONS[k] || ICONS.gen) + '</svg>'; }

// زخرفة خلفية لكل مادة (نمط متكرر شفاف)
const MOTIF = {
  gen: '<g fill="none" stroke="#fff" stroke-width="1.2"><ellipse cx="40" cy="40" rx="22" ry="8"/><ellipse cx="40" cy="40" rx="22" ry="8" transform="rotate(60 40 40)"/><ellipse cx="40" cy="40" rx="22" ry="8" transform="rotate(-60 40 40)"/></g><circle cx="40" cy="40" r="3" fill="#fff"/><text x="92" y="104" font-family="Arial" font-size="15" fill="#fff">e⁻</text><circle cx="110" cy="40" r="2" fill="#fff"/><circle cx="20" cy="110" r="2" fill="#fff"/>',
  org: '<g fill="none" stroke="#fff" stroke-width="1.3"><path d="M30 20l17 10v20l-17 10-17-10V30z"/><path d="M47 30l17-10 17 10v20l-17 10M81 50l17 10"/><path d="M100 95l12 7v14l-12 7-12-7v-14z"/></g><text x="98" y="40" font-family="Arial" font-size="13" fill="#fff">OH</text>',
  bio: '<g fill="none" stroke="#fff" stroke-width="1.2"><path d="M40 14c15 0 26 11 26 26S55 66 40 66 14 55 14 40s11-26 26-26z"/><circle cx="36" cy="36" r="8"/><path d="M96 80c0 10 14 10 14 20s-14 10-14 20M110 80c0 10-14 10-14 20s14 10 14 20"/><path d="M98 88h10M98 112h10"/></g><circle cx="52" cy="50" r="2" fill="#fff"/>',
  stat: '<g fill="none" stroke="#fff" stroke-width="1.2"><path d="M10 60c12 0 14-40 25-40s13 40 25 40"/><path d="M10 60h50"/><path d="M80 120v-20h8v20M92 120v-34h8v34M104 120v-26h8v26"/></g><text x="80" y="40" font-family="Arial" font-size="15" fill="#fff">x̄ σ</text>',
  hist: '<g fill="none" stroke="#fff" stroke-width="1.3"><path d="M20 40h40M24 40v-14M56 40v-14M24 26h32l-16-10z"/><path d="M20 40v6h40v-6"/><path d="M92 100c0-14 22-14 22 0 0 12-22 12-22 0zM103 86v-8M97 78h12"/></g>',
  ana: '<g fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round"><path d="M22 30c-6-6 2-14 8-8l30 30c6-6 14 2 8 8s-2 6-8 8-14-2-8-8L22 30c-6 6-14-2-8-8s2-6 8-8z" transform="translate(-4 -4) scale(.85)"/><path d="M100 70c-9 0-14 9-9 17 4 6 9 8 9 8s5-2 9-8c5-8 0-17-9-17z"/><path d="M100 72v10"/></g>',
};
export function subjMotif(k) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 140 140" opacity=".09">' + (MOTIF[k] || MOTIF.gen) + '</svg>';
  return 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")';
}

/* ---------- رسمة مجسّمة لكل درس ---------- */
const ART = {
  1(P) { // بنية المادة: نواة بروتونات/نيوترونات + مدار
    let n = '';
    [[0, 0, '#e5484d'], [12, -4, '#4b7bec'], [-11, -6, '#4b7bec'], [5, 11, '#e5484d'], [-8, 9, '#4b7bec'], [14, 8, '#e5484d'], [-2, -13, '#e5484d']].forEach(([x, y, c]) => { n += P.s(100 + x, 100 + y, 11, c); });
    return P.shadow(100, 178, 60) + '<ellipse cx="100" cy="100" rx="82" ry="30" fill="none" stroke="#7fd3ff" stroke-width="3" opacity=".8" transform="rotate(-20 100 100)"/>' +
      '<ellipse cx="100" cy="100" rx="82" ry="30" fill="none" stroke="#7fd3ff" stroke-width="3" opacity=".55" transform="rotate(40 100 100)"/>' + n + P.s(170, 74, 8, '#2fd3ff') + P.s(52, 150, 8, '#2fd3ff');
  },
  2(P) { // ميكانيك الكم: مستويات طاقة + فوتون
    let s = P.shadow(100, 182, 64);
    [70, 54, 38].forEach((r, i) => { s += '<circle cx="92" cy="104" r="' + r + '" fill="none" stroke="#9fd8ff" stroke-width="2.5" stroke-dasharray="' + (i ? '6 6' : '0') + '" opacity="' + (.9 - i * .2) + '"/>'; });
    s += P.s(92, 104, 16, '#e5484d') + P.s(146, 62, 8, '#2fd3ff') + P.s(130, 118, 8, '#2fd3ff');
    s += '<path d="M150 58c8-10 14 4 22-6s14 4 22-6" fill="none" stroke="#ffd166" stroke-width="3.5" stroke-linecap="round"/><path d="M190 40l6 6-9 2z" fill="#ffd166"/><text x="160" y="80" font-family="Arial" font-size="15" font-style="italic" fill="#ffd166">hν</text>';
    return s;
  },
  3(P) { // الميكانيك الموجي: مدارات s و p
    const lobe = (rot, c) => '<g transform="rotate(' + rot + ' 100 100)"><ellipse cx="100" cy="62" rx="20" ry="36" fill="' + P.ball(c) + '" opacity=".92"/><ellipse cx="100" cy="138" rx="20" ry="36" fill="' + P.ball(P.sh(c, -.1)) + '" opacity=".92"/></g>';
    return P.shadow(100, 184, 66) + lobe(90, '#4b7bec') + lobe(0, '#e5484d') + lobe(45, '#22b07d') + P.s(100, 100, 13, '#ffd166');
  },
  4(P) { // الجدول الدوري: كتل متساوية القياس
    const C = ['#4b7bec', '#22b07d', '#ffd166', '#e5484d', '#8b5cf6', '#2fd3ff'];
    let s = P.shadow(100, 176, 76); const L = ['H', 'He', 'Li', 'C', 'N', 'O', 'Na', 'Cl', 'Fe'];
    for (let r = 2; r >= 0; r--) for (let c = 0; c < 3; c++) {
      const x = 44 + c * 36 - r * 18, y = 70 + r * 22 + c * 0 + c * 10, hgt = 18 + ((r * 3 + c) % 3) * 8;
      s += P.cube(x + 20, y + 50 - hgt, 36, hgt, 10, C[(r + c) % 6]);
      s += '<text x="' + (x + 38) + '" y="' + (y + 54 - hgt) + '" font-family="Arial" font-size="9" font-weight="700" text-anchor="middle" fill="#fff">' + L[r * 3 + c] + '</text>';
    }
    return s;
  },
  5(P) { // الروابط الكيميائية: جزيء ماء
    return P.shadow(100, 176, 58) + P.bond(100, 92, 52, 128, 10) + P.bond(100, 92, 148, 128, 10) + P.s(100, 92, 34, '#e5484d') + P.s(52, 130, 22, '#e9edf3') + P.s(148, 130, 22, '#e9edf3') +
      '<text x="100" y="99" font-family="Arial" font-size="18" font-weight="700" text-anchor="middle" fill="#fff">O</text><text x="52" y="136" font-family="Arial" font-size="14" font-weight="700" text-anchor="middle" fill="#55617a">H</text><text x="148" y="136" font-family="Arial" font-size="14" font-weight="700" text-anchor="middle" fill="#55617a">H</text>';
  },
  11(P) { // الذرة والروابط: الميثان رباعي الأوجه
    return P.shadow(100, 182, 60) + P.bond(100, 100, 100, 34, 9) + P.bond(100, 100, 44, 138, 9) + P.bond(100, 100, 158, 140, 9) + P.bond(100, 100, 124, 112, 7) +
      P.s(124, 114, 14, '#d9dee7') + P.s(100, 100, 28, '#3a3f4a') + P.s(100, 32, 18, '#eef1f6') + P.s(44, 140, 18, '#eef1f6') + P.s(158, 142, 18, '#eef1f6') +
      '<text x="100" y="106" font-family="Arial" font-size="17" font-weight="700" text-anchor="middle" fill="#fff">C</text>';
  },
  12(P) { // التسمية والوظائف: سلسلة متعرجة + OH
    const pts = [[28, 120], [62, 96], [96, 120], [130, 96]];
    let s = P.shadow(100, 176, 76);
    for (let i = 0; i < pts.length - 1; i++) s += P.bond(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 8);
    s += P.bond(130, 96, 166, 116, 8);
    pts.forEach(([x, y]) => { s += P.s(x, y, 15, '#3a3f4a'); });
    s += P.s(166, 118, 18, '#e5484d') + P.s(184, 98, 9, '#eef1f6') + '<text x="166" y="124" font-family="Arial" font-size="13" font-weight="700" text-anchor="middle" fill="#fff">O</text>';
    return s + '<text x="40" y="60" font-family="Arial" font-size="14" font-weight="700" fill="#c9b8ff">-ol · -al · -one</text>';
  },
  13(P) { // التأثيرات الإلكترونية: نواة بنزين + δ
    const hx = (r) => { let d = ''; for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i - Math.PI / 2; d += (i ? 'L' : 'M') + (100 + r * Math.cos(a)).toFixed(1) + ' ' + (100 + r * Math.sin(a) * .62).toFixed(1); } return d + 'z'; };
    return P.shadow(100, 170, 70) + '<path d="' + hx(62) + '" fill="' + P.lin('#8b5cf6') + '" opacity=".35"/><path d="' + hx(62) + '" fill="none" stroke="#c9b8ff" stroke-width="5" stroke-linejoin="round"/>' +
      '<ellipse cx="100" cy="100" rx="36" ry="22" fill="none" stroke="#fff" stroke-width="3" opacity=".8"/>' +
      '<path d="M40 50c20-22 46-22 60-8" fill="none" stroke="#ffd166" stroke-width="3"/><path d="M98 36l6 8-10 1z" fill="#ffd166"/>' +
      '<text x="26" y="46" font-family="Arial" font-size="18" font-style="italic" fill="#ffd166">δ⁺</text><text x="156" y="166" font-family="Arial" font-size="18" font-style="italic" fill="#7fd3ff">δ⁻</text>';
  },
  14(P) { // الكيمياء الفراغية: جزيئان متناظران حول مرآة
    const mol = (cx, f) => P.bond(cx, 100, cx, 52, 7) + P.bond(cx, 100, cx - 34 * f, 130, 7) + P.bond(cx, 100, cx + 30 * f, 128, 7) +
      P.s(cx, 100, 18, '#3a3f4a') + P.s(cx, 50, 12, '#e5484d') + P.s(cx - 34 * f, 132, 12, '#22b07d') + P.s(cx + 30 * f, 130, 12, '#ffd166') + P.s(cx + 16 * f, 116, 9, '#eef1f6');
    return P.shadow(100, 176, 82) + mol(52, 1) + '<rect x="97" y="30" width="6" height="140" rx="3" fill="' + P.lin('#c9d6e8', 'h') + '" opacity=".85"/>' + mol(148, -1);
  },
  15(P) { // آليات التفاعل: دورق + أسهم منحنية
    return P.shadow(100, 182, 52) + '<path d="M84 40h32v36l34 70c4 10-2 20-14 20H64c-12 0-18-10-14-20l34-70z" fill="' + P.lin('#d7e6f7') + '" opacity=".35" stroke="#e3ecf7" stroke-width="3"/>' +
      '<path d="M58 132c14-8 26 4 42-2s26-10 42 0l8 16c4 10-2 20-14 20H64c-12 0-18-10-14-20z" fill="' + P.lin('#8b5cf6') + '"/>' + P.s(84, 148, 6, '#fff') + P.s(112, 140, 4, '#fff') + P.s(100, 118, 5, '#c9b8ff') +
      '<path d="M128 40c30 0 44 20 36 42" fill="none" stroke="#ffd166" stroke-width="3.5"/><path d="M158 80l8 6 2-12z" fill="#ffd166"/><path d="M70 40C40 38 28 60 36 80" fill="none" stroke="#7fd3ff" stroke-width="3.5"/><path d="M30 76l6 8 6-10z" fill="#7fd3ff"/>';
  },
  21(P) { // مدخل إلى البيولوجيا الخلوية: مجهر
    return P.shadow(100, 182, 64) + '<rect x="58" y="164" width="88" height="14" rx="5" fill="' + P.lin('#2f4a3a') + '"/>' +
      '<path d="M120 164c18-20 18-64-6-86" fill="none" stroke="#3d5c49" stroke-width="12" stroke-linecap="round"/>' +
      '<rect x="56" y="122" width="70" height="8" rx="3" fill="#9cc7ae"/>' +
      '<g transform="rotate(-28 92 70)"><rect x="80" y="26" width="22" height="80" rx="6" fill="' + P.lin('#e9f1ec', 'h') + '"/><rect x="76" y="20" width="30" height="12" rx="4" fill="#cfe0d6"/><rect x="84" y="104" width="14" height="16" rx="3" fill="#8fb3a0"/></g>' +
      P.s(80, 118, 6, '#22a35a') + '<circle cx="160" cy="50" r="26" fill="' + P.glow('#22a35a') + '"/>' + P.s(160, 50, 14, '#22a35a') + P.s(156, 46, 5, '#0f5a36');
  },
  22(P) { // البكتيريا: عصية بسياط
    return P.shadow(100, 176, 70) + '<path d="M150 90c18-6 26 10 40 4M150 108c18 6 22 22 40 18M48 100c-16-10-24 6-40-2" fill="none" stroke="#a7e3bf" stroke-width="3" stroke-linecap="round"/>' +
      '<rect x="40" y="70" width="120" height="58" rx="29" fill="' + P.ball('#22a35a') + '"/><rect x="48" y="78" width="104" height="42" rx="21" fill="none" stroke="#c8f0d6" stroke-width="2" opacity=".7"/>' +
      '<path d="M66 100c10-14 22 14 34 0s22 14 34 0" fill="none" stroke="#0b3d24" stroke-width="3" opacity=".7"/>' + P.s(70, 88, 4, '#c8f0d6') + P.s(132, 112, 4, '#c8f0d6') + P.s(116, 86, 3, '#c8f0d6');
  },
  23(P) { // الفيروسات: قفيصة بنتوءات
    let s = P.shadow(100, 182, 56);
    for (let i = 0; i < 12; i++) { const a = Math.PI * 2 * i / 12, x = 100 + Math.cos(a) * 62, y = 100 + Math.sin(a) * 62, x0 = 100 + Math.cos(a) * 44, y0 = 100 + Math.sin(a) * 44; s += '<line x1="' + x0 + '" y1="' + y0 + '" x2="' + x + '" y2="' + y + '" stroke="#f4a6ac" stroke-width="4"/>' + P.s(x, y, 8, '#e5484d'); }
    s += '<circle cx="100" cy="100" r="48" fill="' + P.ball('#22a35a') + '"/>';
    s += '<path d="M100 56l38 22v44l-38 22-38-22V78z" fill="none" stroke="#c8f0d6" stroke-width="2" opacity=".7"/><path d="M100 56v88M62 78l76 44M138 78l-76 44" stroke="#c8f0d6" stroke-width="1.4" opacity=".45"/>';
    return s;
  },
  31(P) { // مدخل إلى البيوستات: أعمدة متساوية القياس
    let s = P.shadow(100, 178, 80); const H = [40, 70, 56, 92];
    H.forEach((h, i) => { s += P.cube(30 + i * 36, 160 - h - i * 0, 32, h, 9, ['#f08a1c', '#ffb347', '#e0663a', '#ffd166'][i]); });
    return s + '<path d="M30 60l36-18 36 10 36-30" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>' + P.s(138, 22, 6, '#fff');
  },
  32(P) { // المفاهيم والمتغيرات: دائرة نسبية مجسّمة
    const sl = (a0, a1, c, dz) => {
      const p = (a) => [100 + 70 * Math.cos(a), 96 + 40 * Math.sin(a)];
      const [x0, y0] = p(a0), [x1, y1] = p(a1), lg = a1 - a0 > Math.PI ? 1 : 0;
      let side = '';
      if (Math.sin((a0 + a1) / 2) > -0.2) side = '<path d="M' + x0 + ' ' + y0 + 'A70 40 0 ' + lg + ' 1 ' + x1 + ' ' + y1 + 'v18A70 40 0 ' + lg + ' 0 ' + x0 + ' ' + (y0 + 18) + 'z" fill="' + P.sh(c, -.35) + '"/>';
      return '<g transform="translate(0 ' + (dz || 0) + ')">' + side + '<path d="M100 96L' + x0 + ' ' + y0 + 'A70 40 0 ' + lg + ' 1 ' + x1 + ' ' + y1 + 'z" fill="' + P.sh(c, .1) + '"/></g>';
    };
    return P.shadow(100, 156, 80) + sl(0, 2.2, '#f08a1c') + sl(2.2, 4.0, '#ffd166') + sl(4.0, 5.2, '#e0663a', -10) + sl(5.2, Math.PI * 2, '#ffb347');
  },
  33(P) { // عرض البيانات: مدرج تكراري + مضلع
    let s = P.shadow(100, 178, 82); const H = [26, 52, 84, 66, 38, 18]; const pts = [];
    H.forEach((h, i) => { s += P.cube(22 + i * 26, 162 - h, 26, h, 6, i % 2 ? '#ffb347' : '#f08a1c'); pts.push((35 + i * 26) + ' ' + (156 - h)); });
    return s + '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>' + pts.map((p) => { const [x, y] = p.split(' '); return P.s(+x, +y, 5, '#ffffff'); }).join('');
  },
  34(P) { // المعالم الوصفية: منحنى جرسي + المتوسط
    return P.shadow(100, 176, 80) + '<path d="M18 160C60 160 66 40 100 40s40 120 82 120z" fill="' + P.lin('#f08a1c') + '" opacity=".9"/>' +
      '<path d="M18 160C60 160 66 40 100 40s40 120 82 120" fill="none" stroke="#ffd9a8" stroke-width="3"/>' +
      '<path d="M100 34v128" stroke="#fff" stroke-width="3" stroke-dasharray="6 5"/><path d="M70 120h60" stroke="#fff" stroke-width="2.5"/><path d="M70 114v12M130 114v12" stroke="#fff" stroke-width="2.5"/>' +
      '<text x="106" y="30" font-family="Arial" font-size="16" font-weight="700" fill="#fff">x̄</text><text x="92" y="140" font-family="Arial" font-size="14" fill="#fff">±σ</text>';
  },
  41(P) { // مدخل إلى التشريح: جسم في الوضع التشريحي + المستويات
    return P.shadow(100, 186, 50) +
      '<path d="M40 70l120-20v96L40 166z" fill="#7fd3ff" opacity=".18" stroke="#7fd3ff" stroke-width="1.5"/>' +
      '<circle cx="100" cy="36" r="16" fill="' + P.ball('#f2b8a0') + '"/>' +
      '<path d="M78 56h44l6 54-10 2-4-36-2 40v66h-14l-2-56-2 56H80v-66l-2-40-4 36-10-2z" fill="' + P.lin('#e0464e', 'h') + '"/>' +
      '<path d="M100 18v170" stroke="#fff" stroke-width="2" stroke-dasharray="5 5" opacity=".8"/><path d="M50 108h100" stroke="#ffd166" stroke-width="2" stroke-dasharray="5 5"/>' +
      '<text x="152" y="104" font-family="Arial" font-size="11" fill="#ffd166">axial</text><text x="104" y="14" font-family="Arial" font-size="11" fill="#fff">sagittal</text>';
  },
};
// رسمة عامة لدرس جديد لا يملك رسمة خاصة: شعار مادته داخل كرة
function generic(P, k) { const t = theme(k); return P.shadow(100, 178, 56) + '<circle cx="100" cy="98" r="62" fill="' + P.ball(t.a) + '"/><g transform="translate(60 58) scale(2.5)" style="color:#fff" opacity=".9">' + (ICONS[k] || ICONS.gen) + '</g>'; }

export function chArt(ch, cls) {
  const P = Pen(); const f = ART[ch.id];
  return P.svg('0 0 200 200', f ? f(P) : generic(P, ch.sub), cls);
}
