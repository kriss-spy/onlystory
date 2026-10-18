// Catalog specs must derive collection counts from the imported library data
// instead of hardcoding them, so a growing library cannot leave a stale
// assertion behind. An intentional literal carries a `// derived` annotation.
import { readdirSync, readFileSync } from 'node:fs';

const directory = 'tests';
const files = readdirSync(directory).filter((file) =>
  /^ba-.*\.spec\.ts$/.test(file),
);
const countPattern = /\.toHaveCount\(\s*(\d+)\s*\)/g;
const failures = [];
for (const file of files) {
  const path = `${directory}/${file}`;
  const text = readFileSync(path, 'utf8');
  for (const match of text.matchAll(countPattern)) {
    const start = text.lastIndexOf(';', match.index) + 1;
    const end = text.indexOf(';', match.index);
    const statement = text.slice(start, end === -1 ? text.length : end);
    if (!/\.event-row|\boption\b/.test(statement)) continue;
    const lineStart = text.lastIndexOf('\n', match.index) + 1;
    const lineEnd = text.indexOf('\n', match.index);
    const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
    if (/\/\/\s*derived/i.test(line)) continue;
    failures.push(`${path}:${text.slice(0, match.index).split('\n').length}`);
  }
}
if (failures.length) {
  console.error(
    'Hardcoded catalog count(s):\n  ' +
      failures.join('\n  ') +
      '\nDerive the count from scripts/ba-library.json or src/ba-catalog.json, or annotate the line with "// derived".',
  );
  process.exit(1);
}
console.log('Catalog spec counts are data-derived.');
