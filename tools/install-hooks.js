// Installs the git pre-push hook: every push first runs the private-data check, then the tests.
// Git doesn't copy hooks with the repo, so run this once on each computer: npm run install-hooks
const fs = require('fs');
const path = require('path');

const hook = path.join(__dirname, '..', '.git', 'hooks', 'pre-push');
fs.writeFileSync(hook, `#!/bin/sh
# Installed by tools/install-hooks.js — blocks the push if private data or failing tests would go public.
node tools/check-private.js || exit 1
node tests/run-all.js || { echo "Tests failed. Nothing was pushed."; exit 1; }
`);
fs.chmodSync(hook, 0o755);
console.log('pre-push hook installed: private-data check + tests run before every push.');
