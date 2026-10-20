/**
 * Local storage for the cashier: the catalogue snapshot, the waiting sales and a few settings.
 * IndexedDB when the browser allows it; otherwise memory (and the screen tells the cashier it is not safe to work offline).
 * Every record carries the storeId so two owners on one device can never see or send each other's sales.
 */
const DB_NAME = 'twist-pos';
const VERSION = 1;

export function createMemoryDb() {
  const kv = new Map(); const sales = new Map();
  return {
    persistent: false,
    async get(k) { return kv.get(k) ?? null; },
    async set(k, v) { kv.set(k, v); },
    async sales(storeId) { return [...sales.values()].filter((s) => s.storeId === storeId); },
    async putSale(e) { sales.set(e.uuid, structuredClone(e)); },
    async deleteSale(uuid) { sales.delete(uuid); },
  };
}

const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export async function openPosDb(idb = globalThis.indexedDB) {
  if (!idb) return createMemoryDb();
  try {
    const db = await new Promise((resolve, reject) => {
      const open = idb.open(DB_NAME, VERSION);
      open.onupgradeneeded = () => {
        const d = open.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('sales')) d.createObjectStore('sales', { keyPath: 'uuid' }).createIndex('storeId', 'storeId');
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
      open.onblocked = () => reject(new Error('blocked'));
    });
    const store = (name, mode = 'readonly') => db.transaction(name, mode).objectStore(name);
    return {
      persistent: true,
      async get(k) { return (await wrap(store('kv').get(k))) ?? null; },
      async set(k, v) { await wrap(store('kv', 'readwrite').put(v, k)); },
      async sales(storeId) { return wrap(store('sales').index('storeId').getAll(storeId)); },
      async putSale(e) { await wrap(store('sales', 'readwrite').put(e)); },
      async deleteSale(uuid) { await wrap(store('sales', 'readwrite').delete(uuid)); },
    };
  } catch {
    return createMemoryDb();
  }
}
