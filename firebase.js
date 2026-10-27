// طبقة الاتصال بـ Firebase: الدخول بحساب Google وقراءة/كتابة Firestore.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  doc, getDoc, getDocFromCache, getDocFromServer, onSnapshot, getDocs, setDoc, deleteDoc, collection, serverTimestamp, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

export const configMissing = !firebaseConfig.apiKey || String(firebaseConfig.apiKey).indexOf('PASTE') === 0;

let auth = null, db = null;
if (!configMissing) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  // نخزّن الصور في ذاكرة المتصفح بعد أول تحميل حتى لا تُحمَّل كل مرة (أسرع وأوفر).
  try {
    // اكتشاف تلقائي للاتصال البديل (long polling) للمتصفحات والشبكات التي تحجب الاتصال المستمر (مثل متصفحات الفلترة).
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }), experimentalAutoDetectLongPolling: true });
  } catch (e) {
    db = initializeFirestore(app, { localCache: memoryLocalCache(), experimentalAutoDetectLongPolling: true });
  }
}

const lower = (s) => String(s || '').trim().toLowerCase();

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

export function signOutUser() { return signOut(auth); }

/* ---------- صلاحية الطالب ---------- */
export async function getAccess(email) {
  const adm = await getDocFromServer(doc(db, 'admins', email)).catch(() => getDoc(doc(db, 'admins', email)));
  if (adm.exists()) return 'admin';
  const al = await getDocFromServer(doc(db, 'allowed', email)).catch(() => getDoc(doc(db, 'allowed', email)));
  if (al.exists()) return 'allowed';
  const rq = await getDoc(doc(db, 'requests', email));
  return rq.exists() ? 'pending' : 'none';
}

export async function sendRequest(user) {
  await setDoc(doc(db, 'requests', user.email), {
    email: user.email,
    name: user.name || '',
    createdAt: serverTimestamp()
  });
}

/* ---------- المحتوى ---------- */
// الفهرس صغير ويُقرأ من الخادم دائماً حتى يظهر أي تحديث فوراً.
export async function loadManifest() {
  const ref = doc(db, 'content', 'manifest');
  // من الخادم دائماً (مع محاولة ثانية)، ولا نرجع للنسخة المحفوظة إلا دون إنترنت.
  const s = await getDocFromServer(ref)
    .catch(() => new Promise((r) => setTimeout(r, 1500)).then(() => getDocFromServer(ref)))
    .catch(() => getDoc(ref));
  if (!s.exists()) return null;
  return JSON.parse(s.data().json);
}

// مراقبة الفهرس مباشرة: أي تعديل من المشرف يصل للطلبة دون إعادة فتح الموقع.
export function watchManifest(cb) {
  try {
    return onSnapshot(doc(db, 'content', 'manifest'), (s) => { if (s.exists() && !s.metadata.fromCache) { try { cb(JSON.parse(s.data().json)); } catch (e) {} } }, () => {});
  } catch (e) { return () => {}; }
}

// الصور ثابتة (رقم النسخة داخل المعرّف)، فنقرؤها من ذاكرة المتصفح أولاً.
const memo = new Map();
export function getImage(id) {
  if (memo.has(id)) return memo.get(id);
  const ref = doc(db, 'content', 'img_' + id);
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
  const s = await getDocFromServer(doc(db, 'progress', email));
  return s.exists() ? s.data().json : null;
}

export async function saveProgress(email, json) {
  await setDoc(doc(db, 'progress', email), { json: json, updatedAt: serverTimestamp() });
}

/* ---------- الأجهزة (جهازان كحد أقصى لكل حساب) ---------- */
export async function getDevices(email) {
  const s = await getDocFromServer(doc(db, 'devices', email));
  return s.exists() ? s.data() : null;
}

export async function addDevice(email, ids, info) {
  await setDoc(doc(db, 'devices', email), { ids: ids, info: info, updatedAt: serverTimestamp() });
}

export async function listDevices() {
  const s = await getDocs(collection(db, 'devices'));
  return s.docs.map((d) => ({ email: d.id, ids: d.data().ids || [], info: d.data().info || {} }));
}

export async function resetDevices(email) { await deleteDoc(doc(db, 'devices', lower(email))); }

/* ---------- الإدارة ---------- */
export async function listProgress() {
  const s = await getDocs(collection(db, 'progress'));
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
  const s = await getDocs(collection(db, 'requests'));
  return s.docs.map((d) => ({ email: d.id, name: d.data().name || '' }));
}

export async function listAllowed() {
  const s = await getDocs(collection(db, 'allowed'));
  return s.docs.map((d) => ({ email: d.id, name: d.data().name || '' }));
}

export async function approve(email, name) {
  const b = writeBatch(db);
  b.set(doc(db, 'allowed', lower(email)), { email: lower(email), name: name || '', approvedAt: serverTimestamp() });
  b.delete(doc(db, 'requests', lower(email)));
  await b.commit();
}

export async function reject(email) { await deleteDoc(doc(db, 'requests', lower(email))); }

export async function removeAllowed(email) { await deleteDoc(doc(db, 'allowed', lower(email))); }

export async function addAllowed(email) {
  await setDoc(doc(db, 'allowed', lower(email)), { email: lower(email), name: '', approvedAt: serverTimestamp() });
}

export async function uploadImage(id, data) {
  await setDoc(doc(db, 'content', 'img_' + id), { d: data });
}

export async function uploadManifest(manifest) {
  const json = JSON.stringify(manifest);
  if (json.length > 900000) throw new Error('الفهرس كبير جداً.');
  await setDoc(doc(db, 'content', 'manifest'), { json: json, updatedAt: serverTimestamp() });
}
