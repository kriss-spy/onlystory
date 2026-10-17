import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importPjsk } from './pjsk-import.mjs';
import { installPjskEpisode } from './pjsk-media.mjs';
import { readFile } from 'node:fs/promises';
import { pjskLibraryRoot } from './local-environment.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
try {
  const { values } = parseArgs({
    options: {
      region: { type: 'string', default: 'cn' },
      kind: { type: 'string', default: 'unit' },
      scenario: { type: 'string', default: 'mmj_01_00' },
      cache: { type: 'string', default: resolve(root, '.cache/pjsk/http') },
      output: {
        type: 'string',
        default: resolve(root, '.cache/pjsk/packages'),
      },
      offline: { type: 'boolean' },
      refresh: { type: 'boolean' },
      list: { type: 'boolean' },
      help: { type: 'boolean' },
      install: { type: 'boolean' },
      library: {
        type: 'string',
        default: pjskLibraryRoot,
      },
    },
  });
  if (values.help) {
    console.log(`Usage: npm run import:pjsk -- [options]
  --region cn|jp|en|tc|kr   Source region, default cn
  --kind unit|event        Master table, default unit
  --scenario ID            One metadata-indexed scenario, default mmj_01_00
  --list                   Print available episodes without importing scenarios
  --offline                Read checksum-verified cache only
  --refresh                Fetch fresh inputs, replacing cached URL snapshots
  --cache DIRECTORY        Source cache, default .cache/pjsk/http
  --output DIRECTORY       Packages, default .cache/pjsk/packages

  --install                Acquire media and publish a supported episode to the reader
  --library DIRECTORY      PJSK library, default .cache/pjsk/library

Without --install, imports source commands and text only.`);
  } else {
    const result = await importPjsk({
      region: values.region,
      kind: values.kind,
      scenario: values.scenario,
      cacheDir: resolve(values.cache),
      outputDir: resolve(values.output),
      offline: values.offline,
      refresh: values.refresh,
      list: values.list,
    });
    console.log(JSON.stringify(result, null, 2));
    if (values.install) {
      if (values.list)
        throw new Error('--install cannot be combined with --list.');
      const pkg = JSON.parse(await readFile(result.outputPath, 'utf8'));
      console.log(
        JSON.stringify(
          await installPjskEpisode(pkg, {
            libraryDir: resolve(values.library),
            generatedDir: resolve(root, 'src/generated'),
            offline: values.offline,
          }),
          null,
          2,
        ),
      );
    }
  }
} catch (error) {
  console.error(`PJSK import failed: ${error.message}`);
  process.exitCode = 1;
}
