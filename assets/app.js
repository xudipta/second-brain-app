/* Second Brain capture app.
   Asks the questions from templates.js one at a time and stores the answers exactly as typed.
   It never writes, suggests or rewrites anything. Entries live in this browser, encrypted with the owner's
   passphrase (see vault.js), and leave only when you download, copy or share them. */
(function () {
  'use strict';
  const T = window.TEMPLATES;
  const V = window.Vault;
  const LOCK_AFTER_MS = 2 * 60 * 1000; // lock when the app has been in the background this long
  const app = document.getElementById('app');
  const topbar = document.getElementById('topbar');
  const tabs = document.getElementById('tabs');

  // ---------- icons (static strings only) ----------
  const ICON = {
    idea: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
    learning: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5V5.5M9 8h7M9 12h5"/>',
    session: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2h5"/>',
    journal: '<path d="M5 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5zM9 3v18M12.5 8h4M12.5 12h4"/>',
    habit: '<path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    download: '<path d="M12 3v12M7 11l5 5 5-5M5 21h14"/>',
    upload: '<path d="M12 16V4M7 8l5-5 5 5M5 21h14"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>',
    notebook: '<path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6zM6 3v18M10 8h5M10 12h5"/>',
    chevron: '<path d="M9 5l7 7-7 7"/>',
    plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3M12 15v2"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'
  };
  function svg(name) {
    const t = document.createElement('template');
    t.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name] || ''}</svg>`;
    return t.content.firstChild;
  }

  // ---------- storage (in memory while unlocked; written back encrypted by vault.js) ----------
  const getEntries = () => (V.state ? V.state.entries : []);
  const setEntries = (list) => { V.state.entries = list; V.touch(0); return true; };
  const getDraft = () => (V.state ? V.state.draft : null);
  const setDraft = (d) => { if (V.state) { V.state.draft = d; V.touch(400); } };
  V.onError = () => toast('Could not save on this device (storage is full or blocked).');

  // ---------- helpers ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  }
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dateStr(new Date());
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const slugify = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 5).join('-');
  const plural = (n, w, pl) => `${n} ${n === 1 ? w : pl || w + 's'}`;
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  function dayLabel(s) {
    if (s === today()) return 'Today';
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (s === dateStr(y)) return 'Yesterday';
    try { return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(parseDate(s)); } catch (e) { return s; }
  }
  const stripOptional = (q) => q.replace(/\s*\(optional\)$/, '');
  const typeClass = (type) => 't-' + type;
  const badge = (type) => h('div', { class: `badge ${typeClass(type)}` }, svg(type));

  let toastTimer;
  function toast(msg, action) {
    const t = document.getElementById('toast');
    t.replaceChildren(msg);
    if (action) t.append(h('button', { onclick: () => { t.hidden = true; action.run(); } }, action.label));
    t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, action ? 7000 : 2600);
  }

  // ---------- shell ----------
  function shell({ top, tab, focus }) {
    topbar.replaceChildren(...[].concat(top).filter(Boolean));
    tabs.hidden = !!focus;
    document.body.classList.toggle('focus', !!focus);
    app.classList.toggle('no-tabs', !!focus);
    tabs.querySelectorAll('a').forEach((a) => (a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  }
  const logo = () => h('span', { class: 'logo' }, h('i', null, svg('notebook')), 'Second Brain');
  const title = (t) => h('div', { class: 'title' }, t);
  const backBtn = (href, label) => h('a', { class: 'icon-btn', href, 'aria-label': label || 'Back' }, svg('back'));
  function view(...nodes) {
    // fixed bars live outside the animated wrapper, or the animation's transform would trap them
    const flat = nodes.flat(Infinity).filter(Boolean), bars = flat.filter((n) => n.classList && n.classList.contains('actionbar'));
    app.replaceChildren(h('div', { class: 'view' }, flat.filter((n) => !bars.includes(n))), ...bars);
    window.scrollTo(0, 0);
  }

  // ---------- markdown (same format as second-brain/entries) ----------
  const yaml = (s) => (/[:#\[\]{}&*!|>'"%@`]|^\s|\s$/.test(s) ? JSON.stringify(s) : s);

  function entryToMarkdown(e) {
    const fm = ['---', `date: ${e.date}`, `type: ${e.type}`];
    if (e.title) fm.push(`title: ${yaml(e.title)}`);
    if (e.source) fm.push(`source: ${yaml(e.source)}`);
    if (e.duration) fm.push(`duration: ${yaml(e.duration)}`);
    if (e.tags && e.tags.length) fm.push(`tags: [${e.tags.join(', ')}]`);
    fm.push('---', '');
    return fm.join('\n') + '\n' + e.qa.map((p) => `**Q:** ${p.q}\n**A:** ${p.a}`).join('\n\n') + '\n';
  }
  const baseName = (e) => `${e.date}-${e.type}-${slugify(e.title) || 'entry'}`;
  function entryPath(e, all) {
    const [y, m] = e.date.split('-');
    const base = baseName(e);
    const taken = (all || getEntries()).filter((x) => x.id !== e.id && x.created < e.created).map(baseName);
    let name = base, n = 2;
    while (taken.includes(name)) name = `${base}-${n++}`;
    return `entries/${y}/${m}/${name}.md`;
  }
  // Answers aligned to the template questions, for editing. Older entries without `ans` are matched by question text.
  function answersOf(e) {
    const t = T[e.type]; if (!t) return [];
    if (Array.isArray(e.ans)) return t.questions.map((_, i) => e.ans[i] || '');
    return t.questions.map((q) => {
      if (q.kind === 'tags') return (e.tags || []).join(', ');
      const hit = e.qa.find((p) => p.q === q.q);
      return hit ? hit.a : '';
    });
  }

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

  // ---------- install ----------
  let deferredInstall = null;
  const isIOS = /iphone|ipad/i.test(navigator.userAgent) && !navigator.standalone;
  const installed = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; if (V.unlocked && (/^#?\/?$/.test(location.hash) || location.hash === '#/more')) route(); });
  window.addEventListener('appinstalled', () => { deferredInstall = null; if (V.unlocked) route(); });
  const askInstall = () => { if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; } };

  // ====================== VIEWS ======================

  function homeView() {
    shell({ top: logo(), tab: 'capture' });
    const draft = getDraft();
    const entries = getEntries().slice().sort((a, b) => b.created - a.created);
    let installDismissed = false; try { installDismissed = sessionStorage.getItem('sb.noinstall') === '1'; } catch (e) { /* ignore */ }

    view(
      h('h1', { class: 'h-lg', style: 'margin-top:.5rem' }, 'What do you want to capture?'),
      h('p', { class: 'lead' }, 'Pick a type. You will be asked one question at a time, and your words are kept exactly as you write them.'),

      draft && T[draft.type] ? h('div', { class: `banner ${typeClass(draft.type)}` },
        badge(draft.type),
        h('div', { class: 'grow' }, h('strong', null, `Unfinished ${T[draft.type].label.toLowerCase()}`), h('span', { class: 'sub' }, `Question ${draft.idx + 1} of ${T[draft.type].questions.length}`)),
        h('a', { class: 'btn sm', href: `#/new/${draft.type}` }, 'Continue'),
        h('button', { class: 'icon-btn', 'aria-label': 'Discard draft', onclick: () => discardDraft() }, svg('trash'))) : null,

      deferredInstall && !installDismissed && !installed() ? h('div', { class: 'banner' },
        h('div', { class: 'grow' }, h('strong', null, 'Install Second Brain'), h('span', { class: 'sub' }, 'Open it like an app, even offline.')),
        h('button', { class: 'btn sm', onclick: askInstall }, 'Install'),
        h('button', { class: 'icon-btn', 'aria-label': 'Dismiss', onclick: () => { try { sessionStorage.setItem('sb.noinstall', '1'); } catch (e) { /* ignore */ } homeView(); } }, svg('close'))) : null,

      h('div', { class: 'section' }, h('h2', null, 'Start a new entry')),
      h('div', { class: 'types' }, Object.entries(T).map(([key, t]) =>
        h('a', { class: `tile ${typeClass(key)}`, href: `#/new/${key}` },
          badge(key), h('strong', null, t.label), h('span', null, t.blurb), h('small', null, plural(t.questions.filter((q) => q.kind !== 'tags').length, 'question'))))),

      h('div', { class: 'section' }, h('h2', null, 'Recent'), entries.length ? h('a', { href: '#/entries' }, 'See all') : null),
      entries.length ? entries.slice(0, 3).map(entryRow) : emptyState('Nothing captured yet', 'Your first entry will show up here.')
    );
  }

  function discardDraft() {
    const draft = getDraft(); if (!draft) return;
    setDraft(null); homeView();
    toast('Draft discarded.', { label: 'Undo', run: () => { setDraft(draft); if (!location.hash || location.hash === '#/') homeView(); } });
  }

  function emptyState(head, text) {
    return h('div', { class: 'empty' }, h('div', { class: 'badge' }, svg('notebook')), h('h3', null, head), h('p', null, text));
  }

  function excerpt(e) {
    const first = e.qa.find((p) => p.a.trim());
    return first ? first.a.replace(/\s+/g, ' ').trim() : '';
  }
  function entryRow(e) {
    return h('a', { class: `entry ${typeClass(e.type)}`, href: `#/entry/${e.id}` },
      badge(e.type),
      h('div', { class: 'body' },
        h('div', { class: 'ttl' }, e.title || (T[e.type] ? T[e.type].label : e.type) + ' · ' + dayLabel(e.date)),
        h('div', { class: 'ex' }, excerpt(e)),
        h('div', { class: 'meta' }, h('span', null, dayLabel(e.date)), e.duration ? h('span', null, e.duration) : null,
          e.exportedAt ? null : h('span', { class: 'pending', title: 'Not exported yet' }), e.exportedAt ? null : h('span', null, 'Not exported'))));
  }

  // --- entries ---
  const filters = { q: '', type: 'all' };
  function entriesView() {
    shell({ top: title('Entries'), tab: 'entries' });
    const all = getEntries();
    const list = h('div', { id: 'entry-list' });
    const draw = () => {
      const q = filters.q.trim().toLowerCase();
      const rows = all.filter((e) => (filters.type === 'all' || e.type === filters.type) &&
        (!q || [e.title, e.source, (e.tags || []).join(' '), e.qa.map((p) => p.a).join(' ')].join(' ').toLowerCase().includes(q)))
        .sort((a, b) => (a.date === b.date ? b.created - a.created : a.date < b.date ? 1 : -1));
      if (!rows.length) { list.replaceChildren(all.length ? emptyState('No matches', 'Try a different word or type.') : emptyState('No entries yet', 'Capture something and it will appear here.')); return; }
      const out = []; let last = '';
      rows.forEach((e) => { if (e.date !== last) { out.push(h('div', { class: 'day' }, dayLabel(e.date))); last = e.date; } out.push(entryRow(e)); });
      list.replaceChildren(...out);
    };
    const pending = all.filter((e) => !e.exportedAt).length;
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by type' });
    const drawChips = () => chips.replaceChildren(...[['all', 'All'], ...Object.entries(T).map(([k, t]) => [k, t.label])].map(([k, label]) =>
      h('button', { class: 'chip', 'aria-pressed': String(filters.type === k), onclick: () => { filters.type = k; drawChips(); draw(); } }, label)));
    drawChips();

    view(
      all.length ? h('div', { class: 'search' }, svg('search'),
        h('input', { type: 'search', placeholder: 'Search your entries', 'aria-label': 'Search entries', value: filters.q, oninput: (ev) => { filters.q = ev.target.value; draw(); } })) : null,
      all.length ? chips : null,
      pending ? h('p', { class: 'sub', style: 'margin-top:.5rem' }, `${plural(pending, 'entry', 'entries')} not exported yet. They exist only on this device until you export them. `, h('a', { href: '#/more' }, 'Export')) : null,
      list);
    draw();
  }

  // --- entry detail ---
  function entryView(id) {
    const all = getEntries(), e = all.find((x) => x.id === id);
    if (!e) { location.hash = '#/entries'; return; }
    shell({ top: [backBtn('#/entries', 'Back to entries'), title(T[e.type] ? T[e.type].label : 'Entry')], tab: 'entries' });
    const md = entryToMarkdown(e), path = entryPath(e, all), file = path.split('/').pop();
    const mkFile = () => new File([md], file, { type: 'text/markdown' });
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [mkFile()] }));
    const body = h('div');
    let mode = 'read';
    const draw = () => {
      body.replaceChildren(...(mode === 'read'
        ? e.qa.map((p) => h('div', { class: 'qa' }, h('div', { class: 'q' }, p.q), h('div', { class: 'a' }, p.a)))
        : [h('pre', { class: 'md' }, md), h('p', { class: 'sub', style: 'margin-top:.5rem' }, 'Saves as ' + path)]));
      seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === mode)));
    };
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'View' },
      h('button', { 'data-m': 'read', onclick: () => { mode = 'read'; draw(); } }, 'Read'),
      h('button', { 'data-m': 'md', onclick: () => { mode = 'md'; draw(); } }, 'Markdown'));

    view(
      h('div', { class: `dhead ${typeClass(e.type)}` },
        h('div', { class: 'metas' }, h('span', { class: 'meta-chip' }, dayLabel(e.date)), e.duration ? h('span', { class: 'meta-chip' }, e.duration) : null,
          e.source ? h('span', { class: 'meta-chip' }, e.source) : null, (e.tags || []).map((t) => h('span', { class: 'tag' }, '#' + t))),
        e.title ? h('h1', null, e.title) : null),
      h('p', { class: 'sub', style: 'margin-top:.6rem' }, e.exportedAt ? 'Exported. Still saved on this device.' : 'Saved on this device only. Export it to keep a copy.'),
      h('div', { class: 'btn-row', style: 'margin-top:1rem' },
        h('button', { class: 'btn', onclick: () => { download(file, 'text/markdown', md); markExported([e.id]); toast('Downloaded ' + file); } }, svg('download'), 'Download .md'),
        h('button', { class: 'btn secondary', onclick: () => navigator.clipboard.writeText(md).then(() => { markExported([e.id]); toast('Copied as markdown.'); }, () => toast('Copying was blocked by the browser.')) }, svg('copy'), 'Copy'),
        canShare ? h('button', { class: 'btn secondary', onclick: () => navigator.share({ files: [mkFile()] }).then(() => markExported([e.id])).catch(() => {}) }, svg('share'), 'Share') : null),
      seg, body,
      h('div', { class: 'btn-row', style: 'margin-top:1.5rem' },
        h('a', { class: 'btn secondary', href: `#/edit/${e.id}` }, svg('edit'), 'Edit'),
        h('button', { class: 'btn danger', onclick: () => deleteEntry(e) }, svg('trash'), 'Delete')));
    draw();
  }

  function deleteEntry(e) {
    setEntries(getEntries().filter((x) => x.id !== e.id));
    location.hash = '#/entries';
    toast('Entry deleted.', { label: 'Undo', run: () => { const l = getEntries(); l.push(e); setEntries(l); if (location.hash === '#/entries') entriesView(); } });
  }

  // --- more ---
  function moreView() {
    shell({ top: title('More'), tab: 'more' });
    const all = getEntries();
    const row = (icon, head, text, attrs) => h(attrs.href ? 'a' : 'button', Object.assign({ class: 'row-item' }, attrs),
      h('div', { class: 'ico' }, svg(icon)), h('div', { class: 'txt' }, h('strong', null, head), h('span', null, text)), svg('chevron'));
    view(
      h('h1', { class: 'h-lg', style: 'margin-top:.5rem' }, 'More'),
      h('div', { class: 'section' }, h('h2', null, 'About')),
      h('div', { class: 'rows' }, row('info', 'Why these questions', 'Where each question comes from, and its limits', { href: '#/about' })),
      h('div', { class: 'section' }, h('h2', null, 'Your data')),
      h('div', { class: 'rows' },
        row('download', 'Export all as .zip', all.length ? `${plural(all.length, 'entry', 'entries')}, in entries/YYYY/MM/ folders` : 'Nothing to export yet', { onclick: () => exportAll(), disabled: all.length ? null : true }),
        row('download', 'Backup (.json, encrypted)', 'A full copy, protected by your passphrase', { onclick: backup, disabled: all.length ? null : true }),
        h('label', { class: 'row-item', style: 'position:relative' },
          h('div', { class: 'ico' }, svg('upload')), h('div', { class: 'txt' }, h('strong', null, 'Restore a backup'), h('span', null, 'Adds entries from a .json backup')),
          h('input', { type: 'file', accept: 'application/json,.json', onchange: restore, style: 'position:absolute;inset:0;opacity:0;cursor:pointer', 'aria-label': 'Restore a backup file' }))),
      h('p', { class: 'sub', style: 'margin-top:.6rem' }, 'The .zip and .md exports are plain readable files, because they are meant for your second-brain repo. Treat them accordingly. Clearing browser data deletes your entries, so back up now and then.'),
      h('div', { class: 'section' }, h('h2', null, 'Security')),
      h('div', { class: 'rows' },
        row('lock', 'Lock now', 'Needs your passphrase to open again', { onclick: () => lockNow() }),
        row('key', 'Change passphrase', 'Re-encrypts everything with a new one', { href: '#/passphrase' })),
      h('div', { class: 'note', style: 'margin-top:.75rem' },
        h('strong', null, 'How your data is protected'),
        h('ul', null,
          h('li', null, 'Entries and drafts are stored encrypted (AES-256-GCM). The key comes from your passphrase and exists only in memory while the app is open.'),
          h('li', null, 'Other apps, other sites and anyone looking through this browser\'s storage see only unreadable data.'),
          h('li', null, 'The app locks itself after 2 minutes in the background.'),
          h('li', null, 'There is no way to recover a forgotten passphrase. That is what keeps it private.'),
          h('li', null, 'It cannot protect you from malware on your device, someone watching you type, or a weak passphrase.'))),
      !installed() && (deferredInstall || isIOS) ? [
        h('div', { class: 'section' }, h('h2', null, 'App')),
        h('div', { class: 'rows' }, deferredInstall
          ? row('phone', 'Install Second Brain', 'Add it to your home screen; works offline', { onclick: askInstall })
          : h('div', { class: 'row-item' }, h('div', { class: 'ico' }, svg('phone')), h('div', { class: 'txt' }, h('strong', null, 'Install on iPhone or iPad'), h('span', null, 'Tap Share, then "Add to Home Screen".'))))] : null);
  }

  function exportAll() {
    const list = getEntries(); if (!list.length) return;
    download(`second-brain-${today()}.zip`, 'application/zip', makeZip(list.map((e) => ({ name: entryPath(e, list), content: entryToMarkdown(e) }))));
    markExported(list.map((e) => e.id));
    toast(`Exported ${plural(list.length, 'entry', 'entries')}.`);
  }
  async function backup() {
    download(`second-brain-backup-${today()}.json`, 'application/json', await V.exportBackup());
    toast('Encrypted backup downloaded.');
  }
  function mergeEntries(incoming) {
    const have = getEntries(), ids = new Set(have.map((e) => e.id));
    const add = incoming.filter((e) => e && e.id && T[e.type] && e.date && Array.isArray(e.qa) && !ids.has(e.id));
    setEntries(have.concat(add));
    return add.length;
  }
  async function restore(ev) {
    const input = ev.target, file = input.files[0]; if (!file) return;
    try {
      const parsed = V.parseBackup(await file.text());
      let incoming;
      if (parsed.plain) incoming = parsed.plain; // an old, unencrypted backup: it is encrypted as it joins the vault
      else if (V.sameKeyAs(parsed.file)) incoming = await V.openBackup(parsed.file);
      else {
        const pass = await askPassphrase('This backup was made with a different passphrase. Enter the passphrase it was made with.');
        if (pass == null) return;
        incoming = await V.openBackup(parsed.file, pass);
      }
      const n = mergeEntries(incoming);
      toast(`Restored ${plural(n, 'entry', 'entries')}.`); moreView();
    } catch (e) { toast('Could not restore: wrong passphrase or not a valid backup.'); }
    input.value = '';
  }

  // --- about / sources ---
  function aboutView(focusType) {
    shell({ top: [backBtn('#/more', 'Back'), title('Why these questions')], tab: 'more' });
    view(
      h('h1', { class: 'h-lg', style: 'margin-top:.5rem' }, 'Why these questions'),
      h('p', { class: 'lead' }, 'Nothing here is made up. Every question traces to a published framework. The questions are plain-language adaptations of these works, not copies of any book\'s exact protocol.'),
      Object.entries(T).map(([key, t]) =>
        h('div', { class: `card src-card ${typeClass(key)}`, id: 'src-' + key, style: 'margin-top:.9rem' },
          h('h3', null, badge(key), t.label),
          h('p', { class: 'fw' }, 'Frameworks: ' + t.frameworks + '.'),
          h('ul', null, (window.SOURCES[key] || []).map((s) => h('li', null, s))))),
      h('div', { class: 'section' }, h('h2', null, 'Honest limits')),
      h('div', { class: 'note' }, h('ul', { style: 'margin:0' }, window.SOURCES_LIMITS.map((s) => h('li', null, s)))),
      h('p', { class: 'sub', style: 'margin-top:1rem' }, 'The small label under each question names the idea it comes from. "record" means the question only notes a fact.'));
    if (focusType && T[focusType]) { const el = document.getElementById('src-' + focusType); if (el) el.scrollIntoView(); }
  }

  // ====================== INTERVIEW ======================
  let session = null; // { type, idx, answers[], date, title, source, duration, editId, review }
  const persist = () => { if (session && !session.editId) setDraft(session); };

  function startOrResume(type) {
    const t = T[type]; if (!t) { location.hash = '#/'; return; }
    const draft = getDraft();
    if (session && session.type === type && !session.editId) { return session.review ? reviewView() : interviewView(); }
    if (draft && draft.type === type) { session = draft; return session.review ? reviewView() : interviewView(); }
    session = { type, idx: 0, answers: t.questions.map(() => ''), date: today() };
    if (draft) setDraft(null); // starting another type replaces the old draft (the banner offered Discard)
    if (t.checkInFrom) return habitChoiceView();
    persist(); interviewView();
  }

  function leave() {
    if (session && session.editId) { const id = session.editId; session = null; location.hash = `#/entry/${id}`; return; }
    persist(); session = null; toast('Draft saved. Continue from the home screen.'); location.hash = '#/';
  }

  function habitChoiceView() {
    const t = T.habit;
    shell({ top: [h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => { session = null; location.hash = '#/'; } }, svg('close')), title('Habit')], focus: true });
    view(
      h('div', { class: `qwrap ${typeClass('habit')}` },
        h('div', { class: 'question' }, 'Was this habit set up in an earlier entry?'),
        h('p', { class: 'hint' }, 'A check-in skips the set-up questions and starts with "did you do it?".'),
        h('button', { class: 'choice', onclick: () => { session.idx = t.checkInFrom - 1; persist(); interviewView(); } }, h('strong', null, 'Yes, check in'), h('span', null, `Start at question ${t.checkInFrom} of ${t.questions.length - 1}`)),
        h('button', { class: 'choice', onclick: () => { persist(); interviewView(); } }, h('strong', null, 'No, set up a new habit'), h('span', null, 'Start from the beginning'))));
  }

  function interviewView() {
    const t = T[session.type], total = t.questions.length, q = t.questions[session.idx];
    const isTags = q.kind === 'tags', last = session.idx === total - 1, review = !!session.review;
    session.review = review;
    const saved = h('span', null, '');
    let savedTimer;
    const input = isTags
      ? h('input', { class: 'answer', type: 'text', id: 'ans', autocomplete: 'off', style: 'min-height:56px;height:56px', placeholder: 'For example: flute, practice', value: session.answers[session.idx] })
      : h('textarea', { class: 'answer', id: 'ans', rows: 4, placeholder: 'Type in your own words, in any language', value: session.answers[session.idx], 'aria-describedby': 'hint' });
    const preview = h('div', { class: 'tagpreview' });
    const grow = () => { if (!isTags) { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight + 2, window.innerHeight * 0.5) + 'px'; } };
    const drawTags = () => preview.replaceChildren(...input.value.split(',').map((s) => s.trim()).filter(Boolean).map((s) => h('span', { class: 'tag' }, '#' + s)));
    input.addEventListener('input', () => {
      session.answers[session.idx] = input.value; persist(); grow(); if (isTags) drawTags();
      saved.textContent = 'Saved on this device'; clearTimeout(savedTimer); savedTimer = setTimeout(() => { saved.textContent = ''; }, 1500);
    });
    const go = (delta, skip) => {
      if (skip) { input.value = ''; session.answers[session.idx] = ''; }
      const next = session.idx + delta;
      if (review || next >= total) { session.review = true; persist(); return reviewView(); }
      if (next < 0) return leave();
      session.idx = next; persist(); interviewView();
    };
    input.addEventListener('keydown', (ev) => { if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') { ev.preventDefault(); go(1); } if (isTags && ev.key === 'Enter') { ev.preventDefault(); go(1); } });

    const why = [
      h('p', null, h('strong', null, 'Framework: '), t.frameworks + '.'),
      h('p', null, h('strong', null, 'This question: '), q.why === 'record' ? 'It only records a fact for the entry.' : q.why + '.'),
      h('p', null, h('a', { href: `#/about/${session.type}` }, 'See the full sources'), ' (your answers so far are kept).')
    ];

    shell({
      top: [h('button', { class: 'icon-btn', 'aria-label': review ? 'Back to review' : 'Close and save draft', onclick: () => (review ? (reviewView()) : leave()) }, svg(review ? 'back' : 'close')),
        h('div', { class: `progress ${typeClass(session.type)}`, role: 'progressbar', 'aria-valuemin': 1, 'aria-valuemax': total, 'aria-valuenow': session.idx + 1, 'aria-label': 'Progress' },
          t.questions.map((_, i) => h('i', { class: i < session.idx ? 'done' : i === session.idx ? 'now' : '' }))),
        h('span', { class: 'count' }, `${session.idx + 1}/${total}`)],
      focus: true
    });
    view(
      h('div', { class: `qwrap ${typeClass(session.type)}` },
        h('span', { class: 'qtype' }, svg(session.type), t.label),
        h('label', { class: 'question', for: 'ans' }, q.q),
        q.hint ? h('p', { class: 'hint', id: 'hint' }, q.hint) : null,
        input, isTags ? preview : null,
        h('div', { class: 'answer-foot' }, saved, window.matchMedia('(pointer: fine)').matches ? h('span', { class: 'kbd' }, 'Ctrl + Enter for next') : null),
        h('details', { class: 'why' }, h('summary', null, 'Why this question?'), h('div', { class: 'in' }, why))),
      h('div', { class: 'actionbar' },
        h('button', { class: 'btn secondary', onclick: () => (review ? reviewView() : go(-1)) }, review ? 'Cancel' : session.idx === 0 ? 'Close' : 'Back'),
        h('button', { class: 'btn ghost', onclick: () => go(1, true) }, 'Skip'),
        h('button', { class: 'btn primary', onclick: () => go(1) }, review ? 'Done' : last ? 'Review' : 'Next')));
    if (isTags) drawTags();
    grow();
    input.focus({ preventScroll: true });
    if (!isTags) input.setSelectionRange(input.value.length, input.value.length);
  }

  function reviewView() {
    const t = T[session.type];
    session.review = true; persist();
    const edit = !!session.editId;
    shell({ top: [h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: leave }, svg('close')), title(edit ? 'Edit entry' : 'Review')], focus: true });
    const field = (id, label, hint, type) => h('label', { class: 'field' }, label,
      h('input', { type: type || 'text', value: session[id] || '', oninput: (ev) => { session[id] = ev.target.value; persist(); } }), hint ? h('small', null, hint) : null);
    const skippedAll = t.questions.every((q, i) => !(session.answers[i] || '').trim());
    view(
      h('div', { class: `qwrap ${typeClass(session.type)}` },
        h('span', { class: 'qtype' }, svg(session.type), t.label),
        h('h1', { class: 'h-lg', style: 'margin:.75rem 0 .25rem' }, edit ? 'Edit your answers' : 'Check your entry'),
        h('p', { class: 'lead', style: 'margin-bottom:.5rem' }, 'Tap Edit to change an answer. Skipped questions are left out of the saved entry.'),
        t.questions.map((q, i) => {
          const a = (session.answers[i] || '').trim();
          return h('div', { class: 'qa' },
            h('button', { class: 'btn sm secondary edit', onclick: () => { session.idx = i; interviewView(); } }, a ? 'Edit' : 'Answer'),
            h('div', { class: 'q' }, stripOptional(q.q)),
            h('div', { class: 'a' + (a ? '' : ' skipped') }, a || 'Skipped'));
        }),
        h('div', { class: 'section' }, h('h2', null, 'Details (optional)')),
        field('title', 'Title', 'In your own words. Used in the file name.'),
        session.type === 'learning' ? field('source', 'Source', 'Name, URL or author.') : null,
        session.type === 'session' || session.type === 'learning' ? field('duration', 'Duration', 'For example 1h or 2h.') : null,
        field('date', 'Date', null, 'date')),
      h('div', { class: 'actionbar' },
        h('button', { class: 'btn secondary', onclick: () => { session.review = false; session.idx = edit ? 0 : t.questions.length - 1; interviewView(); } }, 'Back'),
        h('button', { class: 'btn primary', onclick: () => (skippedAll ? toast('Every question was skipped, so there is nothing to save.') : saveEntry()) }, edit ? 'Save changes' : 'Save entry')));
  }

  function saveEntry() {
    const t = T[session.type], qa = [], tags = [];
    t.questions.forEach((q, i) => {
      const a = (session.answers[i] || '').replace(/\s+$/g, '');
      if (!a.trim()) return;
      if (q.kind === 'tags') a.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => tags.push(s));
      else qa.push({ q: stripOptional(q.q), a });
    });
    const list = getEntries(), old = session.editId ? list.find((x) => x.id === session.editId) : null;
    const entry = {
      id: old ? old.id : uid(), created: old ? old.created : Date.now(), type: session.type, date: session.date || today(),
      title: (session.title || '').trim(), source: (session.source || '').trim(), duration: (session.duration || '').trim(),
      tags, qa, ans: session.answers.slice()
    };
    const next = old ? list.map((x) => (x.id === old.id ? entry : x)) : list.concat(entry);
    if (!setEntries(next)) return;
    setDraft(null); session = null;
    toast(old ? 'Changes saved.' : 'Entry saved.');
    location.hash = `#/entry/${entry.id}`;
  }

  function editView(id) {
    const e = getEntries().find((x) => x.id === id);
    if (!e || !T[e.type]) { location.hash = '#/entries'; return; }
    if (!session || session.editId !== id) {
      session = { type: e.type, idx: 0, answers: answersOf(e), date: e.date, title: e.title, source: e.source, duration: e.duration, editId: id, review: true };
    }
    reviewView();
  }

  // ====================== ROUTER ======================
  function route() {
    if (!V.unlocked) return boot();
    const [, kind, arg] = location.hash.match(/^#\/(\w*)\/?([\w-]*)/) || [];
    // leaving an unsaved edit by navigating elsewhere drops it
    if (session && session.editId && !(kind === 'edit' && arg === session.editId)) session = null;
    if (kind !== 'entries' && kind !== 'entry') { filters.q = ''; filters.type = 'all'; }
    switch (kind) {
      case 'new': return startOrResume(arg);
      case 'edit': return editView(arg);
      case 'entry': return entryView(arg);
      case 'entries': return entriesView();
      case 'more': return moreView();
      case 'passphrase': return changePassView();
      case 'about': return aboutView(arg);
      default: return homeView();
    }
  }
  window.addEventListener('hashchange', route);

  // ====================== VAULT (set up, lock, unlock) ======================
  let resumeHash = '';

  function boot() {
    if (!V.supported) return unsupportedView();
    return V.exists() ? lockView() : setupView();
  }

  function unsupportedView() {
    shell({ top: logo(), focus: true });
    view(h('div', { class: 'empty' }, h('div', { class: 'badge' }, svg('lock')), h('h3', null, 'This browser cannot encrypt your notes'),
      h('p', null, 'Second Brain needs a secure connection (https) and a current browser so it can keep your entries private. Open it from its normal address in an up-to-date browser.')));
  }

  function passField(label, autocomplete, onInput) {
    const input = h('input', { type: 'password', autocomplete, required: true, 'aria-label': label, oninput: onInput });
    const tog = h('button', { type: 'button', class: 'btn ghost sm', 'aria-pressed': 'false', onclick: () => {
      const show = input.type === 'password'; input.type = show ? 'text' : 'password'; tog.textContent = show ? 'Hide' : 'Show'; tog.setAttribute('aria-pressed', String(show)); } }, 'Show');
    return { input, el: h('label', { class: 'field' }, label, h('div', { class: 'pass' }, input, tog)) };
  }
  const MIN_PASS = 8;
  const strength = (p) => (!p ? '' : p.length < MIN_PASS ? `At least ${MIN_PASS} characters (${p.length} so far).` : p.length < 12 ? 'Okay. A longer phrase is stronger.' : 'Good length.');

  // Shared by set-up and change-passphrase: two matching, long-enough fields.
  function newPassFields(labelA, labelB) {
    const hint = h('small', { 'aria-live': 'polite' }, '');
    const a = passField(labelA, 'new-password', () => { hint.textContent = strength(a.input.value); });
    const b = passField(labelB, 'new-password');
    const valid = () => {
      if (a.input.value.length < MIN_PASS) { toast(`Use at least ${MIN_PASS} characters.`); a.input.focus(); return null; }
      if (a.input.value !== b.input.value) { toast('The two passphrases do not match.'); b.input.focus(); return null; }
      return a.input.value;
    };
    return { nodes: [a.el, hint, b.el], valid, first: a.input };
  }

  function setupView() {
    const legacy = V.legacy();
    shell({ top: logo(), focus: true });
    const fields = newPassFields('Choose a passphrase', 'Type it again');
    const ack = h('input', { type: 'checkbox', id: 'ack', required: true });
    const go = h('button', { class: 'btn block', type: 'submit', style: 'margin-top:1.25rem' }, 'Create passphrase and continue');
    const form = h('form', { onsubmit: async (ev) => {
      ev.preventDefault();
      const pass = fields.valid(); if (!pass) return;
      go.disabled = true; go.textContent = 'Encrypting...';
      try { await V.create(pass, legacy || undefined); route(); }
      catch (e) { go.disabled = false; go.textContent = 'Create passphrase and continue'; toast('Could not set up encryption on this device.'); }
    } }, fields.nodes,
      h('label', { class: 'check' }, ack, h('span', null, 'I understand that if I forget this passphrase, my entries cannot be recovered by anyone.')), go);
    const restoreInput = h('input', { type: 'file', accept: 'application/json,.json', 'aria-label': 'Restore an encrypted backup', onchange: async (ev) => {
      const input = ev.target, file = input.files[0]; if (!file) return;
      try {
        const parsed = V.parseBackup(await file.text());
        if (!parsed.file) throw new Error('plain');
        const pass = await askPassphrase('Enter the passphrase this backup was made with. It becomes the passphrase for this device.');
        if (pass == null) return;
        await V.createFromBackup(parsed.file, pass); route();
      } catch (e) { toast('Could not restore: wrong passphrase, or not an encrypted backup.'); }
      input.value = '';
    } });

    view(h('div', { class: 'lockwrap' },
      h('div', { class: 'badge lockbadge' }, svg('shield')),
      h('h1', { class: 'h-lg' }, 'Protect your notebook'),
      h('p', { class: 'lead' }, 'Your entries are encrypted on this device with a passphrase that only you know. Without it, nobody can read them, not even this app.'),
      legacy && legacy.entries.length ? h('p', { class: 'banner' }, `Your ${plural(legacy.entries.length, 'existing entry', 'existing entries')} will be encrypted too.`) : null,
      form,
      h('div', { class: 'section' }, h('h2', null, 'Already have a backup?')),
      h('label', { class: 'btn secondary file block' }, svg('upload'), 'Restore an encrypted backup', restoreInput)));
    fields.first.focus();
  }

  function lockView(message) {
    shell({ top: logo(), focus: true });
    const err = h('p', { class: 'error', role: 'alert' }, message || '');
    const pf = passField('Passphrase', 'current-password');
    const go = h('button', { class: 'btn block', type: 'submit', style: 'margin-top:1.25rem' }, 'Unlock');
    const form = h('form', { onsubmit: async (ev) => {
      ev.preventDefault();
      go.disabled = true; go.textContent = 'Unlocking...'; err.textContent = '';
      try {
        await V.unlock(pf.input.value);
        if (resumeHash) { history.replaceState(null, '', resumeHash); resumeHash = ''; }
        route();
      } catch (e) {
        go.disabled = false; go.textContent = 'Unlock'; pf.input.value = ''; pf.input.focus();
        err.textContent = 'That passphrase did not work. Try again.';
      }
    } }, pf.el, err, go);
    view(h('div', { class: 'lockwrap' },
      h('div', { class: 'badge lockbadge' }, svg('lock')),
      h('h1', { class: 'h-lg' }, 'Enter your passphrase'),
      h('p', { class: 'lead' }, 'Your notebook is locked.'),
      form,
      h('details', { class: 'why' }, h('summary', null, 'Forgot your passphrase?'),
        h('div', { class: 'in' },
          h('p', null, 'It cannot be recovered or reset, because nobody else has a key. If you have an encrypted backup, you will still need the passphrase it was made with.'),
          h('p', null, 'You can erase everything on this device and start fresh. If you exported your entries as .md or .zip files, those are still safe.'),
          h('button', { class: 'btn danger sm', style: 'margin-top:.75rem', onclick: () => {
            if (confirm('Erase ALL entries on this device? This cannot be undone.') && confirm('Really erase everything and start over?')) { V.erase(); resumeHash = ''; location.hash = '#/'; setupView(); }
          } }, 'Erase everything on this device')))));
    pf.input.focus();
  }

  async function lockNow() {
    resumeHash = location.hash;
    await V.lock();
    session = null;
    document.getElementById('toast').hidden = true;
    lockView();
  }

  function changePassView() {
    shell({ top: [backBtn('#/more', 'Back'), title('Change passphrase')], tab: 'more' });
    const cur = passField('Current passphrase', 'current-password');
    const fresh = newPassFields('New passphrase', 'Type the new one again');
    const go = h('button', { class: 'btn block', type: 'submit', style: 'margin-top:1.25rem' }, 'Change passphrase');
    view(h('h1', { class: 'h-lg', style: 'margin-top:.5rem' }, 'Change passphrase'),
      h('p', { class: 'lead' }, 'Everything is re-encrypted with the new passphrase. Older encrypted backups still need the passphrase they were made with.'),
      h('form', { onsubmit: async (ev) => {
        ev.preventDefault();
        const pass = fresh.valid(); if (!pass) return;
        go.disabled = true; go.textContent = 'Re-encrypting...';
        try { await V.changePassphrase(cur.input.value, pass); toast('Passphrase changed.'); location.hash = '#/more'; }
        catch (e) { go.disabled = false; go.textContent = 'Change passphrase'; toast('The current passphrase did not work.'); cur.input.focus(); }
      } }, cur.el, fresh.nodes, go));
  }

  // A small modal to ask for one passphrase. Resolves with the text, or null if cancelled.
  function askPassphrase(message) {
    return new Promise((resolve) => {
      const pf = passField('Passphrase', 'current-password');
      const done = (v) => { overlay.remove(); resolve(v); };
      const overlay = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Passphrase needed' },
        h('form', { class: 'sheet', onsubmit: (ev) => { ev.preventDefault(); done(pf.input.value); } },
          h('p', null, message), pf.el,
          h('div', { class: 'btn-row', style: 'margin-top:1rem' }, h('button', { class: 'btn', type: 'submit' }, 'Continue'), h('button', { class: 'btn ghost', type: 'button', onclick: () => done(null) }, 'Cancel'))));
      document.body.append(overlay); pf.input.focus();
    });
  }

  // Lock after time in the background; always flush pending writes when the page is hidden.
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); V.flush(); }
    else if (V.unlocked && hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS) lockNow();
  });
  window.addEventListener('pagehide', () => { V.flush(); });

  route();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
