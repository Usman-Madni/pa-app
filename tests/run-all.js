// Runs every tests/test-*.js, 4 at a time, keeps going after a failure, one line per test (in name order), exit 1 if
// any failed. A file gets 5 minutes, so a busy computer slows the run down rather than failing it; one that does run
// out of time says so. A failed file is run once more on its own, and only counts as failed if it fails again (a
// timing check that a busy computer upset passes then; a real failure fails twice). --verbose prints every file's
// output; a name (or part of one) runs just those files: node tests/run-all.js utilities vault.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PARALLEL = 4;
const TIMEOUT = 5 * 60 * 1000;
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const only = args.filter((a) => !a.startsWith('--'));
const files = fs.readdirSync(__dirname).filter((f) => /^test-.*\.js$/.test(f) && (!only.length || only.some((o) => f.includes(o)))).sort();

function run(f) {
  return new Promise((resolve) => {
    const started = Date.now();
    const p = spawn(process.execPath, [path.join(__dirname, f)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { out += `\n(ran out of time after ${TIMEOUT / 60000} minutes)\n`; p.kill(); }, TIMEOUT);
    p.on('close', (code) => { clearTimeout(timer); resolve({ f, ok: code === 0, out, ms: Date.now() - started }); });
  });
}

(async () => {
  const started = Date.now();
  const results = new Array(files.length);
  let next = 0;
  const worker = async () => { while (next < files.length) { const i = next++; results[i] = await run(files[i]); } };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, files.length) }, worker));
  // A failure is tried once more on its own, with nothing else running.
  for (let i = 0; i < results.length; i++) {
    if (results[i].ok) continue;
    const again = await run(files[i]);
    results[i] = again.ok ? { ...again, retried: true } : { ...again, out: results[i].out + '\n--- run again on its own ---\n' + again.out };
  }
  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.f}${r.retried ? '  (passed when run again on its own)' : ''}`);
    if (!r.ok || verbose) process.stdout.write(r.out);
  }
  console.log(`\n${files.length - failed}/${files.length} test files passed in ${Math.round((Date.now() - started) / 1000)}s`);
  process.exit(failed ? 1 : 0);
})();
