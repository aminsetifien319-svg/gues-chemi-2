// طبقة الاتصال بـ Firebase: الدخول بحساب Google وقراءة/كتابة Firestore.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, CACHE_SIZE_UNLIMITED,
  doc, getDoc, getDocFromCache, getDocFromServer, onSnapshot, getDocs, setDoc, deleteDoc, collection, serverTimestamp, writeBatch, query, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import * as CFG from './firebase-config.js?v=79';
const firebaseConfig = CFG.firebaseConfig;

export const configMissing = !firebaseConfig.apiKey || String(firebaseConfig.apiKey).indexOf('PASTE') === 0;

let auth = null, db = null;
if (!configMissing) {
  const app = initializeApp(firebaseConfig);
  if (CFG.appCheckSiteKey) {
    // يُحمَّل فقط عند تفعيله، حتى لا يتعطل الموقع إن لم يُضبط
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js').then((m) => {
      try { m.initializeAppCheck(app, { provider: CFG.appCheckEnterprise ? new m.ReCaptchaEnterpriseProvider(CFG.appCheckSiteKey) : new m.ReCaptchaV3Provider(CFG.appCheckSiteKey), isTokenAutoRefreshEnabled: true }); } catch (e) {}
    }).catch(() => {});
  }
  auth = getAuth(app);
  // نخزّن الصور في ذاكرة المتصفح بعد أول تحميل حتى لا تُحمَّل كل مرة (أسرع وأوفر).
  try {
    // اكتشاف تلقائي للاتصال البديل (long polling) للمتصفحات والشبكات التي تحجب الاتصال المستمر (مثل متصفحات الفلترة).
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager(), cacheSizeBytes: CACHE_SIZE_UNLIMITED }), experimentalAutoDetectLongPolling: true });
  } catch (e) {
    db = initializeFirestore(app, { localCache: memoryLocalCache(), experimentalAutoDetectLongPolling: true });
  }
}

// دون إنترنت: نقرأ من ذاكرة الجهاز مباشرة بدل انتظار الخادم
const fromServer = (ref) => (typeof navigator !== 'undefined' && navigator.onLine === false) ? getDocFromCache(ref) : getDocFromServer(ref);
const lower = (s) => String(s || '').trim().toLowerCase();

/* ---------- السنة الدراسية: الأولى أو الثانية (كل سنة لها محتواها وطلبتها في مجموعات منفصلة) ---------- */
const _yq = (() => { try { return new URLSearchParams(location.search).get('y'); } catch (e) { return null; } })();
export const YEAR_EXPLICIT = _yq === '1' || _yq === '2';
export const YEAR = (() => {
  let y = 1;
  try { if (YEAR_EXPLICIT) { y = +_yq; localStorage.setItem('gueschemi.year', String(y)); } else y = localStorage.getItem('gueschemi.year') === '2' ? 2 : 1; } catch (e) { y = _yq === '2' ? 2 : 1; }
  return y;
})();
export const YEAR_AR = YEAR === 2 ? 'السنة الثانية' : 'السنة الأولى';
export const YEAR_EN = YEAR === 2 ? '2nd-year' : '1st-year';
// اسم المجموعة حسب السنة: السنة الأولى بدون لاحقة (كما كانت)، والثانية بلاحقة 2
const C = (name, y) => ((y || YEAR) === 2 ? name + '2' : name);
export function yearUrl(y) { return location.pathname + '?y=' + y + (location.hash || ''); }
export function switchYear(y) { try { localStorage.setItem('gueschemi.year', String(y)); } catch (e) {} location.href = yearUrl(y); }
// هل الحساب مقبول في سنة معيّنة؟ (يُستعمل لتوجيه الطالب تلقائياً لسنته)
export async function hasYear(email, y) {
  try { const s = await fromServer(doc(db, C('allowed', y), email)); return s.exists(); } catch (e) { return false; }
}

/* ---------- الدخول ---------- */
export function watchUser(cb) {
  if (configMissing) { cb(null); return; }
  onAuthStateChanged(auth, (u) => {
    cb(u && u.email ? { email: lower(u.email), name: u.displayName || '', photo: u.photoURL || '' } : null);
  });
}

export async function signIn() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    if (err && (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment')) {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw err;
  }
}

// كم ساعة مرّت منذ آخر تسجيل دخول فعلي (وليس منذ فتح الصفحة)
export async function authAgeHours() {
  const u = auth && auth.currentUser; if (!u) return 1e9;
  const r = await u.getIdTokenResult();
  return (Date.now() / 1000 - Number(r.claims.auth_time || 0)) / 3600;
}
export function signOutUser() { return signOut(auth); }

