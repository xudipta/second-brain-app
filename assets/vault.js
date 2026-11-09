/* Encrypted storage for Second Brain.
   Everything the app stores (entries and the unfinished draft) lives in ONE record in localStorage,
   encrypted with AES-256-GCM. There are two ways the key is kept:

   - mode "device" (default): a random key made by the browser and kept in this app's IndexedDB as a
     non-extractable CryptoKey. No password, the app opens straight away. The stored data is unreadable to
     other apps, other sites and anything that just copies or syncs the raw storage, but anyone who can open
     this app on an unlocked device can read it.
   - mode "pass" (optional): the key is derived from a passphrase with PBKDF2-SHA256 and held only in memory
     while the app is unlocked. No passphrase, no readable data. There is no recovery if it is forgotten.

   Either way a fresh random IV is used for every write and any change to the stored data is detected. */
(function () {
  'use strict';
  const VAULT_KEY = 'sb.vault.v1';
  const LEGACY_KEYS = ['sb.entries.v1', 'sb.draft.v1']; // plaintext storage used before encryption existed
  const ITERATIONS = 600000;                             // PBKDF2-SHA256 rounds (OWASP 2023 guidance)
  const enc = new TextEncoder(), dec = new TextDecoder();
  const AAD = enc.encode('second-brain/v1');

  let key = null, salt = null, iter = ITERATIONS, mode = null;
  let dirty = false, timer = null, writing = Promise.resolve();
  const V = { state: null, onError: () => {} };

  // ---- encoding ----
  const b64 = (buf) => {
    const a = new Uint8Array(buf); let s = '';
    for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  // ---- crypto ----
  async function derive(pass, saltBytes, rounds) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pass.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: saltBytes, iterations: rounds, hash: 'SHA-256' }, base,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const newDeviceKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  async function seal(k, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, k, enc.encode(JSON.stringify(obj)));
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function open(k, rec) { // throws if the key is wrong or the data was changed
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv), additionalData: AAD }, k, unb64(rec.ct));
    return JSON.parse(dec.decode(pt));
  }
  const passEnvelope = (sealed, extra) => Object.assign({ v: 1, mode: 'pass', kdf: 'PBKDF2-SHA256', iter, salt: b64(salt) }, extra, sealed);

  // ---- the device key lives in IndexedDB (a CryptoKey can be stored there without ever exposing its bytes) ----
  const idb = () => new Promise((res, rej) => {
    const r = indexedDB.open('sb-keys', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('keys');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  async function idbRun(kind, fn) {
    const db = await idb();
    return new Promise((res, rej) => {
      const t = db.transaction('keys', kind), req = fn(t.objectStore('keys'));
      t.oncomplete = () => { db.close(); res(req && req.result !== undefined ? req.result : null); };
      t.onerror = t.onabort = () => { db.close(); rej(t.error); };
    });
  }
  const keyGet = () => idbRun('readonly', (s) => s.get('vault'));
  const keyPut = (k) => idbRun('readwrite', (s) => s.put(k, 'vault'));
  const keyDel = () => idbRun('readwrite', (s) => s.delete('vault'));

  // ---- persistence ----
  async function writeNow() {
    const sealed = await seal(key, V.state);
    localStorage.setItem(VAULT_KEY, JSON.stringify(mode === 'device' ? Object.assign({ v: 1, mode: 'device' }, sealed) : passEnvelope(sealed)));
  }
  V.touch = (delayMs) => { // schedule an encrypted write; writes are queued so they land in order
    if (!key) return;
    dirty = true; clearTimeout(timer);
    timer = setTimeout(V.flush, delayMs || 0);
  };
  V.flush = () => {
    clearTimeout(timer);
    if (!dirty || !key) return writing;
    dirty = false;
    writing = writing.then(writeNow).catch(() => V.onError());
    return writing;
  };

  // ---- status ----
  V.supported = !!(window.isSecureContext && window.crypto && crypto.subtle && window.indexedDB);
  const record = () => { try { return JSON.parse(localStorage.getItem(VAULT_KEY)); } catch (e) { return null; } };
  V.exists = () => !!record();
  V.storedMode = () => { const r = record(); return r ? r.mode || 'pass' : null; }; // records from before modes existed are passphrase vaults
  V.currentMode = () => mode;
  Object.defineProperty(V, 'unlocked', { get: () => !!key && !!V.state });

  // Plaintext data left by the pre-encryption version, if any. It is moved into the vault, then deleted.
  V.legacy = () => {
    try {
      const entries = JSON.parse(localStorage.getItem('sb.entries.v1') || 'null');
      const draft = JSON.parse(localStorage.getItem('sb.draft.v1') || 'null');
      if (!Array.isArray(entries) && !draft) return null;
      return { entries: Array.isArray(entries) ? entries : [], draft: draft || null };
    } catch (e) { return null; }
  };
  const dropLegacy = () => LEGACY_KEYS.forEach((k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } });

  // ---- lifecycle ----
  V.createDevice = async (initial) => {
    const k = await newDeviceKey();
    await keyPut(k);
    key = k; mode = 'device'; salt = null;
    V.state = initial || { entries: [], draft: null, tasks: [] };
    await writeNow();
    dropLegacy(); // only after the encrypted copy is safely written
  };
  V.unlockDevice = async () => {
    const rec = record();
    if (!rec || rec.mode !== 'device') throw new Error('not a device vault');
    const k = await keyGet();
    if (!k) throw new Error('nokey');
    V.state = await open(k, rec); key = k; mode = 'device';
  };
  V.create = async (pass, initial) => {
    salt = crypto.getRandomValues(new Uint8Array(16)); iter = ITERATIONS;
    key = await derive(pass, salt, iter); mode = 'pass';
    V.state = initial || { entries: [], draft: null, tasks: [] };
    await writeNow();
    dropLegacy();
  };
  V.unlock = async (pass) => {
    const rec = record();
    const s = unb64(rec.salt), k = await derive(pass, s, rec.iter || ITERATIONS);
    const state = await open(k, rec); // wrong passphrase throws here
    salt = s; iter = rec.iter || ITERATIONS; key = k; mode = 'pass'; V.state = state;
  };
  V.lock = async () => { // passphrase mode only
    await V.flush();
    clearTimeout(timer); dirty = false; key = null; V.state = null;
  };
  V.changePassphrase = async (oldPass, newPass) => {
    const rec = record();
    await open(await derive(oldPass, unb64(rec.salt), rec.iter || ITERATIONS), rec); // proves the old passphrase
    await V.flush();
    salt = crypto.getRandomValues(new Uint8Array(16)); iter = ITERATIONS;
    key = await derive(newPass, salt, iter);
    await writeNow();
  };
  // device -> passphrase
  V.toPassphrase = async (newPass) => {
    await V.flush();
    salt = crypto.getRandomValues(new Uint8Array(16)); iter = ITERATIONS;
    key = await derive(newPass, salt, iter); mode = 'pass';
    await writeNow();
    try { await keyDel(); } catch (e) { /* the old device key is no longer used either way */ }
  };
  // passphrase -> device
  V.toDevice = async (pass) => {
    const rec = record();
    await open(await derive(pass, unb64(rec.salt), rec.iter || ITERATIONS), rec); // proves the passphrase
    await V.flush();
    const k = await newDeviceKey();
    await keyPut(k);
    key = k; mode = 'device'; salt = null;
    await writeNow();
  };
  V.erase = async () => {
    clearTimeout(timer); dirty = false; key = null; V.state = null; mode = null;
    try { localStorage.removeItem(VAULT_KEY); } catch (e) { /* ignore */ }
    dropLegacy();
    try { await keyDel(); } catch (e) { /* ignore */ }
  };

  // ---- backups ----
  // With a passphrase: encrypted with a key made from that passphrase (works in either mode).
  // Without one: in passphrase mode it is encrypted with the vault's own key; in device mode it is plain JSON.
  V.exportBackup = async (pass) => {
    const data = { entries: V.state.entries, tasks: V.state.tasks || [] };
    if (pass) {
      const s = crypto.getRandomValues(new Uint8Array(16)), k = await derive(pass, s, ITERATIONS), sealed = await seal(k, data);
      return JSON.stringify(Object.assign({ v: 1, kind: 'backup', kdf: 'PBKDF2-SHA256', iter: ITERATIONS, salt: b64(s) }, sealed), null, 2);
    }
    if (mode === 'pass') return JSON.stringify(passEnvelope(await seal(key, data), { kind: 'backup' }), null, 2);
    return JSON.stringify(data, null, 2);
  };
  V.parseBackup = (text) => {
    const data = JSON.parse(text);
    if (Array.isArray(data)) return { plain: { entries: data, tasks: [] } };          // oldest plain backups: a bare list of entries
    if (data && Array.isArray(data.entries) && !data.ct) return { plain: { entries: data.entries, tasks: data.tasks || [] } };
    if (data && data.v === 1 && data.kind === 'backup' && data.ct) return { file: data };
    throw new Error('not a backup');
  };
  V.sameKeyAs = (file) => mode === 'pass' && !!key && !!salt && file.salt === b64(salt) && (file.iter || ITERATIONS) === iter;
  V.openBackup = async (file, pass) => {
    const k = pass == null && V.sameKeyAs(file) ? key : await derive(pass, unb64(file.salt), file.iter || ITERATIONS);
    const data = await open(k, file);
    return { entries: data.entries || [], tasks: data.tasks || [] }; // backups made before to-dos existed have no tasks
  };
  V.createFromBackup = async (file, pass) => {
    const k = await derive(pass, unb64(file.salt), file.iter || ITERATIONS);
    const data = await open(k, file);
    salt = unb64(file.salt); iter = file.iter || ITERATIONS; key = k; mode = 'pass';
    V.state = { entries: data.entries || [], draft: null, tasks: data.tasks || [] };
    await writeNow(); dropLegacy();
  };

  window.Vault = V;
})();
