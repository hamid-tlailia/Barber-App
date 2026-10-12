// تخزين محلي دائم على الجهاز (IndexedDB) ليعمل التطبيق بدون إنترنت، مع بديل localStorage.
const DB_NAME = 'miqass';
const STORE = 'kv';
let dbPromise;

const openDB = () => {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  dbPromise ||= new Promise(resolve => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return dbPromise;
};

export async function getItem(key) {
  const db = await openDB();
  if (!db) { try { return JSON.parse(localStorage.getItem(`${DB_NAME}:${key}`)); } catch { return null; } }
  return new Promise(resolve => {
    const request = db.transaction(STORE).objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => resolve(null);
  });
}

export async function setItem(key, value) {
  const db = await openDB();
  if (!db) { try { localStorage.setItem(`${DB_NAME}:${key}`, JSON.stringify(value)); } catch { /* storage full or disabled */ } return; }
  await new Promise(resolve => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = resolve; tx.onerror = resolve; tx.onabort = resolve;
  });
}

export async function removeItem(key) {
  const db = await openDB();
  if (!db) { try { localStorage.removeItem(`${DB_NAME}:${key}`); } catch { /* ignore */ } return; }
  await new Promise(resolve => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = resolve; tx.onerror = resolve;
  });
}

// إعدادات صغيرة متزامنة (الوضع الليلي، آخر صالون مفتوح...).
export const prefs = {
  get(key, fallback = null) { try { const v = localStorage.getItem(`miqass-${key}`); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`miqass-${key}`, JSON.stringify(value)); } catch { /* ignore */ } },
};
