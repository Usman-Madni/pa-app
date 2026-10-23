/* Personal Assistant — tasks, reminders, notes, calendar, Gmail + Google Calendar sync.
   All local data lives in localStorage; Google data is fetched live with a short-lived OAuth token. */

// ---------- Helpers ----------
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => dateKey(new Date());
const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const fmtTime = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};
const fmtDay = (k) => parseKey(k).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

const store = {
  load(key, fallback) {
    try { return JSON.parse(localStorage.getItem('pa.' + key)) ?? fallback; } catch { return fallback; }
  },
  save(key, value) {
    try { localStorage.setItem('pa.' + key, JSON.stringify(value)); } catch { toast('Could not save — storage is full or blocked'); }
  },
};

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 5000);
}

// ---------- State ----------
const state = {
  view: store.load('view', 'today'),
  tasks: store.load('tasks', []),     // {id, title, due:'YYYY-MM-DDTHH:mm'|'', priority:'low'|'med'|'high', remind:-1|0|10|60, notified, done, created}
  notes: store.load('notes', []),     // {id, title, body, updated}
  events: store.load('events', []),   // {id, title, date:'YYYY-MM-DD', time:'HH:mm'|'', googleId?}
  taskFilter: 'active',
  noteQuery: '',
  activeNote: null,
  calMonth: monthStart(new Date()),
  selectedDay: todayKey(),
  google: {
    token: null,
    expires: 0,
    eventsByMonth: {},   // 'YYYY-MM' -> normalized events
    loadingMonths: new Set(),
    emails: null,
    unread: null,
    loadingMail: false,
    error: null,
    profile: null,
  },
};

const saveTasks = () => store.save('tasks', state.tasks);
const saveNotes = () => store.save('notes', state.notes);
const saveEvents = () => store.save('events', state.events);

// ---------- Derived data ----------
const taskDate = (t) => (t.due ? t.due.slice(0, 10) : '');
const taskTime = (t) => (t.due ? t.due.slice(11, 16) : '');
const isOverdue = (t) => !t.done && t.due && new Date(t.due) < new Date();

function sortTasks(list) {
  const prio = { high: 0, med: 1, low: 2 };
  return [...list].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (!!a.due !== !!b.due) return a.due ? -1 : 1;
    if (a.due !== b.due) return a.due < b.due ? -1 : 1;
    return prio[a.priority] - prio[b.priority];
  });
}

function itemsForDay(key) {
  const local = state.events.filter((e) => e.date === key).map((e) => ({ ...e, kind: 'event' }));
  const googleIds = new Set(state.events.map((e) => e.googleId).filter(Boolean));
  const google = (state.google.eventsByMonth[key.slice(0, 7)] || [])
    .filter((e) => e.date === key && !googleIds.has(e.id))
    .map((e) => ({ ...e, kind: 'google' }));
  const tasks = state.tasks.filter((t) => taskDate(t) === key).map((t) => ({ id: t.id, title: t.title, time: taskTime(t), done: t.done, kind: 'task' }));
  return [...local, ...google, ...tasks].sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
}

// ---------- Rendering ----------
function render() {
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
  const views = { today: renderToday, tasks: renderTasks, calendar: renderCalendar, notes: renderNotes, inbox: renderInbox, settings: renderSettings };
  $('#main').innerHTML = (views[state.view] || renderToday)();
}

function taskItem(t) {
  const meta = [];
  if (t.due) {
    const label = taskDate(t) === todayKey() ? `Today${taskTime(t) ? ' ' + fmtTime(taskTime(t)) : ''}` : `${fmtDay(taskDate(t))}${taskTime(t) ? ' ' + fmtTime(taskTime(t)) : ''}`;
    meta.push(`<span class="${isOverdue(t) ? 'overdue' : ''}">${isOverdue(t) ? 'Overdue · ' : ''}${esc(label)}</span>`);
  }
  if (t.remind >= 0 && t.due && !t.done) meta.push(`<span>🔔 ${t.remind === 0 ? 'at time' : t.remind >= 60 ? t.remind / 60 + 'h before' : t.remind + 'm before'}</span>`);
  return `
    <li class="item ${t.done ? 'done' : ''}">
      <input type="checkbox" class="check" data-action="toggle-task" data-id="${t.id}" ${t.done ? 'checked' : ''} aria-label="Mark done">
      <div class="body">
        <div class="title">${esc(t.title)} ${t.priority !== 'low' ? `<span class="pill ${t.priority}">${t.priority === 'high' ? 'High' : 'Medium'}</span>` : ''}</div>
        ${meta.length ? `<div class="meta">${meta.join('')}</div>` : ''}
      </div>
      <button class="icon-btn" data-action="delete-task" data-id="${t.id}" title="Delete">✕</button>
    </li>`;
}

