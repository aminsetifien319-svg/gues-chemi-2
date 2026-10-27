// طبقة الاتصال بـ Firebase: الدخول بحساب Google وقراءة/كتابة Firestore.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  doc, getDoc, getDocFromCache, getDocFromServer, getDocs, setDoc, deleteDoc, collection, serverTimestamp, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

export const configMissing = !firebaseConfig.apiKey || String(firebaseConfig.apiKey).indexOf('PASTE') === 0;

let auth = null, db = null;
if (!configMissing) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  // نخزّن الصور في ذاكرة المتصفح بعد أول تحميل حتى لا تُحمَّل كل مرة (أسرع وأوفر).
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch (e) {
    db = initializeFirestore(app, { localCache: memoryLocalCache() });
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
  const s = await getDocFromServer(doc(db, 'content', 'manifest')).catch(() => getDoc(doc(db, 'content', 'manifest')));
  if (!s.exists()) return null;
  return JSON.parse(s.data().json);
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

/* ---------- الإدارة ---------- */
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
