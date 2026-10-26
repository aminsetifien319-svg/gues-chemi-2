// طبقة الاتصال بـ Firebase: الدخول بحساب Google وقراءة/كتابة Firestore.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, doc, getDoc, getDocs, setDoc, deleteDoc, collection, serverTimestamp, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

export const configMissing = !firebaseConfig.apiKey || String(firebaseConfig.apiKey).indexOf('PASTE') === 0;

let auth = null, db = null;
if (!configMissing) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
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
  const adm = await getDoc(doc(db, 'admins', email));
  if (adm.exists()) return 'admin';
  const al = await getDoc(doc(db, 'allowed', email));
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

export async function loadContent() {
  const snap = await getDocs(collection(db, 'content'));
  const out = { chapters: [], stats: null };
  snap.forEach((d) => {
    const raw = d.data().json;
    if (!raw) return;
    const j = JSON.parse(raw);
    if (d.id === 'stats') out.stats = j; else out.chapters.push(j);
  });
  out.chapters.sort((a, b) => a.id - b.id);
  return out;
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

// content: { chapters: [...], stats: {...} } ← يُخزَّن كل جزء كنص JSON (Firestore لا يقبل مصفوفات داخل مصفوفات)
export async function uploadContent(content) {
  const b = writeBatch(db);
  content.chapters.forEach((ch) => {
    const json = JSON.stringify(ch);
    if (json.length > 900000) throw new Error('الشابيطر ' + ch.id + ' كبير جداً (أكثر من 900KB)');
    b.set(doc(db, 'content', 'ch' + ch.id), { json: json });
  });
  if (content.stats) b.set(doc(db, 'content', 'stats'), { json: JSON.stringify(content.stats) });
  await b.commit();
  return content.chapters.length;
}