function dayItem(i) {
  const tag = i.kind === 'google' ? '<span class="pill google">Google</span>' : i.kind === 'task' ? '<span class="pill">Task</span>' : '';
  const del = i.kind === 'event' ? `<button class="icon-btn" data-action="delete-event" data-id="${i.id}" title="Delete">✕</button>` : '';
  const title = i.kind === 'google' && i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a>` : esc(i.title);
  return `
    <li class="item ${i.done ? 'done' : ''}">
      <span class="time">${i.time ? fmtTime(i.time) : 'All day'}</span>
      <div class="body"><div class="title">${title} ${tag}</div></div>
      ${del}
    </li>`;
}

function taskForm(compact = false) {
  return `
    <form class="row" data-form="add-task">
      <input class="input grow" name="title" placeholder="Add a task…" required autocomplete="off">
      ${compact ? '' : `
      <input class="input" type="datetime-local" name="due" aria-label="Due">
      <select class="select input" name="priority" aria-label="Priority">
        <option value="low">Low</option><option value="med">Medium</option><option value="high">High</option>
      </select>
      <select class="select input" name="remind" aria-label="Reminder">
        <option value="-1">No reminder</option><option value="0" selected>Remind at time</option>
        <option value="10">10 min before</option><option value="60">1 hour before</option><option value="1440">1 day before</option>
      </select>`}
      <button class="btn primary">Add</button>
    </form>`;
}

function renderToday() {
  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const tk = todayKey();
  const open = state.tasks.filter((t) => !t.done);
  const dueToday = sortTasks(open.filter((t) => taskDate(t) === tk || isOverdue(t)));
  const noDate = sortTasks(open.filter((t) => !t.due)).slice(0, 5);
  const schedule = itemsForDay(tk).filter((i) => i.kind !== 'task');
  const g = state.google;
  const unread = g.unread == null ? (g.token ? '…' : '—') : g.unread;

  return `
    <div class="page-head">
      <div><h1>${greet}</h1><p class="sub">${now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p></div>
    </div>
    <div class="grid grid-3" style="margin-bottom:16px">
      <div class="card"><div class="stat">${dueToday.length}</div><div class="stat-label">Tasks due today / overdue</div></div>
      <div class="card"><div class="stat">${schedule.length}</div><div class="stat-label">Events today</div></div>
      <div class="card"><div class="stat">${unread}</div><div class="stat-label">Unread emails${g.token ? '' : ' (connect Google)'}</div></div>
    </div>
    <div class="grid grid-2">
      <div class="card">
        <h2>Today's tasks</h2>
        ${taskForm(true)}
        <ul class="list">${dueToday.map(taskItem).join('') || '<li class="empty">Nothing due today 🎉</li>'}</ul>
        ${noDate.length ? `<h2 style="margin-top:16px">Anytime</h2><ul class="list">${noDate.map(taskItem).join('')}</ul>` : ''}
      </div>
      <div class="card">
        <h2>Schedule <button class="btn small" data-goto="calendar">Open calendar</button></h2>
        <ul class="list">${schedule.map(dayItem).join('') || '<li class="empty">No events today</li>'}</ul>
      </div>
    </div>`;
}

function renderTasks() {
  const f = state.taskFilter;
  const tk = todayKey();
  const filters = {
    active: (t) => !t.done,
    today: (t) => !t.done && (taskDate(t) === tk || isOverdue(t)),
    upcoming: (t) => !t.done && t.due && taskDate(t) > tk,
    done: (t) => t.done,
  };
  const list = sortTasks(state.tasks.filter(filters[f]));
  const tab = (key, label) => `<button class="tab ${f === key ? 'active' : ''}" data-filter="${key}">${label}</button>`;
  return `
    <div class="page-head">
      <div><h1>Tasks</h1><p class="sub">${state.tasks.filter((t) => !t.done).length} open</p></div>
      <div class="tabs">${tab('active', 'All open')}${tab('today', 'Today')}${tab('upcoming', 'Upcoming')}${tab('done', 'Done')}</div>
    </div>
    <div class="card">
      ${taskForm()}
      <ul class="list" style="margin-top:8px">${list.map(taskItem).join('') || '<li class="empty">No tasks here</li>'}</ul>
      ${f === 'done' && list.length ? '<div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn small danger" data-action="clear-done">Clear completed</button></div>' : ''}
    </div>`;
}

function renderCalendar() {
  const m = state.calMonth;
  ensureGoogleMonth(m);
  const first = monthStart(m);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const k = dateKey(d);
    const items = itemsForDay(k);
    const chips = items.slice(0, 3).map((i) => `<span class="chip ${i.kind === 'task' ? 'task' : i.kind === 'google' ? 'google' : ''}">${i.time ? fmtTime(i.time) + ' ' : ''}${esc(i.title)}</span>`).join('');
    cells.push(`
      <button class="cal-day ${d.getMonth() !== m.getMonth() ? 'other' : ''} ${k === todayKey() ? 'today' : ''} ${k === state.selectedDay ? 'selected' : ''} ${items.length ? 'has-items' : ''}" data-day="${k}">
        <span class="num">${d.getDate()}</span>${chips}${items.length > 3 ? `<span class="more">+${items.length - 3} more</span>` : ''}
      </button>`);
    // Drop the 6th row when it would only hold next month's days.
    if (i === 34 && new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getMonth() !== m.getMonth()) break;
  }
  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div class="cal-dow">${d}</div>`).join('');
  const sel = state.selectedDay;
  const g = state.google;
  return `
    <div class="page-head">
      <div><h1>Calendar</h1><p class="sub">${g.token ? '<span class="status-dot on"></span>Synced with Google Calendar' : 'Local calendar · connect Google in Settings to sync'}</p></div>
    </div>
    <div class="cal-layout">
      <div class="card">
        <div class="cal-head">
          <button class="btn small" data-action="cal-prev" aria-label="Previous month">‹</button>
          <h2>${m.toLocaleDateString([], { month: 'long', year: 'numeric' })}${g.loadingMonths.has(monthKey(m)) ? ' <span class="sub" style="font-size:13px">syncing…</span>' : ''}</h2>
          <div class="row"><button class="btn small" data-action="cal-today">Today</button><button class="btn small" data-action="cal-next" aria-label="Next month">›</button></div>
        </div>
        <div class="cal-grid">${dows}${cells.join('')}</div>
      </div>
      <div class="card">
        <h2>${fmtDay(sel)}</h2>
        <ul class="list">${itemsForDay(sel).map(dayItem).join('') || '<li class="empty">Nothing scheduled</li>'}</ul>
        <form data-form="add-event" style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
          <input class="input" name="title" placeholder="New event…" required autocomplete="off">
          <div class="row">
            <input class="input grow" type="date" name="date" value="${sel}" required>
            <input class="input" type="time" name="time" aria-label="Time">
          </div>
          ${g.token ? '<label class="row" style="font-size:13px;color:var(--muted)"><input type="checkbox" name="toGoogle" checked> Also add to Google Calendar</label>' : ''}
          <button class="btn primary">Add event</button>
        </form>
      </div>
    </div>`;
}

