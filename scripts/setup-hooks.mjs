// Point Git at the committed hooks so `npm ci` enables the pre-commit check.
import { spawnSync } from 'node:child_process';

const result = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], {
  stdio: 'ignore',
});
if (result.status === 0) console.log('Enabled the .githooks pre-commit check.');
else console.warn('Skipped git hook setup (git unavailable).');
