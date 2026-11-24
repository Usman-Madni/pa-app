// Butler's background check (the Android app, round 3). Android runs this about every 15 minutes, even with Butler
// closed (Capacitor Background Runner: no page, no Butler code; fetch, CapacitorKV and CapacitorNotifications only).
// It reads the data file from OneDrive and hands Android each reminder in its ring list (written by every save, from
// Butler's own rules) that is due in the next WINDOW and that Android doesn't have yet. It can't take a reminder back,
// so it never looks further ahead than that, and Butler leaves the ones it gave alone (see Native in PA App.html).
// Its storage (CapacitorKV) is its own; Butler fills it through the 'sync' event:
//   auth     — the OneDrive sign-in ({access, exp, refresh, scope, got}); whichever side renewed it last wins
//   ring     — this phone's choice: 'app' (Butler rings reminders) or 'todo' (To Do does; nothing to do here)
//   channel  — the Android channel reminders ring on (Butler makes it; this can't)
//   pageGave — {key: at} the reminders Butler itself gave Android
//   gave     — {key: at} the reminders this check gave Android
// Shipped inside the APK: a change here needs a new APK (the workflow builds one on any change in android-app/).

var CLIENT_ID = '011c6ecd-2984-4293-a6be-c83ebba20855'; // Butler's (not a secret)
var TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
var GRAPH = 'https://graph.microsoft.com/v1.0';
var SCOPE = 'Files.ReadWrite.AppFolder Tasks.ReadWrite offline_access';
var FILES = ['Data/pa-app-data.json', 'pa-app-data.json']; // in Apps › PA App › Data, or loose from before
var WINDOW_MS = 20 * 60000; // runs every ~15 minutes, so 20 overlaps a little
var KEEP_MS = 3600000; // what was given is remembered until an hour after it rang

function kvGet(k) {
  try {
    var r = CapacitorKV.get(k);
    var v = r && typeof r === 'object' ? r.value : r;
    return v == null || v === '' ? null : JSON.parse(v);
  } catch (e) { return null; }
}
function kvSet(k, v) {
  if (v == null) CapacitorKV.remove(k);
  else CapacitorKV.set(k, JSON.stringify(v));
}
// The same number Butler gives a reminder (Native.numId): a positive 32-bit whole number from '<task>:<reminder>'.
function numId(key) {
  var h = 0;
  for (var i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  return (h & 0x7fffffff) || 1;
}
function prune(map, now) {
  var out = {};
  for (var k in map) if (map[k] > now - KEEP_MS) out[k] = map[k];
  return out;
}
function form(o) {
  var parts = [];
  for (var k in o) parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(o[k]));
  return parts.join('&');
}
// A response's JSON, however this engine's fetch hands it over; null if it isn't any.
async function bodyOf(res) {
  try {
    if (!res) return null;
    if (typeof res.json === 'function') return await res.json();
    if (typeof res.text === 'function') return JSON.parse(await res.text());
    if (res.data != null) return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  } catch (e) { /* not JSON */ }
  return null;
}
function okStatus(res) { return !!res && (res.status == null || (res.status >= 200 && res.status < 300)); }

// The OneDrive sign-in, renewed when its access has run out (null: signed out, or it can't be renewed).
async function signIn(now) {
  var auth = kvGet('auth');
  if (!auth || !auth.refresh) return null;
  if (auth.access && auth.exp - 60000 > now) return auth;
  var res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ client_id: CLIENT_ID, scope: SCOPE, grant_type: 'refresh_token', refresh_token: auth.refresh }),
  });
  var j = await bodyOf(res);
  if (!okStatus(res) || !j || !j.access_token) return null; // Butler asks to sign in again when it opens
  auth = { access: j.access_token, exp: now + (j.expires_in || 3600) * 1000, refresh: j.refresh_token || auth.refresh, scope: j.scope || auth.scope || '', got: now, native: true };
  kvSet('auth', auth);
  return auth;
}

// The data file: its details first (which hold a short-lived download link, so no redirect needs following), then it.
async function readFile(access) {
  for (var i = 0; i < FILES.length; i++) {
    var meta = await fetch(GRAPH + '/me/drive/special/approot:/' + FILES[i], { headers: { Authorization: 'Bearer ' + access } });
    if (!okStatus(meta)) continue;
    var m = await bodyOf(meta);
    var link = m && m['@microsoft.graph.downloadUrl'];
    if (!link) continue;
    var res = await fetch(link, {});
    if (okStatus(res)) return bodyOf(res);
  }
  return null;
}

// Butler, while open: swap what each side knows. Answers {auth, gave}.
addEventListener('sync', function (resolve, reject, args) {
  try {
    var d = args || {};
    var now = Date.now();
    var auth = kvGet('auth');
    if (d.auth === null) auth = null; // signed out in Butler
    else if (d.auth && d.auth.refresh && (!auth || (d.auth.got || 0) >= (auth.got || 0))) auth = d.auth;
    kvSet('auth', auth);
    if (d.ring) kvSet('ring', d.ring);
    if (d.channel) kvSet('channel', d.channel);
    if (d.given && typeof d.given === 'object') kvSet('pageGave', d.given);
    var gave = prune(kvGet('gave') || {}, now);
    kvSet('gave', gave);
    resolve({ auth: auth, gave: gave });
  } catch (e) { reject(String(e && e.message || e)); }
});

// Every ~15 minutes.
addEventListener('check', async function (resolve, reject) {
  try {
    if (kvGet('ring') !== 'app') return resolve();
    var now = Date.now();
    var auth = await signIn(now);
    if (!auth) return resolve();
    var file = await readFile(auth.access);
    var ring = file && Array.isArray(file.ring) ? file.ring : [];
    var pageGave = kvGet('pageGave') || {};
    var gave = prune(kvGet('gave') || {}, now);
    var channel = kvGet('channel') || 'butler-ring';
    var due = ring.filter(function (e) {
      return e && e.key && typeof e.at === 'number' && e.at > now && e.at <= now + WINDOW_MS && pageGave[e.key] !== e.at && gave[e.key] !== e.at;
    });
    if (due.length) {
      CapacitorNotifications.schedule(due.map(function (e) {
        return { id: numId(e.key), title: e.title || 'Reminder', body: e.body || '', scheduleAt: new Date(e.at), channelId: channel, smallIcon: 'ic_stat_butler', extra: { task: e.task } };
      }));
      due.forEach(function (e) { gave[e.key] = e.at; });
    }
    kvSet('gave', gave);
    resolve();
  } catch (e) { reject(String(e && e.message || e)); }
});