function renderNotes() {
  const q = state.noteQuery.toLowerCase();
  const notes = [...state.notes]
    .sort((a, b) => b.updated - a.updated)
    .filter((n) => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q));
  if (!state.activeNote && notes.length) state.activeNote = notes[0].id;
  const active = state.notes.find((n) => n.id === state.activeNote);
  return `
    <div class="page-head">
      <div><h1>Notes</h1><p class="sub">${state.notes.length} note${state.notes.length === 1 ? '' : 's'} · saved automatically</p></div>
      <button class="btn primary" data-action="new-note">+ New note</button>
    </div>
    <div class="notes-layout">
      <div>
        <input class="input" style="width:100%;margin-bottom:10px" placeholder="Search notes…" data-input="note-search" value="${esc(state.noteQuery)}">
        <div class="note-list">
          ${notes.map((n) => `
            <button class="note-card ${n.id === state.activeNote ? 'active' : ''}" data-note="${n.id}">
              <div class="t">${esc(n.title || 'Untitled')}</div>
              <div class="p">${esc(n.body.slice(0, 80) || 'Empty note')}</div>
            </button>`).join('') || '<div class="empty">No notes yet</div>'}
        </div>
      </div>
      <div class="card editor">
        ${active ? `
          <input class="note-title" data-input="note-title" value="${esc(active.title)}" placeholder="Title">
          <div class="meta"><span>Edited ${new Date(active.updated).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
          <textarea data-input="note-body" placeholder="Start writing…">${esc(active.body)}</textarea>
          <div class="row" style="justify-content:flex-end"><button class="btn small danger" data-action="delete-note">Delete note</button></div>
        ` : '<div class="empty">Create a note to get started</div>'}
      </div>
    </div>`;
}

