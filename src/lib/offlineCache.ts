const DB_NAME = 'bc-money-cache';
const DB_VERSION = 1;
const TTL_MS = 24 * 60 * 60 * 1000;
const STORES = ['transactions', 'accounts', 'categories', 'budgets'] as const;

type StoreName = (typeof STORES)[number];

interface CacheEntry<T> {
  userId: string;
  data: T[];
  cachedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          const os = db.createObjectStore(store, { keyPath: 'userId' });
          os.createIndex('userId', 'userId', { unique: true });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function set(store: StoreName, userId: string, data: unknown[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const entry: CacheEntry<unknown> = { userId, data, cachedAt: Date.now() };
    const req = tx.objectStore(store).put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function get<T>(store: StoreName, userId: string): Promise<T[] | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(userId);
    req.onsuccess = () => {
      db.close();
      const entry = req.result as CacheEntry<T> | undefined;
      if (!entry) return resolve(null);
      if (Date.now() - entry.cachedAt > TTL_MS) return resolve(null);
      resolve(entry.data);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function clear(userId: string): Promise<void> {
  const db = await openDB();
  const promises = STORES.map(
    (store) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const req = tx.objectStore(store).delete(userId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
  await Promise.all(promises);
  db.close();
}

export const offlineCache = { set, get, clear };
