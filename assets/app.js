/* Second Brain: a daily to-do list that carries unfinished tasks forward, and a notebook that asks the questions
   from templates.js one at a time and stores the answers exactly as typed.
   It never writes, suggests or rewrites anything. Entries live in this browser, encrypted with a device
   key (see vault.js; the owner can add a passphrase lock), and leave only when you download, copy or share them. */
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
    plus: '<path d="M12 5v14M5 12h14"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
    dusk: '<path d="M4 18h16M7.5 18a4.5 4.5 0 0 1 9 0M12 8v2M5 11.5l1.4 1.4M19 11.5l-1.4 1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    archive: '<path d="M4 7h16v4H4zM6 11v8h12v-8M10 15h4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    arrowup: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    review: '<path d="M5 20V11M12 20V5M19 20v-6"/>',
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
  const logo = () => h('span', { class: 'wordmark' }, h('i', null, svg('check')), 'Second Brain');
  const title = (t) => h('div', { class: 'title' }, t);
  const backBtn = (href, label) => h('a', { class: 'icon-btn', href, 'aria-label': label || 'Back' }, svg('back'));
  function view(...nodes) {
    // sticky bars live outside the animated wrapper, so the wrapper's animation can never trap them
    const flat = nodes.flat(Infinity).filter(Boolean), isBar = (n) => n.classList && (n.classList.contains('actionbar') || n.classList.contains('addbar'));
    const bars = flat.filter(isBar);
    app.replaceChildren(h('div', { class: 'view' + (quiet ? ' quiet' : '') }, flat.filter((n) => !isBar(n))), ...bars);
    if (!quiet) window.scrollTo(0, 0);
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

  // ====================== TO-DOS ======================
  const Tk = window.Tasks, Tr = window.Tracking;
  const getTasks = () => { if (!V.state) return []; return V.state.tasks || (V.state.tasks = []); };
  const saveTasks = () => V.touch(0);
  // Habits, check-ins and meals (see assets/tracking.js). A vault saved before they existed simply has none.
  const getHabits = () => { if (!V.state) return []; return V.state.habits || (V.state.habits = []); };
  const getHabitLogs = () => { if (!V.state) return []; return V.state.habitLogs || (V.state.habitLogs = []); };
  const getMeals = () => { if (!V.state) return []; return V.state.meals || (V.state.meals = []); };
  const saveTracking = () => V.touch(0);
  let shownDay = today();            // the day the screen was drawn for; used to redraw after midnight
  const addState = { text: '', tomorrow: false };
  const shortDay = (s) => { try { return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(parseDate(s)); } catch (e) { return s; } };
  const longDay = (s) => { try { return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: s.slice(0, 4) === today().slice(0, 4) ? undefined : 'numeric' }).format(parseDate(s)); } catch (e) { return s; } };
  const weekday = (s) => { try { return new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(parseDate(s)); } catch (e) { return ''; } };
  const firstLine = (s) => (s || '').split('\n')[0].trim();

  function taskMeta(t, t0) {
    const bits = [];
    if (t.done) { if (t.plan0 < t.doneDate) bits.push(h('span', { class: 'age' }, `From ${shortDay(t.plan0)}`)); }
    else if (t.plan > t0) bits.push(h('span', null, `Planned ${dayLabel(t.plan)}`));
    else if (t.plan0 < t0) bits.push(h('span', { class: 'age' }, `From ${shortDay(t.plan0)} · ${plural(Tk.carriedDays(t, t0), 'day')}`));
    if (t.note) bits.push(h('span', null, firstLine(t.note)));
    return bits.length ? h('div', { class: 'meta' }, bits) : null;
  }

  // Redraw the Today screen without jumping to the top or replaying the entrance animation.
  function redrawToday(...focusKeys) { const y = window.scrollY; quiet = true; todayView(); quiet = false; window.scrollTo(0, y); if (focusKeys.length) focusByKey(...focusKeys); }
  let quiet = false;

  function taskRow(t, t0) {
    const toggle = () => { if (t.done) Tk.reopen(t); else Tk.complete(t, today(), Date.now()); saveTasks(); redrawToday(); };
    const carried = !t.done && t.plan < t0;
    return h('li', { class: 'task' + (t.done ? ' done' : '') },
      h('button', { class: 'cb', role: 'checkbox', 'aria-checked': String(!!t.done), 'aria-label': (t.done ? 'Mark not done: ' : 'Mark done: ') + t.title, onclick: toggle }, svg('check')),
      h('button', { class: 'body', onclick: () => taskSheet(t, redrawToday), 'aria-label': 'Edit task: ' + t.title }, h('div', { class: 'ttl' }, t.title), taskMeta(t, t0)),
      carried ? h('button', { class: 'link-btn', onclick: () => { Tk.doToday(t, today()); saveTasks(); redrawToday(); } }, 'Do today') : null);
  }

  function todayView() {
    shownDay = today();
    const t0 = shownDay, tasks = getTasks(), v = Tk.today(tasks, t0);
    const draft = getDraft();
    let installDismissed = false; try { installDismissed = sessionStorage.getItem('sb.noinstall') === '1'; } catch (e) { /* ignore */ }
    const openCount = v.carried.length + v.planned.length, doneCount = v.done.length, total = openCount + doneCount;

    shell({ top: [h('span', { class: 'wordmark' }, h('i', null, svg('check')), 'Second Brain'), h('span', { class: 'spacer' }), total ? h('a', { class: 'link-btn', href: '#/close' }, 'Close the day') : null], tab: 'today' });

    const input = h('input', { type: 'text', placeholder: 'Add a task', maxlength: 300, 'aria-label': 'New task', autocomplete: 'off', enterkeyhint: 'done', value: addState.text, oninput: (e) => { addState.text = e.target.value; } });
    const when = h('button', { type: 'button', class: 'when', 'aria-pressed': String(addState.tomorrow), 'aria-label': 'Plan for ' + (addState.tomorrow ? 'tomorrow' : 'today') + ' (tap to change)', onclick: () => { addState.tomorrow = !addState.tomorrow; when.textContent = addState.tomorrow ? 'Tomorrow' : 'Today'; when.setAttribute('aria-pressed', String(addState.tomorrow)); input.focus(); } }, addState.tomorrow ? 'Tomorrow' : 'Today');
    const bar = h('form', { class: 'addbar', onsubmit: (ev) => {
      ev.preventDefault();
      const text = input.value.trim(); if (!text) return;
      tasks.push(Tk.make(text, addState.tomorrow ? Tk.addDays(t0, 1) : t0, t0, Date.now()));
      addState.text = ''; saveTasks(); redrawToday();
      const next = document.querySelector('.addbar input'); if (next) next.focus();
    } }, h('div', { class: 'field-wrap' }, input, when), h('button', { class: 'btn go', type: 'submit', 'aria-label': 'Add task' }, svg('arrowup')));

    const list = (arr) => h('ul', { class: 'tasks' }, arr.map((t) => taskRow(t, t0)));
    const pct = total ? Math.round((doneCount / total) * 100) : 0;

    view(
      h('div', { class: 'today-head' },
        h('div', null, h('div', { class: 'eyebrow' }, weekday(t0)), h('h1', { class: 'page-title' }, longDay(t0))),
        total ? h('div', { class: 'right progress-text' }, h('b', null, doneCount), ` of ${total} done`) : null),
      total ? h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': doneCount, 'aria-label': 'Tasks done today' }, h('i', { style: `width:${pct}%` })) : null,

      draft && T[draft.type] ? h('div', { class: `banner ${typeClass(draft.type)}` },
        h('div', { class: 'grow' }, h('strong', null, `Unfinished ${T[draft.type].label.toLowerCase()} note`), h('span', { class: 'sub' }, `Question ${draft.idx + 1} of ${T[draft.type].questions.length}`)),
        h('a', { class: 'btn sm', href: `#/new/${draft.type}` }, 'Continue'),
        h('button', { class: 'icon-btn', 'aria-label': 'Discard draft', onclick: () => discardDraft() }, svg('trash'))) : null,
      deferredInstall && !installDismissed && !installed() ? h('div', { class: 'banner' },
        h('div', { class: 'grow' }, h('strong', null, 'Install Second Brain'), h('span', { class: 'sub' }, 'Open it like an app, even offline.')),
        h('button', { class: 'btn sm', onclick: askInstall }, 'Install'),
        h('button', { class: 'icon-btn', 'aria-label': 'Dismiss', onclick: () => { try { sessionStorage.setItem('sb.noinstall', '1'); } catch (e) { /* ignore */ } todayView(); } }, svg('close'))) : null,
      habitsSection(t0),
      mealsSection(t0),
      v.carried.length ? [h('div', { class: 'section' }, h('h2', null, 'Carried over'), h('span', { class: 'count-chip' }, v.carried.length)), list(v.carried)] : null,
      h('div', { class: 'section' }, h('h2', null, 'Today'), h('span', { class: 'count-chip' }, v.planned.length || '')),
      v.planned.length ? list(v.planned) : h('p', { class: 'empty-line' }, total ? (openCount ? 'Nothing else planned for today.' : 'Everything planned is done.') : 'Nothing planned yet. Add your first task below. Whatever you do not finish carries over to the next day.'),
      v.later.length ? h('details', { class: 'fold' }, h('summary', null, h('h2', null, 'Later'), h('span', { class: 'count-chip' }, v.later.length)), list(v.later)) : null,
      v.done.length ? h('details', { class: 'fold', open: openCount === 0 ? true : null }, h('summary', null, h('h2', null, 'Done'), h('span', { class: 'count-chip' }, v.done.length)), list(v.done)) : null,
      V.currentMode() === 'device' && !V.state.tipDismissed ? h('div', { class: 'banner' },
        h('div', { class: 'grow' }, h('strong', null, 'Add a passphrase lock?'), h('span', { class: 'sub' }, 'Optional. Worth it if others use this phone.')),
        h('a', { class: 'btn sm', href: '#/passphrase' }, 'Set up'),
        h('button', { class: 'icon-btn', 'aria-label': 'Dismiss', onclick: () => { V.state.tipDismissed = true; V.touch(0); todayView(); } }, svg('close'))) : null,
      bar);
  }

  // A sheet for one task: edit the words, or move it. Words are kept exactly as typed.
  function taskSheet(t, after) {
    const t0 = today();
    const title = h('input', { type: 'text', value: t.title, maxlength: 300 });
    const note = h('textarea', { placeholder: 'Optional', maxlength: 2000 }, t.note || '');
    const date = h('input', { type: 'date', min: Tk.addDays(t0, 1), 'aria-label': 'Move to date' });
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (ev) => { if (ev.key === 'Escape') close(); };
    const commit = (fn) => { const w = title.value.trim(); if (w) t.title = w; t.note = note.value.trim(); fn && fn(); saveTasks(); close(); after && after(); };
    const open = Tk.isOpen(t);
    const acts = [];
    if (open && t.plan !== t0) acts.push(h('button', { class: 'btn secondary', type: 'button', onclick: () => commit(() => Tk.doToday(t, t0)) }, 'Do today'));
    if (open && t.plan !== Tk.addDays(t0, 1)) acts.push(h('button', { class: 'btn secondary', type: 'button', onclick: () => commit(() => Tk.moveTo(t, Tk.addDays(t0, 1), t0)) }, 'Tomorrow'));
    if (t.done) acts.push(h('button', { class: 'btn secondary', type: 'button', onclick: () => commit(() => Tk.reopen(t)) }, 'Mark not done'));
    if (t.dropped) acts.push(h('button', { class: 'btn secondary', type: 'button', onclick: () => commit(() => Tk.restore(t)) }, 'Restore'));
    if (open) acts.push(h('button', { class: 'btn secondary', type: 'button', onclick: () => commit(() => Tk.drop(t, t0, Date.now())) }, 'Drop'));
    acts.push(h('button', { class: 'btn danger', type: 'button', onclick: () => {
      const list = getTasks(), i = list.indexOf(t); list.splice(i, 1); saveTasks(); close(); after && after();
      toast('Task deleted.', { label: 'Undo', run: () => { list.splice(Math.min(i, list.length), 0, t); saveTasks(); after && after(); } });
    } }, 'Delete'));
    const overlay = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Task', onclick: (ev) => { if (ev.target === overlay) close(); } },
      h('form', { class: 'sheet', onsubmit: (ev) => { ev.preventDefault(); commit(); } },
        h('h3', null, 'Edit task'),
        h('label', { class: 'field', style: 'margin-top:0' }, 'Title', title), h('label', { class: 'field' }, 'Note', note),
        open ? h('div', { class: 'field' }, 'Move to a date', h('div', { class: 'pass' }, date, h('button', { class: 'btn secondary', type: 'button', onclick: () => { if (date.value && date.value > t0) commit(() => Tk.moveTo(t, date.value, t0)); else toast('Pick a day after today.'); } }, 'Move'))) : null,
        h('div', { class: 'acts' }, acts),
        h('div', { class: 'btn-row', style: 'margin-top:1rem' }, h('button', { class: 'btn', type: 'submit' }, 'Save'), h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Cancel'))));
    document.addEventListener('keydown', onKey);
    document.body.append(overlay); title.focus();
  }

  // ====================== HABITS ======================
  const PART_LABEL = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
  const PART_HINT = { morning: 'before 12', afternoon: '12 to 5', evening: 'after 5' };
  const PART_ICON = { morning: 'sun', afternoon: 'dusk', evening: 'moon' };
  const ic = (name) => { const s = svg(name); s.setAttribute('class', 'ic'); return s; };
  const focusByKey = (...keys) => { for (const k of keys) { const el = document.querySelector(`[data-focus-key="${k}"]`); if (el && !el.disabled) { el.focus(); return true; } } return false; };
  const fullDay = (d) => `${weekday(d)}, ${longDay(d)}`;

  // A bottom sheet. While it is open the page behind it is inert, Escape closes it, and focus goes back to the control
  // that opened it (found again by its data-focus-key, because the screen behind may have been redrawn).
  function openSheet(label, build) {
    const opener = document.activeElement, key = opener && opener.getAttribute ? opener.getAttribute('data-focus-key') : null;
    const page = document.getElementById('shell');
    document.getElementById('toast').hidden = true; // a toast would sit on top of the sheet
    const overlay = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': label, onclick: (ev) => { if (ev.target === overlay) close(); } });
    const onKey = (ev) => { if (ev.key === 'Escape') close(); };
    function close() {
      overlay.remove(); document.removeEventListener('keydown', onKey); page.inert = false;
      if (!(key && focusByKey(key)) && opener && opener.isConnected) opener.focus();
    }
    overlay.append(build(close));
    document.addEventListener('keydown', onKey); page.inert = true; document.body.append(overlay);
    const first = overlay.querySelector('input, button'); if (first) first.focus();
    return close;
  }

  // One tap on the checkbox logs today, with the time of day from the clock. Undo is always offered.
  function toggleHabit(hb, date, afterKey) {
    const logs = getHabitLogs(), existing = Tr.findLog(logs, hb.id, date);
    if (existing) {
      const removed = Tr.unlogHabit(logs, hb.id, date); saveTracking(); redrawToday(afterKey);
      toast(`${hb.name} unmarked.`, { label: 'Undo', run: () => { getHabitLogs().push(removed); saveTracking(); route(); } });
    } else {
      const part = hb.trackTime ? Tr.partOfDay(new Date()) : null;
      Tr.logHabit(logs, hb.id, date, { part }, Date.now()); saveTracking(); redrawToday(afterKey);
      toast(`${hb.name} done${part ? ', ' + PART_LABEL[part].toLowerCase() : ''}.`, { label: 'Undo', run: () => { Tr.unlogHabit(getHabitLogs(), hb.id, date); saveTracking(); route(); } });
    }
  }

  function habitRow(hb, t0, logs) {
    const log = Tr.findLog(logs, hb.id, t0), dots = Tr.weekDots(hb.id, logs, t0), cbKey = `habit-cb-${hb.id}`, chipKey = `habit-chip-${hb.id}`;
    const chip = log && hb.trackTime
      ? h('button', { class: 'when-chip', type: 'button', 'data-focus-key': chipKey, 'aria-label': `${hb.name}, ${log.part ? PART_LABEL[log.part] : 'no time set'}. Change the time of day`,
        onclick: () => habitTimeSheet(hb, t0, () => redrawToday(chipKey)) }, log.part ? [ic(PART_ICON[log.part]), PART_LABEL[log.part]] : 'Add time')
      : null;
    return h('div', { class: 'habit' },
      h('button', { class: 'cb', type: 'button', role: 'checkbox', 'aria-checked': String(!!log), 'aria-label': `Mark ${hb.name} ${log ? 'not done' : 'done'}`, 'data-focus-key': cbKey, onclick: () => toggleHabit(hb, t0, cbKey) }, svg('check')),
      h('div', { class: 'name' }, h('b', null, hb.name), chip || h('small', null, log ? 'Done today' : 'Not yet today')),
      h('div', { class: 'dots', role: 'img', 'aria-label': `Last 7 days: ${dots.filter((d) => d.done).length} of 7 days` }, dots.map((d) => h('i', { class: (d.done ? 'on' : '') + (d.today ? ' now' : '') }))));
  }

  // The Habits section on Today. With no habits it is just a prompt to add one.
  function habitsSection(t0) {
    const habits = Tr.activeHabits(getHabits()), logs = getHabitLogs();
    const doneCount = habits.filter((hb) => Tr.findLog(logs, hb.id, t0)).length;
    return [
      h('div', { class: 'section' }, h('h2', null, 'Habits'),
        habits.length ? h('span', { class: 'count-chip' }, `${doneCount} of ${habits.length}`) : null,
        habits.length ? h('a', { class: 'push link-btn', href: '#/habits', 'data-focus-key': 'habits-edit' }, 'Edit') : null),
      habits.length ? null : h('p', { class: 'empty-line' }, 'Track something you want to do regularly, like the gym or reading.'),
      habits.map((hb) => habitRow(hb, t0, logs)),
      h('div', { class: 'link-row' }, h('button', { class: 'link-btn', type: 'button', 'data-focus-key': 'add-habit', onclick: () => habitEditorSheet(null, () => redrawToday('add-habit')) }, habits.length ? '+ Add habit' : '+ Add a habit'))
    ];
  }

  // Set or change the time of day and note for one habit on one day (today, or a past day from Review), or remove the log.
  function habitTimeSheet(hb, date, after) {
    const existing = Tr.findLog(getHabitLogs(), hb.id, date), isToday = date === today();
    let part = existing ? existing.part : null;
    const note = h('input', { type: 'text', value: existing ? existing.note : '', maxlength: 1000, placeholder: 'Optional. What did you do?', autocomplete: 'off' });
    return openSheet(`${hb.name}, ${dayLabel(date)}`, (close) => {
      const btns = Tr.PARTS.map((k) => h('button', { type: 'button', class: 'bigbtn', 'data-part': k, 'aria-pressed': String(part === k), onclick: () => { part = k; btns.forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-part') === part))); } },
        ic(PART_ICON[k]), PART_LABEL[k], h('small', null, PART_HINT[k])));
      const save = () => { Tr.logHabit(getHabitLogs(), hb.id, date, { part: hb.trackTime ? part : null, note: note.value }, Date.now()); saveTracking(); close(); after && after(); };
      const remove = () => {
        const removed = Tr.unlogHabit(getHabitLogs(), hb.id, date); saveTracking(); close(); after && after();
        if (removed) toast(`${hb.name} unmarked for ${dayLabel(date)}.`, { label: 'Undo', run: () => { getHabitLogs().push(removed); saveTracking(); route(); } });
      };
      return h('form', { class: 'sheet', onsubmit: (ev) => { ev.preventDefault(); save(); } },
        h('h3', null, hb.name, h('small', null, fullDay(date))),
        hb.trackTime ? [h('div', { class: 'eyebrow', style: 'margin-top:.9rem' }, 'When did you do it?'), h('div', { class: 'big3', role: 'group', 'aria-label': 'Time of day' }, btns)] : null,
        h('label', { class: 'field' }, 'Note', note),
        h('div', { class: 'btn-row', style: 'margin-top:1rem' }, h('button', { class: 'btn', type: 'submit', style: 'flex:1' }, 'Save'),
          existing ? h('button', { class: 'btn danger', type: 'button', onclick: remove }, isToday ? "Remove today's log" : "Remove this day's log") : h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Cancel')));
    });
  }

  // Add a habit (habit is null) or edit one.
  function habitEditorSheet(habit, after) {
    const editing = !!habit; let trackTime = editing ? habit.trackTime : true, goal = editing ? habit.weeklyGoal : null;
    const SUGGESTIONS = ['Gym', 'Walk', 'Read', 'Stretch', 'Water', 'Meditate'];
    return openSheet(editing ? 'Edit habit' : 'New habit', (close) => {
      const nameIn = h('input', { type: 'text', maxlength: 60, value: editing ? habit.name : '', placeholder: 'For example: Gym', autocomplete: 'off', 'aria-describedby': 'habit-msg' });
      const err = h('div', { class: 'form-msg err', id: 'habit-msg', role: 'alert' }, ''), warn = h('div', { class: 'form-msg info', 'aria-live': 'polite' }, '');
      const chips = SUGGESTIONS.map((s) => h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => { nameIn.value = s; sync(); nameIn.focus(); } }, s));
      const sync = () => {
        err.textContent = '';
        const v = nameIn.value.trim().toLowerCase();
        chips.forEach((c) => c.setAttribute('aria-pressed', String(!!v && c.textContent.toLowerCase() === v)));
        const dup = v && getHabits().some((x) => x !== habit && x.name.toLowerCase() === v);
        warn.textContent = dup ? `You already have a habit called "${nameIn.value.trim()}". You can still add it.` : '';
      };
      nameIn.addEventListener('input', sync);
      const sw = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(trackTime), 'aria-label': 'Track time of day', onclick: () => { trackTime = !trackTime; sw.setAttribute('aria-checked', String(trackTime)); } });
      const goalVal = h('span', { style: 'min-width:4.6rem;white-space:nowrap', 'aria-live': 'polite' }, '');
      const showGoal = () => { goalVal.textContent = goal ? `${goal} ${goal === 1 ? 'day' : 'days'}` : 'None'; less.disabled = goal === null; more.disabled = goal === 7; };
      const less = h('button', { type: 'button', 'aria-label': 'Fewer days a week', onclick: () => { goal = goal === null ? null : goal === 1 ? null : goal - 1; showGoal(); } }, '–');
      const more = h('button', { type: 'button', 'aria-label': 'More days a week', onclick: () => { goal = goal === null ? 3 : Math.min(7, goal + 1); showGoal(); } }, '+');
      showGoal();
      const submit = () => {
        const name = nameIn.value.trim();
        if (!name) { err.textContent = 'Give the habit a name.'; nameIn.focus(); return; }
        if (editing) Tr.updateHabit(habit, { name, trackTime, weeklyGoal: goal });
        else getHabits().push(Tr.makeHabit(name, { trackTime, weeklyGoal: goal, order: Tr.nextOrder(getHabits()) }, today(), Date.now()));
        saveTracking(); close(); after && after();
      };
      return h('form', { class: 'sheet', onsubmit: (ev) => { ev.preventDefault(); submit(); } },
        h('h3', null, editing ? 'Edit habit' : 'New habit'),
        h('label', { class: 'field', style: 'margin-top:.2rem' }, 'What do you want to track?', nameIn), err, warn,
        editing ? null : h('div', { class: 'chipset', role: 'group', 'aria-label': 'Suggestions' }, chips),
        h('div', { class: 'rowline', style: 'margin-top:.9rem' }, h('div', null, h('b', null, 'Track time of day'), h('small', null, 'Morning, afternoon or evening when you log it')), sw),
        h('div', { class: 'rowline' }, h('div', null, h('b', null, 'Weekly goal'), h('small', null, 'Optional. Shown in Review, never as a streak')), h('div', { class: 'stepper' }, less, goalVal, more)),
        h('div', { class: 'btn-row', style: 'margin-top:1rem' }, h('button', { class: 'btn', type: 'submit', style: 'flex:1' }, editing ? 'Save' : 'Add habit'), h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Cancel'),
          editing ? h('button', { class: 'btn danger', type: 'button', onclick: () => { deleteHabit(habit, () => { close(); if (after) after(); }); } }, 'Delete') : null));
    });
  }

  // Delete a habit and its check-ins, after a clear warning, with Undo.
  function deleteHabit(hb, after) {
    const n = getHabitLogs().filter((l) => l.habitId === hb.id).length;
    if (!confirm(`Delete "${hb.name}"${n ? ` and its ${plural(n, 'check-in')}` : ''}? You can undo right after.`)) return false;
    const snap = Tr.deleteHabit(V.state, hb.id); saveTracking(); after && after();
    toast(`${hb.name} deleted.`, { label: 'Undo', run: () => { Tr.restoreHabit(V.state, snap); saveTracking(); route(); } });
    return true;
  }

  // Manage habits: edit, reorder, archive, delete.
  function redrawHabits(...keys) { const y = window.scrollY; quiet = true; habitsView(); quiet = false; window.scrollTo(0, y); if (keys.length) focusByKey(...keys); }
  function habitsView() {
    shell({ top: [backBtn('#/', 'Back to Today'), h('div', { class: 'title' }, 'Habits')], tab: 'today' });
    const all = getHabits(), active = Tr.activeHabits(all), archived = Tr.archivedHabits(all);
    const meta = (hb) => [hb.trackTime ? 'Tracks time of day' : 'No time of day', hb.weeklyGoal ? `Goal ${hb.weeklyGoal} ${hb.weeklyGoal === 1 ? 'day' : 'days'} a week` : null].filter(Boolean).join(' · ');
    const iconBtn = (icon, label, key, fn, disabled) => h('button', { class: 'icon-btn', type: 'button', 'aria-label': label, 'data-focus-key': key, disabled: disabled ? true : null, onclick: fn }, svg(icon));
    const move = (hb, d) => { Tr.reorderHabit(all, hb.id, d); saveTracking(); redrawHabits(`mv-${d < 0 ? 'up' : 'down'}-${hb.id}`, `mv-${d < 0 ? 'down' : 'up'}-${hb.id}`); };
    view(
      h('div', { class: 'eyebrow', style: 'margin-top:.5rem' }, 'Today'), h('h1', { class: 'page-title' }, 'Habits'),
      h('p', { class: 'lead' }, 'Add, rename, reorder or archive the habits you track. Archived habits keep their history.'),
      h('div', { class: 'section' }, h('h2', null, 'Active'), h('span', { class: 'count-chip' }, active.length || '')),
      active.length ? h('ul', { class: 'tasks' }, active.map((hb, i) => h('li', { class: 'mrow' },
        h('div', { class: 'txt' }, h('b', null, hb.name), h('small', null, meta(hb))),
        h('div', { class: 'acts' },
          iconBtn('up', `Move ${hb.name} up`, `mv-up-${hb.id}`, () => move(hb, -1), i === 0),
          iconBtn('down', `Move ${hb.name} down`, `mv-down-${hb.id}`, () => move(hb, 1), i === active.length - 1),
          iconBtn('edit', `Edit ${hb.name}`, `edit-${hb.id}`, () => habitEditorSheet(hb, () => redrawHabits(`edit-${hb.id}`))),
          iconBtn('archive', `Archive ${hb.name}`, `arch-${hb.id}`, () => { Tr.archiveHabit(hb, Date.now()); saveTracking(); redrawHabits('add-habit'); toast(`${hb.name} archived.`, { label: 'Undo', run: () => { hb.archivedAt = null; saveTracking(); route(); } }); }))))) : h('p', { class: 'empty-line' }, 'No habits yet.'),
      h('div', { class: 'link-row' }, h('button', { class: 'link-btn', type: 'button', 'data-focus-key': 'add-habit', onclick: () => habitEditorSheet(null, () => redrawHabits('add-habit')) }, '+ Add habit')),
      archived.length ? [h('div', { class: 'section' }, h('h2', null, 'Archived'), h('span', { class: 'count-chip' }, archived.length)),
        h('ul', { class: 'tasks' }, archived.map((hb) => h('li', { class: 'mrow' },
          h('div', { class: 'txt' }, h('b', null, hb.name), h('small', null, `${plural(getHabitLogs().filter((l) => l.habitId === hb.id).length, 'check-in')} kept`)),
          h('div', { class: 'acts' },
            h('button', { class: 'btn sm secondary', type: 'button', 'aria-label': `Unarchive ${hb.name}`, onclick: () => { Tr.unarchiveHabit(all, hb); saveTracking(); redrawHabits('add-habit'); } }, 'Unarchive'),
            iconBtn('trash', `Delete ${hb.name}`, `del-${hb.id}`, () => deleteHabit(hb, () => redrawHabits('add-habit')))))))] : null,
      null);
  }

  // ====================== MEALS ======================
  const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };
  const GROUP_CLASS = { protein: 'g-protein', veg: 'g-veg', carbs: 'g-carb', other: 'g-other' };
  const GROUP_LETTER = { protein: 'P', veg: 'V', carbs: 'C', other: 'O' };
  const GROUP_EG = { protein: 'eggs, dal, shake', veg: 'vegetables, fruit', carbs: 'rice, roti, bread', other: 'oil, sweets, drinks' };

  // A bar split by food group, with a text alternative. The gap between segments and the legend keep colour from being the only signal.
  const plateBar = (percent) => h('div', { class: 'plate-bar', role: 'img', 'aria-label': Tr.shareText(percent) || 'Nothing logged' },
    Tr.GROUPS.filter((g) => percent[g] > 0).map((g) => h('i', { class: GROUP_CLASS[g], style: `flex:${percent[g]}` })));
  const plateLegend = (percent) => h('div', { class: 'legend-row' }, Tr.GROUPS.filter((g) => percent[g] > 0).map((g) => h('span', { class: GROUP_CLASS[g] }, `${Tr.GROUP_LABEL[g]} ${percent[g]}%`)));

  // The Meals section on Today: today's plate so far, and the four fixed slots.
  function mealsSection(t0) {
    const meals = getMeals(), eaten = meals.filter((m) => m.date === t0 && !m.skipped).length, plate = Tr.dayPlate(meals, t0);
    const row = (slot) => {
      const m = Tr.findMeal(meals, t0, slot), name = SLOT_LABEL[slot], lower = name.toLowerCase();
      const open = () => mealSheet(slot, t0, () => redrawToday(`meal-${slot}`, `meal-add-${slot}`));
      if (!m) {
        return h('div', { class: 'meal' }, h('span', { class: 'lab' }, name), h('div', { class: 'mid' }),
          h('button', { class: 'btn secondary add', type: 'button', 'aria-label': `Add ${lower}`, 'data-focus-key': `meal-add-${slot}`, onclick: open }, ic('plus'), 'Add'));
      }
      const shares = m.skipped ? null : Tr.mealShares(m.levels);
      const label = m.skipped ? `Edit ${lower}, skipped` : `Edit ${lower}: ${Tr.shareText(shares)}${m.note ? '. ' + m.note : ''}`;
      return h('div', { class: 'meal' }, h('span', { class: 'lab' }, name),
        h('button', { class: 'mid', type: 'button', 'aria-label': label, 'data-focus-key': `meal-${slot}`, onclick: open },
          m.skipped ? h('small', { class: 'skip' }, 'Skipped') : [plateBar(shares), m.note ? h('small', null, m.note) : null]),
        h('span'));
    };
    return [
      h('div', { class: 'section' }, h('h2', null, 'Meals'), eaten ? h('span', { class: 'count-chip' }, `${eaten} logged`) : null),
      plate ? h('div', { class: 'day-plate' }, h('div', { class: 'cap' }, h('span', null, "Today's plate so far"), h('span', null, 'rough portions')), plateBar(plate.percent), plateLegend(plate.percent)) : null,
      Tr.SLOTS.map(row)
    ];
  }

  // The meal sheet: tap a food group to change its share of the plate, or copy a recent meal. Used for today and for past days.
  function mealSheet(slot, date, after) {
    const existing = Tr.findMeal(getMeals(), date, slot), name = SLOT_LABEL[slot], isToday = date === today();
    const levels = Tr.cleanLevels(existing && !existing.skipped ? existing.levels : null);
    const note = h('input', { type: 'text', maxlength: 200, value: existing ? existing.note : '', placeholder: 'Optional', autocomplete: 'off' });
    return openSheet(`${name}, ${dayLabel(date)}`, (close) => {
      const live = h('div', { class: 'sr-only', 'aria-live': 'polite' }, ''), preview = h('div', { class: 'live' });
      const save = h('button', { class: 'btn', type: 'submit', style: 'flex:1' }, 'Save meal');
      let chipEls = [];
      const tiles = Tr.GROUPS.map((g) => {
        const word = h('small', null, ''), pips = [0, 1, 2].map(() => h('i')), g1 = g;
        const el = h('button', { type: 'button', class: `ptile ${GROUP_CLASS[g]}`, onclick: () => { levels[g1] = Tr.cycleLevel(levels[g1]); chipEls.forEach((c) => c.setAttribute('aria-pressed', 'false')); paint(g1); } },
          h('span', { class: 'top' }, Tr.GROUP_LABEL[g], h('em', null, GROUP_LETTER[g])), h('span', { class: 'eg' }, GROUP_EG[g]), h('span', { class: 'pips' }, pips), word);
        return { el, g, word, pips };
      });
      // Redraw the tiles and the live bar. `changed` is the tile just tapped, announced to screen readers.
      function paint(changed) {
        tiles.forEach(({ el, g, word, pips }) => {
          const lv = levels[g];
          el.classList.toggle('on', lv > 0); pips.forEach((p, i) => p.classList.toggle('f', i < lv)); word.textContent = Tr.LEVEL_WORDS[lv];
          el.setAttribute('aria-label', `${Tr.GROUP_LABEL[g]}, ${Tr.LEVEL_WORDS[lv]}. Tap to change`);
        });
        const shares = Tr.mealShares(levels);
        preview.replaceChildren(...(shares ? [plateBar(shares), plateLegend(shares)] : [h('p', { class: 'sub' }, 'Tap a food group to start the plate.')]));
        save.disabled = !shares;
        if (changed) live.textContent = `${Tr.GROUP_LABEL[changed]}, ${Tr.LEVEL_WORDS[levels[changed]]}. ${shares ? Tr.shareText(shares) : 'Nothing selected'}`;
      }
      const recents = Tr.recentMeals(getMeals(), 6);
      const chips = recents.length ? h('div', { class: 'recent', role: 'group', 'aria-label': 'Recent meals' }, recents.map((r) => {
        const b = h('button', { type: 'button', 'aria-pressed': 'false', title: Tr.mealLabel(r), onclick: () => {
          Tr.GROUPS.forEach((g) => { levels[g] = r.levels[g]; }); note.value = r.note;
          chipEls.forEach((c) => c.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); paint();
        } }, h('span', { class: 'clip' }, Tr.mealLabel(r)));
        return b;
      })) : null;
      chipEls = chips ? [...chips.children] : [];

      // Save, skip or delete, then redraw; Undo puts back whatever was there before.
      const commit = (meal, message) => {
        if (!meal) return;
        const prev = existing ? JSON.parse(JSON.stringify(existing)) : null;
        Tr.setMeal(getMeals(), meal); saveTracking(); close(); after && after();
        toast(message, { label: 'Undo', run: () => { const ms = getMeals(); if (prev) Tr.setMeal(ms, prev); else Tr.removeMeal(ms, date, slot); saveTracking(); route(); } });
      };
      const saveMeal = () => commit(Tr.makeMeal({ date, slot, levels, note: note.value, skipped: false }, Date.now()), `${name} saved.`);
      const skipMeal = () => commit(Tr.makeMeal({ date, slot, note: note.value, skipped: true }, Date.now()), `${name} marked as skipped.`);
      const deleteMeal = () => {
        const prev = JSON.parse(JSON.stringify(existing)); Tr.removeMeal(getMeals(), date, slot); saveTracking(); close(); after && after();
        toast(`${name} deleted.`, { label: 'Undo', run: () => { Tr.setMeal(getMeals(), prev); saveTracking(); route(); } });
      };
      paint();
      return h('form', { class: 'sheet', onsubmit: (ev) => { ev.preventDefault(); if (!save.disabled) saveMeal(); } },
        h('h3', null, name, h('small', null, (isToday ? '' : fullDay(date) + '. ') + 'Tap a food group to change its share of the plate')),
        chips, h('div', { class: 'tiles' }, tiles.map((t) => t.el)), preview, live,
        h('label', { class: 'field' }, 'What did you eat?', note),
        h('div', { class: 'btn-row', style: 'margin-top:1rem' }, save, h('button', { class: 'btn ghost', type: 'button', onclick: skipMeal }, 'I skipped it'),
          existing ? h('button', { class: 'btn danger', type: 'button', onclick: deleteMeal }, 'Delete meal') : null));
    });
  }

  // --- close the day ---
  function closeView() {
    const t0 = today(), v = Tk.today(getTasks(), t0), left = v.carried.concat(v.planned);
    shell({ top: [backBtn('#/', 'Back to Today'), h('div', { class: 'title' }, 'Close the day')], tab: 'today' });
    view(
      h('div', { class: 'eyebrow', style: 'margin-top:.5rem' }, `${weekday(t0)} ${longDay(t0)}`),
      h('h1', { class: 'page-title' }, 'How did today go?'),
      h('div', { class: 'stats', style: 'margin-top:1.25rem;grid-template-columns:repeat(2,1fr)' },
        h('div', { class: 'stat' }, h('div', { class: 'n' }, v.done.length), h('div', { class: 'l' }, 'Done')),
        h('div', { class: 'stat' }, h('div', { class: 'n' }, left.length), h('div', { class: 'l' }, 'Still open'))),
      left.length ? [
        h('div', { class: 'section' }, h('h2', null, 'Still open'), h('span', { class: 'count-chip' }, left.length)),
        h('p', { class: 'sub', style: 'margin:.4rem 0' }, 'These carry over to tomorrow on their own. Drop anything you no longer want to do.'),
        h('ul', { class: 'tasks' }, left.map((t) => h('li', { class: 'task' },
          h('div', { class: 'body', style: 'cursor:default' }, h('div', { class: 'ttl' }, t.title), taskMeta(t, t0)),
          h('button', { class: 'link-btn', onclick: () => { Tk.drop(t, t0, Date.now()); saveTasks(); closeView(); } }, 'Drop'))))] : h('p', { class: 'empty-line' }, total0(v) ? 'Nothing left open. Nicely done.' : 'No tasks today.'),
      v.done.length ? [h('div', { class: 'section' }, h('h2', null, 'Done today'), h('span', { class: 'count-chip' }, v.done.length)), h('ul', { class: 'tasks' }, v.done.map((t) => h('li', { class: 'task done' }, h('div', { class: 'cb', role: 'img', 'aria-label': 'Done', 'aria-checked': 'true' }, svg('check')), h('div', { class: 'body', style: 'cursor:default' }, h('div', { class: 'ttl' }, t.title), taskMeta(t, t0)))))] : null,
      h('div', { class: 'btn-row', style: 'margin-top:2rem' },
        h('a', { class: 'btn', href: '#/' }, 'Done for today'),
        h('a', { class: 'btn secondary', href: '#/new/journal' }, 'Reflect in your journal')));
  }
  const total0 = (v) => v.done.length + v.carried.length + v.planned.length;

  // --- review ---
  let reviewMore = 1; // pages of 30 days shown
  // Review has three panels behind a switch. The one last used is remembered for the session, and the Review tab opens it.
  let reviewPanel = 'tasks';
  const REVIEW_PANELS = [['tasks', 'Tasks'], ['habits', 'Habits'], ['diet', 'Diet']];
  const panelHref = (k) => (k === 'tasks' ? '#/review' : `#/review/${k}`);
  function reviewHead(panel) {
    reviewPanel = panel;
    const tab = tabs.querySelector('a[data-tab=review]'); if (tab) tab.setAttribute('href', panelHref(panel));
    return [
      h('div', { class: 'eyebrow', style: 'margin-top:.5rem' }, 'Review'), h('h1', { class: 'page-title' }, 'Your days'),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Review sections' }, REVIEW_PANELS.map(([k, label]) =>
        h('button', { 'aria-pressed': String(k === panel), onclick: () => { if (k !== panel) location.hash = panelHref(k); } }, label)))
    ];
  }
  // Habits and Diet are built in the next steps; until then each panel says what it will show.
  function reviewSoon(panel) {
    shell({ top: [h('span', { class: 'wordmark' }, h('i', null, svg('check')), 'Second Brain')], tab: 'review' });
    const [title, text] = panel === 'habits'
      ? ['Habit tracking is on its way', 'Soon you will log habits on Today, and see here how many days you went, your usual time of day and a month calendar.']
      : ['Meal tracking is on its way', 'Soon you will log meals on Today, and see here your average plate and how each day looked.'];
    view(...reviewHead(panel), h('div', { class: 'empty' }, svg('review'), h('h3', null, title), h('p', null, text), h('a', { class: 'btn', style: 'margin-top:1rem', href: '#/' }, 'Go to Today')));
  }
  function barChart(per, t0) {
    const days = per.slice().reverse(); // oldest first
    const max = Math.max(1, ...days.map((p) => p.done.length + p.left.length));
    const W = 336, H = 150, base = 120, top = 8, bw = 30, gap = (W - bw * days.length) / (days.length + 1), scale = (base - top) / max, r = 3;
    const parts = [];
    days.forEach((p, i) => {
      const x = gap + i * (bw + gap), d = p.done.length, l = p.left.length;
      const hd = d * scale, hl = l * scale;
      const tip = `${shortDay(p.date)}: ${d} done, ${l} left over`;
      parts.push(`<g><title>${tip}</title>`);
      if (d) parts.push(`<rect class="done" x="${x}" y="${base - hd}" width="${bw}" height="${hd}" rx="${r}"/>`);
      if (l) parts.push(`<rect class="left" x="${x}" y="${base - hd - hl - (d ? 2 : 0)}" width="${bw}" height="${hl}" rx="${r}"/>`);
      if (!d && !l) parts.push(`<rect class="left" x="${x}" y="${base - 2}" width="${bw}" height="2" rx="1"/>`);
      parts.push(`<text x="${x + bw / 2}" y="${H - 14}" text-anchor="middle">${new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(parseDate(p.date)).slice(0, 3)}</text>`);
      if (p.date === t0) parts.push(`<rect class="today-mark" x="${x + bw / 2 - 8}" y="${H - 6}" width="16" height="2" rx="1"/>`);
      parts.push('</g>');
    });
    const wrap = document.createElement('div');
    wrap.innerHTML = `<svg class="bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tasks done and left over each day for the last 7 days; a table follows">${parts.join('')}</svg>`;
    return wrap.firstChild;
  }
  function reviewTab() {
    shell({ top: [h('span', { class: 'wordmark' }, h('i', null, svg('check')), 'Second Brain')], tab: 'review' });
    const t0 = today(), tasks = getTasks();
    if (!tasks.length) {
      view(...reviewHead('tasks'),
        h('div', { class: 'empty' }, svg('review'), h('h3', null, 'Nothing to review yet'), h('p', null, 'Add tasks on Today. Each day will show up here with what you finished and what carried over.'), h('a', { class: 'btn', style: 'margin-top:1rem', href: '#/' }, 'Go to Today')));
      return;
    }
    const week = Tk.days(Tk.addDays(t0, -6), t0), r = Tk.range(tasks, week, t0);
    const first = Tk.firstDay(tasks) || t0, all = Tk.days(first, t0).map((d) => Tk.day(tasks, d)).filter((p) => p.done.length || p.left.length || p.dropped.length || p.added.length);
    const shown = all.slice(0, 30 * reviewMore);
    view(
      ...reviewHead('tasks'),
      h('div', { class: 'eyebrow', style: 'margin-top:1.25rem' }, 'Last 7 days'),
      h('div', { class: 'stats', style: 'margin-top:.5rem' },
        h('div', { class: 'stat' }, h('div', { class: 'n' }, r.done), h('div', { class: 'l' }, 'Tasks finished')),
        h('div', { class: 'stat' }, h('div', { class: 'n' }, r.rate == null ? '–' : Math.round(r.rate * 100) + '%'), h('div', { class: 'l' }, 'Of the tasks on your list')),
        h('div', { class: 'stat' }, h('div', { class: 'n' }, `${r.activeDays}/7`), h('div', { class: 'l' }, 'Days with something done')),
        h('div', { class: 'stat' }, h('div', { class: 'n' }, r.oldest ? plural(r.oldestDays, 'day') : '–'), h('div', { class: 'l' }, r.oldest ? `Longest open: ${r.oldest.title.length > 28 ? r.oldest.title.slice(0, 27) + '…' : r.oldest.title}` : 'Nothing open from earlier'))),
      barChart(r.per, t0),
      h('div', { class: 'legend' }, h('span', null, h('i', { style: 'background:var(--accent)' }), 'Done'), h('span', null, h('i', { style: 'background:var(--line-strong)' }), 'Left over')),
      h('table', { class: 'sr-only' }, h('caption', null, 'Tasks per day, last 7 days'), h('thead', null, h('tr', null, h('th', null, 'Day'), h('th', null, 'Done'), h('th', null, 'Left over'))),
        h('tbody', null, r.per.slice().reverse().map((p) => h('tr', null, h('td', null, p.date), h('td', null, p.done.length), h('td', null, p.left.length))))),
      h('div', { class: 'section' }, h('h2', null, 'Days'), h('span', { class: 'count-chip' }, all.length)),
      shown.map((p) => h('a', { class: 'dayrow', href: `#/review/${p.date}` },
        h('span', { class: 'd' }, dayLabel(p.date)),
        h('span', { class: 's' }, [`${p.done.length} done`, p.left.length ? `${p.left.length} left` : null, p.dropped.length ? `${p.dropped.length} dropped` : null].filter(Boolean).join(' · ')),
        h('span', { class: 'bar' }, h('i', { style: `width:${p.rate == null ? 0 : Math.round(p.rate * 100)}%` })))),
      all.length > shown.length ? h('button', { class: 'btn secondary block', style: 'margin-top:1rem', onclick: () => { reviewMore++; reviewTab(); } }, 'Show older days') : null);
  }

  function dayDetailView(d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) { location.hash = '#/review'; return; }
    shell({ top: [backBtn('#/review', 'Back to review'), h('div', { class: 'title' }, dayLabel(d))], tab: 'review' });
    const t0 = today(), p = Tk.day(getTasks(), d), notes = getEntries().filter((e) => e.date === d);
    const ro = (arr, mark) => h('ul', { class: 'tasks' }, arr.map((t) => h('li', { class: 'task' + (mark === 'done' ? ' done' : '') },
      mark === 'done' ? h('div', { class: 'cb', role: 'img', 'aria-label': 'Done', 'aria-checked': 'true' }, svg('check')) : h('div', { class: 'cb', 'aria-hidden': 'true', style: 'opacity:.45' }),
      h('div', { class: 'body', style: 'cursor:default' }, h('div', { class: 'ttl' }, t.title),
        h('div', { class: 'meta' }, t.plan0 < d ? h('span', { class: 'age' }, `From ${shortDay(t.plan0)} · ${plural(Tk.diffDays(d, t.plan0), 'day')}`) : null, t.note ? h('span', null, firstLine(t.note)) : null)))));
    const sec = (name, arr, mark) => (arr.length ? [h('div', { class: 'section' }, h('h2', null, name), h('span', { class: 'count-chip' }, arr.length)), ro(arr, mark)] : null);
    view(
      h('div', { class: 'eyebrow', style: 'margin-top:.5rem' }, weekday(d)), h('h1', { class: 'page-title' }, longDay(d)),
      h('div', { class: 'stats', style: 'margin-top:1.25rem' },
        h('div', { class: 'stat' }, h('div', { class: 'n' }, p.done.length), h('div', { class: 'l' }, 'Done')),
        h('div', { class: 'stat' }, h('div', { class: 'n' }, p.left.length), h('div', { class: 'l' }, 'Left over')),
        h('div', { class: 'stat' }, h('div', { class: 'n' }, p.added.length), h('div', { class: 'l' }, 'Added')),
        h('div', { class: 'stat' }, h('div', { class: 'n' }, p.rate == null ? '–' : Math.round(p.rate * 100) + '%'), h('div', { class: 'l' }, 'Completed'))),
      sec('Done', p.done, 'done'), sec('Left over', p.left, 'left'), sec('Dropped', p.dropped, 'dropped'),
      notes.length ? [h('div', { class: 'section' }, h('h2', null, 'Notes that day'), h('span', { class: 'count-chip' }, notes.length)), notes.map(entryRow)] : null,
      !p.done.length && !p.left.length && !p.dropped.length && !notes.length ? h('p', { class: 'empty-line' }, 'Nothing was on the list that day.') : null,
      d < t0 && p.left.length ? h('p', { class: 'sub', style: 'margin-top:1rem' }, 'Anything still open now is on the Today screen, under Carried over.') : null);
  }

  // ====================== NOTES ======================
  function discardDraft() {
    const draft = getDraft(); if (!draft) return;
    setDraft(null); route();
    toast('Draft discarded.', { label: 'Undo', run: () => { setDraft(draft); route(); } });
  }

  function emptyState(head, text, icon) {
    return h('div', { class: 'empty' }, svg(icon || 'notebook'), h('h3', null, head), h('p', null, text));
  }

  function excerpt(e) {
    const first = e.qa.find((p) => p.a.trim());
    return first ? first.a.replace(/\s+/g, ' ').trim() : '';
  }
  function entryRow(e) {
    return h('a', { class: `entry ${typeClass(e.type)}`, href: `#/entry/${e.id}` },
      h('span', { class: 'tlabel' }, T[e.type] ? T[e.type].label : e.type),
      h('div', { class: 'ttl' }, e.title || (T[e.type] ? T[e.type].label : e.type) + ' · ' + dayLabel(e.date)),
      h('div', { class: 'ex' }, excerpt(e)),
      h('div', { class: 'meta' }, h('span', null, dayLabel(e.date)), e.duration ? h('span', null, e.duration) : null,
        e.exportedAt ? null : h('span', { class: 'pending', title: 'Not exported yet' }), e.exportedAt ? null : h('span', null, 'Not exported')));
  }

  // The type picker: a plain list, not a grid of tiles.
  function newView() {
    shell({ top: [backBtn('#/notes', 'Back to notes'), h('div', { class: 'title' }, 'New note')], tab: 'notes' });
    view(h('h1', { class: 'page-title', style: 'margin-top:.5rem' }, 'What kind of note?'),
      h('p', { class: 'lead' }, 'You will be asked one question at a time, and your words are kept exactly as you write them.'),
      Object.entries(T).map(([key, t]) => h('a', { class: `typerow ${typeClass(key)}`, href: `#/new/${key}` },
        h('h3', null, t.label), h('p', null, t.blurb),
        h('small', null, `${plural(t.questions.filter((q) => q.kind !== 'tags').length, 'question')} · based on ${t.frameworks.split(/[,(]/)[0].trim()}`))),
      h('p', { class: 'sub', style: 'margin-top:1.25rem' }, h('a', { href: '#/about' }, 'Why these questions?')));
  }

  const filters = { q: '', type: 'all' };
  function notesView() {
    shell({ top: [h('span', { class: 'wordmark' }, h('i', null, svg('check')), 'Second Brain'), h('span', { class: 'spacer' }), h('a', { class: 'btn sm', href: '#/new' }, svg('plus'), 'New note')], tab: 'notes' });
    const all = getEntries(), draft = getDraft();
    const list = h('div', { id: 'entry-list' });
    const draw = () => {
      const q = filters.q.trim().toLowerCase();
      const rows = all.filter((e) => (filters.type === 'all' || e.type === filters.type) &&
        (!q || [e.title, e.source, (e.tags || []).join(' '), e.qa.map((p) => p.a).join(' ')].join(' ').toLowerCase().includes(q)))
        .sort((a, b) => (a.date === b.date ? b.created - a.created : a.date < b.date ? 1 : -1));
      if (!rows.length) { list.replaceChildren(all.length ? emptyState('No matches', 'Try a different word or type.', 'search') : emptyState('No notes yet', 'Capture an idea, something you learned, a work session, a journal entry or a habit check-in.')); return; }
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
      h('div', { class: 'eyebrow', style: 'margin-top:.5rem' }, all.length ? plural(all.length, 'note') : 'Notebook'), h('h1', { class: 'page-title' }, 'Notes'),
      draft && T[draft.type] ? h('div', { class: `banner ${typeClass(draft.type)}` },
        h('div', { class: 'grow' }, h('strong', null, `Unfinished ${T[draft.type].label.toLowerCase()}`), h('span', { class: 'sub' }, `Question ${draft.idx + 1} of ${T[draft.type].questions.length}`)),
        h('a', { class: 'btn sm', href: `#/new/${draft.type}` }, 'Continue'),
        h('button', { class: 'icon-btn', 'aria-label': 'Discard draft', onclick: () => discardDraft() }, svg('trash'))) : null,
      all.length ? h('div', { class: 'search' }, svg('search'),
        h('input', { type: 'search', placeholder: 'Search your notes', 'aria-label': 'Search notes', value: filters.q, oninput: (ev) => { filters.q = ev.target.value; draw(); } })) : null,
      all.length ? chips : null,
      pending ? h('p', { class: 'sub', style: 'margin-top:.5rem' }, `${plural(pending, 'note')} not exported yet. They exist only on this device until you export them. `, h('a', { href: '#/more' }, 'Export')) : null,
      list);
    draw();
  }

  // --- entry detail ---
  function entryView(id) {
    const all = getEntries(), e = all.find((x) => x.id === id);
    if (!e) { location.hash = '#/notes'; return; }
    shell({ top: [backBtn('#/notes', 'Back to notes'), title(T[e.type] ? T[e.type].label : 'Entry')], tab: 'notes' });
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
        h('div', { class: 'metas' }, h('span', { class: 'tlabel' }, T[e.type] ? T[e.type].label : e.type), h('span', { class: 'meta-chip' }, dayLabel(e.date)), e.duration ? h('span', { class: 'meta-chip' }, e.duration) : null,
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
    location.hash = '#/notes';
    toast('Note deleted.', { label: 'Undo', run: () => { const l = getEntries(); l.push(e); setEntries(l); if (location.hash === '#/notes') notesView(); } });
  }

  // --- more ---
  function moreView() {
    shell({ top: title('More'), tab: 'more' });
    const all = getEntries(), tk = getTasks(), hasData = all.length || tk.length;
    const row = (icon, head, text, attrs) => h(attrs.href ? 'a' : 'button', Object.assign({ class: 'row-item' }, attrs),
      h('div', { class: 'ico' }, svg(icon)), h('div', { class: 'txt' }, h('strong', null, head), h('span', null, text)), svg('chevron'));
    view(
      h('div', { class: 'eyebrow', style: 'margin-top:.5rem' }, 'Settings'), h('h1', { class: 'page-title' }, 'More'),
      h('div', { class: 'section' }, h('h2', null, 'About')),
      h('div', { class: 'rows' }, row('info', 'Why these questions', 'Where each question comes from, and its limits', { href: '#/about' })),
      h('div', { class: 'section' }, h('h2', null, 'Your data')),
      h('div', { class: 'rows' },
        row('download', 'Export all as .zip', hasData ? `${plural(all.length, 'note')} in entries/, daily to-dos in todos/` : 'Nothing to export yet', { onclick: () => exportAll(), disabled: hasData ? null : true }),
        row('download', 'Backup (.json)', V.currentMode() === 'pass' ? 'Encrypted with your passphrase' : 'Optionally protected by its own passphrase', { onclick: backup, disabled: hasData ? null : true }),
        h('label', { class: 'row-item', style: 'position:relative' },
          h('div', { class: 'ico' }, svg('upload')), h('div', { class: 'txt' }, h('strong', null, 'Restore a backup'), h('span', null, 'Adds notes, to-dos, habits and meals from a .json backup')),
          h('input', { type: 'file', accept: 'application/json,.json', onchange: restore, style: 'position:absolute;inset:0;opacity:0;cursor:pointer', 'aria-label': 'Restore a backup file' }))),
      h('p', { class: 'sub', style: 'margin-top:.6rem' }, 'The .zip and .md exports are plain readable files, because they are meant for your second-brain repo. Treat them accordingly. Clearing browser data deletes your entries, so back up now and then.'),
      h('div', { class: 'section' }, h('h2', null, 'Security')),
      V.currentMode() === 'pass'
        ? h('div', { class: 'rows' },
          row('lock', 'Lock now', 'Needs your passphrase to open again', { onclick: () => lockNow() }),
          row('key', 'Change passphrase', 'Re-encrypts everything with a new one', { href: '#/passphrase' }),
          row('shield', 'Remove passphrase lock', 'Go back to opening the app without one', { onclick: removeLock }))
        : h('div', { class: 'rows' }, row('key', 'Add a passphrase lock', 'Optional. Asks for it each time the app opens', { href: '#/passphrase' })),
      h('div', { class: 'note', style: 'margin-top:.75rem' },
        h('strong', null, 'How your data is protected'),
        V.currentMode() === 'pass'
          ? h('ul', null,
            h('li', null, 'Entries and drafts are stored encrypted (AES-256-GCM). The key comes from your passphrase and exists only in memory while the app is open.'),
            h('li', null, 'Other apps, other sites and anyone looking through this browser\'s storage see only unreadable data.'),
            h('li', null, 'The app locks itself after 2 minutes in the background.'),
            h('li', null, 'There is no way to recover a forgotten passphrase. That is what keeps it private.'),
            h('li', null, 'It cannot protect you from malware on your device, someone watching you type, or a weak passphrase.'))
          : h('ul', null,
            h('li', null, 'Entries and drafts are stored encrypted (AES-256-GCM) with a key the browser keeps for this app only. There is no password to remember.'),
            h('li', null, 'Other apps, other sites, and tools that copy or sync this browser\'s raw storage see only unreadable data.'),
            h('li', null, 'Anyone who can open this app on your unlocked phone can read your entries. Add a passphrase lock if that matters.'))),
      !installed() && (deferredInstall || isIOS) ? [
        h('div', { class: 'section' }, h('h2', null, 'App')),
        h('div', { class: 'rows' }, deferredInstall
          ? row('phone', 'Install Second Brain', 'Add it to your home screen; works offline', { onclick: askInstall })
          : h('div', { class: 'row-item' }, h('div', { class: 'ico' }, svg('phone')), h('div', { class: 'txt' }, h('strong', null, 'Install on iPhone or iPad'), h('span', null, 'Tap Share, then "Add to Home Screen".'))))] : null);
  }

  function exportAll() {
    const list = getEntries(), tk = getTasks(); if (!list.length && !tk.length) return;
    const files = list.map((e) => ({ name: entryPath(e, list), content: entryToMarkdown(e) }));
    let days = 0;
    if (tk.length) Tk.days(Tk.firstDay(tk), today()).forEach((d) => { const md = Tk.dayMarkdown(tk, d); if (md) { files.push({ name: `todos/${d.slice(0, 4)}/${d.slice(5, 7)}/${d}.md`, content: md + '\n' }); days++; } });
    download(`second-brain-${today()}.zip`, 'application/zip', makeZip(files));
    markExported(list.map((e) => e.id));
    toast(`Exported ${plural(list.length, 'note')} and ${plural(days, 'day')} of to-dos.`);
  }
  async function backup() {
    let pass; // undefined: use the vault's own key (passphrase mode)
    if (V.currentMode() === 'device') { pass = await askBackupPassphrase(); if (pass === null) return; }
    download(`second-brain-backup-${today()}.json`, 'application/json', await V.exportBackup(pass));
    toast(V.currentMode() === 'device' && !pass ? 'Backup downloaded. It is a plain, readable file.' : 'Encrypted backup downloaded.');
  }
  function mergeData(data) {
    const have = getEntries(), ids = new Set(have.map((e) => e.id));
    const add = (data.entries || []).filter((e) => e && e.id && T[e.type] && e.date && Array.isArray(e.qa) && !ids.has(e.id));
    setEntries(have.concat(add));
    const tk = getTasks(), tids = new Set(tk.map((t) => t.id));
    const addT = (data.tasks || []).map(Tk.normalize).filter((t) => t && !tids.has(t.id));
    addT.forEach((t) => tk.push(t)); saveTasks();
    const tracked = Tr.mergeTracking(V.state, data); saveTracking();
    return { notes: add.length, tasks: addT.length, habits: tracked.habits, logs: tracked.logs, meals: tracked.meals };
  }
  const joinList = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  const restoredMessage = (n) => {
    const parts = [[n.notes, 'note'], [n.tasks, 'task'], [n.habits, 'habit'], [n.logs, 'check-in'], [n.meals, 'meal']].filter(([c]) => c > 0).map(([c, w]) => plural(c, w));
    return parts.length ? `Restored ${joinList(parts)}.` : 'Nothing new to restore.';
  };
  async function restore(ev) {
    const input = ev.target, file = input.files[0]; if (!file) return;
    try {
      const parsed = V.parseBackup(await file.text());
      let incoming;
      if (parsed.plain) incoming = parsed.plain; // an unencrypted backup: it is encrypted as it joins the vault
      else if (V.sameKeyAs(parsed.file)) incoming = await V.openBackup(parsed.file);
      else {
        const pass = await askPassphrase('This backup was made with a different passphrase. Enter the passphrase it was made with.');
        if (pass == null) return;
        incoming = await V.openBackup(parsed.file, pass);
      }
      const n = mergeData(incoming);
      toast(restoredMessage(n)); moreView();
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
        h('div', { class: `src-card ${typeClass(key)}`, id: 'src-' + key },
          h('h3', null, t.label),
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
    if (!type) return newView();
    const t = T[type]; if (!t) { location.hash = '#/notes'; return; }
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
    persist(); session = null; toast('Draft saved. Continue from Notes or Today.'); location.hash = '#/notes';
  }

  function habitChoiceView() {
    const t = T.habit;
    shell({ top: [h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => { session = null; location.hash = '#/notes'; } }, svg('close')), title('Habit')], focus: true });
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
          h('i', { style: `width:${((session.idx + 1) / total) * 100}%` })),
        h('span', { class: 'count' }, `${session.idx + 1}/${total}`)],
      focus: true
    });
    view(
      h('div', { class: `qwrap ${typeClass(session.type)}` },
        h('span', { class: 'qtype' }, t.label),
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
        h('span', { class: 'qtype' }, t.label),
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
    if (!e || !T[e.type]) { location.hash = '#/notes'; return; }
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
    if (kind !== 'notes' && kind !== 'entries' && kind !== 'entry') { filters.q = ''; filters.type = 'all'; }
    if (kind !== 'review') reviewMore = 1;
    switch (kind) {
      case 'new': return startOrResume(arg);
      case 'edit': return editView(arg);
      case 'entry': return entryView(arg);
      case 'notes': case 'entries': return notesView();
      case 'review': return arg === 'habits' || arg === 'diet' ? reviewSoon(arg) : arg ? dayDetailView(arg) : reviewTab();
      case 'close': return closeView();
      case 'habits': return habitsView();
      case 'more': return moreView();
      case 'passphrase': return changePassView();
      case 'about': return aboutView(arg);
      default: return todayView();
    }
  }
  window.addEventListener('hashchange', route);

  // ====================== VAULT (set up, lock, unlock) ======================
  let resumeHash = '';

  let booting = null; // one boot at a time, so the vault is never created twice
  function boot() {
    if (!booting) booting = doBoot().finally(() => { booting = null; });
    return booting;
  }
  async function doBoot() {
    if (!V.supported) return unsupportedView();
    if (!V.exists()) { // first launch: no password, just start (an older plaintext copy is moved into the vault)
      try { await V.createDevice(V.legacy() || undefined); return route(); } catch (e) { return setupView(); }
    }
    if (V.storedMode() === 'device') {
      try { await V.unlockDevice(); return route(); } catch (e) { return keyMissingView(); }
    }
    return lockView();
  }

  function keyMissingView() {
    shell({ top: logo(), focus: true });
    view(h('div', { class: 'lockwrap' },
      h('div', { class: 'badge lockbadge' }, svg('lock')),
      h('h1', { class: 'h-lg' }, 'Your entries cannot be opened'),
      h('p', { class: 'lead' }, 'This browser no longer has the key that protects them, which usually means its site data was cleared or the app was reinstalled. Without the key the entries are unreadable.'),
      h('p', { class: 'sub', style: 'margin-top:.75rem' }, 'If you have a backup, start fresh and restore it from More → Restore a backup. Your exported .md and .zip files are not affected.'),
      h('button', { class: 'btn danger block', style: 'margin-top:1.25rem', onclick: async () => {
        if (confirm('Start fresh? The unreadable entries on this device will be deleted.')) { await V.erase(); location.hash = '#/'; boot(); }
      } }, 'Start fresh on this device')));
  }

  function unsupportedView() {
    shell({ top: logo(), focus: true });
    view(emptyState('This browser cannot encrypt your notes', 'Second Brain needs a secure connection (https) and a current browser so it can keep your entries private. Open it from its normal address in an up-to-date browser.', 'lock'));
  }

  function passField(label, autocomplete, onInput, optional) {
    const input = h('input', { type: 'password', autocomplete, required: !optional, 'aria-label': label, oninput: onInput });
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
      h('p', { class: 'lead' }, 'This browser cannot keep an automatic key, so your entries need a passphrase that only you know. Without it, nobody can read them, not even this app.'),
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
            if (confirm('Erase ALL entries on this device? This cannot be undone.') && confirm('Really erase everything and start over?')) { V.erase().then(() => { resumeHash = ''; location.hash = '#/'; boot(); }); }
          } }, 'Erase everything on this device')))));
    pf.input.focus();
  }

  async function lockNow() {
    if (V.currentMode() !== 'pass') return;
    resumeHash = location.hash;
    await V.lock();
    session = null;
    document.getElementById('toast').hidden = true;
    lockView();
  }

  function changePassView() {
    const adding = V.currentMode() === 'device';
    const heading = adding ? 'Add a passphrase lock' : 'Change passphrase';
    shell({ top: [backBtn('#/more', 'Back'), title(heading)], tab: 'more' });
    const cur = adding ? null : passField('Current passphrase', 'current-password');
    const fresh = newPassFields(adding ? 'Choose a passphrase' : 'New passphrase', adding ? 'Type it again' : 'Type the new one again');
    const ack = adding ? h('input', { type: 'checkbox', id: 'ack', required: true }) : null;
    const go = h('button', { class: 'btn block', type: 'submit', style: 'margin-top:1.25rem' }, adding ? 'Turn on passphrase lock' : 'Change passphrase');
    view(h('h1', { class: 'h-lg', style: 'margin-top:.5rem' }, heading),
      h('p', { class: 'lead' }, adding
        ? 'The app will ask for this passphrase each time it opens, and lock itself after 2 minutes in the background. You can remove the lock later.'
        : 'Everything is re-encrypted with the new passphrase. Older encrypted backups still need the passphrase they were made with.'),
      h('form', { onsubmit: async (ev) => {
        ev.preventDefault();
        const pass = fresh.valid(); if (!pass) return;
        go.disabled = true; go.textContent = 'Encrypting...';
        try {
          if (adding) await V.toPassphrase(pass); else await V.changePassphrase(cur.input.value, pass);
          toast(adding ? 'Passphrase lock is on.' : 'Passphrase changed.'); location.hash = '#/more'; if (adding) moreView();
        } catch (e) { go.disabled = false; go.textContent = adding ? 'Turn on passphrase lock' : 'Change passphrase'; toast(adding ? 'Could not turn on the lock.' : 'The current passphrase did not work.'); if (cur) cur.input.focus(); }
      } }, cur ? cur.el : null, fresh.nodes,
      adding ? h('label', { class: 'check' }, ack, h('span', null, 'I understand that if I forget this passphrase, my entries cannot be recovered by anyone.')) : null, go));
  }

  async function removeLock() {
    const pass = await askPassphrase('Enter your passphrase to remove the lock. Your entries stay encrypted on this device, with a key the browser keeps, and the app will open without a password.');
    if (pass == null) return;
    try { await V.toDevice(pass); toast('Passphrase lock removed.'); moreView(); }
    catch (e) { toast('That passphrase did not work.'); }
  }

  // Modal asking for an optional passphrase to protect a backup. Resolves '' for none, null if cancelled.
  function askBackupPassphrase() {
    return new Promise((resolve) => {
      const pf = passField('Backup passphrase (optional)', 'new-password', null, true);
      const done = (v) => { overlay.remove(); resolve(v); };
      const overlay = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Protect the backup' },
        h('form', { class: 'sheet', onsubmit: (ev) => { ev.preventDefault(); done(pf.input.value); } },
          h('p', null, 'Protect this backup with a passphrase? Leave it empty for a plain, readable file that anyone who has it can open.'), pf.el,
          h('div', { class: 'btn-row', style: 'margin-top:1rem' }, h('button', { class: 'btn', type: 'submit' }, 'Download'), h('button', { class: 'btn ghost', type: 'button', onclick: () => done(null) }, 'Cancel'))));
      document.body.append(overlay); pf.input.focus();
    });
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
  // After midnight, redraw the screens that depend on the date so yesterday's leftovers show as carried over.
  function checkNewDay() {
    if (!V.unlocked || today() === shownDay) return;
    shownDay = today();
    if (/^(#\/?|#\/review|#\/close)?$/.test(location.hash)) route();
  }
  setInterval(checkNewDay, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); V.flush(); }
    else if (V.unlocked && V.currentMode() === 'pass' && hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS) lockNow();
    else checkNewDay();
  });
  window.addEventListener('pagehide', () => { V.flush(); });

  route();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