function renderInbox() {
  const g = state.google;
  if (!g.token) {
    return `
      <div class="page-head"><div><h1>Inbox</h1><p class="sub">Unread Gmail messages</p></div></div>
      <div class="card">${googleConnectBlock()}</div>`;
  }
  if (g.emails == null && !g.loadingMail) loadEmails();
  return `
    <div class="page-head">
      <div><h1>Inbox</h1><p class="sub">${g.unread != null ? `${g.unread} unread in your inbox` : 'Loading…'}</p></div>
      <button class="btn" data-action="refresh-mail">↻ Refresh</button>
    </div>
    ${g.error ? `<div class="banner error">${esc(g.error)}</div>` : ''}
    <div class="card" style="padding:6px 14px">
      ${g.loadingMail && !g.emails ? '<div class="empty">Loading emails…</div>' : ''}
      ${(g.emails || []).map((e) => `
        <a class="mail" href="https://mail.google.com/mail/u/0/#inbox/${esc(e.threadId)}" target="_blank" rel="noopener">
          <div class="from"><span>${esc(e.from)}</span><span class="meta">${esc(e.date)}</span></div>
          <div class="subject">${esc(e.subject || '(no subject)')}</div>
          <div class="snippet">${e.snippet}</div>
        </a>`).join('')}
      ${g.emails && !g.emails.length ? '<div class="empty">Inbox zero — no unread email 🎉</div>' : ''}
    </div>`;
}

function googleConnectBlock() {
  const clientId = window.APP_CONFIG?.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return `
      <h2>Connect Google</h2>
      <p class="sub">To sync Gmail and Google Calendar, add your Google OAuth client ID to <code>config.js</code>.
      The README walks you through creating one (about 5 minutes, free).</p>`;
  }
  if (location.protocol === 'file:') {
    return `<div class="banner error">Google sign-in doesn't work from a file. Start the app with <code>node server.js</code> and open http://localhost:5173.</div>`;
  }
  return `
    <h2>Connect Google</h2>
    <p class="sub">Read your unread Gmail and sync Google Calendar events. Access is read-only for email; calendar access lets you add events.
    Nothing leaves your browser except requests to Google.</p>
    <button class="btn primary" data-action="google-connect">Connect Google account</button>`;
}

function renderSettings() {
  const g = state.google;
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  return `
    <div class="page-head"><div><h1>Settings</h1></div></div>
    <div class="grid" style="max-width:720px">
      <div class="card">
        ${g.token ? `
          <h2>Google account</h2>
          <p><span class="status-dot on"></span>Connected${g.profile ? ` as <b>${esc(g.profile)}</b>` : ''}. Session lasts about an hour; reconnect when prompted.</p>
          <div class="row"><button class="btn" data-action="google-sync">↻ Sync now</button><button class="btn danger" data-action="google-disconnect">Disconnect</button></div>
        ` : googleConnectBlock()}
        ${g.error ? `<div class="banner error" style="margin-top:12px">${esc(g.error)}</div>` : ''}
      </div>
      <div class="card">
        <h2>Reminders</h2>
        <p class="sub">Desktop notifications fire while this app is open in a tab.</p>
        <p>Status: <b>${perm === 'granted' ? 'Enabled' : perm === 'denied' ? 'Blocked in browser settings' : perm === 'unsupported' ? 'Not supported in this browser' : 'Not enabled yet'}</b></p>
        <div class="row">
          ${perm === 'default' ? '<button class="btn primary" data-action="enable-notifications">Enable notifications</button>' : ''}
          <button class="btn" data-action="test-notification">Send test reminder</button>
        </div>
      </div>
      <div class="card">
        <h2>Your data</h2>
        <p class="sub">Tasks, notes and events are stored in this browser. Export a backup to move them to another device.</p>
        <div class="row">
          <button class="btn" data-action="export">⬇ Export backup</button>
          <label class="btn">⬆ Import backup<input type="file" accept="application/json" data-input="import" hidden></label>
          <button class="btn danger" data-action="wipe">Delete all data</button>
        </div>
      </div>
    </div>`;
}

