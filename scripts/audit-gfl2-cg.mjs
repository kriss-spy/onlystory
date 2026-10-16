import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const cli = 'node_modules/@playwright/test/cli.js';
const file = 'tests/gfl2-cg-audit.spec.ts';
const listing = spawnSync(process.execPath, [cli, 'test', file, '--list'], {
  encoding: 'utf8',
});
if (listing.status !== 0) {
  process.stderr.write(listing.stderr || listing.stdout);
  process.exit(listing.status || 1);
}
const source = JSON.parse(
  readFileSync('private-review/cg-audit/source-audit.json', 'utf8'),
);
// Bound the lifetime of each Chrome process during a large WebGL audit. Each
// reference still gets an independent page and its own recorded pass/failure.
for (let offset = 0; offset < source.cgReferences; offset += 12) {
  const ids = Array.from(
    { length: Math.min(12, source.cgReferences - offset) },
    (_, i) => String(offset + i + 1).padStart(3, '0'),
  );
  const grep =
    (offset === 0 ? 'all 36|' : '') + `\\b(?:${ids.join('|')}) gfl2-`;
  const batch = offset / 12 + 1;
  console.log(
    `CG audit batch ${batch}: references ${offset + 1}–${offset + ids.length}`,
  );
  const result = spawnSync(
    process.execPath,
    [
      cli,
      'test',
      file,
      '--grep',
      grep,
      '--workers=1',
      `--output=.cache/gfl2-cg-audit-batch-${batch}`,
    ],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
const report = spawnSync(
  process.execPath,
  ['scripts/report-gfl2-cg-audit.mjs'],
  { stdio: 'inherit' },
);
process.exit(report.status || 0);
