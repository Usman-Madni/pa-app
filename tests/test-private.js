// The private-data check catches private terms, emails, personal paths, forbidden files and personal commit
// emails anywhere in history — and passes a clean repo. Uses throwaway git repos outside the project folder.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { scan } = require('../tools/check-private');
const { check, done } = require('./helpers');

// Built from pieces so this test file never contains a real-looking email or path itself.
const at = (a, b) => [a, b].join('@');
const NOREPLY = at('123+tester', 'users.noreply.github.com');
const PERSONAL = at('tester', 'mail.test');

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-private-'));
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout;
  };
  git('init', '-q', '-b', 'master');
  git('config', 'user.name', 'Tester');
  git('config', 'user.email', NOREPLY);
  git('config', 'core.autocrlf', 'false');
  const commit = (files, msg, email) => {
    for (const [name, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), text);
    }
    git('add', '-A');
    const env = email ? ['-c', `user.email=${email}`] : [];
    git(...env, 'commit', '-q', '-m', msg);
  };
  const removeAll = (names) => { for (const n of names) fs.rmSync(path.join(dir, n)); git('add', '-A'); git('commit', '-q', '-m', 'tidy'); };
  return { dir, commit, removeAll, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const terms = ['Secretville', 'My Other Project'];

// Clean repo passes
let r = repo();
r.commit({ 'app.html': '<p>Hello</p>', 'README.md': `Co-Authored-By: Claude <${at('noreply', 'anthropic.com')}>` }, 'First version');
check(scan({ root: r.dir, terms }).length === 0, 'a clean repo passes');
r.cleanup();

// A private term in an OLD version is still caught after it was removed
r = repo();
r.commit({ 'notes.md': 'I live in secretville' }, 'Add notes');
r.commit({ 'notes.md': 'I live somewhere' }, 'Remove place');
let f = scan({ root: r.dir, terms });
check(f.some((x) => /notes\.md.*Secretville/.test(x)), 'private term in an old version is caught (case-insensitive)');
r.cleanup();

// Emails and personal paths
r = repo();
r.commit({ 'a.js': `// contact ${PERSONAL}\nconst p = 'C:${'\\'}Users${'\\'}someone${'\\'}Desktop';` }, 'Add a');
f = scan({ root: r.dir, terms });
check(f.some((x) => x.includes('email address') && x.includes(PERSONAL)), 'a personal email in a file is caught');
check(f.some((x) => x.includes('personal folder path')), 'a C:\\Users\\<name> path is caught');
r.cleanup();

// Forbidden files, even if deleted later
r = repo();
r.commit({ 'CLAUDE.local.md': 'rules', 'pa-app-data.json': '{}' }, 'Oops');
r.removeAll(['CLAUDE.local.md', 'pa-app-data.json']);
f = scan({ root: r.dir, terms });
check(f.some((x) => x.startsWith('CLAUDE.local.md')), 'CLAUDE.local.md in history is caught');
check(f.some((x) => x.startsWith('pa-app-data.json')), 'a data file in history is caught');
r.cleanup();

// Commit messages and personal commit emails
r = repo();
r.commit({ 'a.txt': 'x' }, 'Copied from My Other Project');
r.commit({ 'b.txt': 'y' }, 'Normal message', PERSONAL);
f = scan({ root: r.dir, terms });
check(f.some((x) => /message: private term "My Other Project"/.test(x)), 'a private term in a commit message is caught');
check(f.some((x) => x.includes('made with email') && x.includes(PERSONAL)), 'a commit made with a personal email is caught');
r.cleanup();

// The real project: if the private list exists here, today's history must pass
const realTerms = path.join(__dirname, '..', 'private-terms.txt');
if (fs.existsSync(realTerms)) {
  const { loadTerms } = require('../tools/check-private');
  const real = scan({ root: path.join(__dirname, '..'), terms: loadTerms(realTerms) });
  check(real.length === 0, 'this project\'s own history is clean' + (real.length ? ': ' + real.slice(0, 3).join(' | ') : ''));
} else {
  console.log('  skip this project\'s own history (no private-terms.txt on this machine)');
}
done();
