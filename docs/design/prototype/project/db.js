/* ShiftForge — IndexedDB key-value store + serialization helpers */
window.DB = (function () {
  "use strict";
  const NAME  = "shiftforge_v3";
  const STORE = "kv";
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((res, rej) => {
      const req = indexedDB.open(NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = (e) => { _db = e.target.result; res(_db); };
      req.onerror   = ()  => rej(req.error);
    });
  }

  async function set(key, val) {
    const db = await open();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(val, key);
      tx.oncomplete = res;
      tx.onerror    = () => rej(tx.error);
    });
  }

  async function get(key) {
    const db = await open();
    return new Promise((res, rej) => {
      const tx  = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => res(req.result ?? null);
      req.onerror   = () => rej(req.error);
    });
  }

  /* Map <-> plain-object serialization */
  const mapToObj = (m) => {
    const o = {};
    m.forEach((v, k) => { o[k] = v; });
    return o;
  };
  const objToMap = (o) => {
    const m = new Map();
    Object.entries(o || {}).forEach(([k, v]) => m.set(k, v));
    return m;
  };

  open(); /* warm-up */
  return { set, get, mapToObj, objToMap };
})();
