/* Second Brain capture app.
   Asks the questions from templates.js one at a time and stores the answers exactly as typed.
   It never writes, suggests or rewrites anything. Entries live in this browser (localStorage) and
   leave only when you download, copy or share them. */
(function () {
  'use strict';
  const T = window.TEMPLATES;
  const ENTRIES_KEY = 'sb.entries.v1';
  const DRAFT_KEY = 'sb.draft.v1';
  const app = document.getElementById('app');

  // ---------- storage ----------
  function load(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { toast('Could not save on this device (storage full or blocked).'); return false; }
  }
  const getEntries = () => load(ENTRIES_KEY, []);
  const setEntries = (list) => save(ENTRIES_KEY, list);
  const getDraft = () => load(DRAFT_KEY, null);
  const setDraft = (d) => (d ? save(DRAFT_KEY, d) : localStorage.removeItem(DRAFT_KEY));

  // ---------- small helpers ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  }
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const slugify = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 5).join('-');

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  function render(...nodes) { app.replaceChildren(...nodes.filter(Boolean)); window.scrollTo(0, 0); }

  // ---------- markdown (same format as second-brain/entries) ----------
  const yaml = (s) => (/[:#\[\]{}&*!|>'"%@`]|^\s|\s$/.test(s) ? JSON.stringify(s) : s);

  function entryToMarkdown(e) {
    const fm = ['---', `date: ${e.date}`, `type: ${e.type}`];
    if (e.title) fm.push(`title: ${yaml(e.title)}`);
    if (e.source) fm.push(`source: ${yaml(e.source)}`);
    if (e.duration) fm.push(`duration: ${yaml(e.duration)}`);
    if (e.tags && e.tags.length) fm.push(`tags: [${e.tags.join(', ')}]`);
    fm.push('---', '');
    const body = e.qa.map((p) => `**Q:** ${p.q}\n**A:** ${p.a}`).join('\n\n');
    return fm.join('\n') + '\n' + body + '\n';
  }

  function entryPath(e, all) {
    const [y, m] = e.date.split('-');
    const base = `${e.date}-${e.type}-${slugify(e.title) || 'entry'}`;
    // numbered suffix when another saved entry would get the same file name
    const taken = (all || getEntries()).filter((x) => x.id !== e.id && x.created < e.created).map((x) => baseName(x));
    let name = base, n = 2;
    while (taken.includes(name)) name = `${base}-${n++}`;
    return `entries/${y}/${m}/${name}.md`;
  }
  const baseName = (e) => `${e.date}-${e.type}-${slugify(e.title) || 'entry'}`;

  // ---------- downloads / zip ----------
  function download(name, mime, data) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  // Minimal store-only zip so the files keep their entries/YYYY/MM/ paths.
  function makeZip(files) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const chunks = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = enc.encode(f.content), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      chunks.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((n, c) => n + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }

  function markExported(ids) {
    const list = getEntries(), stamp = Date.now();
    list.forEach((e) => { if (ids.includes(e.id)) e.exportedAt = stamp; });
    setEntries(list);
  }

  // ---------- views ----------
  function homeView() {
    const draft = getDraft();
    const entries = getEntries().sort((a, b) => (a.date === b.date ? b.created - a.created : a.date < b.date ? 1 : -1));
    const pending = entries.filter((e) => !e.exportedAt).length;
    const nodes = [];

    if (draft && T[draft.type]) {
      nodes.push(h('div', { class: 'card draft' },
        h('p', null, `Unfinished ${T[draft.type].label.toLowerCase()} entry (question ${draft.idx + 1} of ${T[draft.type].questions.length}).`),
        h('div', { class: 'row' },
          h('a', { class: 'btn', href: `#/new/${draft.type}` }, 'Continue'),
          h('button', { class: 'btn ghost', onclick: () => { if (confirm('Throw away this unfinished entry?')) { setDraft(null); route(); } } }, 'Discard'))));
    }

    nodes.push(h('h2', null, 'What do you want to capture?'));
    nodes.push(h('div', { class: 'types' }, Object.entries(T).map(([key, t]) =>
      h('a', { class: 'type', href: `#/new/${key}` }, h('strong', null, t.label), h('span', null, t.blurb)))));

    nodes.push(h('h2', null, 'Your entries'));
    if (!entries.length) {
      nodes.push(h('p', { class: 'muted' }, 'Nothing yet. Pick a type above and I will ask the questions one at a time.'));
    } else {
      if (pending) nodes.push(h('p', { class: 'muted' }, `${pending} not exported yet. They exist only on this device until you export them.`));
      nodes.push(h('ul', { class: 'list' }, entries.map((e) =>
        h('li', null, h('a', { href: `#/entry/${e.id}` },
          h('span', { class: 'chip' }, T[e.type] ? T[e.type].label : e.type),
          h('span', { class: 'date' }, e.date),
          h('span', { class: 'ttl' }, e.title || (e.qa[0] ? e.qa[0].a.split('\n')[0].slice(0, 80) : '(empty)')),
          e.exportedAt ? null : h('span', { class: 'dot', title: 'Not exported yet' }))))));
      nodes.push(h('div', { class: 'row wrap' },
        h('button', { class: 'btn', onclick: exportAll }, 'Export all as .zip'),
        h('button', { class: 'btn ghost', onclick: backup }, 'Backup (.json)'),
        h('label', { class: 'btn ghost file' }, 'Restore backup', h('input', { type: 'file', accept: 'application/json,.json', onchange: restore }))));
      nodes.push(h('p', { class: 'muted small' }, 'The zip keeps the entries/YYYY/MM/ folders. Unzip it into your second-brain repo and commit.'));
    }
    render(...nodes);
  }

  function exportAll() {
    const list = getEntries();
    const files = list.map((e) => ({ name: entryPath(e, list), content: entryToMarkdown(e) }));
    download(`second-brain-${today()}.zip`, 'application/zip', makeZip(files));
    markExported(list.map((e) => e.id));
    toast(`Exported ${files.length} entries.`);
    homeView();
  }
  function backup() {
    download(`second-brain-backup-${today()}.json`, 'application/json', JSON.stringify(getEntries(), null, 2));
    toast('Backup downloaded.');
  }
  function restore(ev) {
    const file = ev.target.files[0]; if (!file) return;
    file.text().then((txt) => {
      const incoming = JSON.parse(txt);
      if (!Array.isArray(incoming)) throw new Error('not a list');
      const have = getEntries(), ids = new Set(have.map((e) => e.id));
      const add = incoming.filter((e) => e && e.id && e.type && e.date && Array.isArray(e.qa) && !ids.has(e.id));
      setEntries(have.concat(add));
      toast(`Restored ${add.length} entries.`); homeView();
    }).catch(() => toast('That file is not a valid backup.'));
  }

  // --- interview ---
  let session = null; // { type, idx, answers[], from }

  function startOrResume(type) {
    const t = T[type]; if (!t) { location.hash = ''; return; }
    const draft = getDraft();
    if (draft && draft.type === type) { session = draft; return interviewView(); }
    if (draft && !confirm(`You have an unfinished ${T[draft.type].label.toLowerCase()} entry. Replace it?`)) { location.hash = `#/new/${draft.type}`; return; }
    session = { type, idx: 0, answers: t.questions.map(() => ''), date: today() };
    if (t.checkInFrom) return habitChoiceView();
    setDraft(session); interviewView();
  }

  function habitChoiceView() {
    const t = T.habit;
    render(h('h2', null, 'Habit'),
      h('p', null, 'Was this habit set up in an earlier entry?'),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn', onclick: () => { session.idx = t.checkInFrom - 1; setDraft(session); interviewView(); } }, `Yes, check in (start at question ${t.checkInFrom})`),
        h('button', { class: 'btn ghost', onclick: () => { setDraft(session); interviewView(); } }, 'No, set up a new habit')),
      h('p', { class: 'muted small' }, 'Frameworks: ' + t.frameworks));
  }

  function interviewView() {
    const t = T[session.type], q = t.questions[session.idx], total = t.questions.length;
    const isTags = q.kind === 'tags', last = session.idx === total - 1;
    const input = isTags
      ? h('input', { type: 'text', id: 'ans', autocomplete: 'off', placeholder: 'Separate with commas', value: session.answers[session.idx] })
      : h('textarea', { id: 'ans', rows: 6, value: session.answers[session.idx], placeholder: 'Type your answer in your own words (any language)' });
    const keep = () => { session.answers[session.idx] = input.value; setDraft(session); };
    input.addEventListener('input', keep);

    const go = (delta, skip) => {
      if (skip) input.value = '';
      keep();
      const next = session.idx + delta;
      if (next < 0) { return homeLeave(); }
      if (next >= total) { return finishView(); }
      session.idx = next; setDraft(session); interviewView();
    };
    const homeLeave = () => { location.hash = ''; };

    render(
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 1, 'aria-valuemax': total, 'aria-valuenow': session.idx + 1 },
        h('i', { style: `width:${((session.idx + 1) / total) * 100}%` })),
      h('p', { class: 'muted small' }, `${t.label} · question ${session.idx + 1} of ${total}`),
      h('label', { for: 'ans', class: 'question' }, q.q),
      q.hint ? h('p', { class: 'hint' }, q.hint) : null,
      input,
      q.why ? h('p', { class: 'why' }, q.why) : null,
      h('div', { class: 'row wrap nav' },
        h('button', { class: 'btn ghost', onclick: () => go(-1) }, session.idx === 0 ? 'Leave' : 'Back'),
        h('button', { class: 'btn ghost', onclick: () => go(1, true) }, 'Skip'),
        h('button', { class: 'btn', onclick: () => go(1) }, last ? 'Review' : 'Next')));
    input.focus();
  }

  function finishView() {
    const t = T[session.type];
    const f = { title: session.title || '', source: session.source || '', duration: session.duration || '', date: session.date || today() };
    const field = (id, label, hint, val, type) => h('label', { class: 'field' }, label, h('input', { id, type: type || 'text', value: val, oninput: (e) => { f[id] = e.target.value; session[id] = e.target.value; setDraft(session); } }), hint ? h('small', null, hint) : null);
    const wantsSource = session.type === 'learning', wantsDuration = session.type === 'session' || session.type === 'learning';
    render(h('h2', null, 'Almost done'),
      h('p', { class: 'muted' }, 'All optional except the date. Fill in only what you want in the entry.'),
      field('title', 'Title', 'In your own words.', f.title),
      wantsSource ? field('source', 'Source', 'Name, URL or author.', f.source) : null,
      wantsDuration ? field('duration', 'Duration', 'For example 1h or 2h.', f.duration) : null,
      field('date', 'Date', null, f.date, 'date'),
      h('div', { class: 'row wrap nav' },
        h('button', { class: 'btn ghost', onclick: () => { session.idx = t.questions.length - 1; interviewView(); } }, 'Back'),
        h('button', { class: 'btn', onclick: () => saveEntry(f) }, 'Save entry')));
  }

  function saveEntry(f) {
    const t = T[session.type];
    const qa = [], tags = [];
    t.questions.forEach((q, i) => {
      const a = (session.answers[i] || '').replace(/\s+$/g, '');
      if (!a.trim()) return;
      if (q.kind === 'tags') a.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => tags.push(s));
      else qa.push({ q: q.q.replace(/\s*\(optional\)$/, ''), a });
    });
    if (!qa.length) { toast('Every question was skipped, so there is nothing to save.'); return; }
    const entry = { id: uid(), created: Date.now(), type: session.type, date: f.date || today(), title: f.title.trim(), source: f.source.trim(), duration: f.duration.trim(), tags, qa };
    const list = getEntries(); list.push(entry);
    if (!setEntries(list)) return;
    setDraft(null); session = null;
    location.hash = `#/entry/${entry.id}`;
  }

  function entryView(id) {
    const list = getEntries(), e = list.find((x) => x.id === id);
    if (!e) { location.hash = ''; return; }
    const md = entryToMarkdown(e), path = entryPath(e, list), file = path.split('/').pop();
    const canShare = navigator.canShare && navigator.canShare({ files: [new File([md], file, { type: 'text/markdown' })] });
    render(
      h('p', null, h('a', { href: '#' }, '← All entries')),
      h('p', { class: 'muted small' }, 'Saved on this device. ' + (e.exportedAt ? 'Exported.' : 'Not exported yet.')),
      h('pre', { class: 'md' }, md),
      h('p', { class: 'muted small' }, 'File: ' + path),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn', onclick: () => { download(file, 'text/markdown', md); markExported([e.id]); } }, 'Download .md'),
        h('button', { class: 'btn ghost', onclick: () => navigator.clipboard.writeText(md).then(() => { markExported([e.id]); toast('Copied.'); }, () => toast('Copy was blocked by the browser.')) }, 'Copy'),
        canShare ? h('button', { class: 'btn ghost', onclick: () => navigator.share({ files: [new File([md], file, { type: 'text/markdown' })] }).then(() => markExported([e.id])).catch(() => {}) }, 'Share') : null,
        h('button', { class: 'btn danger', onclick: () => { if (confirm('Delete this entry from this device? Exported copies are not affected.')) { setEntries(getEntries().filter((x) => x.id !== e.id)); location.hash = ''; } } }, 'Delete')));
  }

  // ---------- router ----------
  function route() {
    const [, kind, arg] = location.hash.match(/^#\/(\w+)\/?([\w-]*)/) || [];
    if (kind === 'new') return startOrResume(arg);
    if (kind === 'entry') return entryView(arg);
    homeView();
  }
  window.addEventListener('hashchange', route);
  route();

  // ---------- install + offline ----------
  const installBtn = document.getElementById('install');
  let deferred;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; installBtn.hidden = false; });
  installBtn.addEventListener('click', () => { if (deferred) { deferred.prompt(); deferred = null; installBtn.hidden = true; } });
  window.addEventListener('appinstalled', () => { installBtn.hidden = true; });
  if (/iphone|ipad/i.test(navigator.userAgent) && !navigator.standalone) document.getElementById('ios-tip').hidden = false;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