// ---------- Actions ----------
function setView(view) {
  state.view = view;
  store.save('view', view);
  render();
  window.scrollTo(0, 0);
}

function addTask(data) {
  state.tasks.push({
    id: uid(),
    title: data.title.trim(),
    due: data.due || '',
    priority: data.priority || 'low',
    remind: data.remind != null ? Number(data.remind) : -1,
    notified: false,
    done: false,
    created: Date.now(),
  });
  saveTasks();
  if (data.due && Number(data.remind) >= 0) maybeAskNotifications();
}

async function addEvent(data) {
  const ev = { id: uid(), title: data.title.trim(), date: data.date, time: data.time || '' };
  state.events.push(ev);
  saveEvents();
  state.selectedDay = data.date;
  render();
  if (data.toGoogle && state.google.token) {
    try {
      const created = await createGoogleEvent(ev);
      ev.googleId = created.id;
      saveEvents();
      delete state.google.eventsByMonth[ev.date.slice(0, 7)];
      toast('Added to Google Calendar');
      render();
    } catch (e) {
      toast('Saved locally, but Google Calendar failed: ' + e.message);
    }
  }
}

function newNote() {
  const n = { id: uid(), title: '', body: '', updated: Date.now() };
  state.notes.push(n);
  state.activeNote = n.id;
  state.noteQuery = '';
  saveNotes();
  render();
  $('[data-input="note-title"]')?.focus();
}

