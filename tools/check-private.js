// Blocks a push when anything private would go public. Runs from the pre-push hook (tools/install-hooks.js).
// Scans every file version and every commit message in the history being pushed, not just today's files,
// because GitHub shows the whole history.
//   - words/phrases listed in private-terms.txt (git-ignored, so the list itself never goes public)
//   - any email address except GitHub noreply ones and the Claude co-author line
//   - personal folder paths (C:\Users\<name>, /c/Users/<name>)
//   - files that must never be committed (CLAUDE.local.md, the terms list, data files, backups,
//     attachments, and any photo/scan/document such as a PDF or JPG)
//   - commit author/committer emails that aren't GitHub noreply
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ALLOWED_EMAIL_DOMAINS = ['users.noreply.github.com', 'anthropic.com', 'example.com'];
const FORBIDDEN_FILES = [
  /(^|\/)CLAUDE\.local\.md$/i, /(^|\/)private-terms\.txt$/i, /(^|\/)pa-app-data[^/]*\.json$/i, /(^|\/)PA App Backup [^/]*\.json$/i,
  /(^|\/)attachments\//i,
  // Photos, scans and documents (bills, IDs…) never belong in this repo — the app is code only.
  /\.(pdf|jpe?g|png|gif|webp|heic|heif|bmp|tiff?|docx?|xlsx?|pptx?|odt|ods|zip|rar|7z)$/i,
];
const BUILT_IN = [
  { label: 'email address', re: /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g, allow: (m) => ALLOWED_EMAIL_DOMAINS.some((d) => m.toLowerCase().endsWith('@' + d) || m.toLowerCase().endsWith('.' + d)) },
  { label: 'personal folder path', re: /[A-Za-z]:[\\/]{1,2}Users[\\/]{1,2}[A-Za-z0-9._-]+|\/c\/Users\/[A-Za-z0-9._-]+/gi, allow: () => false },
];

function git(root, args, input) {
  const r = spawnSync('git', args, { cwd: root, input, maxBuffer: 256 << 20 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

function loadTerms(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

function findIn(text, terms) {
  const hits = [];
  const lower = text.toLowerCase();
  for (const t of terms) if (lower.includes(t.toLowerCase())) hits.push(`private term "${t}"`);
  for (const b of BUILT_IN) {
    for (const m of text.match(b.re) || []) if (!b.allow(m)) hits.push(`${b.label} "${m}"`);
  }
  return [...new Set(hits)];
}

// Returns a list of findings (empty = safe to push).
function scan({ root, terms, rev = 'HEAD' }) {
  const findings = [];

  // 1. Every file version reachable from rev
  const objects = git(root, ['rev-list', '--objects', rev]).toString('utf8').split('\n').filter(Boolean);
  const pathOf = new Map(); // object id → one path (for reporting where a hit was)
  for (const line of objects) {
    const sp = line.indexOf(' ');
    if (sp > 0) pathOf.set(line.slice(0, sp), line.slice(sp + 1));
  }
  // rev-list lists identical file contents only once (under one name), so take every name that any
  // commit ever added or changed from the log instead — otherwise a copy of an allowed file under a
  // forbidden name would slip through.
  const allPaths = new Set(git(root, ['-c', 'core.quotepath=false', 'log', '--name-only', '--format=', '--no-renames', '-m', rev])
    .toString('utf8').split('\n').filter(Boolean));
  for (const p of allPaths) {
    if (FORBIDDEN_FILES.some((re) => re.test(p))) findings.push(`${p}: this file must never be committed`);
  }
  const shas = [...pathOf.keys()];
  if (shas.length) {
    const out = git(root, ['cat-file', '--batch'], shas.join('\n') + '\n');
    let pos = 0;
    while (pos < out.length) {
      const nl = out.indexOf(10, pos);
      const [sha, type, size] = out.slice(pos, nl).toString('utf8').split(' ');
      const start = nl + 1;
      const end = start + Number(size);
      if (type === 'blob') {
        const buf = out.slice(start, end);
        if (!buf.includes(0)) {
          for (const hit of findIn(buf.toString('utf8'), terms)) findings.push(`${pathOf.get(sha)} (version ${sha.slice(0, 7)}): ${hit}`);
        }
      }
      pos = end + 1;
    }
  }

  // 2. Commit messages and who made them
  const log = git(root, ['log', '--format=%h%x00%an%x00%ae%x00%cn%x00%ce%x00%B%x1e', rev]).toString('utf8');
  for (const rec of log.split('\x1e').map((r) => r.replace(/^\n/, '')).filter(Boolean)) {
    const [h, an, ae, cn, ce, msg] = rec.split('\x00');
    for (const e of [ae, ce]) if (!e.toLowerCase().endsWith('@users.noreply.github.com')) findings.push(`commit ${h}: made with email "${e}" (use the GitHub noreply email)`);
    for (const hit of findIn(`${an}\n${cn}\n${msg}`, terms)) findings.push(`commit ${h} message: ${hit}`);
  }
  return [...new Set(findings)];
}

module.exports = { scan, findIn, loadTerms };

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const termsFile = path.join(root, 'private-terms.txt');
  if (!fs.existsSync(termsFile)) {
    console.error('private-terms.txt is missing, so the private-data check cannot run. Push blocked.\nCreate it (one private word or phrase per line) — see CLAUDE.md.');
    process.exit(1);
  }
  const findings = scan({ root, terms: loadTerms(termsFile), rev: process.argv[2] || 'HEAD' });
  if (findings.length) {
    console.error(`Private data check FAILED — ${findings.length} problem(s). Nothing was pushed.`);
    for (const f of findings.slice(0, 50)) console.error('  ' + f);
    if (findings.length > 50) console.error(`  …and ${findings.length - 50} more`);
    process.exit(1);
  }
  console.log('Private data check passed — nothing private in the history being pushed.');
}
