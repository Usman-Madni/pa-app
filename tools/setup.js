// Installs the test tools (jsdom) OUTSIDE the project folder, in %LOCALAPPDATA%\pa-app-testdeps.
// npm install inside a synced folder (OneDrive, Google Drive) breaks: file locks, thousands of synced files.
const { execSync } = require('child_process');
const { DEPS_DIR } = require('../tests/helpers');

console.log(`Installing test tools into ${DEPS_DIR}`);
execSync(`npm install --prefix "${DEPS_DIR}" jsdom@24.1.3 --no-audit --no-fund`, { stdio: 'inherit' });
console.log('Done. Run: npm test');