function exportData() {
  const blob = new Blob([JSON.stringify({ version: 1, tasks: state.tasks, notes: state.notes, events: state.events }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `assistant-backup-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.tasks) || !Array.isArray(data.notes) || !Array.isArray(data.events)) throw new Error('bad file');
      if (!confirm(`Replace current data with ${data.tasks.length} tasks, ${data.notes.length} notes and ${data.events.length} events?`)) return;
      state.tasks = data.tasks; state.notes = data.notes; state.events = data.events;
      saveTasks(); saveNotes(); saveEvents();
      toast('Backup imported');
      render();
    } catch {
      toast('That file is not a valid backup');
    }
  };
  reader.readAsText(file);
}

// ---------- Reminders ----------
function maybeAskNotifications() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(() => state.view === 'settings' && render());
}

function notify(title, body) {
  toast(`🔔 ${title}${body ? ' — ' + body : ''}`);
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body, tag: title }); } catch { /* some browsers need a service worker; toast already shown */ }
  }
}

function checkReminders() {
  const now = Date.now();
  let changed = false;
  for (const t of state.tasks) {
    if (t.done || t.notified || !t.due || t.remind < 0) continue;
    const fireAt = new Date(t.due).getTime() - t.remind * 60000;
    if (now >= fireAt) {
      t.notified = true;
      changed = true;
      notify(t.title, t.remind === 0 ? 'Due now' : `Due at ${fmtTime(taskTime(t))}`);
    }
  }
  if (changed) { saveTasks(); if (['today', 'tasks'].includes(state.view)) render(); }
}

// ---------- Google (Gmail + Calendar) ----------
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email';
let tokenClient = null;

function restoreGoogleToken() {
  try {
    const saved = JSON.parse(sessionStorage.getItem('pa.gtoken'));
    if (saved && saved.expires > Date.now() + 60000) Object.assign(state.google, saved);
  } catch { /* ignore */ }
}

function initTokenClient() {
  if (tokenClient) return tokenClient;
  if (!window.google?.accounts?.oauth2) throw new Error('Google sign-in is still loading — try again in a second.');
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: window.APP_CONFIG.GOOGLE_CLIENT_ID,
    scope: GOOGLE_SCOPES,
    callback: (resp) => {
      if (resp.error) { state.google.error = `Google sign-in failed: ${resp.error}`; render(); return; }
      state.google.token = resp.access_token;
      state.google.expires = Date.now() + resp.expires_in * 1000;
      state.google.error = null;
      try { sessionStorage.setItem('pa.gtoken', JSON.stringify({ token: state.google.token, expires: state.google.expires })); } catch { /* ignore */ }
      toast('Google connected');
      syncGoogle();
    },
  });
  return tokenClient;
}

function connectGoogle() {
  try { initTokenClient().requestAccessToken({ prompt: state.google.token ? '' : 'consent' }); } catch (e) { toast(e.message); }
}

function disconnectGoogle() {
  if (state.google.token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(state.google.token, () => {});
  Object.assign(state.google, { token: null, expires: 0, eventsByMonth: {}, emails: null, unread: null, error: null, profile: null });
  sessionStorage.removeItem('pa.gtoken');
  render();
}

async function gfetch(url, opts = {}) {
  const g = state.google;
  if (!g.token || g.expires < Date.now()) {
    g.token = null;
    throw new Error('Google session expired — reconnect in Settings.');
  }
  const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${g.token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (res.status === 401) {
    g.token = null;
    sessionStorage.removeItem('pa.gtoken');
    throw new Error('Google session expired — reconnect in Settings.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message || `Google API error ${res.status}`);
  }
  return res.json();
}

function syncGoogle() {
  state.google.eventsByMonth = {};
  state.google.emails = null;
  ensureGoogleMonth(monthStart(new Date()));
  if (state.view === 'calendar') ensureGoogleMonth(state.calMonth);
  loadEmails();
  gfetch('https://www.googleapis.com/oauth2/v3/userinfo').then((p) => { state.google.profile = p.email; render(); }).catch(() => {});
  render();
}

async function ensureGoogleMonth(month) {
  const g = state.google;
  const key = monthKey(month);
  if (!g.token || g.eventsByMonth[key] || g.loadingMonths.has(key)) return;
  g.loadingMonths.add(key);
  try {
    const timeMin = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
    const timeMax = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();
    const params = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
    const data = await gfetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`);
    const out = [];
    for (const e of data.items || []) {
      if (e.status === 'cancelled') continue;
      if (e.start?.dateTime) {
        const d = new Date(e.start.dateTime);
        out.push({ id: e.id, title: e.summary || '(no title)', date: dateKey(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, link: e.htmlLink });
      } else if (e.start?.date) {
        // All-day events can span several days; the end date is exclusive.
        const start = parseKey(e.start.date);
        const end = e.end?.date ? parseKey(e.end.date) : new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
        for (let d = start; d < end; d.setDate(d.getDate() + 1)) {
          if (monthKey(d) === key) out.push({ id: e.id, title: e.summary || '(no title)', date: dateKey(d), time: '', link: e.htmlLink });
        }
      }
    }
    g.eventsByMonth[key] = out;
    g.error = null;
  } catch (e) {
    g.error = e.message;
    g.eventsByMonth[key] = []; // cache the failure so re-renders don't retry in a loop
  } finally {
    g.loadingMonths.delete(key);
    render();
  }
}

async function createGoogleEvent(ev) {
  let body;
  if (ev.time) {
    const start = new Date(`${ev.date}T${ev.time}`);
    const end = new Date(start.getTime() + 60 * 60000);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    body = { summary: ev.title, start: { dateTime: start.toISOString(), timeZone: tz }, end: { dateTime: end.toISOString(), timeZone: tz } };
  } else {
    const next = parseKey(ev.date);
    next.setDate(next.getDate() + 1);
    body = { summary: ev.title, start: { date: ev.date }, end: { date: dateKey(next) } };
  }
  return gfetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', { method: 'POST', body: JSON.stringify(body) });
}

async function loadEmails() {
  const g = state.google;
  if (!g.token || g.loadingMail) return;
  g.loadingMail = true;
  try {
    const list = await gfetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?' + new URLSearchParams({ q: 'is:unread in:inbox', maxResults: '20' }));
    const label = await gfetch('https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX');
    g.unread = label.messagesUnread ?? list.resultSizeEstimate ?? 0;
    const msgs = await Promise.all((list.messages || []).map((m) =>
      gfetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)));
    g.emails = msgs.map((m) => {
      const h = Object.fromEntries((m.payload?.headers || []).map((x) => [x.name.toLowerCase(), x.value]));
      const from = (h.from || '').replace(/\s*<.*>$/, '').replace(/^"|"$/g, '') || h.from;
      const d = new Date(Number(m.internalDate));
      const date = dateKey(d) === todayKey() ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      // Gmail snippets arrive with HTML entities already encoded; escaping '<' keeps any stray tags inert.
      return { id: m.id, threadId: m.threadId, from, subject: h.subject, date, snippet: (m.snippet || '').replace(/</g, '&lt;') };
    });
    g.error = null;
  } catch (e) {
    g.error = e.message;
    if (g.emails == null) g.emails = [];
  } finally {
    g.loadingMail = false;
    render();
  }
}

// ---------- Events ----------
document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-view]');
  if (nav) return setView(nav.dataset.view);
  const go = e.target.closest('[data-goto]');
  if (go) return setView(go.dataset.goto);

  const filter = e.target.closest('[data-filter]');
  if (filter) { state.taskFilter = filter.dataset.filter; return render(); }

  const day = e.target.closest('[data-day]');
  if (day) {
    state.selectedDay = day.dataset.day;
    const d = parseKey(day.dataset.day);
    if (d.getMonth() !== state.calMonth.getMonth()) state.calMonth = monthStart(d);
    return render();
  }

  const note = e.target.closest('[data-note]');
  if (note) { state.activeNote = note.dataset.note; return render(); }

  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  switch (btn.dataset.action) {
    case 'toggle-task': {
      const t = state.tasks.find((x) => x.id === id);
      if (t) { t.done = !t.done; saveTasks(); }
      // Let the checkbox animate before the list re-sorts.
      setTimeout(render, 150);
      break;
    }
    case 'delete-task':
      state.tasks = state.tasks.filter((x) => x.id !== id); saveTasks(); render(); break;
    case 'clear-done':
      state.tasks = state.tasks.filter((x) => !x.done); saveTasks(); render(); break;
    case 'delete-event':
      state.events = state.events.filter((x) => x.id !== id); saveEvents(); render(); break;
    case 'cal-prev':
      state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() - 1, 1); render(); break;
    case 'cal-next':
      state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1, 1); render(); break;
    case 'cal-today':
      state.calMonth = monthStart(new Date()); state.selectedDay = todayKey(); render(); break;
    case 'new-note': newNote(); break;
    case 'delete-note':
      if (confirm('Delete this note?')) {
        state.notes = state.notes.filter((n) => n.id !== state.activeNote);
        state.activeNote = null; saveNotes(); render();
      }
      break;
    case 'google-connect': connectGoogle(); break;
    case 'google-disconnect': disconnectGoogle(); break;
    case 'google-sync': syncGoogle(); break;
    case 'refresh-mail': state.google.emails = null; loadEmails(); render(); break;
    case 'enable-notifications': maybeAskNotifications(); break;
    case 'test-notification': maybeAskNotifications(); notify('Test reminder', 'Reminders are working'); break;
    case 'export': exportData(); break;
    case 'wipe':
      if (confirm('Delete ALL tasks, notes and events from this browser? This cannot be undone.')) {
        state.tasks = []; state.notes = []; state.events = []; state.activeNote = null;
        saveTasks(); saveNotes(); saveEvents(); render();
      }
      break;
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  if (form.dataset.form === 'add-task') {
    if (!data.title.trim()) return;
    addTask(data);
    render();
    $('[data-form="add-task"] [name="title"]')?.focus();
  } else if (form.dataset.form === 'add-event') {
    if (!data.title.trim()) return;
    addEvent({ ...data, toGoogle: data.toGoogle === 'on' });
  }
});

