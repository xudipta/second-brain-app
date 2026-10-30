/* Encrypted storage for Second Brain.
   Everything the app stores (entries and the unfinished draft) lives in ONE record in localStorage that is
   encrypted with AES-256-GCM. The key is derived from the owner's passphrase with PBKDF2-SHA256 and is held
   only in memory (as a non-extractable CryptoKey) while the app is unlocked. No passphrase, no readable data.
   There is no recovery: a forgotten passphrase means the entries cannot be read (encrypted backups still need it too). */
(function () {
  'use strict';
  const VAULT_KEY = 'sb.vault.v1';
  const LEGACY_KEYS = ['sb.entries.v1', 'sb.draft.v1']; // plaintext storage used before encryption existed
  const ITERATIONS = 600000;                             // PBKDF2-SHA256 rounds (OWASP 2023 guidance)
  const enc = new TextEncoder(), dec = new TextDecoder();
  const AAD = enc.encode('second-brain/v1');

  let key = null, salt = null, iter = ITERATIONS;
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
  async function seal(k, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // fresh random IV for every write
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, k, enc.encode(JSON.stringify(obj)));
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function open(k, rec) { // throws if the key is wrong or the data was changed
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv), additionalData: AAD }, k, unb64(rec.ct));
    return JSON.parse(dec.decode(pt));
  }
  const envelope = (sealed, extra) => Object.assign({ v: 1, kdf: 'PBKDF2-SHA256', iter, salt: b64(salt) }, extra, sealed);

  // ---- persistence ----
  async function writeNow() {
    const sealed = await seal(key, V.state);
    localStorage.setItem(VAULT_KEY, JSON.stringify(envelope(sealed)));
  }
  // Schedule an encrypted write. Writes are queued so they land in order.
  V.touch = (delayMs) => {
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
  V.supported = !!(window.isSecureContext && window.crypto && crypto.subtle);
  V.exists = () => { try { return localStorage.getItem(VAULT_KEY) != null; } catch (e) { return false; } };
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
  V.create = async (pass, initial) => {
    salt = crypto.getRandomValues(new Uint8Array(16)); iter = ITERATIONS;
    key = await derive(pass, salt, iter);
    V.state = initial || { entries: [], draft: null };
    await writeNow();
    dropLegacy(); // only after the encrypted copy is safely written
  };
  V.unlock = async (pass) => {
    const rec = JSON.parse(localStorage.getItem(VAULT_KEY));
    const s = unb64(rec.salt), k = await derive(pass, s, rec.iter || ITERATIONS);
    const state = await open(k, rec); // wrong passphrase throws here
    salt = s; iter = rec.iter || ITERATIONS; key = k; V.state = state;
  };
  V.lock = async () => {
    await V.flush();
    clearTimeout(timer); dirty = false; key = null; V.state = null;
  };
  V.changePassphrase = async (oldPass, newPass) => {
    const rec = JSON.parse(localStorage.getItem(VAULT_KEY));
    await open(await derive(oldPass, unb64(rec.salt), rec.iter || ITERATIONS), rec); // proves the old passphrase
    await V.flush();
    salt = crypto.getRandomValues(new Uint8Array(16)); iter = ITERATIONS;
    key = await derive(newPass, salt, iter);
    await writeNow();
  };
  V.erase = () => {
    clearTimeout(timer); dirty = false; key = null; V.state = null;
    try { localStorage.removeItem(VAULT_KEY); } catch (e) { /* ignore */ }
    dropLegacy();
  };

  // ---- backups: an encrypted file with the same passphrase protection ----
  V.exportBackup = async () => JSON.stringify(envelope(await seal(key, { entries: V.state.entries }), { kind: 'backup' }), null, 2);
  V.parseBackup = (text) => {
    const data = JSON.parse(text);
    if (Array.isArray(data)) return { plain: data };                   // old plaintext backup from before encryption
    if (data && data.v === 1 && data.kind === 'backup' && data.ct) return { file: data };
    throw new Error('not a backup');
  };
  V.sameKeyAs = (file) => !!key && file.salt === b64(salt) && (file.iter || ITERATIONS) === iter;
  V.openBackup = async (file, pass) => {
    const k = pass == null && V.sameKeyAs(file) ? key : await derive(pass, unb64(file.salt), file.iter || ITERATIONS);
    return (await open(k, file)).entries;
  };
  V.createFromBackup = async (file, pass) => {
    const k = await derive(pass, unb64(file.salt), file.iter || ITERATIONS);
    const data = await open(k, file);
    salt = unb64(file.salt); iter = file.iter || ITERATIONS; key = k;
    V.state = { entries: data.entries || [], draft: null };
    await writeNow(); dropLegacy();
  };

  window.Vault = V;
})();
