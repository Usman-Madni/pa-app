// Shared test helpers: load PA App.html into jsdom, fake data files, simple asserts.
const fs = require('fs');
const path = require('path');

const DEPS_DIR = path.join(process.env.LOCALAPPDATA || path.join(require('os').homedir(), '.local'), 'pa-app-testdeps');
const APP_FILE = path.join(__dirname, '..', 'PA App.html');

function loadJsdom() {
  try {
    return require(path.join(DEPS_DIR, 'node_modules', 'jsdom'));
  } catch {
    console.error('Test tools missing. Run: npm run setup');
    process.exit(2);
  }
}

// A fake file handle that behaves like the File System Access API's FileSystemFileHandle.
function fakeFile(name = 'pa-app-data.json', text = '') {
  const handle = {
    kind: 'file',
    name,
    text,
    writes: 0,
    parts: [],
    async getFile() { return { name, size: handle.text.length, type: handle.type || '', text: async () => handle.text }; },
    async createWritable() {
      const parts = [];
      return {
        write: async (p) => { parts.push(p); },
        close: async () => {
          handle.parts = parts; // raw pieces (strings or File/Blob objects)
          handle.text = parts.map((p) => (typeof p === 'string' ? p : `[${p.constructor.name} ${p.name || ''}]`)).join('');
          handle.writes++;
        },
      };
    },
    async queryPermission() { return 'granted'; },
    async requestPermission() { return 'granted'; },
    json() { return handle.text ? JSON.parse(handle.text) : null; },
  };
  return handle;
}

// A fake folder handle for daily backups.
function fakeFolder(name = 'backups') {
  const files = {};
  return {
    kind: 'directory',
    name,
    files,
    async getFileHandle(fname, opts = {}) {
      if (!files[fname]) {
        if (!opts.create) { const e = new Error('not found'); e.name = 'NotFoundError'; throw e; }
        files[fname] = fakeFile(fname);
      }
      return files[fname];
    },
    async removeEntry(fname) {
      if (!files[fname]) { const e = new Error('not found'); e.name = 'NotFoundError'; throw e; }
      delete files[fname];
    },
    permission: 'granted',
    async queryPermission() { return this.permission; },
    async requestPermission() { return 'granted'; },
  };
}

// Load the app. opts.fsa=false simulates a phone (no File System Access API).
// opts.storage pre-fills localStorage. opts.query adds e.g. '?readonly'.
function loadApp(opts = {}) {
  const { JSDOM, VirtualConsole } = loadJsdom();
  const html = fs.readFileSync(APP_FILE, 'utf8');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => { if (!/Not implemented/.test(e.message)) errors.push(e.message); });
  vc.on('error', (e) => errors.push(String(e)));
  const dom = new JSDOM(html, {
    url: 'http://localhost/' + (opts.query || ''),
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(win) {
      if (opts.ua) Object.defineProperty(win.navigator, 'userAgent', { get: () => opts.ua });
      for (const [k, v] of Object.entries(opts.storage || {})) win.localStorage.setItem(k, v);
      if (opts.fsa !== false) {
        win.showOpenFilePicker = async () => [opts.pickFile || fakeFile()];
        win.showSaveFilePicker = async () => opts.pickFile || fakeFile();
        win.showDirectoryPicker = async () => opts.pickFolder || fakeFolder();
      }
      win.confirm = () => true;
      win.scrollTo = () => {};
      if (!win.CSS) win.CSS = { escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c) };
    },
  });
  const win = dom.window;
  return { dom, win, doc: win.document, PA: win.PA, errors, close: () => win.close() };
}

// Fill and submit a form in the app.
function submitForm(win, formName, values) {
  const form = win.document.querySelector(`[data-form="${formName}"]`);
  if (!form) throw new Error(`form ${formName} not on screen`);
  for (const [k, v] of Object.entries(values)) form.elements[k].value = v;
  form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
}

// Ticking a task opens the "Done on…" pop-up; this answers it (default: now).
function confirmDone(win, values = {}) {
  const form = win.document.querySelector('#modal form[data-form="done-date"]');
  if (!form) throw new Error('"Done on" pop-up not open');
  for (const [k, v] of Object.entries(values)) {
    if (form.elements[k].type === 'checkbox') form.elements[k].checked = !!v; else form.elements[k].value = v;
  }
  form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(cond, label) {
  if (cond) console.log('  ok   ' + label);
  else { failures++; console.log('  FAIL ' + label); }
}
function done() {
  if (failures) { console.log(`${failures} check(s) failed`); process.exit(1); }
  process.exit(0);
}

module.exports = { DEPS_DIR, APP_FILE, loadApp, fakeFile, fakeFolder, submitForm, confirmDone, tick, check, done };