/* ---------- صلاحية الطالب ---------- */
export async function getAccess(email) {
  const adm = await fromServer(doc(db, 'admins', email)).catch(() => getDoc(doc(db, 'admins', email)));
  if (adm.exists()) return 'admin';
  const al = await fromServer(doc(db, C('allowed'), email)).catch(() => getDoc(doc(db, C('allowed'), email)));
  if (al.exists()) return 'allowed';
  const rq = await getDoc(doc(db, C('requests'), email));
  return rq.exists() ? 'pending' : 'none';
}

export async function sendRequest(user) {
  await setDoc(doc(db, C('requests'), user.email), {
    email: user.email,
    name: String(user.name || '').slice(0, 100),
    createdAt: serverTimestamp()
  });
}

/* ---------- المحتوى ---------- */
// الفهرس صغير ويُقرأ من الخادم دائماً حتى يظهر أي تحديث فوراً.
export async function loadManifest(id) {
  const ref = doc(db, C('content'), id || 'manifest');
  // من الخادم دائماً (مع محاولة ثانية)، ولا نرجع للنسخة المحفوظة إلا دون إنترنت.
  const s = await fromServer(ref)
    .catch(() => new Promise((r) => setTimeout(r, 1500)).then(() => fromServer(ref)))
    .catch(() => getDoc(ref));
  if (!s.exists()) return null;
  return JSON.parse(s.data().json);
}

// مراقبة الفهرس مباشرة: أي تعديل من المشرف يصل للطلبة دون إعادة فتح الموقع.
export function watchManifest(cb, id) {
  try {
    return onSnapshot(doc(db, C('content'), id || 'manifest'), (s) => { if (s.exists() && !s.metadata.fromCache) { try { cb(JSON.parse(s.data().json)); } catch (e) {} } }, () => {});
  } catch (e) { return () => {}; }
}

// تحميل وثيقة إلى ذاكرة الجهاز للاستعمال دون إنترنت (بلا حفظ في الذاكرة المؤقتة للصفحة)
export async function cacheDoc(id) {
  const ref = doc(db, C('content'), 'img_' + id);
  let s = null, hit = true;
  try { s = await getDocFromCache(ref); } catch (e) { hit = false; s = await fromServer(ref); }
  if (!s.exists()) return { d: '', hit: hit };
  return { d: s.data().d || '', hit: hit };
}

// الصور ثابتة (رقم النسخة داخل المعرّف)، فنقرؤها من ذاكرة المتصفح أولاً.
const memo = new Map();
export function getImage(id) {
  if (memo.has(id)) return memo.get(id);
  const ref = doc(db, C('content'), 'img_' + id);
  const p = getDocFromCache(ref).catch(() => getDoc(ref)).then((s) => {
    if (!s.exists()) throw new Error('missing image ' + id);
    return s.data().d;
  });
  p.catch(() => memo.delete(id));
  memo.set(id, p);
  return p;
}

/* ---------- تقدّم الطالب (يتبعه على كل أجهزته) ---------- */
export async function loadProgress(email) {
  const s = await fromServer(doc(db, C('progress'), email));
  return s.exists() ? s.data().json : null;
}

export async function saveProgress(email, json) {
  await setDoc(doc(db, C('progress'), email), { json: json, updatedAt: serverTimestamp() });
}

/* ---------- ملاحظات الطالب على الدرس PDF (خاصة به، لكل فصل وثيقة) ---------- */
export async function loadNotes(email, cid) {
  const ref = doc(db, C('notes'), lower(email), 'ch', String(cid));
  const s = await fromServer(ref).catch(() => getDoc(ref));
  return s.exists() ? s.data().json : null;
}
export async function saveNotes(email, cid, json) {
  await setDoc(doc(db, C('notes'), lower(email), 'ch', String(cid)), { json: json, updatedAt: serverTimestamp() });
}

// صور وتسجيلات الطالب داخل ملاحظاته (كل ملف وثيقة مستقلة، خاصة به)
export async function loadMedia(email, id) {
  const ref = doc(db, C('notesm'), lower(email), 'm', id);
  const s = await getDocFromCache(ref).catch(() => getDoc(ref));
  if (!s.exists()) throw new Error('missing media');
  return s.data().d;
}
export async function saveMedia(email, id, d) {
  await setDoc(doc(db, C('notesm'), lower(email), 'm', id), { d: d, updatedAt: serverTimestamp() });
}