let noteSaveTimer;
document.addEventListener('input', (e) => {
  const kind = e.target.dataset?.input;
  if (!kind) return;
  if (kind === 'note-search') {
    state.noteQuery = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const input = $('[data-input="note-search"]');
    input.focus();
    input.setSelectionRange(pos, pos);
    return;
  }
  const n = state.notes.find((x) => x.id === state.activeNote);
  if (!n) return;
  if (kind === 'note-title') n.title = e.target.value;
  if (kind === 'note-body') n.body = e.target.value;
  n.updated = Date.now();
  // Update the sidebar preview in place so typing never loses focus.
  const card = $(`[data-note="${n.id}"]`);
  if (card) {
    $('.t', card).textContent = n.title || 'Untitled';
    $('.p', card).textContent = n.body.slice(0, 80) || 'Empty note';
  }
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(saveNotes, 300);
});

document.addEventListener('change', (e) => {
  if (e.target.dataset?.input === 'import' && e.target.files[0]) importData(e.target.files[0]);
});

window.addEventListener('beforeunload', saveNotes);

// ---------- Boot ----------
restoreGoogleToken();
render();
if (state.google.token) syncGoogle();
checkReminders();
setInterval(checkReminders, 20000);
// Keep "Today" fresh (greeting, overdue markers) without a reload.
setInterval(() => { if (state.view === 'today') render(); }, 60000);
