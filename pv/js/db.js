// db.js — persistenta locala (IndexedDB) pentru PV Euro Ecologic WebApp.
// Inlocuieste sqflite/SharedPreferences din aplicatia Flutter: totul ramane
// pe acest telefon/browser, fara cont, fara sincronizare.

const DB_NAME = 'pv_euro_ecologic_web';
const DB_VERSION = 1;

const STORES = {
  drivers: 'drivers',
  cars: 'cars',
  depots: 'depots',
  catalog: 'catalog', // key = model name, value = { model, types: [], aux: [] }
  pvRecords: 'pvRecords',
  clientLocations: 'clientLocations',
  counters: 'counters', // key/value simplu
  meta: 'meta',
};

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.drivers)) {
        db.createObjectStore(STORES.drivers, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORES.cars)) {
        db.createObjectStore(STORES.cars, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORES.depots)) {
        db.createObjectStore(STORES.depots, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORES.catalog)) {
        db.createObjectStore(STORES.catalog, { keyPath: 'model' });
      }
      if (!db.objectStoreNames.contains(STORES.pvRecords)) {
        const s = db.createObjectStore(STORES.pvRecords, { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains(STORES.clientLocations)) {
        db.createObjectStore(STORES.clientLocations, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.counters)) {
        db.createObjectStore(STORES.counters, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAll(storeName) {
  const store = await tx(storeName);
  return reqToPromise(store.getAll());
}

async function get(storeName, key) {
  const store = await tx(storeName);
  return reqToPromise(store.get(key));
}

async function put(storeName, value) {
  const store = await tx(storeName, 'readwrite');
  return reqToPromise(store.put(value));
}

async function del(storeName, key) {
  const store = await tx(storeName, 'readwrite');
  return reqToPromise(store.delete(key));
}

// ---------------------------------------------------------------------
// Repos de nivel inalt, echivalente cu repository-urile din Flutter.
// ---------------------------------------------------------------------

export const DriverRepo = {
  getAll: async () => (await getAll(STORES.drivers)).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
  save: (driver) => put(STORES.drivers, driver),
  remove: (id) => del(STORES.drivers, id),
};

export const CarRepo = {
  getAll: async () => (await getAll(STORES.cars)).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
  save: (car) => put(STORES.cars, car),
  remove: (id) => del(STORES.cars, id),
};

export const DepotRepo = {
  getAll: async () => (await getAll(STORES.depots)).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
  save: (depot) => put(STORES.depots, depot),
  remove: (id) => del(STORES.depots, id),
};

export const CatalogRepo = {
  getAll: () => getAll(STORES.catalog),
  save: (entry) => put(STORES.catalog, entry),
  get: (model) => get(STORES.catalog, model),
};

export const PvRepo = {
  getAll: async () => {
    const all = await getAll(STORES.pvRecords);
    return all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  },
  get: (id) => get(STORES.pvRecords, id),
  save: (record) => put(STORES.pvRecords, record),
  remove: (id) => del(STORES.pvRecords, id),
};

export const ClientLocationRepo = {
  getAll: () => getAll(STORES.clientLocations),
  save: (point) => put(STORES.clientLocations, point),
};

export const CounterRepo = {
  async next(key, { resetIf } = {}) {
    const store = await tx(STORES.counters, 'readwrite');
    const current = await reqToPromise(store.get(key));
    let value = current ? current.value : 0;
    if (resetIf && current && resetIf(current)) value = 0;
    value += 1;
    const record = { key, value, ...(resetIf ? { year: new Date().getFullYear() } : {}) };
    await reqToPromise(store.put(record));
    return value;
  },
  async peekYear(key) {
    const record = await get(STORES.counters, key);
    return record ? record.year : null;
  },
};

export const MetaRepo = {
  get: (key) => get(STORES.meta, key),
  set: (key, value) => put(STORES.meta, { key, value }),
};

export { STORES };