/* ---------- محادثات Gemini لكل طالب (سجلّه الخاص) ---------- */
export async function listChats(email) {
  const s = await getDocs(query(collection(db, 'aichat', lower(email), 'c'), orderBy('updatedAt', 'desc'), limit(40)));
  return s.docs.map((d) => d.data().json).filter(Boolean);
}
export async function saveChat(email, id, json) {
  await setDoc(doc(db, 'aichat', lower(email), 'c', id), { json: json, updatedAt: serverTimestamp() });
}
export async function delChat(email, id) { await deleteDoc(doc(db, 'aichat', lower(email), 'c', id)); }

/* ---------- الأجهزة (جهازان كحد أقصى لكل حساب) ---------- */
export async function getDevices(email) {
  const s = await fromServer(doc(db, 'devices', email));
  return s.exists() ? s.data() : null;
}

export async function addDevice(email, ids, info, prev, swap) {
  const o = { ids: ids, info: info, updatedAt: serverTimestamp() };
  if (swap) o.swapAt = serverTimestamp();
  else if (prev && prev.swapAt) o.swapAt = prev.swapAt;   // نحتفظ بتاريخ آخر استبدال كما هو
  await setDoc(doc(db, 'devices', email), o);
}

export async function listDevices() {
  const s = await getDocs(collection(db, 'devices'));
  return s.docs.map((d) => ({ email: d.id, ids: d.data().ids || [], info: d.data().info || {}, swapAt: d.data().swapAt || null }));
}

export async function resetDevices(email) { await deleteDoc(doc(db, 'devices', lower(email))); }

/* ---------- الإدارة ---------- */
export async function listProgress() {
  const s = await getDocs(collection(db, C('progress')));
  return s.docs.map((d) => {
    const x = d.data();
    return { email: d.id, json: x.json || '', at: x.updatedAt && x.updatedAt.toDate ? x.updatedAt.toDate() : null };
  });
}

export async function isAdminUser(email) {
  const s = await getDoc(doc(db, 'admins', email));
  return s.exists();
}

export async function listRequests() {
  const s = await getDocs(collection(db, C('requests')));
  return s.docs.map((d) => ({ email: d.id, name: d.data().name || '' }));
}

export async function listAllowed() {
  const s = await getDocs(collection(db, C('allowed')));
  return s.docs.map((d) => ({ email: d.id, name: d.data().name || '' }));
}

export async function approve(email, name) {
  const b = writeBatch(db);
  b.set(doc(db, C('allowed'), lower(email)), { email: lower(email), name: name || '', approvedAt: serverTimestamp() });
  b.delete(doc(db, C('requests'), lower(email)));
  await b.commit();
}

export async function reject(email) { await deleteDoc(doc(db, C('requests'), lower(email))); }

export async function removeAllowed(email) { await deleteDoc(doc(db, C('allowed'), lower(email))); }

export async function addAllowed(email) {
  await setDoc(doc(db, C('allowed'), lower(email)), { email: lower(email), name: '', approvedAt: serverTimestamp() });
}

export async function uploadImage(id, data) {
  await setDoc(doc(db, C('content'), 'img_' + id), { d: data });
}

export async function uploadManifest(manifest, id) {
  const json = JSON.stringify(manifest);
  if (json.length > 900000) throw new Error('الفهرس كبير جداً.');
  await setDoc(doc(db, C('content'), id || 'manifest'), { json: json, updatedAt: serverTimestamp() });
}

/* ---------- المواد (الكيمياء العامة، العضوية، …) ---------- */
export const DEFAULT_SUBJECTS = [{ key: 'gen', doc: 'manifest', en: 'General Chemistry', ar: 'الكيمياء العامة' }];
export async function loadSubjects() {
  const ref = doc(db, C('content'), 'subjects');
  let s = null;
  try { s = await fromServer(ref); } catch (e) { try { s = await getDoc(ref); } catch (e2) { s = null; } }
  if (!s || !s.exists()) return YEAR === 2 ? [] : DEFAULT_SUBJECTS.slice();
  const DEF = YEAR === 2 ? [] : DEFAULT_SUBJECTS.slice();
  try { const L = JSON.parse(s.data().json); return Array.isArray(L) && L.length ? L : DEF; } catch (e) { return DEF; }
}
export async function saveSubjects(list) {
  await setDoc(doc(db, C('content'), 'subjects'), { json: JSON.stringify(list), updatedAt: serverTimestamp() });
}
